import {
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto'

export const PATIENT_ACCESS_ISSUER = 'sevaro-clinical'
export const PATIENT_ACCESS_AUDIENCE = 'sevaro-patient-access'
export const PATIENT_ACCESS_TOKEN_VERSION = 1 as const
export const PATIENT_ACCESS_MAX_TOKEN_BYTES = 4096
export const PATIENT_ACCESS_CLOCK_SKEW_SECONDS = 30
export const PATIENT_ACCESS_MAX_INVITE_TTL_SECONDS = 24 * 60 * 60
export const PATIENT_ACCESS_MAX_SESSION_TTL_SECONDS = 30 * 60

export const PATIENT_ACCESS_SCOPES = [
  'patient:historian:start',
  'patient:historian:renew',
  'patient:historian:save',
  'patient:historian:report',
  'patient:intake:submit',
  'patient:clarification:answer',
] as const

export type PatientAccessScope = (typeof PATIENT_ACCESS_SCOPES)[number]
export type PatientAccessCapabilityKind = 'invite' | 'session'

export interface PatientAccessCapabilityClaims {
  iss: typeof PATIENT_ACCESS_ISSUER
  aud: typeof PATIENT_ACCESS_AUDIENCE
  ver: typeof PATIENT_ACCESS_TOKEN_VERSION
  kind: PatientAccessCapabilityKind
  tenant_id: string
  patient_id: string
  consult_id?: string
  scopes: PatientAccessScope[]
  jti: string
  iat: number
  exp: number
}

export interface PatientAccessCapabilityHeader {
  alg: 'HS256'
  typ: 'SEVARO-PATIENT-ACCESS'
  kid: string
}

export interface PatientAccessKeyRing {
  readonly activeKid: string
  readonly keys: ReadonlyMap<string, Buffer>
}

export type PatientAccessCapabilityErrorCode =
  | 'signing_configuration_unavailable'
  | 'invalid_token'
  | 'token_too_large'
  | 'invalid_signature'
  | 'invalid_claims'
  | 'ttl_exceeded'
  | 'expired'
  | 'not_yet_valid'
  | 'kind_mismatch'
  | 'binding_mismatch'
  | 'scope_denied'

export class PatientAccessCapabilityError extends Error {
  constructor(
    public readonly code: PatientAccessCapabilityErrorCode,
    message = code,
  ) {
    super(message)
    this.name = 'PatientAccessCapabilityError'
  }
}

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/
const KID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const TENANT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_SCOPES = new Set<string>(PATIENT_ACCESS_SCOPES)
const HEADER_KEYS = new Set(['alg', 'typ', 'kid'])
const CLAIM_KEYS = new Set([
  'iss',
  'aud',
  'ver',
  'kind',
  'tenant_id',
  'patient_id',
  'consult_id',
  'scopes',
  'jti',
  'iat',
  'exp',
])

function decodeCanonicalBase64Url(
  encoded: string,
  code: PatientAccessCapabilityErrorCode,
): Buffer {
  if (!encoded || !BASE64URL_PATTERN.test(encoded)) {
    throw new PatientAccessCapabilityError(code)
  }
  try {
    const decoded = Buffer.from(encoded, 'base64url')
    if (decoded.toString('base64url') !== encoded) {
      throw new PatientAccessCapabilityError(code)
    }
    return decoded
  } catch (error) {
    if (error instanceof PatientAccessCapabilityError) throw error
    throw new PatientAccessCapabilityError(code)
  }
}

function parseJsonObject(encoded: string, maxDecodedBytes: number): Record<string, unknown> {
  const decoded = decodeCanonicalBase64Url(encoded, 'invalid_token')
  if (decoded.length > maxDecodedBytes) {
    throw new PatientAccessCapabilityError('token_too_large')
  }
  try {
    const value: unknown = JSON.parse(decoded.toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new PatientAccessCapabilityError('invalid_token')
    }
    return value as Record<string, unknown>
  } catch (error) {
    if (error instanceof PatientAccessCapabilityError) throw error
    throw new PatientAccessCapabilityError('invalid_token')
  }
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key))
}

function validateHeader(value: Record<string, unknown>): PatientAccessCapabilityHeader {
  if (
    !hasOnlyKeys(value, HEADER_KEYS) ||
    Object.keys(value).length !== HEADER_KEYS.size ||
    value.alg !== 'HS256' ||
    value.typ !== 'SEVARO-PATIENT-ACCESS' ||
    typeof value.kid !== 'string' ||
    !KID_PATTERN.test(value.kid)
  ) {
    throw new PatientAccessCapabilityError('invalid_token')
  }
  return value as unknown as PatientAccessCapabilityHeader
}

function validateClaims(value: Record<string, unknown>): PatientAccessCapabilityClaims {
  const requiredKeyCount = value.consult_id === undefined ? 10 : 11
  const scopes = value.scopes
  if (
    !hasOnlyKeys(value, CLAIM_KEYS) ||
    Object.keys(value).length !== requiredKeyCount ||
    value.iss !== PATIENT_ACCESS_ISSUER ||
    value.aud !== PATIENT_ACCESS_AUDIENCE ||
    value.ver !== PATIENT_ACCESS_TOKEN_VERSION ||
    (value.kind !== 'invite' && value.kind !== 'session') ||
    typeof value.tenant_id !== 'string' ||
    !TENANT_PATTERN.test(value.tenant_id) ||
    typeof value.patient_id !== 'string' ||
    !UUID_PATTERN.test(value.patient_id) ||
    (value.consult_id !== undefined &&
      (typeof value.consult_id !== 'string' || !UUID_PATTERN.test(value.consult_id))) ||
    !Array.isArray(scopes) ||
    scopes.length < 1 ||
    scopes.length > PATIENT_ACCESS_SCOPES.length ||
    scopes.some((scope) => typeof scope !== 'string' || !ALLOWED_SCOPES.has(scope)) ||
    new Set(scopes).size !== scopes.length ||
    typeof value.jti !== 'string' ||
    !UUID_PATTERN.test(value.jti) ||
    !Number.isSafeInteger(value.iat) ||
    !Number.isSafeInteger(value.exp) ||
    (value.iat as number) < 1 ||
    (value.exp as number) <= (value.iat as number)
  ) {
    throw new PatientAccessCapabilityError('invalid_claims')
  }

  const maxTtl =
    value.kind === 'invite'
      ? PATIENT_ACCESS_MAX_INVITE_TTL_SECONDS
      : PATIENT_ACCESS_MAX_SESSION_TTL_SECONDS
  if ((value.exp as number) - (value.iat as number) > maxTtl) {
    throw new PatientAccessCapabilityError('ttl_exceeded')
  }

  return value as unknown as PatientAccessCapabilityClaims
}

export function createPatientAccessKeyRing(input: {
  activeKid: string
  encodedKeys: Record<string, string>
}): PatientAccessKeyRing {
  const entries = Object.entries(input.encodedKeys)
  if (
    !KID_PATTERN.test(input.activeKid) ||
    entries.length < 1 ||
    entries.length > 5 ||
    !Object.prototype.hasOwnProperty.call(input.encodedKeys, input.activeKid)
  ) {
    throw new PatientAccessCapabilityError('signing_configuration_unavailable')
  }

  const keys = new Map<string, Buffer>()
  for (const [kid, encodedSecret] of entries) {
    if (!KID_PATTERN.test(kid) || typeof encodedSecret !== 'string') {
      throw new PatientAccessCapabilityError('signing_configuration_unavailable')
    }
    let decoded: Buffer
    try {
      decoded = decodeCanonicalBase64Url(
        encodedSecret,
        'signing_configuration_unavailable',
      )
    } catch {
      throw new PatientAccessCapabilityError('signing_configuration_unavailable')
    }
    if (decoded.length < 32 || decoded.length > 64) {
      throw new PatientAccessCapabilityError('signing_configuration_unavailable')
    }
    keys.set(kid, decoded)
  }

  return Object.freeze({ activeKid: input.activeKid, keys })
}

export function loadPatientAccessKeyRing(
  environment: Record<string, string | undefined> = process.env,
): PatientAccessKeyRing {
  const activeKid = environment.PATIENT_ACCESS_ACTIVE_KID?.trim()
  const rawKeys = environment.PATIENT_ACCESS_SIGNING_KEYS_JSON?.trim()
  if (!activeKid || !rawKeys || rawKeys.length > 4096) {
    throw new PatientAccessCapabilityError('signing_configuration_unavailable')
  }

  try {
    const parsed: unknown = JSON.parse(rawKeys)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid key object')
    }
    return createPatientAccessKeyRing({
      activeKid,
      encodedKeys: parsed as Record<string, string>,
    })
  } catch (error) {
    if (error instanceof PatientAccessCapabilityError) throw error
    throw new PatientAccessCapabilityError('signing_configuration_unavailable')
  }
}

export function signPatientAccessCapability(
  claims: PatientAccessCapabilityClaims,
  keyRing: PatientAccessKeyRing,
): string {
  validateClaims(claims as unknown as Record<string, unknown>)
  const secret = keyRing.keys.get(keyRing.activeKid)
  if (!secret) {
    throw new PatientAccessCapabilityError('signing_configuration_unavailable')
  }
  const header: PatientAccessCapabilityHeader = {
    alg: 'HS256',
    typ: 'SEVARO-PATIENT-ACCESS',
    kid: keyRing.activeKid,
  }
  const encodedHeader = Buffer.from(JSON.stringify(header), 'utf8').toString('base64url')
  const encodedPayload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = createHmac('sha256', secret)
    .update(signingInput, 'ascii')
    .digest('base64url')
  const token = `${signingInput}.${signature}`
  if (Buffer.byteLength(token, 'utf8') > PATIENT_ACCESS_MAX_TOKEN_BYTES) {
    throw new PatientAccessCapabilityError('token_too_large')
  }
  return token
}

export function hashPatientAccessJti(jti: string): Buffer {
  return createHash('sha256').update(jti, 'utf8').digest()
}

export function verifyPatientAccessCapability(
  token: string,
  options: {
    keys: PatientAccessKeyRing
    nowEpochSeconds?: number
    expectedKind?: PatientAccessCapabilityKind
    expectedTenantId?: string
    expectedPatientId?: string
    expectedConsultId?: string | null
    requiredScopes?: readonly PatientAccessScope[]
  },
): {
  header: PatientAccessCapabilityHeader
  claims: PatientAccessCapabilityClaims
  jtiHash: Buffer
} {
  if (
    typeof token !== 'string' ||
    Buffer.byteLength(token, 'utf8') > PATIENT_ACCESS_MAX_TOKEN_BYTES
  ) {
    throw new PatientAccessCapabilityError('token_too_large')
  }
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new PatientAccessCapabilityError('invalid_token')
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const header = validateHeader(parseJsonObject(encodedHeader, 512))
  const secret = options.keys.keys.get(header.kid)
  if (!secret) {
    throw new PatientAccessCapabilityError('invalid_signature')
  }

  const suppliedSignature = decodeCanonicalBase64Url(
    encodedSignature,
    'invalid_signature',
  )
  const expectedSignature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`, 'ascii')
    .digest()
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw new PatientAccessCapabilityError('invalid_signature')
  }

  const claims = validateClaims(parseJsonObject(encodedPayload, 3072))
  const now = options.nowEpochSeconds ?? Math.floor(Date.now() / 1000)
  if (claims.iat > now + PATIENT_ACCESS_CLOCK_SKEW_SECONDS) {
    throw new PatientAccessCapabilityError('not_yet_valid')
  }
  if (claims.exp <= now - PATIENT_ACCESS_CLOCK_SKEW_SECONDS) {
    throw new PatientAccessCapabilityError('expired')
  }
  if (options.expectedKind && claims.kind !== options.expectedKind) {
    throw new PatientAccessCapabilityError('kind_mismatch')
  }
  if (
    (options.expectedTenantId !== undefined &&
      claims.tenant_id !== options.expectedTenantId) ||
    (options.expectedPatientId !== undefined &&
      claims.patient_id !== options.expectedPatientId) ||
    (options.expectedConsultId !== undefined &&
      (claims.consult_id ?? null) !== options.expectedConsultId)
  ) {
    throw new PatientAccessCapabilityError('binding_mismatch')
  }
  if (
    options.requiredScopes?.some(
      (requiredScope) => !claims.scopes.includes(requiredScope),
    )
  ) {
    throw new PatientAccessCapabilityError('scope_denied')
  }

  return { header, claims, jtiHash: hashPatientAccessJti(claims.jti) }
}
