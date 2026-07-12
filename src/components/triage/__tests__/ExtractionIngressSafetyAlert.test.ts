import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { TriageStartError } from '@/lib/triage/pollClient'
import ExtractionIngressSafetyAlert, * as safetyAlertModule from '../ExtractionIngressSafetyAlert'

describe('ExtractionIngressSafetyAlert', () => {
  it('visibly reports immediate review and the durable safety workflow id', () => {
    const html = renderToStaticMarkup(
      createElement(ExtractionIngressSafetyAlert, {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'triage-safety-123',
        sourceLabel: 'packet.pdf',
      }),
    )

    expect(html).toContain('Immediate clinician review required')
    expect(html).toContain('packet.pdf')
    expect(html).toContain('triage-safety-123')
    expect(html).toContain('Extraction continues in the background')
  })

  it('offers an explicit new-referral boundary without implying that the active safety action is resolved', () => {
    const html = renderToStaticMarkup(
      createElement(ExtractionIngressSafetyAlert, {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'triage-safety-active',
        safetyPathway: 'emergency_now',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        onStartNewReferral: () => undefined,
      }),
    )

    expect(html).toContain('Start New Referral')
    expect(html).toContain(
      'Starting a new referral clears this screen only. It does not close or resolve the existing safety workflow or required action.',
    )
    expect(html).not.toContain('Dismiss')
  })

  it('renders the exact emergency action without allowing missing data to weaken it', () => {
    const html = renderToStaticMarkup(
      createElement(ExtractionIngressSafetyAlert, {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'triage-emergency-1',
        safetyPathway: 'emergency_now',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
      }),
    )

    expect(html).toContain('Emergency evaluation now')
    expect(html).toContain('Missing extraction data does not weaken this action')
    expect(html).toContain('Outpatient/model scoring is blocked')
    expect(html).toContain('Routine scheduling remains blocked')
    expect(html).toContain('triage-emergency-1')
  })

  it('renders a mandatory manual action when the automated safety workflow was not persisted', () => {
    const html = renderToStaticMarkup(
      createElement(ExtractionIngressSafetyAlert, {
        immediateReviewRequired: true,
        safetyTriageSessionId: null,
        safetyPathway: 'emergency_now',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        holdReason: 'model_safety_workflow_persistence_failed',
      }),
    )

    expect(html).toContain('Emergency evaluation now')
    expect(html).toContain('automated safety workflow was not created')
    expect(html).toContain('must take the emergency or same-day action manually now')
    expect(html).toContain('Safety workflow ID unavailable')
  })

  it('renders the exact same-day clinician action and scoring hold', () => {
    const html = renderToStaticMarkup(
      createElement(ExtractionIngressSafetyAlert, {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'triage-same-day-1',
        safetyPathway: 'same_day_clinician_review',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
      }),
    )

    expect(html).toContain('Same-day clinician review')
    expect(html).toContain('Missing extraction data does not weaken this action')
    expect(html).toContain('Outpatient/model scoring is blocked')
    expect(html).toContain('Routine scheduling remains blocked')
  })

  it.each([
    ['emergency_now', 'Emergency evaluation now'],
    ['same_day_clinician_review', 'Same-day clinician review'],
  ] as const)(
    'states the routine scheduling hold for %s even when scoring is not separately blocked',
    (safetyPathway, heading) => {
      const html = renderToStaticMarkup(
        createElement(ExtractionIngressSafetyAlert, {
          immediateReviewRequired: true,
          safetyTriageSessionId: null,
          safetyPathway,
          outpatientScoringBlocked: false,
          humanReviewRequired: true,
        }),
      )

      expect(html).toContain(heading)
      expect(html).toContain('Routine scheduling remains blocked')
    },
  )

  it('fails visibly safe for a structured missing-summary emergency without a workflow id', () => {
    const html = renderToStaticMarkup(
      createElement(ExtractionIngressSafetyAlert, {
        immediateReviewRequired: true,
        safetyTriageSessionId: null,
        safetyPathway: 'emergency_now',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        holdReason: 'source_extraction_summary_missing',
      }),
    )

    expect(html).toContain('Emergency evaluation now')
    expect(html).toContain('Missing extraction data does not weaken this action')
    expect(html).toContain('Outpatient/model scoring is blocked')
    expect(html).toContain('Safety workflow ID unavailable')
  })

  it('renders a generic human-review hold when routine outpatient scoring is blocked', () => {
    const html = renderToStaticMarkup(
      createElement(ExtractionIngressSafetyAlert, {
        immediateReviewRequired: false,
        safetyTriageSessionId: null,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
      }),
    )

    expect(html).toContain('Human review required — scoring blocked')
    expect(html).not.toContain('Immediate clinician review required')
    expect(html).toContain('Outpatient/model scoring is blocked')
    expect(html).toContain('Routine scheduling remains blocked')
  })

  it('renders nothing when the ingress gateway did not require immediate review', () => {
    const html = renderToStaticMarkup(
      createElement(ExtractionIngressSafetyAlert, {
        immediateReviewRequired: false,
        safetyTriageSessionId: null,
        outpatientScoringBlocked: false,
        humanReviewRequired: false,
      }),
    )

    expect(html).toBe('')
  })

  it('renders nothing for a scheduling lock without a clinical safety signal', () => {
    const html = renderToStaticMarkup(
      createElement(ExtractionIngressSafetyAlert, {
        immediateReviewRequired: false,
        safetyTriageSessionId: null,
        outpatientScoringBlocked: false,
        humanReviewRequired: false,
        schedulingLocked: true,
      }),
    )

    expect(html).toBe('')
  })

  it('fails visibly safe when review is required but the workflow id is unavailable', () => {
    const html = renderToStaticMarkup(
      createElement(ExtractionIngressSafetyAlert, {
        immediateReviewRequired: true,
        safetyTriageSessionId: null,
      }),
    )

    expect(html).toContain('Immediate clinician review required')
    expect(html).toContain('Safety workflow ID unavailable')
    expect(html).toContain('Do not proceed to routine scheduling')
  })
})

describe('retained extraction safety state', () => {
  const mergeSafetyNotice = (
    safetyAlertModule as unknown as {
      mergeExtractionIngressSafetyNotice?: (
        previous: Record<string, unknown> | null,
        incoming: Record<string, unknown>,
      ) => Record<string, unknown> | null
    }
  ).mergeExtractionIngressSafetyNotice
  const retainSafetyNotice = (
    safetyAlertModule as unknown as {
      retainExtractionIngressSafetyNotice?: (
        previous: Record<string, unknown> | null,
        error: TriageStartError,
      ) => Record<string, unknown> | null
    }
  ).retainExtractionIngressSafetyNotice
  const mergeBatchSafetyNotice = (
    safetyAlertModule as unknown as {
      mergeBatchItemSafetyNotice?: (
        items: Array<Record<string, unknown>>,
        batchItemId: string,
        incoming: Record<string, unknown>,
      ) => Array<Record<string, unknown>>
    }
  ).mergeBatchItemSafetyNotice

  it('keeps an incoming emergency context atomic when the prior same-day context has an id', () => {
    expect(typeof mergeSafetyNotice).toBe('function')
    if (!mergeSafetyNotice) return

    const retained = mergeSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'triage-same-day-old',
        safetyPathway: 'same_day_clinician_review',
        sourceLabel: 'same-day-source.pdf',
        outpatientScoringBlocked: false,
        humanReviewRequired: true,
      },
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: null,
        safetyPathway: 'emergency_now',
        sourceLabel: 'emergency-source.pdf',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
      },
    )

    expect(retained).toStrictEqual({
      immediateReviewRequired: true,
      safetyTriageSessionId: null,
      safetyPathway: 'emergency_now',
      sourceLabel: 'emergency-source.pdf',
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
    })
  })

  it('does not let a lower-severity context donate its workflow id to a retained emergency', () => {
    expect(typeof mergeSafetyNotice).toBe('function')
    if (!mergeSafetyNotice) return

    const retained = mergeSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: null,
        safetyPathway: 'emergency_now',
        sourceLabel: 'emergency-source.pdf',
        outpatientScoringBlocked: false,
        humanReviewRequired: true,
      },
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'triage-same-day-later',
        safetyPathway: 'same_day_clinician_review',
        sourceLabel: 'same-day-source.pdf',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
      },
    )

    expect(retained).toStrictEqual({
      immediateReviewRequired: true,
      safetyTriageSessionId: null,
      safetyPathway: 'emergency_now',
      sourceLabel: 'emergency-source.pdf',
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
    })
  })

  it('fails closed when equal-severity governed contexts change workflow identity', () => {
    expect(typeof mergeSafetyNotice).toBe('function')
    if (!mergeSafetyNotice) return

    const retained = mergeSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'triage-same-day-old',
        safetyPathway: 'same_day_clinician_review',
        sourceLabel: 'old-source.pdf',
        outpatientScoringBlocked: false,
        humanReviewRequired: true,
      },
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'triage-same-day-new',
        safetyPathway: 'same_day_clinician_review',
        sourceLabel: 'new-source.pdf',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
      },
    )

    expect(retained).toStrictEqual({
      immediateReviewRequired: true,
      safetyTriageSessionId: null,
      safetyPathway: 'same_day_clinician_review',
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
      safetyWorkflowIdentityConflict: true,
      holdReason: 'safety_workflow_identity_conflict_manual_hold',
    })
  })

  it('keeps an extraction-start emergency visible when scoring is later blocked', () => {
    expect(typeof retainSafetyNotice).toBe('function')
    if (!retainSafetyNotice) return

    const retained = retainSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'triage-ingress-emergency-1',
        safetyPathway: 'emergency_now',
        sourceLabel: 'synthetic-referral.pdf',
        outpatientScoringBlocked: false,
        humanReviewRequired: true,
      },
      new TriageStartError('Persisted summary missing.', {
        reason: 'source_extraction_summary_missing',
        immediateActionRequired: true,
        outpatientScoringBlocked: true,
      }),
    )

    expect(retained).toStrictEqual({
      immediateReviewRequired: true,
      safetyTriageSessionId: 'triage-ingress-emergency-1',
      safetyPathway: 'emergency_now',
      sourceLabel: 'synthetic-referral.pdf',
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
      holdReason: 'source_extraction_summary_missing',
    })
  })

  it('keeps a prior pathless clinician-hold identity when a generic error adds a reason', () => {
    expect(typeof retainSafetyNotice).toBe('function')
    if (!retainSafetyNotice) return

    const retained = retainSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'workflow-undetermined-1',
        sourceLabel: 'pathless-referral.pdf',
        outpatientScoringBlocked: false,
        humanReviewRequired: true,
      },
      new TriageStartError('Generic scoring failure.', {
        reason: 'triage_session_start_failed',
        immediateActionRequired: false,
        outpatientScoringBlocked: true,
      }),
    )

    expect(retained).toMatchObject({
      safetyTriageSessionId: 'workflow-undetermined-1',
      sourceLabel: 'pathless-referral.pdf',
      immediateReviewRequired: true,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      holdReason: 'triage_session_start_failed',
    })
  })

  it.each([
    'source_safety_workflow_unavailable_manual_hold',
    'source_safety_workflow_inconsistent_manual_hold',
    'model_safety_workflow_persistence_failed',
    'model_safety_evidence_persistence_failed_manual_hold',
  ] as const)(
    'does not let a %s notice rehydrate a prior workflow id',
    (reason) => {
      expect(typeof mergeSafetyNotice).toBe('function')
      if (!mergeSafetyNotice) return

      const retained = mergeSafetyNotice(
        {
          immediateReviewRequired: true,
          safetyTriageSessionId: 'workflow-prior-emergency',
          sourceLabel: 'prior-emergency.pdf',
          safetyPathway: 'emergency_now',
          outpatientScoringBlocked: false,
          humanReviewRequired: true,
          schedulingLocked: true,
        },
        {
          immediateReviewRequired: false,
          safetyTriageSessionId: null,
          outpatientScoringBlocked: true,
          humanReviewRequired: true,
          schedulingLocked: true,
          holdReason: reason,
        },
      )

      expect(retained).toMatchObject({
        safetyTriageSessionId: null,
        sourceLabel: 'prior-emergency.pdf',
        safetyPathway: 'emergency_now',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        holdReason: reason,
      })
    },
  )

  it.each([
    'model_safety_workflow_persistence_failed',
    'model_safety_evidence_persistence_failed_manual_hold',
  ] as const)(
    'keeps an explicit current recovered workflow id for %s',
    (reason) => {
      expect(typeof mergeSafetyNotice).toBe('function')
      if (!mergeSafetyNotice) return

      const retained = mergeSafetyNotice(
        {
          immediateReviewRequired: true,
          safetyTriageSessionId: null,
          safetyPathway: 'same_day_clinician_review',
          outpatientScoringBlocked: true,
          humanReviewRequired: true,
          schedulingLocked: true,
        },
        {
          immediateReviewRequired: true,
          safetyTriageSessionId: 'workflow-recovered-same-day',
          safetyPathway: 'same_day_clinician_review',
          outpatientScoringBlocked: true,
          humanReviewRequired: true,
          schedulingLocked: true,
          holdReason: reason,
        },
      )

      expect(retained).toMatchObject({
        safetyTriageSessionId: 'workflow-recovered-same-day',
        safetyPathway: 'same_day_clinician_review',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        holdReason: reason,
      })
    },
  )

  it.each([
    'model_safety_workflow_persistence_failed',
    'model_safety_evidence_persistence_failed_manual_hold',
  ] as const)(
    'keeps a recovered workflow-id mismatch as an identity conflict for %s',
    (reason) => {
      expect(typeof mergeSafetyNotice).toBe('function')
      if (!mergeSafetyNotice) return

      const retained = mergeSafetyNotice(
        {
          immediateReviewRequired: true,
          safetyTriageSessionId: 'workflow-prior-same-day',
          safetyPathway: 'same_day_clinician_review',
          outpatientScoringBlocked: true,
          humanReviewRequired: true,
          schedulingLocked: true,
        },
        {
          immediateReviewRequired: true,
          safetyTriageSessionId: 'workflow-recovered-different',
          safetyPathway: 'same_day_clinician_review',
          outpatientScoringBlocked: true,
          humanReviewRequired: true,
          schedulingLocked: true,
          holdReason: reason,
        },
      )

      expect(retained).toMatchObject({
        safetyTriageSessionId: null,
        safetyWorkflowIdentityConflict: true,
        holdReason: 'safety_workflow_identity_conflict_manual_hold',
      })
    },
  )

  it('keeps workflow suppression primary over a retained pathway-conflict identity', () => {
    expect(typeof retainSafetyNotice).toBe('function')
    if (!retainSafetyNotice) return

    const retained = retainSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'workflow-frozen-by-pathway-conflict',
        sourceLabel: 'pathway-conflict-referral.pdf',
        safetyPathway: 'emergency_now',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        holdReason: 'safety_pathway_projection_conflict_manual_hold',
      },
      new TriageStartError('Workflow read unavailable.', {
        reason: 'source_safety_workflow_unavailable_manual_hold',
        safetyPathway: 'emergency_now',
        immediateActionRequired: true,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
      }),
    )

    expect(retained).toMatchObject({
      safetyTriageSessionId: null,
      safetyPathway: 'emergency_now',
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
      holdReason: 'source_safety_workflow_unavailable_manual_hold',
    })
  })

  it.each([
    'source_safety_workflow_unavailable_manual_hold',
    'source_safety_workflow_inconsistent_manual_hold',
    'model_safety_workflow_persistence_failed',
  ] as const)(
    'does not let retainSafetyNotice rehydrate a prior workflow id for %s',
    (reason) => {
      expect(typeof retainSafetyNotice).toBe('function')
      if (!retainSafetyNotice) return

      const retained = retainSafetyNotice(
        {
          immediateReviewRequired: true,
          safetyTriageSessionId: 'workflow-prior-emergency',
          sourceLabel: 'prior-emergency.pdf',
          safetyPathway: 'emergency_now',
          outpatientScoringBlocked: false,
          humanReviewRequired: true,
          schedulingLocked: true,
        },
        new TriageStartError('Workflow binding unavailable.', {
          reason,
          immediateActionRequired: false,
          outpatientScoringBlocked: true,
          humanReviewRequired: true,
          schedulingLocked: true,
        }),
      )

      expect(retained).toMatchObject({
        safetyTriageSessionId: null,
        sourceLabel: 'prior-emergency.pdf',
        safetyPathway: 'emergency_now',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        holdReason: reason,
      })
    },
  )

  it('keeps the established source when an equal-rank pathless error repeats only the workflow id', () => {
    expect(typeof retainSafetyNotice).toBe('function')
    if (!retainSafetyNotice) return

    const retained = retainSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'workflow-pathless-a',
        sourceLabel: 'pathless-referral.pdf',
        outpatientScoringBlocked: false,
        humanReviewRequired: true,
      },
      new TriageStartError('Pathless workflow hold.', {
        reason: 'pathless_workflow_hold',
        immediateActionRequired: true,
        outpatientScoringBlocked: true,
        safetyWorkflowId: 'workflow-pathless-a',
      }),
    )

    expect(retained).toMatchObject({
      safetyTriageSessionId: 'workflow-pathless-a',
      sourceLabel: 'pathless-referral.pdf',
      immediateReviewRequired: true,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      holdReason: 'pathless_workflow_hold',
    })
  })

  it('keeps the established workflow when an equal-rank pathless notice repeats only the source', () => {
    expect(typeof mergeSafetyNotice).toBe('function')
    if (!mergeSafetyNotice) return

    const retained = mergeSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'workflow-pathless-a',
        sourceLabel: 'pathless-referral.pdf',
        outpatientScoringBlocked: false,
        humanReviewRequired: true,
      },
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: null,
        sourceLabel: 'pathless-referral.pdf',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
      },
    )

    expect(retained).toMatchObject({
      safetyTriageSessionId: 'workflow-pathless-a',
      sourceLabel: 'pathless-referral.pdf',
      immediateReviewRequired: true,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
    })
  })

  it.each([
    ['workflow-pathless-a', 'workflow-pathless-b'],
    ['workflow-pathless-b', 'workflow-pathless-a'],
  ])(
    'fails closed when equal-rank pathless workflow ids conflict (%s then %s)',
    (establishedWorkflowId, incomingWorkflowId) => {
      expect(typeof mergeSafetyNotice).toBe('function')
      if (!mergeSafetyNotice) return

      const retained = mergeSafetyNotice(
        {
          immediateReviewRequired: true,
          safetyTriageSessionId: establishedWorkflowId,
          sourceLabel: 'pathless-referral.pdf',
          outpatientScoringBlocked: false,
          humanReviewRequired: true,
        },
        {
          immediateReviewRequired: false,
          safetyTriageSessionId: incomingWorkflowId,
          sourceLabel: 'pathless-referral.pdf',
          outpatientScoringBlocked: true,
          humanReviewRequired: true,
        },
      )
      const html = renderToStaticMarkup(
        createElement(ExtractionIngressSafetyAlert, {
          immediateReviewRequired:
            retained?.immediateReviewRequired === true,
          safetyTriageSessionId:
            typeof retained?.safetyTriageSessionId === 'string'
              ? retained.safetyTriageSessionId
              : null,
          sourceLabel:
            typeof retained?.sourceLabel === 'string'
              ? retained.sourceLabel
              : undefined,
          outpatientScoringBlocked:
            retained?.outpatientScoringBlocked === true,
          humanReviewRequired: retained?.humanReviewRequired === true,
          holdReason:
            typeof retained?.holdReason === 'string'
              ? retained.holdReason
              : undefined,
        }),
      )

      expect(retained).toMatchObject({
        safetyTriageSessionId: null,
        safetyWorkflowIdentityConflict: true,
        sourceLabel: 'pathless-referral.pdf',
        immediateReviewRequired: true,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        holdReason: 'safety_workflow_identity_conflict_manual_hold',
      })
      expect(html).toContain('Safety workflow ID unavailable')
      expect(html).toContain(
        'Conflicting safety workflow identifiers require a manual hold',
      )
      expect(html).not.toContain(establishedWorkflowId)
      expect(html).not.toContain(incomingWorkflowId)
    },
  )

  it('keeps a pathless workflow identity conflict sticky across a later generic error', () => {
    expect(typeof mergeSafetyNotice).toBe('function')
    expect(typeof retainSafetyNotice).toBe('function')
    if (!mergeSafetyNotice || !retainSafetyNotice) return

    const conflicted = mergeSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'workflow-pathless-a',
        sourceLabel: 'pathless-referral.pdf',
        outpatientScoringBlocked: false,
        humanReviewRequired: true,
      },
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'workflow-pathless-b',
        sourceLabel: 'pathless-referral.pdf',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
      },
    )
    const retained = retainSafetyNotice(
      conflicted,
      new TriageStartError('Later generic failure.', {
        reason: 'triage_session_start_failed',
        immediateActionRequired: false,
        outpatientScoringBlocked: true,
      }),
    )

    expect(retained).toMatchObject({
      safetyTriageSessionId: null,
      safetyWorkflowIdentityConflict: true,
      sourceLabel: 'pathless-referral.pdf',
      immediateReviewRequired: true,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      holdReason: 'safety_workflow_identity_conflict_manual_hold',
    })
  })

  it('omits conflicting source context when pathless workflow ids also disagree', () => {
    expect(typeof mergeSafetyNotice).toBe('function')
    if (!mergeSafetyNotice) return

    const retained = mergeSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'workflow-pathless-a',
        sourceLabel: 'referral-a.pdf',
        outpatientScoringBlocked: false,
        humanReviewRequired: true,
      },
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'workflow-pathless-b',
        sourceLabel: 'referral-b.pdf',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
      },
    )

    expect(retained).toMatchObject({
      safetyTriageSessionId: null,
      safetyWorkflowIdentityConflict: true,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      holdReason: 'safety_workflow_identity_conflict_manual_hold',
    })
    expect(retained).not.toHaveProperty('sourceLabel')
  })

  it('fails closed when a retry error supplies a different pathless workflow id', () => {
    expect(typeof retainSafetyNotice).toBe('function')
    if (!retainSafetyNotice) return

    const retained = retainSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'workflow-pathless-a',
        sourceLabel: 'pathless-referral.pdf',
        outpatientScoringBlocked: false,
        humanReviewRequired: true,
      },
      new TriageStartError('Retry returned another workflow.', {
        reason: 'retry_pathless_hold',
        immediateActionRequired: true,
        outpatientScoringBlocked: true,
        safetyWorkflowId: 'workflow-pathless-b',
      }),
    )

    expect(retained).toMatchObject({
      safetyTriageSessionId: null,
      safetyWorkflowIdentityConflict: true,
      sourceLabel: 'pathless-referral.pdf',
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      holdReason: 'safety_workflow_identity_conflict_manual_hold',
    })
  })

  it('keeps a pathless conflict sticky when a third pathless workflow id arrives', () => {
    expect(typeof mergeSafetyNotice).toBe('function')
    if (!mergeSafetyNotice) return

    const conflicted = mergeSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'workflow-pathless-a',
        sourceLabel: 'pathless-referral.pdf',
        outpatientScoringBlocked: false,
        humanReviewRequired: true,
      },
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'workflow-pathless-b',
        sourceLabel: 'pathless-referral.pdf',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
      },
    )
    const retained = mergeSafetyNotice(conflicted, {
      immediateReviewRequired: true,
      safetyTriageSessionId: 'workflow-pathless-c',
      sourceLabel: 'pathless-referral.pdf',
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
    })

    expect(retained).toMatchObject({
      safetyTriageSessionId: null,
      safetyWorkflowIdentityConflict: true,
      sourceLabel: 'pathless-referral.pdf',
      holdReason: 'safety_workflow_identity_conflict_manual_hold',
    })
  })

  it('allows a higher governed pathway to upgrade without clearing an identity conflict', () => {
    expect(typeof mergeSafetyNotice).toBe('function')
    if (!mergeSafetyNotice) return

    const conflicted = mergeSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'workflow-pathless-a',
        sourceLabel: 'pathless-referral.pdf',
        outpatientScoringBlocked: false,
        humanReviewRequired: true,
      },
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'workflow-pathless-b',
        sourceLabel: 'pathless-referral.pdf',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
      },
    )
    const governed = mergeSafetyNotice(conflicted, {
      immediateReviewRequired: true,
      safetyTriageSessionId: 'workflow-emergency-authoritative',
      sourceLabel: 'governed-referral.pdf',
      safetyPathway: 'emergency_now',
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
    })

    expect(governed).toMatchObject({
      safetyTriageSessionId: null,
      safetyPathway: 'emergency_now',
      schedulingLocked: true,
      safetyWorkflowIdentityConflict: true,
      holdReason: 'safety_workflow_identity_conflict_manual_hold',
    })
    expect(governed).not.toHaveProperty(
      'safetyTriageSessionId',
      'workflow-emergency-authoritative',
    )
  })

  it('keeps a pathway projection conflict and scheduling lock sticky during a later pathway upgrade', () => {
    expect(typeof mergeSafetyNotice).toBe('function')
    if (!mergeSafetyNotice) return

    const retained = mergeSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: null,
        safetyPathway: 'same_day_clinician_review',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        holdReason: 'safety_pathway_projection_conflict_manual_hold',
      },
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'workflow-must-not-bind-after-conflict',
        safetyPathway: 'emergency_now',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
      },
    )

    expect(retained).toMatchObject({
      safetyTriageSessionId: null,
      safetyPathway: 'emergency_now',
      schedulingLocked: true,
      holdReason: 'safety_pathway_projection_conflict_manual_hold',
    })
  })

  it('preserves governed safety while nulling a conflicted workflow identity', () => {
    expect(typeof retainSafetyNotice).toBe('function')
    if (!retainSafetyNotice) return

    const retained = retainSafetyNotice(
      null,
      new TriageStartError('Conflicting workflow aliases.', {
        reason: 'safety_workflow_identity_conflict_manual_hold',
        safetyPathway: 'emergency_now',
        immediateActionRequired: true,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        safetyWorkflowIdentityConflict: true,
      }),
    )

    expect(retained).toMatchObject({
      safetyTriageSessionId: null,
      safetyPathway: 'emergency_now',
      immediateReviewRequired: true,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      safetyWorkflowIdentityConflict: true,
      holdReason: 'safety_workflow_identity_conflict_manual_hold',
    })
  })

  it('keeps two batch workflow identities on their exact rows', () => {
    expect(typeof mergeBatchSafetyNotice).toBe('function')
    if (!mergeBatchSafetyNotice) return

    const items = [
      { id: 'batch-a', filename: 'referral-a.pdf' },
      { id: 'batch-b', filename: 'referral-b.pdf' },
    ]
    const withEmergency = mergeBatchSafetyNotice(items, 'batch-a', {
      immediateReviewRequired: true,
      safetyTriageSessionId: 'workflow-emergency-a',
      sourceLabel: 'referral-a.pdf',
      safetyPathway: 'emergency_now',
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
    })
    const withBoth = mergeBatchSafetyNotice(withEmergency, 'batch-b', {
      immediateReviewRequired: true,
      safetyTriageSessionId: 'workflow-same-day-b',
      sourceLabel: 'referral-b.pdf',
      safetyPathway: 'same_day_clinician_review',
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
    })

    expect(withBoth).toMatchObject([
      {
        id: 'batch-a',
        safetyNotice: {
          safetyTriageSessionId: 'workflow-emergency-a',
          sourceLabel: 'referral-a.pdf',
          safetyPathway: 'emergency_now',
        },
      },
      {
        id: 'batch-b',
        safetyNotice: {
          safetyTriageSessionId: 'workflow-same-day-b',
          sourceLabel: 'referral-b.pdf',
          safetyPathway: 'same_day_clinician_review',
        },
      },
    ])
  })

  it('never downgrades a retained emergency to a later same-day error pathway', () => {
    expect(typeof retainSafetyNotice).toBe('function')
    if (!retainSafetyNotice) return

    const retained = retainSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: null,
        safetyPathway: 'emergency_now',
        outpatientScoringBlocked: false,
        humanReviewRequired: true,
      },
      new TriageStartError('Scoring blocked.', {
        safetyPathway: 'same_day_clinician_review',
        immediateActionRequired: true,
        outpatientScoringBlocked: true,
        safetyWorkflowId: 'triage-later-1',
      }),
    )

    expect(retained).toMatchObject({
      safetyPathway: 'emergency_now',
      immediateReviewRequired: true,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      safetyTriageSessionId: null,
    })
  })

  it('fails closed when a structured error escalates the pathway with a different workflow id', () => {
    expect(typeof retainSafetyNotice).toBe('function')
    if (!retainSafetyNotice) return

    const retained = retainSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'triage-same-day-old',
        safetyPathway: 'same_day_clinician_review',
        outpatientScoringBlocked: false,
        humanReviewRequired: true,
      },
      new TriageStartError('Escalated scoring hold.', {
        safetyPathway: 'emergency_now',
        immediateActionRequired: true,
        outpatientScoringBlocked: true,
        safetyWorkflowId: 'triage-emergency-new',
      }),
    )

    expect(retained).toMatchObject({
      safetyPathway: 'emergency_now',
      safetyTriageSessionId: null,
      safetyWorkflowIdentityConflict: true,
      schedulingLocked: true,
      holdReason: 'safety_workflow_identity_conflict_manual_hold',
    })
  })

  it('keeps a model-discovered emergency rendered when triage start then fails', () => {
    expect(typeof mergeSafetyNotice).toBe('function')
    expect(typeof retainSafetyNotice).toBe('function')
    if (!mergeSafetyNotice || !retainSafetyNotice) return

    const lateModelSafety = mergeSafetyNotice(null, {
      immediateReviewRequired: true,
      safetyTriageSessionId: null,
      safetyPathway: 'emergency_now',
      sourceLabel: 'late-model-packet.pdf',
      outpatientScoringBlocked: false,
      humanReviewRequired: true,
    })
    const retained = retainSafetyNotice(
      lateModelSafety,
      new TriageStartError('Triage start failed.', {
        reason: 'triage_session_start_failed',
        immediateActionRequired: false,
        outpatientScoringBlocked: true,
      }),
    )
    const html = renderToStaticMarkup(
      createElement(ExtractionIngressSafetyAlert, {
        immediateReviewRequired: retained?.immediateReviewRequired === true,
        safetyTriageSessionId:
          typeof retained?.safetyTriageSessionId === 'string'
            ? retained.safetyTriageSessionId
            : null,
        sourceLabel:
          typeof retained?.sourceLabel === 'string'
            ? retained.sourceLabel
            : undefined,
        safetyPathway:
          retained?.safetyPathway === 'emergency_now' ||
          retained?.safetyPathway === 'same_day_clinician_review'
            ? retained.safetyPathway
            : undefined,
        outpatientScoringBlocked:
          retained?.outpatientScoringBlocked === true,
        humanReviewRequired: retained?.humanReviewRequired === true,
      }),
    )

    expect(html).toContain('Emergency evaluation now')
    expect(html).toContain('late-model-packet.pdf')
    expect(html).toContain('Safety workflow ID unavailable')
    expect(html).toContain('Routine scheduling remains blocked')
  })

  it('clears retained safety only after an explicit reset or a trusted routine screen', () => {
    const source = readFileSync(
      new URL('../../../app/triage/page.tsx', import.meta.url),
      'utf8',
    )

    expect(source.match(/commitIngressSafetyNotice\(null\)/g)).toHaveLength(2)
    expect(source).toContain(
      'if (accepted.clearExisting) commitIngressSafetyNotice(null)',
    )
    expect(source).not.toContain('attempt.shouldClearSafety')
    expect(source).toContain('function handleReferralLifecycle')
    expect(source).toContain('function handleTryAnother()')
  })

  it('uses a case nonce and has no ambiguous batch-notice branch', () => {
    const source = readFileSync(
      new URL('../../../app/triage/page.tsx', import.meta.url),
      'utf8',
    )

    expect(source).toContain('caseNonce: createReferralCaseNonce()')
    expect(source).toContain('pasteSourceIdentity(referralText, metadata)')
    expect(source).toContain('fileIdentityRef')
    expect(source).not.toContain('batchItemId')
    expect(source).not.toContain('setBatchItems')
    expect(source).not.toContain('preserveSafety: i > 0')
    expect(source).not.toContain(
      'return `file:${file.name}:${file.size}:${file.lastModified}`',
    )

    const mergeScope = source.slice(
      source.indexOf('function mergeScopedSafetyNotice'),
      source.indexOf('function pasteSourceIdentity'),
    )
    const retainScope = source.slice(
      source.indexOf('function retainStructuredStartSafety'),
      source.indexOf('// Cancel in-flight AI requests'),
    )
    expect(mergeScope).toContain('commitIngressSafetyNotice')
    expect(retainScope).toContain('commitIngressSafetyNotice')
  })

  it('clears parent-owned work at a replacement boundary but clears safety only on explicit Clear', () => {
    const source = readFileSync(
      new URL('../../../app/triage/page.tsx', import.meta.url),
      'utf8',
    )
    const lifecycleScope = source.slice(
      source.indexOf('function handleReferralLifecycle'),
      source.indexOf('// Cancel in-flight AI requests'),
    )

    expect(source).toContain(
      'onReferralLifecycle={handleReferralLifecycle}',
    )
    expect(source).toContain('function continueReferralRequest()')
    expect(source).toContain(
      'const { token, controller } = continueReferralRequest()',
    )
    expect(lifecycleScope).toContain('abortControllerRef.current?.abort()')
    expect(lifecycleScope).toContain('invalidateReferralAttempts(')
    expect(lifecycleScope).toContain('createReferralCaseNonce()')
    expect(lifecycleScope).toContain('setResult(null)')
    expect(lifecycleScope).toContain('setExtraction(null)')
    expect(lifecycleScope).toContain('setOriginalText(\'\')')
    expect(lifecycleScope).toContain('setCoordinatedExtraction(null)')
    expect(lifecycleScope).toContain("if (event === 'clear')")
    expect(lifecycleScope).toContain('commitIngressSafetyNotice(null)')
    expect(lifecycleScope).toContain(
      'preserveSafetyNoticeOnSourceReplacement(',
    )
    expect(lifecycleScope).toContain('setLongPacketProgress(null)')
  })

  it('invalidates referral work without state writes when the triage page unmounts', () => {
    const source = readFileSync(
      new URL('../../../app/triage/page.tsx', import.meta.url),
      'utf8',
    )
    const cleanupScope = source.slice(
      source.indexOf('useEffect(() => {'),
      source.indexOf('function commitIngressSafetyNotice'),
    )

    expect(cleanupScope).toContain('abortControllerRef.current?.abort()')
    expect(cleanupScope).toContain('invalidateReferralAttempts(')
    expect(cleanupScope).toContain('createReferralCaseNonce()')
    expect(cleanupScope).toContain('return () => {')
    expect(cleanupScope).not.toMatch(/\bset[A-Z]\w*\(/)
  })

  it('does not re-check a mutable generation inside queued React safety updaters', () => {
    const source = readFileSync(
      new URL('../../../app/triage/page.tsx', import.meta.url),
      'utf8',
    )
    const mergeScope = source.slice(
      source.indexOf('function mergeScopedSafetyNotice'),
      source.indexOf('function acceptTrustedRoutineScreen'),
    )
    const routineScope = source.slice(
      source.indexOf('function acceptTrustedRoutineScreen'),
      source.indexOf('function pasteSourceIdentity'),
    )
    const retainScope = source.slice(
      source.indexOf('function retainStructuredStartSafety'),
      source.indexOf('// Cancel in-flight AI requests'),
    )

    expect(mergeScope.match(/isCurrentAttempt\(token\)/g)).toHaveLength(1)
    expect(routineScope.match(/isCurrentAttempt\(token\)/g)).toHaveLength(1)
    expect(retainScope.match(/isCurrentAttempt\(token\)/g)).toHaveLength(1)
  })

  it('uses the shared atomic-context merge policy on the triage page', () => {
    const source = readFileSync(
      new URL('../../../app/triage/page.tsx', import.meta.url),
      'utf8',
    )

    const mergeScope = source.slice(
      source.indexOf('function mergeScopedSafetyNotice'),
      source.indexOf('function acceptTrustedRoutineScreen'),
    )
    expect(mergeScope).toContain('mergeExtractionIngressSafetyNotice(')
    expect(mergeScope).toContain(
      'accepted.replaceExisting ? null : ingressSafetyNoticeRef.current',
    )
    expect(mergeScope).toContain('commitIngressSafetyNotice(')
    expect(source).not.toContain('retainGovernedSafetyPathway')
    expect(source).not.toContain('incomingRank')
  })

  it('surfaces late packet safety through the scoped poll callback before auto-triage', () => {
    const source = readFileSync(
      new URL('../../../app/triage/page.tsx', import.meta.url),
      'utf8',
    )

    expect(source).toContain('onSafety: (safety) =>')
    expect(source.match(/onSafety: \(safety\) =>/g)).toHaveLength(3)
    expect(source).toContain('surfacePolledSafety(safety')
    expect(source).toContain('schedulingLocked: safety.schedulingLocked')
    expect(source).toContain('isCurrentReferralAttempt')
    expect(source).toContain('isAbortError(error)')
    expect(source).not.toContain('error instanceof DOMException')
  })
})
