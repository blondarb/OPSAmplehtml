import { createHash } from 'node:crypto'
import { deriveClinicalTiming } from '@/lib/triage/clinicalTiming'
import { describe, expect, it } from 'vitest'

import {
  applyHumanOrganizationRoutingOverride,
  routeOrganizationService,
  validateOrganizationRoutingConfig,
  type OrganizationRoutingConfig,
  type OrganizationRoutingRequest,
} from '@/lib/triage/organizationRouting'

const request: OrganizationRoutingRequest = {
  tenantId: 'tenant-synthetic-a',
  carePathway: 'expedited_outpatient',
  urgency: 'expedited',
  schedulingLocked: false,
  preferredClinicalDestination: 'Epilepsy',
}

const tertiaryConfig: OrganizationRoutingConfig = {
  tenantId: 'tenant-synthetic-a',
  version: 'synthetic-v1',
  approval: { status: 'approved', approvalId: 'approval-synthetic-1' },
  externalEscalationContactId: 'contact-external-synthetic-a',
  services: [
    {
      serviceId: 'service-general-synthetic-a',
      tenantId: 'tenant-synthetic-a',
      capabilities: ['General Neurology'],
      available: true,
      referralContactId: 'contact-general-synthetic-a',
    },
    {
      serviceId: 'service-epilepsy-synthetic-a',
      tenantId: 'tenant-synthetic-a',
      capabilities: ['Epilepsy'],
      available: true,
      referralContactId: 'contact-epilepsy-synthetic-a',
    },
  ],
}

describe('organization service routing', () => {
  it('uses the exact preferred service in a tertiary inventory and preserves upstream safety state', () => {
    expect(routeOrganizationService(request, tertiaryConfig)).toMatchObject({
      disposition: 'local_service_available',
      carePathway: 'expedited_outpatient',
      urgency: 'expedited',
      schedulingLocked: false,
      localService: {
        serviceId: 'service-epilepsy-synthetic-a',
        referralContactId: 'contact-epilepsy-synthetic-a',
      },
      provenance: [
        {
          event: 'configuration_applied',
          configVersion: 'synthetic-v1',
        },
      ],
    })
  })

  it('C18 preserves the clinical action, source, clock, and deadline when availability changes', () => {
    const sourceText = 'Synthetic MS scenario.\nSymptom onset: 2026-08-24T12:00:00Z'
    const clinicalTiming = deriveClinicalTiming({ sourceText, decisionAt: '2026-09-05T12:00:00Z', decisionTimeZone: 'UTC', carePathway: 'expedited_outpatient', confirmedPolicy: { policyId: 'ms_relapse_assessment_treatment_window_v1', sourceDigest: createHash('sha256').update(sourceText).digest('hex'), confirmationId: 'synthetic-confirmation', confirmedAt: '2026-09-05T12:00:00Z' } })
    expect(clinicalTiming.assessmentDeadline.state).toBe('established')
    const clinicalRequest = { ...request, clinicalTiming }
    const original = structuredClone(clinicalRequest)
    const available = routeOrganizationService(clinicalRequest, tertiaryConfig)
    const unavailable = routeOrganizationService(clinicalRequest, { ...tertiaryConfig, services: tertiaryConfig.services.map(service => ({ ...service, available: false })) })
    expect(available.disposition).toBe('local_service_available')
    expect(unavailable.disposition).toBe('external_escalation_required')
    expect(available.clinicalTiming).toEqual(clinicalTiming)
    expect(unavailable.clinicalTiming).toEqual(clinicalTiming)
    expect(unavailable.urgency).toBe(available.urgency)
    expect(unavailable.carePathway).toBe(available.carePathway)
    expect(clinicalRequest).toEqual(original)
  })

  it('does not treat General Neurology as equivalent to a requested subspecialty', () => {
    const generalOnly = {
      ...tertiaryConfig,
      services: [tertiaryConfig.services[0]],
    }
    expect(routeOrganizationService(request, generalOnly)).toMatchObject({
      disposition: 'external_escalation_required',
      localService: null,
      externalEscalationContactId: 'contact-external-synthetic-a',
    })
  })

  it.each([
    { schedulingLocked: true },
    { carePathway: 'emergency_now' as const },
    { carePathway: 'same_day_clinician_review' as const },
    { carePathway: 'undetermined' as const },
  ])('keeps safety-held cases out of local routing: %#', (safetyState) => {
    expect(routeOrganizationService({ ...request, ...safetyState }, tertiaryConfig)).toMatchObject({
      disposition: 'clinician_review_required',
      carePathway: safetyState.carePathway || request.carePathway,
      schedulingLocked: safetyState.schedulingLocked || false,
      provenance: [{ reasonCode: 'clinical_safety_hold' }],
    })
  })

  it('requires clinician review instead of using missing, unapproved, or cross-tenant configuration', () => {
    for (const config of [
      null,
      { ...tertiaryConfig, tenantId: 'tenant-synthetic-b' },
      {
        ...tertiaryConfig,
        approval: { status: 'unapproved' as const, approvalId: null },
      },
    ]) {
      expect(routeOrganizationService(request, config)).toMatchObject({
        disposition: 'clinician_review_required',
        carePathway: request.carePathway,
        urgency: request.urgency,
        schedulingLocked: request.schedulingLocked,
        localService: null,
      })
    }
  })

  it('requires clinician review when no local service or governed external contact is available', () => {
    expect(
      routeOrganizationService(
        request,
        {
          ...tertiaryConfig,
          services: [tertiaryConfig.services[0]],
          externalEscalationContactId: null,
        },
      ),
    ).toMatchObject({
      disposition: 'clinician_review_required',
      provenance: [{ reasonCode: 'external_escalation_unconfigured' }],
    })
  })

  it('appends accountable override provenance without relaxing care pathway, urgency, or scheduling lock', () => {
    const overridden = applyHumanOrganizationRoutingOverride(
      routeOrganizationService(request, tertiaryConfig),
      {
        actorId: 'clinician-synthetic-1',
        reasonCode: 'service_capacity_reviewed',
        at: '2026-09-05T12:00:00.000Z',
        destination: {
          kind: 'external_escalation',
          preferredClinicalDestination: 'Stroke',
          referralContactId: 'contact-external-synthetic-a',
        },
      },
      tertiaryConfig,
    )

    expect(overridden).toMatchObject({
      disposition: 'external_escalation_required',
      preferredClinicalDestination: 'Stroke',
      carePathway: request.carePathway,
      urgency: request.urgency,
      schedulingLocked: request.schedulingLocked,
    })
    expect(overridden.provenance.at(-1)).toEqual({
      event: 'human_override',
      at: '2026-09-05T12:00:00.000Z',
      configVersion: 'synthetic-v1',
      actorId: 'clinician-synthetic-1',
      reasonCode: 'service_capacity_reviewed',
    })
  })

  it('rejects an override that attempts to route a specialty to a general-only service', () => {
    const generalOnly = {
      ...tertiaryConfig,
      services: [tertiaryConfig.services[0]],
    }
    const initial = routeOrganizationService(request, generalOnly)
    expect(
      applyHumanOrganizationRoutingOverride(
        initial,
        {
          actorId: 'clinician-synthetic-1',
          reasonCode: 'manual_route',
          at: '2026-09-05T12:00:00.000Z',
          destination: {
            kind: 'local_service',
            preferredClinicalDestination: 'Epilepsy',
            serviceId: 'service-general-synthetic-a',
          },
        },
        generalOnly,
      ),
    ).toMatchObject({
      disposition: 'clinician_review_required',
      provenance: [{ reasonCode: 'override_invalid' }],
    })
  })

  it('validates only tenant-scoped, approved service snapshots', () => {
    expect(validateOrganizationRoutingConfig(tertiaryConfig, request.tenantId)).toEqual({ valid: true })
    expect(
      validateOrganizationRoutingConfig(
        { ...tertiaryConfig, services: [{ ...tertiaryConfig.services[0], tenantId: 'tenant-synthetic-b' }] },
        request.tenantId,
      ),
    ).toEqual({ valid: false, reason: 'configuration_invalid' })
    expect(
      validateOrganizationRoutingConfig(
        {
          ...tertiaryConfig,
          services: [
            {
              ...tertiaryConfig.services[0],
              capabilities: ['unbounded free-text service'] as never,
            },
          ],
        },
        request.tenantId,
      ),
    ).toEqual({ valid: false, reason: 'configuration_invalid' })
  })
})
