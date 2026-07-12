import { TIER_DISPLAY, type TriageResult } from './types'
import {
  DATA_CONFLICT_INFORMATION,
  INSUFFICIENT_DATA_INFORMATION,
  triageOutputPolicy,
} from './triageOutputPolicy'

export function buildTriageReport(result: TriageResult): string {
  const policy = triageOutputPolicy(result)
  const lines: string[] = []

  lines.push('=== NEUROLOGY TRIAGE RECOMMENDATION ===')
  lines.push('')
  lines.push(`Triage Tier: ${TIER_DISPLAY[result.triage_tier].label}`)
  lines.push(`Recommended Timeframe: ${policy.timeframe}`)
  lines.push(`Confidence: ${result.confidence}`)
  if (
    typeof result.weighted_score === 'number' &&
    Number.isFinite(result.weighted_score)
  ) {
    lines.push(`Weighted Score: ${result.weighted_score.toFixed(2)}`)
  }
  lines.push('')

  if (policy.safetyConflict) {
    lines.push('SAFETY CONFLICT')
    lines.push(
      'Emergency markers conflict with the projected care pathway. Human review hold required before scheduling or outpatient disposition.',
    )
    lines.push('')
  } else if (policy.timeframe === 'Emergency evaluation now') {
    lines.push(
      'Emergency action remains active. Human review hold required before scheduling or outpatient disposition.',
    )
    lines.push('')
  }

  if (policy.dataConflict) {
    lines.push('DATA CONFLICT')
    lines.push(
      'Conflicting clinical information requires clinician reconciliation before any final disposition.',
    )
    lines.push('Scheduling remains locked.')
    lines.push('')
  }

  if (policy.insufficientDataHold) {
    lines.push('INSUFFICIENT / UNDETERMINED DATA HOLD')
    lines.push(
      'Human review is required before outpatient workup, routing, or final disposition.',
    )
    lines.push('Scheduling remains locked.')
    lines.push('')
  }

  const missingInformation = result.missing_information?.length
    ? result.missing_information
    : Array.from(
        new Set([
          ...(policy.dataConflict ? [DATA_CONFLICT_INFORMATION] : []),
          ...(policy.insufficientDataHold
            ? [INSUFFICIENT_DATA_INFORMATION]
            : []),
        ]),
      )

  if (policy.showMissingInformation) {
    lines.push('Missing Information:')
    missingInformation.forEach((item) => lines.push(`  - ${item}`))
    if (policy.timeframe === 'Emergency evaluation now') {
      lines.push(
        'The active emergency action remains in effect. Information gathering must not delay emergency evaluation.',
      )
    } else if (policy.timeframe === 'Same-day clinician review') {
      lines.push(
        'Information gathering must not delay same-day clinician review.',
      )
    } else {
      lines.push(
        'The active triage timeframe remains in effect while this information is obtained.',
      )
    }
    lines.push(
      policy.schedulingLocked
        ? 'Scheduling remains locked.'
        : 'Scheduling is not currently locked.',
    )
    lines.push('')
  }

  if (result.clinical_reasons.length) {
    lines.push('Clinical Reasons:')
    result.clinical_reasons.forEach((reason, index) =>
      lines.push(`  ${index + 1}. ${reason}`),
    )
    lines.push('')
  }

  if (result.red_flags.length) {
    lines.push('Red Flags:')
    result.red_flags.forEach((flag) => lines.push(`  - ${flag}`))
    lines.push('')
  } else {
    lines.push('Red Flags: None identified')
    lines.push('')
  }

  if (result.failed_therapies.length) {
    lines.push('Failed/Previously Tried Therapies:')
    result.failed_therapies.forEach((therapy) => {
      lines.push(
        `  - ${therapy.therapy}${therapy.reason_stopped ? ` (${therapy.reason_stopped})` : ''}`,
      )
    })
    lines.push('')
  }

  if (policy.showPreVisitWorkup && result.suggested_workup.length) {
    lines.push('Suggested Pre-Visit Workup:')
    result.suggested_workup.forEach((workup) => lines.push(`  - ${workup}`))
    if (policy.timeframe === 'Same-day clinician review') {
      lines.push(
        '  Non-blocking: this workup must not delay same-day clinician review.',
      )
    }
    lines.push('')
  }

  if (
    policy.showOutpatientRouting &&
    result.subspecialty_recommendation
  ) {
    lines.push(`Subspecialty Routing: ${result.subspecialty_recommendation}`)
    if (result.subspecialty_rationale) {
      lines.push(`  Rationale: ${result.subspecialty_rationale}`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push(result.disclaimer)

  return lines.join('\n')
}
