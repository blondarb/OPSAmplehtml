import { NEURO_SUBSPECIALTIES, type CarePathway, type SubspecialtyType } from './types'

/**
 * Source-only organization routing. This module intentionally does not read
 * tenant configuration, contact directories, schedules, or clinical content.
 * Its caller supplies an already-governed configuration snapshot.
 */

export type OrganizationRoutingUrgency =
  | 'emergency'
  | 'same_day'
  | 'expedited'
  | 'routine'
  | 'undetermined'

export interface ServiceInventoryEntry {
  serviceId: string
  tenantId: string
  capabilities: readonly SubspecialtyType[]
  available: boolean
  referralContactId: string | null
}

export interface OrganizationRoutingConfig {
  tenantId: string
  version: string
  approval: {
    status: 'approved' | 'unapproved'
    approvalId: string | null
  }
  services: readonly ServiceInventoryEntry[]
  externalEscalationContactId: string | null
}

export interface OrganizationRoutingRequest {
  tenantId: string
  carePathway: CarePathway
  urgency: OrganizationRoutingUrgency
  schedulingLocked: boolean
  preferredClinicalDestination: SubspecialtyType
}

export interface OrganizationRoutingProvenance {
  event: 'configuration_applied' | 'safe_default' | 'human_override'
  at: string
  configVersion: string | null
  actorId: string | null
  reasonCode: string
}

export type OrganizationRoutingDecision =
  | {
      disposition: 'local_service_available'
      tenantId: string
      carePathway: CarePathway
      urgency: OrganizationRoutingUrgency
      schedulingLocked: boolean
      preferredClinicalDestination: SubspecialtyType
      localService: { serviceId: string; referralContactId: string }
      externalEscalationContactId: null
      provenance: readonly OrganizationRoutingProvenance[]
    }
  | {
      disposition: 'external_escalation_required'
      tenantId: string
      carePathway: CarePathway
      urgency: OrganizationRoutingUrgency
      schedulingLocked: boolean
      preferredClinicalDestination: SubspecialtyType
      localService: null
      externalEscalationContactId: string
      provenance: readonly OrganizationRoutingProvenance[]
    }
  | {
      disposition: 'clinician_review_required'
      tenantId: string
      carePathway: CarePathway
      urgency: OrganizationRoutingUrgency
      schedulingLocked: boolean
      preferredClinicalDestination: SubspecialtyType
      localService: null
      externalEscalationContactId: string | null
      provenance: readonly OrganizationRoutingProvenance[]
    }

export type OrganizationRoutingConfigValidation =
  | { valid: true }
  | { valid: false; reason: OrganizationRoutingSafeDefaultReason }

export type OrganizationRoutingSafeDefaultReason =
  | 'configuration_missing'
  | 'tenant_mismatch'
  | 'configuration_unapproved'
  | 'configuration_invalid'
  | 'external_escalation_unconfigured'
  | 'clinical_safety_hold'
  | 'override_invalid'

export interface HumanOrganizationRoutingOverride {
  actorId: string
  reasonCode: string
  at: string
  destination:
    | {
        kind: 'local_service'
        preferredClinicalDestination: SubspecialtyType
        serviceId: string
      }
    | {
        kind: 'external_escalation'
        preferredClinicalDestination: SubspecialtyType
        referralContactId: string
      }
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  )
}

function isValidTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value))
}

function hasOnlyGovernedCapabilities(
  capabilities: readonly unknown[],
): capabilities is readonly SubspecialtyType[] {
  return capabilities.every((capability) =>
    NEURO_SUBSPECIALTIES.includes(capability as SubspecialtyType),
  )
}

function sameCareState(
  request: OrganizationRoutingRequest,
): Pick<
  OrganizationRoutingDecision,
  'tenantId' | 'carePathway' | 'urgency' | 'schedulingLocked' | 'preferredClinicalDestination'
> {
  return {
    tenantId: request.tenantId,
    carePathway: request.carePathway,
    urgency: request.urgency,
    schedulingLocked: request.schedulingLocked,
    preferredClinicalDestination: request.preferredClinicalDestination,
  }
}

function safeDefault(
  request: OrganizationRoutingRequest,
  reason: OrganizationRoutingSafeDefaultReason,
  configVersion: string | null,
): OrganizationRoutingDecision {
  return {
    ...sameCareState(request),
    disposition: 'clinician_review_required',
    localService: null,
    externalEscalationContactId: null,
    provenance: [
      {
        event: 'safe_default',
        at: new Date().toISOString(),
        configVersion,
        actorId: null,
        reasonCode: reason,
      },
    ],
  }
}

/** Validates a caller-supplied configuration snapshot for one tenant only. */
export function validateOrganizationRoutingConfig(
  config: OrganizationRoutingConfig | null | undefined,
  tenantId: string,
): OrganizationRoutingConfigValidation {
  if (!config) return { valid: false, reason: 'configuration_missing' }
  if (config.tenantId !== tenantId) return { valid: false, reason: 'tenant_mismatch' }
  if (config.approval.status !== 'approved' || !isIdentifier(config.approval.approvalId)) {
    return { valid: false, reason: 'configuration_unapproved' }
  }
  if (!isIdentifier(config.tenantId) || !isIdentifier(config.version)) {
    return { valid: false, reason: 'configuration_invalid' }
  }
  const serviceIds = new Set<string>()
  if (
    config.services.some(
      (service) =>
        service.tenantId !== tenantId ||
        !isIdentifier(service.serviceId) ||
        !Array.isArray(service.capabilities) ||
        service.capabilities.length === 0 ||
        !hasOnlyGovernedCapabilities(service.capabilities) ||
        typeof service.available !== 'boolean' ||
        (service.referralContactId !== null &&
          !isIdentifier(service.referralContactId)) ||
        (serviceIds.has(service.serviceId)
          ? true
          : (serviceIds.add(service.serviceId), false)),
    )
  ) {
    return { valid: false, reason: 'configuration_invalid' }
  }
  if (
    config.externalEscalationContactId !== null &&
    !isIdentifier(config.externalEscalationContactId)
  ) {
    return { valid: false, reason: 'configuration_invalid' }
  }
  return { valid: true }
}

function validConfigOrSafeDefault(
  request: OrganizationRoutingRequest,
  config: OrganizationRoutingConfig | null | undefined,
): OrganizationRoutingDecision | null {
  if (
    request.schedulingLocked ||
    request.carePathway === 'emergency_now' ||
    request.carePathway === 'same_day_clinician_review' ||
    request.carePathway === 'undetermined'
  ) {
    return safeDefault(request, 'clinical_safety_hold', config?.version ?? null)
  }
  const validation = validateOrganizationRoutingConfig(config, request.tenantId)
  if (validation.valid) return null
  return safeDefault(request, validation.reason, config?.version ?? null)
}

/**
 * Selects only an exact capability match. In particular, General Neurology is
 * never treated as equivalent to a requested subspecialty.
 */
export function routeOrganizationService(
  request: OrganizationRoutingRequest,
  config: OrganizationRoutingConfig | null | undefined,
): OrganizationRoutingDecision {
  const blocked = validConfigOrSafeDefault(request, config)
  if (blocked) return blocked
  const governedConfig = config as OrganizationRoutingConfig
  const localService = governedConfig.services.find(
    (service) =>
      service.available &&
      service.referralContactId !== null &&
      service.capabilities.includes(request.preferredClinicalDestination),
  )
  const provenance: OrganizationRoutingProvenance = {
    event: 'configuration_applied',
    at: new Date().toISOString(),
    configVersion: governedConfig.version,
    actorId: null,
    reasonCode: 'organization_service_inventory',
  }

  if (localService?.referralContactId) {
    return {
      ...sameCareState(request),
      disposition: 'local_service_available',
      localService: {
        serviceId: localService.serviceId,
        referralContactId: localService.referralContactId,
      },
      externalEscalationContactId: null,
      provenance: [provenance],
    }
  }
  if (governedConfig.externalEscalationContactId) {
    return {
      ...sameCareState(request),
      disposition: 'external_escalation_required',
      localService: null,
      externalEscalationContactId: governedConfig.externalEscalationContactId,
      provenance: [provenance],
    }
  }
  return safeDefault(
    request,
    'external_escalation_unconfigured',
    governedConfig.version,
  )
}

/**
 * A human may choose a governed local service or a configured external contact.
 * The upstream urgency, care pathway, and scheduling lock are copied unchanged.
 */
export function applyHumanOrganizationRoutingOverride(
  decision: OrganizationRoutingDecision,
  override: HumanOrganizationRoutingOverride,
  config: OrganizationRoutingConfig | null | undefined,
): OrganizationRoutingDecision {
  const request: OrganizationRoutingRequest = {
    tenantId: decision.tenantId,
    carePathway: decision.carePathway,
    urgency: decision.urgency,
    schedulingLocked: decision.schedulingLocked,
    preferredClinicalDestination: decision.preferredClinicalDestination,
  }
  const blocked = validConfigOrSafeDefault(request, config)
  if (blocked) return blocked
  const governedConfig = config as OrganizationRoutingConfig
  if (
    !isIdentifier(override.actorId) ||
    !isIdentifier(override.reasonCode) ||
    !isValidTimestamp(override.at)
  ) {
    return safeDefault(request, 'override_invalid', governedConfig.version)
  }

  const overrideProvenance: OrganizationRoutingProvenance = {
    event: 'human_override',
    at: override.at,
    configVersion: governedConfig.version,
    actorId: override.actorId,
    reasonCode: override.reasonCode,
  }

  const destination = override.destination
  if (destination.kind === 'local_service') {
    const service = governedConfig.services.find(
      (candidate) =>
        candidate.serviceId === destination.serviceId &&
        candidate.available &&
        candidate.referralContactId !== null &&
        candidate.capabilities.includes(destination.preferredClinicalDestination),
    )
    if (!service?.referralContactId) {
      return safeDefault(request, 'override_invalid', governedConfig.version)
    }
    return {
      ...sameCareState({
        ...request,
        preferredClinicalDestination:
          destination.preferredClinicalDestination,
      }),
      disposition: 'local_service_available',
      localService: {
        serviceId: service.serviceId,
        referralContactId: service.referralContactId,
      },
      externalEscalationContactId: null,
      provenance: [...decision.provenance, overrideProvenance],
    }
  }

  if (
    !isIdentifier(destination.referralContactId) ||
    destination.referralContactId !== governedConfig.externalEscalationContactId
  ) {
    return safeDefault(request, 'override_invalid', governedConfig.version)
  }
  return {
    ...sameCareState({
        ...request,
        preferredClinicalDestination: destination.preferredClinicalDestination,
    }),
    disposition: 'external_escalation_required',
    localService: null,
    externalEscalationContactId: destination.referralContactId,
    provenance: [...decision.provenance, overrideProvenance],
  }
}
