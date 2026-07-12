import { randomUUID } from 'node:crypto'

import type { ClinicalRole } from '@/lib/auth/clinicalAccess'
import {
  PATIENT_ACCESS_AUDIENCE,
  PATIENT_ACCESS_ISSUER,
  PATIENT_ACCESS_MAX_INVITE_TTL_SECONDS,
  PATIENT_ACCESS_TOKEN_VERSION,
  PatientAccessCapabilityError,
  hashPatientAccessJti,
  signPatientAccessCapability,
  verifyPatientAccessCapability,
  type PatientAccessCapabilityClaims,
  type PatientAccessCapabilityKind,
  type PatientAccessKeyRing,
  type PatientAccessScope,
} from './capability'

const PATIENT_SESSION_TTL_SECONDS = 15 * 60

export interface PatientAccessCapabilityRecord {
  jtiHash: Buffer
  parentJtiHash?: Buffer
  kind: PatientAccessCapabilityKind
  version: 1
  tenantId: string
  patientId: string
  consultId?: string
  scopes: readonly PatientAccessScope[]
  issuedBy: string | null
  issuedByRole: 'clinician' | 'admin' | 'system'
  issuedAtEpochSeconds: number
  startsAtEpochSeconds: number
  expiresAtEpochSeconds: number
}

export type PatientAccessBindingStatus =
  | 'valid'
  | 'patient_not_found'
  | 'consult_not_found'
  | 'consult_patient_mismatch'

export type PatientAccessLifecycleStatus =
  | 'active'
  | 'unknown'
  | 'revoked'
  | 'expired'
  | 'already_redeemed'
  | 'binding_mismatch'

export interface PatientAccessRepository {
  validateBinding(input: {
    tenantId: string
    patientId: string
    consultId?: string
  }): Promise<PatientAccessBindingStatus>
  insertCapability(record: PatientAccessCapabilityRecord): Promise<void>
  redeemInviteAndCreateSession(input: {
    inviteJtiHash: Buffer
    inviteClaims: PatientAccessCapabilityClaims
    sessionRecord: PatientAccessCapabilityRecord
    redeemedAtEpochSeconds: number
    correlationId: string
  }): Promise<
    | { status: 'redeemed'; sessionCapabilityId: string }
    | { status: Exclude<PatientAccessLifecycleStatus, 'active'> }
  >
  findActiveCapability(input: {
    jtiHash: Buffer
    kind: PatientAccessCapabilityKind
    version: 1
    tenantId: string
    patientId: string
    consultId?: string
    scopes: readonly PatientAccessScope[]
    issuedAtEpochSeconds: number
    expiresAtEpochSeconds: number
    nowEpochSeconds: number
  }): Promise<
    | { status: 'active'; capabilityId?: string }
    | { status: Exclude<PatientAccessLifecycleStatus, 'active' | 'already_redeemed'> }
  >
  revokeCapability(input: {
    capabilityId: string
    tenantId: string
    revokedBy: string
    revokedByRole: 'clinician' | 'admin'
    reason: string
  }): Promise<'revoked' | 'unknown' | 'already_revoked'>
}

export type PatientAccessServiceErrorCode =
  | 'actor_forbidden'
  | 'invalid_request'
  | 'binding_invalid'
  | 'invalid_capability'
  | 'unknown_capability'
  | 'revoked'
  | 'expired'
  | 'replay_detected'
  | 'scope_denied'
  | 'persistence_unavailable'

export class PatientAccessServiceError extends Error {
  constructor(public readonly code: PatientAccessServiceErrorCode) {
    super(code)
    this.name = 'PatientAccessServiceError'
  }
}

interface PatientAccessServiceDependencies {
  repository: PatientAccessRepository
  keys: PatientAccessKeyRing
  nowEpochSeconds?: () => number
  nextJti?: () => string
  nextCorrelationId?: () => string
}

function nowFrom(dependencies: Pick<PatientAccessServiceDependencies, 'nowEpochSeconds'>) {
  return dependencies.nowEpochSeconds?.() ?? Math.floor(Date.now() / 1000)
}

function assertIssuerRole(role: ClinicalRole): asserts role is 'clinician' | 'admin' {
  if (role !== 'clinician' && role !== 'admin') {
    throw new PatientAccessServiceError('actor_forbidden')
  }
}

function claimsFor(input: {
  kind: PatientAccessCapabilityKind
  tenantId: string
  patientId: string
  consultId?: string
  scopes: readonly PatientAccessScope[]
  jti: string
  issuedAt: number
  expiresAt: number
}): PatientAccessCapabilityClaims {
  return {
    iss: PATIENT_ACCESS_ISSUER,
    aud: PATIENT_ACCESS_AUDIENCE,
    ver: PATIENT_ACCESS_TOKEN_VERSION,
    kind: input.kind,
    tenant_id: input.tenantId,
    patient_id: input.patientId,
    ...(input.consultId ? { consult_id: input.consultId } : {}),
    scopes: [...input.scopes],
    jti: input.jti,
    iat: input.issuedAt,
    exp: input.expiresAt,
  }
}

function capabilityRecord(
  claims: PatientAccessCapabilityClaims,
  actor: {
    userId: string | null
    role: 'clinician' | 'admin' | 'system'
  },
  parentJtiHash?: Buffer,
): PatientAccessCapabilityRecord {
  return {
    jtiHash: hashPatientAccessJti(claims.jti),
    ...(parentJtiHash ? { parentJtiHash } : {}),
    kind: claims.kind,
    version: claims.ver,
    tenantId: claims.tenant_id,
    patientId: claims.patient_id,
    ...(claims.consult_id ? { consultId: claims.consult_id } : {}),
    scopes: claims.scopes,
    issuedBy: actor.userId,
    issuedByRole: actor.role,
    issuedAtEpochSeconds: claims.iat,
    startsAtEpochSeconds: claims.iat,
    expiresAtEpochSeconds: claims.exp,
  }
}

function mapCapabilityError(error: unknown): never {
  if (error instanceof PatientAccessServiceError) throw error
  if (error instanceof PatientAccessCapabilityError) {
    if (error.code === 'expired') throw new PatientAccessServiceError('expired')
    if (error.code === 'scope_denied') {
      throw new PatientAccessServiceError('scope_denied')
    }
    if (error.code === 'binding_mismatch') {
      throw new PatientAccessServiceError('binding_invalid')
    }
    throw new PatientAccessServiceError('invalid_capability')
  }
  throw new PatientAccessServiceError('persistence_unavailable')
}

export async function issuePatientInvite(
  input: {
    tenantId: string
    patientId: string
    consultId?: string
    scopes: readonly PatientAccessScope[]
    ttlSeconds?: number
    actorUserId: string
    actorRole: Extract<ClinicalRole, 'clinician' | 'admin'>
  },
  dependencies: PatientAccessServiceDependencies,
): Promise<{
  token: string
  claims: PatientAccessCapabilityClaims
}> {
  assertIssuerRole(input.actorRole)
  const ttlSeconds = input.ttlSeconds ?? 60 * 60
  if (
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < 60 ||
    ttlSeconds > PATIENT_ACCESS_MAX_INVITE_TTL_SECONDS
  ) {
    throw new PatientAccessServiceError('invalid_request')
  }

  try {
    const binding = await dependencies.repository.validateBinding({
      tenantId: input.tenantId,
      patientId: input.patientId,
      ...(input.consultId ? { consultId: input.consultId } : {}),
    })
    if (binding !== 'valid') {
      throw new PatientAccessServiceError('binding_invalid')
    }

    const issuedAt = nowFrom(dependencies)
    const claims = claimsFor({
      kind: 'invite',
      tenantId: input.tenantId,
      patientId: input.patientId,
      consultId: input.consultId,
      scopes: input.scopes,
      jti: dependencies.nextJti?.() ?? randomUUID(),
      issuedAt,
      expiresAt: issuedAt + ttlSeconds,
    })
    const token = signPatientAccessCapability(claims, dependencies.keys)
    await dependencies.repository.insertCapability(
      capabilityRecord(claims, {
        userId: input.actorUserId,
        role: input.actorRole,
      }),
    )
    return { token, claims }
  } catch (error) {
    return mapCapabilityError(error)
  }
}

export async function redeemPatientInvite(
  input: { token: string },
  dependencies: PatientAccessServiceDependencies,
): Promise<{
  sessionToken: string
  claims: PatientAccessCapabilityClaims
}> {
  try {
    const now = nowFrom(dependencies)
    const invite = verifyPatientAccessCapability(input.token, {
      keys: dependencies.keys,
      nowEpochSeconds: now,
      expectedKind: 'invite',
    })
    const sessionClaims = claimsFor({
      kind: 'session',
      tenantId: invite.claims.tenant_id,
      patientId: invite.claims.patient_id,
      consultId: invite.claims.consult_id,
      scopes: invite.claims.scopes,
      jti: dependencies.nextJti?.() ?? randomUUID(),
      issuedAt: now,
      expiresAt: now + PATIENT_SESSION_TTL_SECONDS,
    })
    const sessionToken = signPatientAccessCapability(sessionClaims, dependencies.keys)
    const result = await dependencies.repository.redeemInviteAndCreateSession({
      inviteJtiHash: invite.jtiHash,
      inviteClaims: invite.claims,
      sessionRecord: capabilityRecord(
        sessionClaims,
        { userId: null, role: 'system' },
        invite.jtiHash,
      ),
      redeemedAtEpochSeconds: now,
      correlationId: dependencies.nextCorrelationId?.() ?? randomUUID(),
    })
    if (result.status !== 'redeemed') {
      const statusMap: Record<string, PatientAccessServiceErrorCode> = {
        unknown: 'unknown_capability',
        revoked: 'revoked',
        expired: 'expired',
        already_redeemed: 'replay_detected',
        binding_mismatch: 'binding_invalid',
      }
      throw new PatientAccessServiceError(
        statusMap[result.status] ?? 'invalid_capability',
      )
    }
    return { sessionToken, claims: sessionClaims }
  } catch (error) {
    return mapCapabilityError(error)
  }
}

export async function authorizePatientSession(
  input: {
    token: string
    expectedTenantId?: string
    expectedPatientId?: string
    expectedConsultId?: string | null
    requiredScopes: readonly PatientAccessScope[]
  },
  dependencies: Pick<
    PatientAccessServiceDependencies,
    'repository' | 'keys' | 'nowEpochSeconds'
  >,
): Promise<PatientAccessCapabilityClaims> {
  try {
    const now = nowFrom(dependencies)
    const verified = verifyPatientAccessCapability(input.token, {
      keys: dependencies.keys,
      nowEpochSeconds: now,
      expectedKind: 'session',
      ...(input.expectedTenantId !== undefined
        ? { expectedTenantId: input.expectedTenantId }
        : {}),
      expectedPatientId: input.expectedPatientId,
      expectedConsultId: input.expectedConsultId,
      requiredScopes: input.requiredScopes,
    })
    const lifecycle = await dependencies.repository.findActiveCapability({
      jtiHash: verified.jtiHash,
      kind: 'session',
      version: verified.claims.ver,
      tenantId: verified.claims.tenant_id,
      patientId: verified.claims.patient_id,
      consultId: verified.claims.consult_id,
      scopes: verified.claims.scopes,
      issuedAtEpochSeconds: verified.claims.iat,
      expiresAtEpochSeconds: verified.claims.exp,
      nowEpochSeconds: now,
    })
    if (lifecycle.status !== 'active') {
      const statusMap: Record<string, PatientAccessServiceErrorCode> = {
        unknown: 'unknown_capability',
        revoked: 'revoked',
        expired: 'expired',
        binding_mismatch: 'binding_invalid',
      }
      throw new PatientAccessServiceError(
        statusMap[lifecycle.status] ?? 'invalid_capability',
      )
    }
    return verified.claims
  } catch (error) {
    return mapCapabilityError(error)
  }
}

export async function revokePatientAccessCapability(
  input: {
    capabilityId: string
    tenantId: string
    actorUserId: string
    actorRole: Extract<ClinicalRole, 'clinician' | 'admin'>
    reason: string
  },
  dependencies: Pick<PatientAccessServiceDependencies, 'repository'>,
): Promise<void> {
  assertIssuerRole(input.actorRole)
  if (!input.reason.trim() || input.reason.trim().length > 1000) {
    throw new PatientAccessServiceError('invalid_request')
  }
  try {
    const result = await dependencies.repository.revokeCapability({
      capabilityId: input.capabilityId,
      tenantId: input.tenantId,
      revokedBy: input.actorUserId,
      revokedByRole: input.actorRole,
      reason: input.reason.trim(),
    })
    if (result === 'unknown') {
      throw new PatientAccessServiceError('unknown_capability')
    }
    if (result === 'already_revoked') {
      throw new PatientAccessServiceError('revoked')
    }
  } catch (error) {
    return mapCapabilityError(error)
  }
}
