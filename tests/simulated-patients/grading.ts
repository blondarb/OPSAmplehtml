/**
 * Grading Rubric for the Simulated Patient E2E Test Agent.
 *
 * Evaluates pipeline output quality across 5 dimensions:
 *   - Triage accuracy (pass/fail → 0 or 100)
 *   - Red flag detection (0-100)
 *   - DDx completeness (0-100, missing dangerous diagnoses = 0)
 *   - History thoroughness (0-100)
 *   - Report quality (0-100)
 */

import type {
  PatientPersona,
  TriageAPIResponse,
  LocalizerResponse,
  ReportResponse,
  GradeResult,
  GradeItem,
} from './types'
import { triageUrgencyMatches, redFlagMatches, ddxContains } from './helpers'

// ── Triage Accuracy (pass/fail → 0 or 100) ───────────────────────────────────

export function gradeTriageAccuracy(
  triageResult: TriageAPIResponse | null,
  persona: PatientPersona,
): GradeItem {
  if (!triageResult) {
    return {
      score: 0,
      max_score: 100,
      pass: false,
      details: 'Triage step did not produce a result',
    }
  }

  const expectedUrgency = persona.expectedTriage.urgency
  const actualUrgency = triageResult.triage_tier
  const match = triageUrgencyMatches(actualUrgency, expectedUrgency)

  // Check if the actual tier is at least as urgent when the expected is emergent/urgent
  // (over-triaging is safer than under-triaging)
  const urgencyOrder = ['emergent', 'urgent', 'semi_urgent', 'routine_priority', 'routine', 'non_urgent']
  const actualIdx = urgencyOrder.indexOf(actualUrgency.toLowerCase().replace(/[^a-z_]/g, ''))
  const expectedIdx = urgencyOrder.indexOf(expectedUrgency.toLowerCase().replace(/[^a-z_]/g, ''))

  const overTriaged = actualIdx >= 0 && expectedIdx >= 0 && actualIdx < expectedIdx
  const underTriaged = actualIdx >= 0 && expectedIdx >= 0 && actualIdx > expectedIdx

  let details = `Expected: ${expectedUrgency}, Got: ${actualUrgency}. `
  if (match) {
    details += 'Exact match.'
  } else if (overTriaged) {
    details += 'Over-triaged (more urgent than expected) — clinically safer but not exact.'
  } else if (underTriaged) {
    details += 'UNDER-TRIAGED — patient triaged less urgently than expected. This is a safety concern.'
  } else {
    details += 'Tier mismatch.'
  }

  details += ` Subspecialty: expected "${persona.expectedTriage.subspecialty}", got "${triageResult.subspecialty_recommendation}".`
  details += ` Confidence: ${triageResult.confidence}.`

  // Strict pass: exact match only. Over-triage gets partial credit.
  const score = match ? 100 : overTriaged ? 75 : 0
  const pass = match || overTriaged

  return { score, max_score: 100, pass, details }
}

// ── Red Flag Detection (0-100) ────────────────────────────────────────────────

export function gradeRedFlagDetection(
  triageResult: TriageAPIResponse | null,
  localizerResult: LocalizerResponse | null,
  persona: PatientPersona,
): GradeItem {
  const expectedFlags = persona.expectedRedFlags

  // If no red flags are expected, check that none were falsely detected
  if (expectedFlags.length === 0) {
    const detectedFlags = [
      ...(triageResult?.red_flags || []),
    ]
    if (detectedFlags.length === 0) {
      return {
        score: 100,
        max_score: 100,
        pass: true,
        details: 'No red flags expected; none detected. Correct.',
      }
    }
    // Some red flags detected when none expected — not necessarily wrong (conservative is OK)
    return {
      score: 80,
      max_score: 100,
      pass: true,
      details: `No red flags expected, but ${detectedFlags.length} detected: ${detectedFlags.join(', ')}. Conservative detection is acceptable.`,
    }
  }

  // Combine red flags from triage and localizer
  const allDetected = [
    ...(triageResult?.red_flags || []),
  ]

  const { found, missing } = redFlagMatches(allDetected, expectedFlags)

  const detectionRate = found.length / expectedFlags.length
  const score = Math.round(detectionRate * 100)

  let details = `Detected ${found.length}/${expectedFlags.length} expected red flags.`
  if (found.length > 0) details += ` Found: ${found.join(', ')}.`
  if (missing.length > 0) details += ` Missing: ${missing.join(', ')}.`

  // Missing a dangerous red flag is a serious issue
  const pass = missing.length === 0

  return { score, max_score: 100, pass, details }
}

// ── DDx Completeness (0-100) ──────────────────────────────────────────────────

export function gradeDDxCompleteness(
  localizerResult: LocalizerResponse | null,
  persona: PatientPersona,
): GradeItem {
  if (!localizerResult || localizerResult.differential.length === 0) {
    return {
      score: 0,
      max_score: 100,
      pass: false,
      details: 'Localizer did not produce a differential diagnosis',
    }
  }

  const { found, missing } = ddxContains(localizerResult.differential, persona.expectedDDx)

  // Calculate score
  const expectedTotal = persona.expectedDDx.length
  const foundCount = found.length

  // Bonus for likelihood matching
  const likelihoodMatches = found.filter((f) => f.likelihoodMatch).length
  const likelihoodBonus = (likelihoodMatches / Math.max(expectedTotal, 1)) * 10

  const baseScore = (foundCount / expectedTotal) * 90
  const score = Math.min(100, Math.round(baseScore + likelihoodBonus))

  // Check if any high-likelihood expected diagnoses are missing
  const missingHighLikelihood = persona.expectedDDx
    .filter((d) => d.likelihood === 'high')
    .filter((d) => missing.includes(d.diagnosis))

  // Missing a high-likelihood diagnosis is a critical failure
  const pass = missingHighLikelihood.length === 0

  let details = `Found ${foundCount}/${expectedTotal} expected diagnoses.`
  if (found.length > 0) {
    details += ` Matched: ${found.map((f) => `${f.expected} -> ${f.actual}${f.likelihoodMatch ? ' (likelihood match)' : ''}`).join('; ')}.`
  }
  if (missing.length > 0) {
    details += ` Missing: ${missing.join(', ')}.`
  }
  if (missingHighLikelihood.length > 0) {
    details += ` CRITICAL: Missing high-likelihood diagnosis(es): ${missingHighLikelihood.map((d) => d.diagnosis).join(', ')}.`
  }
  details += ` Localizer confidence: ${localizerResult.confidence}.`

  return { score, max_score: 100, pass, details }
}

// ── History Thoroughness (0-100) ───────────────────────────────────────────────

export function gradeHistoryThoroughness(
  structuredOutput: Record<string, unknown> | null,
  persona: PatientPersona,
): GradeItem {
  if (!structuredOutput) {
    return {
      score: 0,
      max_score: 100,
      pass: false,
      details: 'No structured history output available',
    }
  }

  // OLDCARTS fields that should be populated
  const oldcartsFields = [
    'chief_complaint',
    'onset',
    'location',
    'duration',
    'character',
    'aggravating_factors',
    'relieving_factors',
    'timing',
    'severity',
    'associated_symptoms',
  ]

  // Additional important fields
  const additionalFields = [
    'current_medications',
    'allergies',
    'past_medical_history',
    'family_history',
    'social_history',
    'review_of_systems',
  ]

  const allFields = [...oldcartsFields, ...additionalFields]
  const populatedFields: string[] = []
  const emptyFields: string[] = []

  for (const field of allFields) {
    const value = structuredOutput[field]
    if (value && typeof value === 'string' && value.trim().length > 0) {
      populatedFields.push(field)
    } else if (Array.isArray(value) && value.length > 0) {
      populatedFields.push(field)
    } else {
      emptyFields.push(field)
    }
  }

  // OLDCARTS completeness is weighted more heavily (60% of score)
  const oldcartsPopulated = oldcartsFields.filter((f) => populatedFields.includes(f))
  const additionalPopulated = additionalFields.filter((f) => populatedFields.includes(f))

  const oldcartsScore = (oldcartsPopulated.length / oldcartsFields.length) * 60
  const additionalScore = (additionalPopulated.length / additionalFields.length) * 40
  const score = Math.round(oldcartsScore + additionalScore)

  const pass = oldcartsPopulated.length >= 8 // Allow 2 OLDCARTS fields to be missing

  let details = `${populatedFields.length}/${allFields.length} fields populated.`
  details += ` OLDCARTS: ${oldcartsPopulated.length}/${oldcartsFields.length}.`
  details += ` Additional: ${additionalPopulated.length}/${additionalFields.length}.`
  if (emptyFields.length > 0) {
    details += ` Empty: ${emptyFields.join(', ')}.`
  }

  return { score, max_score: 100, pass, details }
}

// ── Report Quality (0-100) ────────────────────────────────────────────────────

export function gradeReportQuality(
  reportResult: ReportResponse | null,
  persona: PatientPersona,
): GradeItem {
  if (!reportResult || !reportResult.report) {
    return {
      score: 0,
      max_score: 100,
      pass: false,
      details: 'No report generated',
    }
  }

  const report = reportResult.report
  let score = 0
  const checks: string[] = []

  // 1. Sections present (30 points)
  const expectedSections = ['chief_complaint', 'historian_hpi', 'structured_history']
  const sectionIds = report.sections.map((s) => s.id)
  const sectionsFound = expectedSections.filter((s) => sectionIds.includes(s))
  const sectionScore = (sectionsFound.length / expectedSections.length) * 30
  score += sectionScore
  checks.push(`Sections: ${sectionsFound.length}/${expectedSections.length} key sections present (${report.sections.length} total)`)

  // 2. Chief complaint matches (15 points)
  if (report.chief_complaint && report.chief_complaint.length > 10) {
    score += 15
    checks.push('Chief complaint populated')
  } else {
    checks.push('Chief complaint missing or too short')
  }

  // 3. Triage tier present (10 points)
  if (report.triage_tier) {
    score += 10
    checks.push(`Triage tier: ${report.triage_tier}`)
  } else {
    checks.push('Triage tier missing from report')
  }

  // 4. Word count reasonable (15 points)
  if (report.word_count >= 100) {
    score += 15
    checks.push(`Word count: ${report.word_count} (adequate)`)
  } else if (report.word_count >= 50) {
    score += 8
    checks.push(`Word count: ${report.word_count} (minimal)`)
  } else {
    checks.push(`Word count: ${report.word_count} (insufficient)`)
  }

  // 5. Subspecialty present (10 points)
  if (report.subspecialty) {
    score += 10
    checks.push(`Subspecialty: ${report.subspecialty}`)
  } else {
    checks.push('Subspecialty missing from report')
  }

  // 6. Report references correct patient data (20 points)
  const fullText = report.sections.map((s) => s.content).join(' ').toLowerCase()
  let dataPoints = 0
  const dataChecks: string[] = []

  if (fullText.includes(persona.structuredHistory.chief_complaint.toLowerCase().substring(0, 30))) {
    dataPoints++
    dataChecks.push('chief complaint referenced')
  }
  if (persona.demographics.age && fullText.includes(String(persona.demographics.age))) {
    dataPoints++
    dataChecks.push('age referenced')
  }
  // Check if any medication is mentioned
  const meds = persona.intakeData.current_medications.toLowerCase().split(',')
  if (meds.some((m) => fullText.includes(m.trim().split(' ')[0]))) {
    dataPoints++
    dataChecks.push('medications referenced')
  }
  // Check for any diagnosis mention
  if (persona.expectedDDx.some((d) => fullText.includes(d.diagnosis.toLowerCase().split(' ')[0]))) {
    dataPoints++
    dataChecks.push('diagnosis referenced')
  }

  const dataScore = (dataPoints / 4) * 20
  score += dataScore
  checks.push(`Patient data accuracy: ${dataPoints}/4 data points (${dataChecks.join(', ')})`)

  const pass = score >= 50

  return {
    score: Math.round(score),
    max_score: 100,
    pass,
    details: checks.join('. '),
  }
}

// ── Combined Grade ────────────────────────────────────────────────────────────

export function computeGrade(
  triageResult: TriageAPIResponse | null,
  localizerResult: LocalizerResponse | null,
  structuredOutput: Record<string, unknown> | null,
  reportResult: ReportResponse | null,
  persona: PatientPersona,
): GradeResult {
  const triage_accuracy = gradeTriageAccuracy(triageResult, persona)
  const red_flag_detection = gradeRedFlagDetection(triageResult, localizerResult, persona)
  const ddx_completeness = gradeDDxCompleteness(localizerResult, persona)
  const history_thoroughness = gradeHistoryThoroughness(structuredOutput, persona)
  const report_quality = gradeReportQuality(reportResult, persona)

  // Weighted overall score
  // Triage and red flags are most critical (safety), DDx is next, history and report are quality measures
  const overall_score = Math.round(
    triage_accuracy.score * 0.25 +
    red_flag_detection.score * 0.25 +
    ddx_completeness.score * 0.20 +
    history_thoroughness.score * 0.15 +
    report_quality.score * 0.15,
  )

  return {
    triage_accuracy,
    red_flag_detection,
    ddx_completeness,
    history_thoroughness,
    report_quality,
    overall_score,
  }
}

// ── Report Formatting ─────────────────────────────────────────────────────────

export function formatGradeReport(grade: GradeResult, personaName: string): string {
  const lines: string[] = [
    `\n${'='.repeat(70)}`,
    `GRADE REPORT: ${personaName}`,
    `${'='.repeat(70)}`,
    '',
    `Overall Score: ${grade.overall_score}/100`,
    '',
    formatGradeItem('Triage Accuracy', grade.triage_accuracy),
    formatGradeItem('Red Flag Detection', grade.red_flag_detection),
    formatGradeItem('DDx Completeness', grade.ddx_completeness),
    formatGradeItem('History Thoroughness', grade.history_thoroughness),
    formatGradeItem('Report Quality', grade.report_quality),
    `${'='.repeat(70)}`,
  ]
  return lines.join('\n')
}

function formatGradeItem(name: string, item: GradeItem): string {
  const status = item.pass ? 'PASS' : 'FAIL'
  return [
    `  ${name}: ${item.score}/${item.max_score} [${status}]`,
    `    ${item.details}`,
    '',
  ].join('\n')
}
