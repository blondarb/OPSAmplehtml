/**
 * Report Builder — Phase 7
 *
 * Assembles all pipeline outputs into a unified ConsultReport.
 * This is a pure function — no DB access, no side effects.
 */

import type { NeurologyConsult } from '../types'
import type {
  ConsultReport,
  ReportSection,
  ReportScaleResult,
  ReportDifferentialEntry,
  ReportBodyMapSummary,
  ReportMeasurementSummary,
  ReportSDNESummary,
  ReportRedFlagSummary,
} from './report-types'

interface ReportBuilderInput {
  consult: NeurologyConsult
  /** Scale results from the scale_results table */
  scaleResults?: Array<{
    scale_id: string
    scale_name: string
    abbreviation: string
    total_score: number
    max_score: number
    severity: string
    interpretation: string
  }>
  /** Localizer differential from the consult */
  localizerDifferential?: Array<{
    diagnosis: string
    likelihood: string
    rationale: string
  }>
  /** Body map markers */
  bodyMapMarkers?: Array<{
    region: string
    symptom_type: string
    severity: string
  }>
  /** Device measurements */
  deviceMeasurements?: Array<{
    measurement_type: string
    result: Record<string, unknown>
  }>
  /** Red flag events */
  redFlagEvents?: Array<{
    flag_name: string
    severity: string
    confidence: number
  }>
}

let sectionOrder = 0
function section(
  id: string,
  title: string,
  content: string,
  source: ReportSection['source'],
): ReportSection {
  return { id, title, content, source, order: sectionOrder++ }
}

/**
 * Build a complete ConsultReport from all available pipeline data.
 */
export function buildConsultReport(input: ReportBuilderInput): ConsultReport {
  const { consult } = input
  sectionOrder = 0

  const sections: ReportSection[] = []
  const now = new Date().toISOString()

  // ── 1. Chief Complaint & Triage ─────────────────────────────────────────
  if (consult.triage_chief_complaint || consult.triage_summary) {
    const lines: string[] = []
    if (consult.triage_chief_complaint) {
      lines.push(consult.triage_chief_complaint)
    }
    if (consult.triage_tier_display) {
      lines.push(`\nTriage Priority: ${consult.triage_tier_display}`)
    }
    if (consult.triage_subspecialty) {
      lines.push(`Recommended Subspecialty: ${consult.triage_subspecialty}`)
    }
    if (consult.triage_summary) {
      lines.push(`\n${consult.triage_summary}`)
    }
    sections.push(section('chief_complaint', 'Chief Complaint & Triage', lines.join('\n'), 'triage'))
  }

  // ── 2. Intake Summary ──────────────────────────────────────────────────
  if (consult.intake_summary) {
    let content = consult.intake_summary
    if (consult.intake_escalation_level && consult.intake_escalation_level !== 'none') {
      content += `\n\nEscalation Level: ${consult.intake_escalation_level.toUpperCase()}`
    }
    sections.push(section('intake', 'Pre-Visit Intake Summary', content, 'intake'))
  }

  // ── 3. AI Historian HPI ────────────────────────────────────────────────
  if (consult.historian_summary) {
    sections.push(section('historian_hpi', 'History of Present Illness', consult.historian_summary, 'historian'))
  }

  // ── 4. Historian Structured Output ─────────────────────────────────────
  if (consult.historian_structured_output) {
    const so = consult.historian_structured_output as Record<string, unknown>
    const structuredLines: string[] = []

    const fieldLabels: Record<string, string> = {
      chief_complaint: 'Chief Complaint',
      onset: 'Onset',
      location: 'Location',
      duration: 'Duration',
      character: 'Character',
      alleviating_factors: 'Alleviating Factors',
      aggravating_factors: 'Aggravating Factors',
      radiation: 'Radiation',
      timing: 'Timing',
      severity: 'Severity',
      associated_symptoms: 'Associated Symptoms',
      medications: 'Current Medications',
      allergies: 'Allergies',
      past_medical_history: 'Past Medical History',
      family_history: 'Family History',
      social_history: 'Social History',
      review_of_systems: 'Review of Systems',
    }

    for (const [key, label] of Object.entries(fieldLabels)) {
      const val = so[key]
      if (val && typeof val === 'string' && val.trim()) {
        structuredLines.push(`${label}: ${val}`)
      } else if (Array.isArray(val) && val.length > 0) {
        structuredLines.push(`${label}: ${val.join(', ')}`)
      }
    }

    if (structuredLines.length > 0) {
      sections.push(section('structured_history', 'Structured History (OLDCARTS)', structuredLines.join('\n'), 'historian'))
    }
  }

  // ── 5. Localizer Differential ──────────────────────────────────────────
  const differential: ReportDifferentialEntry[] = (input.localizerDifferential || []).map((d) => ({
    diagnosis: d.diagnosis,
    likelihood: d.likelihood,
    rationale: d.rationale,
  }))

  if (differential.length > 0) {
    const lines = differential.map(
      (d) => `• ${d.diagnosis} (${d.likelihood})\n  ${d.rationale}`,
    )
    sections.push(section('differential', 'AI-Generated Differential Diagnosis', lines.join('\n\n'), 'localizer'))
  }

  // ── 6. Clinical Scales ─────────────────────────────────────────────────
  const scaleResults: ReportScaleResult[] = (input.scaleResults || []).map((s) => ({
    scale_name: s.scale_name,
    abbreviation: s.abbreviation,
    score: s.total_score,
    max_score: s.max_score,
    severity: s.severity,
    interpretation: s.interpretation,
  }))

  if (scaleResults.length > 0) {
    const lines = scaleResults.map(
      (s) => `${s.scale_name} (${s.abbreviation}): ${s.score}/${s.max_score} — ${s.severity}\n  ${s.interpretation}`,
    )
    sections.push(section('scales', 'Clinical Scale Results', lines.join('\n\n'), 'scales'))
  }

  // ── 7. Red Flags ───────────────────────────────────────────────────────
  const redFlagList = input.redFlagEvents || []
  const redFlags: ReportRedFlagSummary = {
    count: redFlagList.length,
    highest_severity: redFlagList.length > 0 ? redFlagList[0].severity : null,
    flags: redFlagList.map((f) => ({
      name: f.flag_name,
      severity: f.severity,
      confidence: f.confidence,
    })),
  }

  if (redFlags.count > 0) {
    const lines = redFlags.flags.map(
      (f) => `• ${f.name} — ${f.severity} (confidence: ${(f.confidence * 100).toFixed(0)}%)`,
    )
    sections.push(
      section(
        'red_flags',
        'Red Flag Alerts',
        `${redFlags.count} red flag(s) detected:\n\n${lines.join('\n')}`,
        'red_flags',
      ),
    )
  }

  // ── 8. SDNE Results ────────────────────────────────────────────────────
  let sdneSummary: ReportSDNESummary | null = null
  if (consult.sdne_session_flag && consult.sdne_domain_flags) {
    const abnormal = Object.entries(consult.sdne_domain_flags)
      .filter(([d, f]) => d !== 'Setup' && f !== 'GREEN' && f !== 'NOT_PERFORMED')
      .map(([domain, flag]) => ({ domain, flag }))

    sdneSummary = {
      session_flag: consult.sdne_session_flag,
      abnormal_domains: abnormal,
      detected_patterns: consult.sdne_detected_patterns || [],
    }

    const lines: string[] = [`Overall: ${sdneSummary.session_flag}`]
    if (abnormal.length > 0) {
      lines.push(`\nAbnormal Domains:`)
      abnormal.forEach((d) => lines.push(`  • ${d.domain}: ${d.flag}`))
    }
    if (sdneSummary.detected_patterns.length > 0) {
      lines.push(`\nDetected Patterns:`)
      sdneSummary.detected_patterns.forEach((p) =>
        lines.push(`  • ${p.description} (${p.confidence})`),
      )
    }
    sections.push(section('sdne', 'Standardized Digital Neurologic Exam', lines.join('\n'), 'sdne'))
  }

  // ── 9. Patient-Reported Body Map ───────────────────────────────────────
  let bodyMap: ReportBodyMapSummary | null = null
  if (input.bodyMapMarkers && input.bodyMapMarkers.length > 0) {
    const regions = [...new Set(input.bodyMapMarkers.map((m) => m.region))]
    const symptomTypes = [...new Set(input.bodyMapMarkers.map((m) => m.symptom_type))]
    const severities = [...new Set(input.bodyMapMarkers.map((m) => m.severity))]

    bodyMap = {
      total_markers: input.bodyMapMarkers.length,
      regions_affected: regions,
      symptom_types: symptomTypes,
      severities,
    }

    const regionLabels = regions.map((r) => r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
    sections.push(
      section(
        'body_map',
        'Patient-Reported Symptom Locations',
        `${bodyMap.total_markers} symptoms marked across ${regions.length} body region(s):\n` +
          `Regions: ${regionLabels.join(', ')}\n` +
          `Types: ${symptomTypes.join(', ')}\n` +
          `Severities: ${severities.join(', ')}`,
        'patient_tools',
      ),
    )
  }

  // ── 10. Device Measurements ────────────────────────────────────────────
  const deviceMeasurements: ReportMeasurementSummary[] = (input.deviceMeasurements || []).map((m) => {
    const result = m.result as Record<string, unknown>
    if (m.measurement_type === 'finger_tapping') {
      return {
        type: 'Finger Tapping',
        hand: (result.hand as string) || undefined,
        key_value: `${(result.tapping_rate as number)?.toFixed(1)} taps/sec`,
        classification: (result.regularity_cv as number) < 0.15 ? 'Very Regular' : 'Variable',
      }
    }
    if (m.measurement_type === 'tremor_detection') {
      return {
        type: 'Tremor Detection',
        hand: (result.hand as string) || undefined,
        key_value: `RMS ${(result.rms_acceleration as number)?.toFixed(3)} m/s²`,
        classification: (result.classification as string) || 'unknown',
      }
    }
    return {
      type: m.measurement_type,
      key_value: 'See raw data',
      classification: 'N/A',
    }
  })

  if (deviceMeasurements.length > 0) {
    const lines = deviceMeasurements.map(
      (m) => `• ${m.type}${m.hand ? ` (${m.hand})` : ''}: ${m.key_value} — ${m.classification}`,
    )
    sections.push(
      section('device_measurements', 'Phone-Based Assessments', lines.join('\n'), 'patient_tools'),
    )
  }

  // ── Physician Corrections (from review step) ────────────────────────────
  if (consult.notes && consult.notes.trim().length > 0) {
    sections.push(
      section(
        'physician_corrections',
        'Physician Corrections & Notes',
        consult.notes.trim(),
        'physician',
      ),
    )
  }

  // ── Historian Red Flags (from historian session) ────────────────────────
  if (consult.historian_red_flags && consult.historian_red_flags.length > 0) {
    const lines = consult.historian_red_flags.map(
      (rf) => `• ${rf.flag} (${rf.severity}): ${rf.context}`,
    )
    sections.push(
      section('historian_red_flags', 'Historian Red Flags', lines.join('\n'), 'historian'),
    )
  }

  // ── Calculate word count ────────────────────────────────────────────────
  const fullText = sections.map((s) => `## ${s.title}\n\n${s.content}`).join('\n\n---\n\n')
  const wordCount = fullText.split(/\s+/).length

  return {
    id: '', // Set by the API when persisting
    consult_id: consult.id,
    status: 'draft',
    patient_name: null,
    exam_date: consult.created_at,
    chief_complaint: consult.triage_chief_complaint || 'Neurological consultation',
    triage_tier: consult.triage_tier_display || null,
    subspecialty: consult.triage_subspecialty || null,
    sections,
    scale_results: scaleResults,
    differential,
    body_map: bodyMap,
    device_measurements: deviceMeasurements,
    sdne_summary: sdneSummary,
    red_flags: redFlags,
    generated_at: now,
    generated_by: 'system',
    word_count: wordCount,
  }
}
