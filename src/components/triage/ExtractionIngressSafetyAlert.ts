import { createElement as h } from 'react'
import type {
  GovernedTriageStartSafetyPathway,
  TriageStartError,
} from '@/lib/triage/pollClient'
import {
  asSafetyWorkflowIdentitySuppressionReason,
  MODEL_SAFETY_WORKFLOW_PERSISTENCE_FAILED_REASON,
  SAFETY_PATHWAY_PROJECTION_CONFLICT_REASON,
  SAFETY_WORKFLOW_IDENTITY_CONFLICT_REASON,
} from '@/lib/triage/pollSafetyState'
import { MODEL_SAFETY_EVIDENCE_PERSISTENCE_FAILED_REASON } from '@/lib/triage/longPacketSafetyPersistenceFailure'

export interface ExtractionIngressSafetyNotice {
  immediateReviewRequired: boolean
  safetyTriageSessionId: string | null
  sourceLabel?: string
  safetyPathway?: GovernedTriageStartSafetyPathway
  outpatientScoringBlocked: boolean
  humanReviewRequired: boolean
  schedulingLocked: boolean
  safetyWorkflowIdentityConflict?: boolean
  holdReason?: string
}

function safetyNoticeRank(
  notice: ExtractionIngressSafetyNotice | null,
): number {
  if (notice?.safetyPathway === 'emergency_now') return 3
  if (notice?.safetyPathway === 'same_day_clinician_review') return 2
  if (
    notice &&
    (notice.safetyTriageSessionId || notice.sourceLabel) &&
    (notice.immediateReviewRequired ||
      notice.humanReviewRequired ||
      notice.outpatientScoringBlocked)
  ) {
    return 1
  }
  return 0
}

export function mergeExtractionIngressSafetyNotice(
  previous: ExtractionIngressSafetyNotice | null,
  incoming: ExtractionIngressSafetyNotice,
): ExtractionIngressSafetyNotice {
  const previousRank = safetyNoticeRank(previous)
  const incomingRank = safetyNoticeRank(incoming)
  // Events are ordered within one referral. Higher severity wins; at equal
  // governed severity the latest identity context wins as an indivisible unit.
  // Pathless holds fill missing identity fields without discarding fields that
  // were already established for this referral.
  const winningContext =
    !previous || incomingRank >= previousRank ? incoming : previous
  const mergePathlessIdentity = previousRank === 1 && incomingRank === 1
  const explicitWorkflowConflict = Boolean(
      previous?.safetyTriageSessionId &&
      incoming.safetyTriageSessionId &&
      previous.safetyTriageSessionId !== incoming.safetyTriageSessionId,
  )
  const previousPathwayProjectionConflict =
    previous?.holdReason === SAFETY_PATHWAY_PROJECTION_CONFLICT_REASON
  const incomingPathwayProjectionConflict =
    incoming.holdReason === SAFETY_PATHWAY_PROJECTION_CONFLICT_REASON
  const safetyPathwayProjectionConflict = Boolean(
    previousPathwayProjectionConflict ||
      incomingPathwayProjectionConflict,
  )
  const safetyWorkflowIdentityConflict = Boolean(
    incoming.safetyWorkflowIdentityConflict ||
      explicitWorkflowConflict ||
      previous?.safetyWorkflowIdentityConflict,
  )
  const workflowIdentitySuppressionReason =
    asSafetyWorkflowIdentitySuppressionReason(incoming.holdReason) ??
    asSafetyWorkflowIdentitySuppressionReason(previous?.holdReason)
  const recoveredPersistedWorkflow = Boolean(
    incoming.safetyTriageSessionId &&
      (workflowIdentitySuppressionReason ===
        MODEL_SAFETY_WORKFLOW_PERSISTENCE_FAILED_REASON ||
        workflowIdentitySuppressionReason ===
          MODEL_SAFETY_EVIDENCE_PERSISTENCE_FAILED_REASON),
  )
  const safetyTriageSessionId =
    safetyWorkflowIdentityConflict ||
    (workflowIdentitySuppressionReason && !recoveredPersistedWorkflow)
      ? null
      : previousPathwayProjectionConflict
        ? previous?.safetyTriageSessionId ?? null
        : incomingPathwayProjectionConflict
          ? (previous?.safetyTriageSessionId ??
            incoming.safetyTriageSessionId)
          : mergePathlessIdentity
            ? (previous?.safetyTriageSessionId ??
              incoming.safetyTriageSessionId)
            : winningContext.safetyTriageSessionId
  const pathlessSourceLabel = (() => {
    const established = previous?.sourceLabel
    const next = incoming.sourceLabel
    if (established && next && established !== next) return undefined
    return established ?? next
  })()
  const sourceLabel = safetyWorkflowIdentityConflict
    ? pathlessSourceLabel
    : mergePathlessIdentity
      ? (previous?.sourceLabel ?? incoming.sourceLabel)
      : winningContext.sourceLabel
  return {
    immediateReviewRequired: Boolean(
      previous?.immediateReviewRequired ||
        incoming.immediateReviewRequired ||
        winningContext.safetyPathway,
    ),
    safetyTriageSessionId,
    ...(sourceLabel
      ? { sourceLabel }
      : {}),
    ...(winningContext.safetyPathway
      ? { safetyPathway: winningContext.safetyPathway }
      : {}),
    outpatientScoringBlocked: Boolean(
      safetyWorkflowIdentityConflict ||
        workflowIdentitySuppressionReason ||
        safetyPathwayProjectionConflict ||
        previous?.outpatientScoringBlocked ||
        incoming.outpatientScoringBlocked,
    ),
    humanReviewRequired: Boolean(
      safetyWorkflowIdentityConflict ||
        workflowIdentitySuppressionReason ||
        safetyPathwayProjectionConflict ||
        previous?.humanReviewRequired ||
        incoming.humanReviewRequired ||
        incoming.immediateReviewRequired ||
        incoming.outpatientScoringBlocked ||
        winningContext.safetyPathway,
    ),
    schedulingLocked: Boolean(
      safetyWorkflowIdentityConflict ||
        workflowIdentitySuppressionReason ||
        safetyPathwayProjectionConflict ||
        previous?.schedulingLocked ||
        incoming.schedulingLocked ||
        previous?.immediateReviewRequired ||
        incoming.immediateReviewRequired ||
        previous?.humanReviewRequired ||
        incoming.humanReviewRequired ||
        previous?.outpatientScoringBlocked ||
        incoming.outpatientScoringBlocked ||
        winningContext.safetyPathway,
    ),
    ...(safetyWorkflowIdentityConflict
      ? {
          safetyWorkflowIdentityConflict: true,
          holdReason: SAFETY_WORKFLOW_IDENTITY_CONFLICT_REASON,
        }
      : workflowIdentitySuppressionReason
        ? { holdReason: workflowIdentitySuppressionReason }
        : safetyPathwayProjectionConflict
          ? { holdReason: SAFETY_PATHWAY_PROJECTION_CONFLICT_REASON }
          : incoming.holdReason
            ? { holdReason: incoming.holdReason }
            : previous?.holdReason
              ? { holdReason: previous.holdReason }
              : {}),
  }
}

export function mergeBatchItemSafetyNotice<
  T extends { id: string; safetyNotice?: ExtractionIngressSafetyNotice },
>(
  items: readonly T[],
  batchItemId: string,
  incoming: ExtractionIngressSafetyNotice,
): T[] {
  return items.map((item) =>
    item.id === batchItemId
      ? {
          ...item,
          safetyNotice: mergeExtractionIngressSafetyNotice(
            item.safetyNotice ?? null,
            incoming,
          ),
        }
      : item,
  )
}

export function retainExtractionIngressSafetyNotice(
  previous: ExtractionIngressSafetyNotice | null,
  error: TriageStartError,
): ExtractionIngressSafetyNotice | null {
  const hasSafetyState = Boolean(
    previous ||
      error.safetyPathway ||
      error.immediateActionRequired ||
      error.outpatientScoringBlocked ||
      error.humanReviewRequired ||
      error.safetyWorkflowIdentityConflict,
  )
  if (!hasSafetyState) return null

  return mergeExtractionIngressSafetyNotice(previous, {
    immediateReviewRequired: Boolean(
      error.immediateActionRequired || error.safetyPathway,
    ),
    safetyTriageSessionId: error.safetyWorkflowIdentityConflict
      ? null
      : (error.safetyWorkflowId ?? null),
    ...(error.safetyPathway ? { safetyPathway: error.safetyPathway } : {}),
    outpatientScoringBlocked: error.outpatientScoringBlocked === true,
    humanReviewRequired: Boolean(
      error.humanReviewRequired ||
      error.immediateActionRequired ||
        error.outpatientScoringBlocked ||
        error.safetyPathway,
    ),
    schedulingLocked: Boolean(
      error.schedulingLocked ||
        error.humanReviewRequired ||
        error.immediateActionRequired ||
        error.outpatientScoringBlocked ||
        error.safetyPathway,
    ),
    ...(error.safetyWorkflowIdentityConflict
      ? { safetyWorkflowIdentityConflict: true }
      : {}),
    ...(error.reason ? { holdReason: error.reason } : {}),
  })
}

interface ExtractionIngressSafetyAlertProps {
  immediateReviewRequired: boolean
  safetyTriageSessionId: string | null
  sourceLabel?: string
  safetyPathway?: 'emergency_now' | 'same_day_clinician_review'
  outpatientScoringBlocked?: boolean
  humanReviewRequired?: boolean
  schedulingLocked?: boolean
  holdReason?: string
  onStartNewReferral?: () => void
}

export default function ExtractionIngressSafetyAlert({
  immediateReviewRequired,
  safetyTriageSessionId,
  sourceLabel,
  safetyPathway,
  outpatientScoringBlocked = false,
  humanReviewRequired = false,
  holdReason,
  onStartNewReferral,
}: ExtractionIngressSafetyAlertProps) {
  const governedPathway =
    safetyPathway === 'emergency_now' ||
    safetyPathway === 'same_day_clinician_review'
      ? safetyPathway
      : undefined
  if (
    !immediateReviewRequired &&
    !humanReviewRequired &&
    !outpatientScoringBlocked &&
    !governedPathway
  ) {
    return null
  }

  const heading =
    governedPathway === 'emergency_now'
      ? 'Emergency evaluation now'
      : governedPathway === 'same_day_clinician_review'
        ? 'Same-day clinician review'
        : immediateReviewRequired
          ? 'Immediate clinician review required'
          : outpatientScoringBlocked
            ? 'Human review required — scoring blocked'
            : 'Human review required — scheduling locked'
  const description = governedPathway
    ? 'Complete-source safety screening requires this action. Missing extraction data does not weaken this action.'
    : immediateReviewRequired
      ? 'Extraction continues in the background, but the complete-source safety gateway has already placed this referral on human review. Do not proceed to routine scheduling.'
      : outpatientScoringBlocked
        ? 'The authoritative extraction cannot support outpatient scoring. Human review is required.'
        : 'A safety review requirement has placed this referral on human review. Routine scheduling remains blocked.'

  return h(
    'div',
    {
      role: 'alert',
      'aria-live': 'assertive',
      className: 'nn-flag',
      style: {
        margin: '0 0 20px',
        padding: '16px',
        border: '2px solid var(--nn-t1)',
      },
    },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'flex-start', gap: '10px' } },
      h(
        'svg',
        {
          'aria-hidden': true,
          width: 22,
          height: 22,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'var(--nn-t1)',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          style: { flexShrink: 0, marginTop: '1px' },
        },
        h('path', {
          d: 'M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z',
        }),
        h('line', { x1: 12, y1: 9, x2: 12, y2: 13 }),
        h('line', { x1: 12, y1: 17, x2: 12.01, y2: 17 }),
      ),
      h(
        'div',
        null,
        h(
          'div',
          { style: { fontSize: 'var(--nn-fs-base)', fontWeight: 700, color: 'var(--nn-t1)' } },
          heading,
        ),
        h(
          'p',
          { style: { margin: '4px 0 0', fontSize: 'var(--nn-fs-sm)', lineHeight: 1.5 } },
          sourceLabel ? `${sourceLabel}: ` : '',
          description,
        ),
        governedPathway
          ? h(
              'p',
              {
                style: {
                  margin: '8px 0 0',
                  fontSize: 'var(--nn-fs-sm)',
                  lineHeight: 1.5,
                  fontWeight: 600,
                },
              },
              'Routine scheduling remains blocked until a clinician completes the governed safety action.',
            )
          : null,
        outpatientScoringBlocked
          ? h(
              'p',
              {
                style: {
                  margin: '8px 0 0',
                  fontSize: 'var(--nn-fs-sm)',
                  lineHeight: 1.5,
                  fontWeight: 600,
                },
              },
              // "Any model score shown" — NOT "the score below". This same flag
              // fires in two different states: after scoring completed (the
              // score renders underneath this banner), and on an ingestion-time
              // hold that fires BEFORE scoring starts, where pageState never
              // reaches 'result' and there is no score on the page at all.
              // Wording that presupposes a visible score is false in the second
              // state. Neither sentence may claim scoring was blocked: the
              // Bedrock scoring call runs unconditionally on every pathway
              // (processTriageInBackground.ts) — what is actually held is
              // scheduling and disposition (workflowPolicy.ts,
              // outpatientFinalDisposition.ts).
              governedPathway
                ? 'Any model score shown is decision support only. It does not unlock scheduling or disposition.'
                : 'Any model score shown is decision support only. Routine scheduling remains blocked until a clinician resolves this human-review hold.',
            )
          : null,
        holdReason === SAFETY_WORKFLOW_IDENTITY_CONFLICT_REASON
          ? h(
              'p',
              {
                style: {
                  margin: '8px 0 0',
                  fontSize: 'var(--nn-fs-sm)',
                  lineHeight: 1.5,
                  fontWeight: 600,
                },
              },
              'Conflicting safety workflow identifiers require a manual hold until a clinician reconciles the referral.',
            )
          : null,
        holdReason === SAFETY_PATHWAY_PROJECTION_CONFLICT_REASON
          ? h(
              'p',
              {
                style: {
                  margin: '8px 0 0',
                  fontSize: 'var(--nn-fs-sm)',
                  lineHeight: 1.5,
                  fontWeight: 600,
                },
              },
              'Conflicting safety pathway projections require a manual hold until a clinician reconciles the referral.',
            )
          : null,
        holdReason === MODEL_SAFETY_WORKFLOW_PERSISTENCE_FAILED_REASON
          ? h(
              'p',
              {
                style: {
                  margin: '8px 0 0',
                  fontSize: 'var(--nn-fs-sm)',
                  lineHeight: 1.5,
                  fontWeight: 700,
                },
              },
              'The automated safety workflow was not created. A clinician must take the emergency or same-day action manually now; do not wait for another automated step.',
            )
          : null,
        h(
          'p',
          { style: { margin: '8px 0 0', fontSize: 'var(--nn-fs-xs)', color: 'var(--nn-t1)' } },
          safetyTriageSessionId
            ? `Safety workflow ID: ${safetyTriageSessionId}`
            : 'Safety workflow ID unavailable — maintain the manual safety hold.',
        ),
        onStartNewReferral
          ? h(
              'div',
              {
                style: {
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--nn-t1)',
                },
              },
              h(
                'p',
                {
                  style: {
                    margin: '0 0 8px',
                    fontSize: 'var(--nn-fs-xs)',
                    lineHeight: 1.5,
                  },
                },
                'Starting a new referral clears this screen only. It does not close or resolve the existing safety workflow or required action.',
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: onStartNewReferral,
                  style: {
                    padding: '8px 12px',
                    borderRadius: 'var(--nn-radius)',
                    border: '1px solid var(--nn-t1)',
                    background: 'transparent',
                    color: 'var(--nn-t1)',
                    fontSize: 'var(--nn-fs-xs)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  },
                },
                'Start New Referral',
              ),
            )
          : null,
      ),
    ),
  )
}
