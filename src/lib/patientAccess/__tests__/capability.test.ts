import { createHmac, randomBytes, randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  PATIENT_ACCESS_AUDIENCE,
  PATIENT_ACCESS_ISSUER,
  PatientAccessCapabilityError,
  createPatientAccessKeyRing,
  hashPatientAccessJti,
  loadPatientAccessKeyRing,
  signPatientAccessCapability,
  verifyPatientAccessCapability,
  type PatientAccessCapabilityClaims,
} from '../capability'

const PATIENT_ID = '11111111-1111-4111-8111-111111111111'
const CONSULT_ID = '22222222-2222-4222-8222-222222222222'

function secret(): string {
  return randomBytes(32).toString('base64url')
}

function keyRing(activeKid = 'current', currentSecret = secret()) {
  return createPatientAccessKeyRing({
    activeKid,
    encodedKeys: {
      current: currentSecret,
      previous: secret(),
    },
  })
}

function signRawClaims(
  claims: Record<string, unknown>,
  encodedSecret: string,
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'SEVARO-PATIENT-ACCESS', kid: 'current' }),
  ).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signingInput = `${header}.${payload}`
  const signature = createHmac('sha256', Buffer.from(encodedSecret, 'base64url'))
    .update(signingInput)
    .digest('base64url')
  return `${signingInput}.${signature}`
}

function validClaims(
  overrides: Partial<PatientAccessCapabilityClaims> = {},
): PatientAccessCapabilityClaims {
  return {
    iss: PATIENT_ACCESS_ISSUER,
    aud: PATIENT_ACCESS_AUDIENCE,
    ver: 1,
    kind: 'invite',
    tenant_id: 'tenant-1',
    patient_id: PATIENT_ID,
    consult_id: CONSULT_ID,
    scopes: ['patient:historian:start', 'patient:historian:save'],
    jti: randomUUID(),
    iat: 2_000_000_000,
    exp: 2_000_003_600,
    ...overrides,
  }
}

describe('patient access capability cryptography', () => {
  it('signs and verifies a versioned, narrowly scoped invite', () => {
    const keys = keyRing()
    const token = signPatientAccessCapability(validClaims(), keys)

    const result = verifyPatientAccessCapability(token, {
      keys,
      nowEpochSeconds: 2_000_000_100,
      expectedKind: 'invite',
      expectedTenantId: 'tenant-1',
      expectedPatientId: PATIENT_ID,
      expectedConsultId: CONSULT_ID,
      requiredScopes: ['patient:historian:start'],
    })

    expect(result.claims.patient_id).toBe(PATIENT_ID)
    expect(result.header).toMatchObject({
      alg: 'HS256',
      typ: 'SEVARO-PATIENT-ACCESS',
      kid: 'current',
    })
    expect(result.jtiHash).toEqual(hashPatientAccessJti(result.claims.jti))
    expect(token.length).toBeLessThanOrEqual(4096)
  })

  it('rejects payload and signature tampering', () => {
    const keys = keyRing()
    const token = signPatientAccessCapability(validClaims(), keys)
    const [header, payload, signature] = token.split('.')
    const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`
    const tamperedSignature = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`

    expect(() =>
      verifyPatientAccessCapability(`${header}.${tamperedPayload}.${signature}`, {
        keys,
        nowEpochSeconds: 2_000_000_100,
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_signature' }))
    expect(() =>
      verifyPatientAccessCapability(`${header}.${payload}.${tamperedSignature}`, {
        keys,
        nowEpochSeconds: 2_000_000_100,
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_signature' }))
  })

  it('rejects expired and not-yet-valid claims with bounded clock skew', () => {
    const keys = keyRing()
    const expired = signPatientAccessCapability(
      validClaims({ iat: 2_000_000_000, exp: 2_000_000_030 }),
      keys,
    )
    const future = signPatientAccessCapability(
      validClaims({ iat: 2_000_000_200, exp: 2_000_003_800 }),
      keys,
    )

    expect(() =>
      verifyPatientAccessCapability(expired, {
        keys,
        nowEpochSeconds: 2_000_000_100,
      }),
    ).toThrowError(expect.objectContaining({ code: 'expired' }))
    expect(() =>
      verifyPatientAccessCapability(future, {
        keys,
        nowEpochSeconds: 2_000_000_100,
      }),
    ).toThrowError(expect.objectContaining({ code: 'not_yet_valid' }))
  })

  it('rejects wrong tenant, patient, consult, kind, or missing scope', () => {
    const keys = keyRing()
    const token = signPatientAccessCapability(validClaims(), keys)

    const failures = [
      { expectedTenantId: 'tenant-2', code: 'binding_mismatch' },
      {
        expectedPatientId: '33333333-3333-4333-8333-333333333333',
        code: 'binding_mismatch',
      },
      {
        expectedConsultId: '44444444-4444-4444-8444-444444444444',
        code: 'binding_mismatch',
      },
      { expectedKind: 'session' as const, code: 'kind_mismatch' },
      {
        requiredScopes: ['patient:intake:submit'] as const,
        code: 'scope_denied',
      },
    ]

    for (const failure of failures) {
      expect(() =>
        verifyPatientAccessCapability(token, {
          keys,
          nowEpochSeconds: 2_000_000_100,
          ...failure,
        }),
      ).toThrowError(expect.objectContaining({ code: failure.code }))
    }
  })

  it('rejects invalid issuer, audience, version, and excessive TTL even when signed', () => {
    const encodedSecret = secret()
    const keys = keyRing('current', encodedSecret)
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ iss: 'other-issuer' }, 'invalid_claims'],
      [{ aud: 'other-audience' }, 'invalid_claims'],
      [{ ver: 2 }, 'invalid_claims'],
      [{ exp: 2_000_100_000 }, 'ttl_exceeded'],
    ]

    for (const [claims, code] of cases) {
      const token = signRawClaims({ ...validClaims(), ...claims }, encodedSecret)
      expect(() =>
        verifyPatientAccessCapability(token, {
          keys,
          nowEpochSeconds: 2_000_000_100,
        }),
      ).toThrowError(expect.objectContaining({ code }))
    }
  })

  it('rejects oversized tokens and invalid scope sets before use', () => {
    const keys = keyRing()
    const oversized = `a.${'b'.repeat(4096)}.c`

    expect(() =>
      verifyPatientAccessCapability(oversized, {
        keys,
        nowEpochSeconds: 2_000_000_100,
      }),
    ).toThrowError(expect.objectContaining({ code: 'token_too_large' }))
    expect(() =>
      signPatientAccessCapability(
        validClaims({
          scopes: ['patient:historian:start', 'patient:historian:start'],
        }),
        keys,
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalid_claims' }))
    expect(() =>
      signPatientAccessCapability(
        validClaims({ scopes: ['patient:everything' as never] }),
        keys,
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalid_claims' }))
  })

  it('supports key rotation while signing only with the active key', () => {
    const previousSecret = secret()
    const currentSecret = secret()
    const oldKeys = createPatientAccessKeyRing({
      activeKid: 'previous',
      encodedKeys: { previous: previousSecret },
    })
    const rotatedKeys = createPatientAccessKeyRing({
      activeKid: 'current',
      encodedKeys: { previous: previousSecret, current: currentSecret },
    })
    const oldToken = signPatientAccessCapability(validClaims(), oldKeys)
    const newToken = signPatientAccessCapability(validClaims(), rotatedKeys)

    expect(
      verifyPatientAccessCapability(oldToken, {
        keys: rotatedKeys,
        nowEpochSeconds: 2_000_000_100,
      }).header.kid,
    ).toBe('previous')
    expect(
      verifyPatientAccessCapability(newToken, {
        keys: rotatedKeys,
        nowEpochSeconds: 2_000_000_100,
      }).header.kid,
    ).toBe('current')
  })

  it('fails closed when signing secrets are absent or malformed', () => {
    expect(() => loadPatientAccessKeyRing({})).toThrowError(
      expect.objectContaining({ code: 'signing_configuration_unavailable' }),
    )
    expect(() =>
      loadPatientAccessKeyRing({
        PATIENT_ACCESS_ACTIVE_KID: 'current',
        PATIENT_ACCESS_SIGNING_KEYS_JSON: JSON.stringify({ current: 'dev-secret' }),
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'signing_configuration_unavailable' }),
    )
  })

  it('uses a stable 32-byte hash without retaining the raw jti', () => {
    const jti = randomUUID()
    const hashed = hashPatientAccessJti(jti)

    expect(hashed).toHaveLength(32)
    expect(hashed.toString('utf8')).not.toContain(jti)
    expect(PatientAccessCapabilityError).toBeDefined()
  })
})
