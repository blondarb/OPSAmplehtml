import { createHash } from 'node:crypto'
import type { CarePathway, ReviewRequirement } from './types'

export const CLINICAL_TIMING_VERSION = 'triage-clinical-timing.v1' as const
export const CLINICAL_TIMING_POLICY_VERSION = 'source-chronology-2026-09-05.v1'

export interface TemporalEvidence {
  quote: string
  startOffset: number
  endOffset: number
}
export type EvidenceTimeV1 =
  | { state: 'known'; precision: 'date' | 'instant'; value: string; evidence: TemporalEvidence[] }
  | { state: 'relative' | 'unknown' | 'conflicting'; evidence: TemporalEvidence[] }

type Deadline =
  | {
      state: 'established'
      policyId: 'immediate_action' | 'ms_relapse_assessment_treatment_window_v1'
      anchor: 'onset' | 'decision_time'
      interval: { value: number; unit: 'elapsed_hours' | 'calendar_days' }
      dueWindow: { earliest: string; latest: string }
      remaining: {
        asOf: string
        earliestDueInSeconds: number
        latestDueInSeconds: number
        state: 'remaining' | 'spans_now' | 'overdue'
      }
      interpretation: string
    }
  | { state: 'indeterminate' | 'not_applicable'; reasons: string[] }

export interface ClinicalTimingV1 {
  schemaVersion: typeof CLINICAL_TIMING_VERSION
  derivationPolicyVersion: string
  sourceDigest: string
  decisionAt: string
  decisionTimeZone: string | null
  chronology: {
    sourceDates: EvidenceTimeV1[]
    onset: EvidenceTimeV1
    lastVerifiedStatus: EvidenceTimeV1
    completedAssessment: { state: 'documented' | 'not_documented' | 'conflicting'; at: EvidenceTimeV1 }
  }
  action: {
    carePathway: CarePathway
    requirement: 'emergency_evaluation_now' | 'immediate_clinician_review' | 'outpatient_assessment' | 'redirect_review' | 'clarify_before_disposition'
  }
  assessmentDeadline: Deadline
  issues: string[]
}

/** Server-internal contract only. No current HTTP route accepts policy selection.
 * A future caller must bind this to an authorized clinician confirmation, not an
 * LLM classification, request-body assertion, diagnosis keyword, or upload time.
 */
export interface ConfirmedTimingPolicy {
  policyId: 'ms_relapse_assessment_treatment_window_v1'
  sourceDigest: string
  confirmedAt: string
  confirmationId: string
}

const ISO_DATE = /^((?:19|20)\d{2})-(\d{2})-(\d{2})$/
const ISO_INSTANT = /^((?:19|20)\d{2}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/

function validDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
function validInstant(value: string): boolean {
  const match = ISO_INSTANT.exec(value)
  return Boolean(match && validDate(match[1]) &&
    /T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d/.test(value) &&
    (value.endsWith('Z') || /[+-](?:0\d|1[0-4]):[0-5]\d$/.test(value)) &&
    Number.isFinite(Date.parse(value)))
}
function unknown(): EvidenceTimeV1 { return { state: 'unknown', evidence: [] } }

/** Small line-header grammar. It preserves the source's assertion and precision;
 * it does not interpret arbitrary prose, infer document boundaries, or establish
 * that a previously completed assessment cleared the current clinical threat.
 */
function readHeader(source: string, label: string): EvidenceTimeV1 {
  const matches = []
  for (const match of source.matchAll(new RegExp(`^[ \\t]*(?:${label})[ \\t]*:[ \\t]*([^\\r\\n]{1,256})$`, 'gim'))) {
    matches.push(match)
    if (matches.length > 8) return unknown()
  }
  if (!matches.length) return unknown()
  const evidence = matches.map(match => ({
    quote: match[0], startOffset: match.index!, endOffset: match.index! + match[0].length,
  }))
  const values = [...new Set(matches.map(match => match[1].trim()))]
  if (values.length !== 1) return { state: 'conflicting', evidence }
  const value = values[0]
  if (validDate(value)) return { state: 'known', precision: 'date', value, evidence }
  if (validInstant(value)) return { state: 'known', precision: 'instant', value, evidence }
  if (/^(?:today|yesterday|\d{1,3} (?:hours?|days?|weeks?) ago)$/i.test(value)) {
    return { state: 'relative', evidence }
  }
  return { state: 'unknown', evidence }
}

function actionFor(carePathway: CarePathway, review?: ReviewRequirement): ClinicalTimingV1['action'] {
  const requirement = carePathway === 'emergency_now' || review === 'emergency_action'
    ? 'emergency_evaluation_now'
    : carePathway === 'same_day_clinician_review' || review === 'immediate_clinician_review'
      ? 'immediate_clinician_review'
      : carePathway === 'undetermined' ? 'clarify_before_disposition'
        : carePathway === 'redirect' ? 'redirect_review' : 'outpatient_assessment'
  return { carePathway, requirement }
}
function establishedDeadline(
  earliest: number, latest: number, decisionAt: string,
  policyId: 'immediate_action' | 'ms_relapse_assessment_treatment_window_v1',
): Deadline {
  const now = Date.parse(decisionAt)
  return {
    state: 'established', policyId,
    anchor: policyId === 'immediate_action' ? 'decision_time' : 'onset',
    interval: policyId === 'immediate_action'
      ? { value: 0, unit: 'elapsed_hours' } : { value: 14, unit: 'calendar_days' },
    dueWindow: { earliest: new Date(earliest).toISOString(), latest: new Date(latest).toISOString() },
    remaining: {
      asOf: decisionAt, earliestDueInSeconds: (earliest - now) / 1000,
      latestDueInSeconds: (latest - now) / 1000,
      state: latest < now ? 'overdue' : earliest <= now ? 'spans_now' : 'remaining',
    },
    interpretation: policyId === 'immediate_action'
      ? 'Act now. This is not an outpatient appointment interval.'
      : 'Assess as early as possible. This is the onset-based MS relapse assessment/treatment window, not permission to wait or a treatment recommendation. Exclude infection and other causes; involve MS expertise.',
  }
}

export function deriveClinicalTiming(input: {
  sourceText: string
  decisionAt: string
  decisionTimeZone?: string | null
  carePathway: CarePathway
  reviewRequirement?: ReviewRequirement
  confirmedPolicy?: ConfirmedTimingPolicy
}): ClinicalTimingV1 {
  if (!validInstant(input.decisionAt)) throw new Error('Invalid clinical decision clock')
  const sourceDigest = createHash('sha256').update(input.sourceText).digest('hex')
  const onset = readHeader(input.sourceText, 'symptom onset|onset date')
  const status = readHeader(input.sourceText, 'last verified status date')
  const assessment = readHeader(input.sourceText, 'completed assessment date')
  const sourceDate = readHeader(input.sourceText, 'note date|document date|encounter date')
  const action = actionFor(input.carePathway, input.reviewRequirement)
  const issues: string[] = []
  if (sourceDate.state === 'known') issues.push('document_date_is_not_current_status_or_onset')
  if (onset.state !== 'known') issues.push(`onset_${onset.state}`)
  if (status.state !== 'known') issues.push(`current_status_${status.state}`)
  if (assessment.state === 'known') issues.push('documented_assessment_date_does_not_establish_clearance')
  let assessmentDeadline: Deadline = { state: 'indeterminate', reasons: ['no_confirmed_condition_timing_policy'] }
  if (action.requirement === 'emergency_evaluation_now' || action.requirement === 'immediate_clinician_review') {
    const now = Date.parse(input.decisionAt)
    assessmentDeadline = establishedDeadline(now, now, input.decisionAt, 'immediate_action')
  } else if (input.confirmedPolicy) {
    const policy = input.confirmedPolicy
    const reasons: string[] = []
    if (policy.policyId !== 'ms_relapse_assessment_treatment_window_v1') reasons.push('unsupported_timing_policy')
    if (policy.sourceDigest !== sourceDigest || !policy.confirmationId?.trim() ||
        !validInstant(policy.confirmedAt) || Date.parse(policy.confirmedAt) > Date.parse(input.decisionAt)) {
      reasons.push('unverified_policy_confirmation')
    }
    if (onset.state !== 'known') reasons.push(`onset_${onset.state}`)
    // Calendar arithmetic needs a declared supported zone. Other zones remain
    // indeterminate until their DST/calendar behavior is independently tested.
    if (input.decisionTimeZone !== 'UTC') reasons.push('supported_calendar_timezone_required')
    if (onset.state === 'known' && Date.parse(onset.precision === 'date' ? `${onset.value}T00:00:00Z` : onset.value) > Date.parse(input.decisionAt)) {
      reasons.push('onset_after_decision')
    }
    if (sourceDate.state === 'conflicting' || status.state === 'conflicting' || assessment.state === 'conflicting') reasons.push('conflicting_chronology')
    if (!reasons.length && onset.state === 'known') {
      const earliest = Date.parse(onset.precision === 'date' ? `${onset.value}T00:00:00Z` : onset.value) + 14 * 86_400_000
      const latest = earliest + (onset.precision === 'date' ? 86_400_000 - 1 : 0)
      assessmentDeadline = establishedDeadline(earliest, latest, input.decisionAt, policy.policyId)
    } else assessmentDeadline = { state: 'indeterminate', reasons }
  }
  return {
    schemaVersion: CLINICAL_TIMING_VERSION, derivationPolicyVersion: CLINICAL_TIMING_POLICY_VERSION,
    sourceDigest, decisionAt: input.decisionAt, decisionTimeZone: input.decisionTimeZone ?? null,
    chronology: {
      sourceDates: sourceDate.evidence.length ? [sourceDate] : [], onset, lastVerifiedStatus: status,
      completedAssessment: {
        state: assessment.state === 'conflicting' ? 'conflicting' : assessment.state === 'known' ? 'documented' : 'not_documented',
        at: assessment,
      },
    },
    action, assessmentDeadline, issues,
  }
}

/** Keep the persisted safety floor authoritative even if it rose after fusion. */
export function withClinicalTimingAction(timing: ClinicalTimingV1, carePathway: CarePathway, reviewRequirement: ReviewRequirement): ClinicalTimingV1 {
  const action = actionFor(carePathway, reviewRequirement)
  return {
    ...timing, action,
    assessmentDeadline: action.requirement === 'emergency_evaluation_now' || action.requirement === 'immediate_clinician_review'
      ? establishedDeadline(Date.parse(timing.decisionAt), Date.parse(timing.decisionAt), timing.decisionAt, 'immediate_action')
      : timing.assessmentDeadline,
  }
}

/** Optional projection for existing rows. Re-derive our current version from its
 * exact persisted source and clock instead of trusting arbitrary stored dates or
 * numeric remaining-time fields. Historical rows stay absent, never backfilled.
 * Confirmed condition policies are not accepted by today's HTTP ingestion path.
 */
export function projectClinicalTiming(snapshot: unknown, sourceText: unknown, carePathway: CarePathway, reviewRequirement: ReviewRequirement): ClinicalTimingV1 | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || typeof sourceText !== 'string') return null
  const stored = (snapshot as Record<string, unknown>).clinicalTiming
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null
  const timing = stored as Record<string, unknown>
  if (timing.schemaVersion !== CLINICAL_TIMING_VERSION || timing.derivationPolicyVersion !== CLINICAL_TIMING_POLICY_VERSION ||
      typeof timing.decisionAt !== 'string' || !validInstant(timing.decisionAt) ||
      timing.sourceDigest !== createHash('sha256').update(sourceText).digest('hex')) return null
  return deriveClinicalTiming({
    sourceText, decisionAt: timing.decisionAt, carePathway, reviewRequirement,
    decisionTimeZone: timing.decisionTimeZone === 'UTC' ? 'UTC' : null,
  })
}
