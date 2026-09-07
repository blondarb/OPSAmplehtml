import type { ClinicalTimingV1 } from './clinicalTiming'

/** Descriptive chronology only; never replaces the authoritative action banner. */
export function clinicalTimingLines(timing?: ClinicalTimingV1 | null): string[] {
  if (!timing) return []
  const onset = timing.chronology.onset
  const lines = [
    `Decision time: ${timing.decisionAt}`,
    onset.state === 'known'
      ? `Source-reported onset: ${onset.value}${onset.precision === 'date' ? ' (date only; time unspecified)' : ''}`
      : `Onset timing: ${onset.state}. Do not infer onset from the document or upload date.`,
  ]
  if (onset.state === 'known' && onset.precision === 'instant') {
    const elapsedHours = (Date.parse(timing.decisionAt) - Date.parse(onset.value)) / 3_600_000
    if (Number.isFinite(elapsedHours) && elapsedHours >= 0) {
      lines.push(`Elapsed since source-reported onset at decision time: ${(elapsedHours / 24).toFixed(1)} days.`)
    }
  }
  const deadline = timing.assessmentDeadline
  if (deadline.state === 'established') {
    lines.push(deadline.interpretation)
    if (deadline.policyId !== 'immediate_action') {
      lines.push(`Onset-based window ends: ${deadline.dueWindow.earliest}${deadline.dueWindow.latest !== deadline.dueWindow.earliest ? ` to ${deadline.dueWindow.latest}` : ''}.`)
    }
  } else {
    lines.push('A condition-specific clinical deadline has not been established. The outpatient tier does not restart an onset-based clock.')
  }
  lines.push('Dates stated in an old note do not establish current status or completed clinical clearance.')
  return lines
}
