/**
 * Assessment & Plan Generator — Phase 7
 *
 * Synthesizes the structured ConsultReport into a clinical impression
 * (Assessment) and an actionable Plan via Bedrock Sonnet 4.6.
 *
 * Kept separate from `report-builder.ts` so the builder remains a pure
 * function. This module performs an AI call and is intended to be invoked
 * from the report API route after the builder runs.
 */

import { invokeBedrockJSON } from '@/lib/bedrock'
import type { ConsultReport, ReportSection } from './report-types'

const ASSESSMENT_SYSTEM_PROMPT = `You are an attending neurologist generating the Assessment and Plan portion of a consult note based on the structured findings already gathered by the intake pipeline.

You will receive:
- Chief complaint, triage tier, subspecialty
- HPI and structured history (OLDCARTS)
- AI-generated localizer differential (ranked diagnoses with rationale)
- Clinical scale results
- Red flags (if any)
- SDNE exam summary (if performed)
- Patient-reported body map and device measurements (if any)

Generate a concise, clinically rigorous Assessment and Plan that:

ASSESSMENT (2-4 sentences):
- State the most likely diagnosis or syndromic impression in clinical language.
- Reference the differential entries by name when narrowing.
- Note pertinent positives and pertinent negatives.
- Flag any red flag findings that change urgency.
- Do not invent findings not present in the input.

PLAN (3-7 numbered items):
- Diagnostic workup (imaging, labs, EEG/EMG, lumbar puncture, etc.) — only items justified by the differential.
- Therapeutic recommendations (medications, dose ranges only when standard, lifestyle modifications, referrals).
- Follow-up cadence appropriate to acuity.
- Patient education points.
- Safety net / when-to-return-to-ED guidance if any red flag is present or possible.

Hard rules:
- NEVER fabricate medication doses, drug names, or guideline citations not supported by the input.
- If a diagnosis is uncertain, say so explicitly — do not pretend to higher confidence.
- If the input has insufficient data to support an assessment, say "Insufficient data for definitive assessment" and propose what to gather.
- Use plain clinical English. No headings or bullets inside the assessment string. Plan items should be plain strings without leading numbers — the renderer will number them.

Return JSON matching exactly:
{
  "assessment": "string (2-4 sentences)",
  "plan": ["string", "string", ...],
  "confidence": "high | medium | low",
  "uncertainty_notes": "string or empty"
}`

export interface AssessmentAndPlan {
  assessment: string
  plan: string[]
  confidence: 'high' | 'medium' | 'low'
  uncertainty_notes: string
}

/**
 * Build a compact prompt input describing every section of the report.
 * Avoids re-formatting the report to keep the model's input grounded
 * in exactly what the builder produced.
 */
function buildPromptInput(report: ConsultReport): string {
  const lines: string[] = [
    `Chief Complaint: ${report.chief_complaint}`,
    `Triage Tier: ${report.triage_tier ?? 'not assigned'}`,
    `Subspecialty: ${report.subspecialty ?? 'general neurology'}`,
    '',
  ]

  for (const sec of report.sections) {
    lines.push(`### ${sec.title}`)
    lines.push(sec.content)
    lines.push('')
  }

  if (report.differential.length > 0) {
    lines.push('### Localizer Differential (structured)')
    for (const d of report.differential) {
      lines.push(`- ${d.diagnosis} [${d.likelihood}]: ${d.rationale}`)
    }
    lines.push('')
  }

  if (report.scale_results.length > 0) {
    lines.push('### Scale Results (structured)')
    for (const s of report.scale_results) {
      lines.push(`- ${s.abbreviation}: ${s.score}/${s.max_score} (${s.severity})`)
    }
    lines.push('')
  }

  if (report.red_flags.count > 0) {
    lines.push(`### Red Flags: ${report.red_flags.count} detected`)
    for (const f of report.red_flags.flags) {
      lines.push(`- ${f.name} (${f.severity}, ${(f.confidence * 100).toFixed(0)}%)`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Generate Assessment and Plan sections from a built report.
 *
 * Throws on Bedrock errors; callers should wrap in try/catch and gracefully
 * skip these sections if generation fails — the rest of the report remains
 * usable on its own.
 */
export async function generateAssessmentAndPlan(
  report: ConsultReport,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<AssessmentAndPlan> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000)
  const signal = options.signal ?? controller.signal

  try {
    const userInput = buildPromptInput(report)
    const { parsed } = await invokeBedrockJSON<AssessmentAndPlan>({
      system: ASSESSMENT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userInput }],
      maxTokens: 1200,
      temperature: 0.2,
      signal,
    })
    return {
      assessment: typeof parsed.assessment === 'string' ? parsed.assessment.trim() : '',
      plan: Array.isArray(parsed.plan) ? parsed.plan.filter((p) => typeof p === 'string' && p.trim()) : [],
      confidence: parsed.confidence === 'high' || parsed.confidence === 'low' ? parsed.confidence : 'medium',
      uncertainty_notes: typeof parsed.uncertainty_notes === 'string' ? parsed.uncertainty_notes : '',
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Append the AI-synthesized Assessment and Plan as two new sections at the
 * end of the report. Mutates the input report's sections array and returns
 * the same report for chaining.
 */
export function appendAssessmentAndPlan(
  report: ConsultReport,
  ap: AssessmentAndPlan,
): ConsultReport {
  const baseOrder = report.sections.length > 0
    ? Math.max(...report.sections.map((s) => s.order)) + 1
    : 0

  const assessmentContent = ap.uncertainty_notes
    ? `${ap.assessment}\n\nUncertainty: ${ap.uncertainty_notes}`
    : ap.assessment

  const assessmentSection: ReportSection = {
    id: 'assessment',
    title: 'Assessment',
    content: `${assessmentContent}\n\nConfidence: ${ap.confidence.toUpperCase()}`,
    source: 'ai_synthesis',
    order: baseOrder,
  }

  const planSection: ReportSection = {
    id: 'plan',
    title: 'Plan',
    content: ap.plan.length > 0
      ? ap.plan.map((item, i) => `${i + 1}. ${item}`).join('\n')
      : 'Plan not generated — insufficient data.',
    source: 'ai_synthesis',
    order: baseOrder + 1,
  }

  report.sections.push(assessmentSection, planSection)

  const fullText = report.sections.map((s) => `## ${s.title}\n\n${s.content}`).join('\n\n---\n\n')
  report.word_count = fullText.split(/\s+/).length

  return report
}
