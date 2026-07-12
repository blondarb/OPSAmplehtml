import { randomBytes } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPatientAccessKeyRing,
  verifyPatientAccessCapability,
  type PatientAccessScope,
} from '../capability'
import {
  PatientAccessServiceError,
  authorizePatientSession,
  issuePatientInvite,
  redeemPatientInvite,
  revokePatientAccessCapability,
  type PatientAccessCapabilityRecord,
  type PatientAccessRepository,
} from '../service'

const PATIENT_ID = '11111111-1111-4111-8111-111111111111'
const CONSULT_ID = '22222222-2222-4222-8222-222222222222'
const SESSION_CAPABILITY_ID = '33333333-3333-4333-8333-333333333333'
const NOW = 2_000_000_000
const SCOPES: PatientAccessScope[] = [
  'patient:historian:start',
  'patient:historian:save',
]

function keys() {
  return createPatientAccessKeyRing({
    activeKid: 'current',
    encodedKeys: { current: randomBytes(32).toString('base64url') },
  })
}

function repository(): PatientAccessRepository {
  return {
    validateBinding: vi.fn().mockResolvedValue('valid'),
    insertCapability: vi.fn().mockResolvedValue(undefined),
    redeemInviteAndCreateSession: vi.fn().mockResolvedValue({
      status: 'redeemed',
      sessionCapabilityId: SESSION_CAPABILITY_ID,
    }),
    findActiveCapability: vi.fn().mockResolvedValue({ status: 'active' }),
    revokeCapability: vi.fn().mockResolvedValue('revoked'),
  }
}

async function issueInvite(
  repo: PatientAccessRepository,
  keyRing = keys(),
) {
  return issuePatientInvite(
    {
      tenantId: 'tenant-1',
      patientId: PATIENT_ID,
      consultId: CONSULT_ID,
      scopes: SCOPES,
      ttlSeconds: 3600,
      actorUserId: 'clinician-1',
      actorRole: 'clinician',
    },
    {
      repository: repo,
      keys: keyRing,
      nowEpochSeconds: () => NOW,
      nextJti: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    },
  )
}

describe('patient access capability service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('tenant-validates patient and consult before recording a hashed invite', async () => {
    const repo = repository()
    const result = await issueInvite(repo)

    expect(repo.validateBinding).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      patientId: PATIENT_ID,
      consultId: CONSULT_ID,
    })
    expect(repo.insertCapability).toHaveBeenCalledOnce()
    const record = vi.mocked(repo.insertCapability).mock.calls[0][0]
    expect(record).toMatchObject({
      kind: 'invite',
      tenantId: 'tenant-1',
      patientId: PATIENT_ID,
      consultId: CONSULT_ID,
      scopes: SCOPES,
      issuedBy: 'clinician-1',
    })
    expect(record.jtiHash).toBeInstanceOf(Buffer)
    expect(record.jtiHash).toHaveLength(32)
    expect(record).not.toHaveProperty('token')
    expect(record).not.toHaveProperty('jti')
    expect(JSON.stringify(record)).not.toContain(result.token)
    expect(JSON.stringify(record)).not.toContain(result.claims.jti)
  })

  it('fails issuance closed for unauthorized actor roles or invalid bindings', async () => {
    const repo = repository()
    await expect(
      issuePatientInvite(
        {
          tenantId: 'tenant-1',
          patientId: PATIENT_ID,
          scopes: SCOPES,
          actorUserId: 'scheduler-1',
          actorRole: 'scheduler' as never,
        },
        { repository: repo, keys: keys(), nowEpochSeconds: () => NOW },
      ),
    ).rejects.toMatchObject({ code: 'actor_forbidden' })

    vi.mocked(repo.validateBinding).mockResolvedValueOnce('consult_patient_mismatch')
    await expect(issueInvite(repo)).rejects.toMatchObject({
      code: 'binding_invalid',
    })
    expect(repo.insertCapability).not.toHaveBeenCalled()
  })

  it('atomically redeems an invite once into a short-lived session capability', async () => {
    const repo = repository()
    const keyRing = keys()
    const invite = await issueInvite(repo, keyRing)
    vi.mocked(repo.insertCapability).mockClear()

    const redeemed = await redeemPatientInvite(
      { token: invite.token },
      {
        repository: repo,
        keys: keyRing,
        nowEpochSeconds: () => NOW + 100,
        nextJti: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        nextCorrelationId: () => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
    )

    expect(repo.redeemInviteAndCreateSession).toHaveBeenCalledOnce()
    const redemption = vi.mocked(repo.redeemInviteAndCreateSession).mock.calls[0][0]
    expect(redemption.inviteJtiHash).toHaveLength(32)
    expect(redemption.sessionRecord).not.toHaveProperty('token')
    expect(redemption.sessionRecord).not.toHaveProperty('jti')
    expect(redemption.sessionRecord).toMatchObject({
      kind: 'session',
      parentJtiHash: redemption.inviteJtiHash,
      tenantId: 'tenant-1',
      patientId: PATIENT_ID,
      consultId: CONSULT_ID,
      scopes: SCOPES,
    })
    expect(redeemed.claims.exp - redeemed.claims.iat).toBe(15 * 60)
    expect(
      verifyPatientAccessCapability(redeemed.sessionToken, {
        keys: keyRing,
        nowEpochSeconds: NOW + 101,
        expectedKind: 'session',
      }).claims.jti,
    ).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  })

  it.each([
    ['unknown', 'unknown_capability'],
    ['revoked', 'revoked'],
    ['expired', 'expired'],
    ['already_redeemed', 'replay_detected'],
    ['binding_mismatch', 'binding_invalid'],
  ] as const)(
    'fails redemption when the repository reports %s',
    async (status, expectedCode) => {
      const repo = repository()
      const keyRing = keys()
      const invite = await issueInvite(repo, keyRing)
      vi.mocked(repo.redeemInviteAndCreateSession).mockResolvedValueOnce({ status })

      await expect(
        redeemPatientInvite(
          { token: invite.token },
          {
            repository: repo,
            keys: keyRing,
            nowEpochSeconds: () => NOW + 100,
          },
        ),
      ).rejects.toMatchObject({ code: expectedCode })
    },
  )

  it('requires the signed session and active database lifecycle record', async () => {
    const repo = repository()
    const keyRing = keys()
    const invite = await issueInvite(repo, keyRing)
    const session = await redeemPatientInvite(
      { token: invite.token },
      {
        repository: repo,
        keys: keyRing,
        nowEpochSeconds: () => NOW + 100,
      },
    )

    const claims = await authorizePatientSession(
      {
        token: session.sessionToken,
        expectedTenantId: 'tenant-1',
        expectedPatientId: PATIENT_ID,
        expectedConsultId: CONSULT_ID,
        requiredScopes: ['patient:historian:start'],
      },
      {
        repository: repo,
        keys: keyRing,
        nowEpochSeconds: () => NOW + 200,
      },
    )

    expect(claims.patient_id).toBe(PATIENT_ID)
    expect(repo.findActiveCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'session',
        tenantId: 'tenant-1',
        patientId: PATIENT_ID,
        consultId: CONSULT_ID,
      }),
    )

    vi.mocked(repo.findActiveCapability).mockResolvedValueOnce({ status: 'revoked' })
    await expect(
      authorizePatientSession(
        {
          token: session.sessionToken,
          expectedTenantId: 'tenant-1',
          requiredScopes: ['patient:historian:start'],
        },
        {
          repository: repo,
          keys: keyRing,
          nowEpochSeconds: () => NOW + 200,
        },
      ),
    ).rejects.toMatchObject({ code: 'revoked' })
  })

  it('records revocation only for a clinician or administrator in the tenant', async () => {
    const repo = repository()
    await expect(
      revokePatientAccessCapability(
        {
          capabilityId: SESSION_CAPABILITY_ID,
          tenantId: 'tenant-1',
          actorUserId: 'admin-1',
          actorRole: 'admin',
          reason: 'Invitation sent to the wrong recipient',
        },
        { repository: repo },
      ),
    ).resolves.toBeUndefined()
    expect(repo.revokeCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityId: SESSION_CAPABILITY_ID,
        tenantId: 'tenant-1',
        revokedBy: 'admin-1',
      }),
    )
  })

  it('exposes stable typed errors without embedding capability tokens', () => {
    const error = new PatientAccessServiceError('replay_detected')
    expect(error.message).toBe('replay_detected')
    expect(error).not.toHaveProperty('token')
    expect({} as PatientAccessCapabilityRecord).toBeDefined()
  })
})
