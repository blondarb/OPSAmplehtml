import { randomBytes } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPostgresPatientAccessRepository } from '../postgresRepository'
import type { PatientAccessCapabilityRecord } from '../service'

const PATIENT_ID = '11111111-1111-4111-8111-111111111111'
const CONSULT_ID = '22222222-2222-4222-8222-222222222222'
const CAPABILITY_ID = '33333333-3333-4333-8333-333333333333'

const { poolQuery, connect, clientQuery, release } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  connect: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
}))

function pool() {
  return { query: poolQuery, connect } as never
}

function record(kind: 'invite' | 'session' = 'invite'): PatientAccessCapabilityRecord {
  return {
    jtiHash: randomBytes(32),
    kind,
    version: 1,
    tenantId: 'tenant-1',
    patientId: PATIENT_ID,
    consultId: CONSULT_ID,
    scopes: ['patient:historian:start'],
    issuedBy: kind === 'invite' ? 'clinician-1' : null,
    issuedByRole: kind === 'invite' ? 'clinician' : 'system',
    issuedAtEpochSeconds: 2_000_000_000,
    startsAtEpochSeconds: 2_000_000_000,
    expiresAtEpochSeconds: 2_000_003_600,
  }
}

describe('Postgres patient access repository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    connect.mockResolvedValue({ query: clientQuery, release })
  })

  it('validates both patient and consult inside the authoritative tenant', async () => {
    poolQuery.mockResolvedValueOnce({
      rows: [
        {
          patient_id: PATIENT_ID,
          consult_id: CONSULT_ID,
          consult_patient_id: PATIENT_ID,
        },
      ],
    })
    const repository = createPostgresPatientAccessRepository(pool())

    await expect(
      repository.validateBinding({
        tenantId: 'tenant-1',
        patientId: PATIENT_ID,
        consultId: CONSULT_ID,
      }),
    ).resolves.toBe('valid')
    expect(poolQuery).toHaveBeenCalledWith(
      expect.stringContaining('c.tenant_id = $2'),
      [PATIENT_ID, 'tenant-1', CONSULT_ID],
    )
  })

  it('rejects a consult that belongs to another patient', async () => {
    poolQuery.mockResolvedValueOnce({
      rows: [
        {
          patient_id: PATIENT_ID,
          consult_id: CONSULT_ID,
          consult_patient_id: '44444444-4444-4444-8444-444444444444',
        },
      ],
    })
    const repository = createPostgresPatientAccessRepository(pool())

    await expect(
      repository.validateBinding({
        tenantId: 'tenant-1',
        patientId: PATIENT_ID,
        consultId: CONSULT_ID,
      }),
    ).resolves.toBe('consult_patient_mismatch')
  })

  it('atomically stores only the jti hash and an issuance audit event', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO patient_access_capabilities')) {
        return { rows: [{ id: CAPABILITY_ID }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })
    const repository = createPostgresPatientAccessRepository(pool())
    const capability = record()

    await repository.insertCapability(capability)

    expect(clientQuery).toHaveBeenCalledWith('BEGIN')
    expect(
      clientQuery.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO patient_access_audit_events'),
      ),
    ).toBe(true)
    const insertCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO patient_access_capabilities'),
    )
    expect(insertCall?.[1]).toContain(capability.jtiHash)
    expect(insertCall?.[1]).not.toContainEqual(expect.stringContaining('token'))
    expect(clientQuery).toHaveBeenCalledWith('COMMIT')
    expect(release).toHaveBeenCalledOnce()
  })

  it('locks the invite and rejects duplicate redemption without creating a session', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM patient_access_capabilities') && sql.includes('FOR UPDATE')) {
        return {
          rows: [
            {
              id: CAPABILITY_ID,
              token_kind: 'invite',
              token_version: 1,
              tenant_id: 'tenant-1',
              patient_id: PATIENT_ID,
              consult_id: CONSULT_ID,
              scopes: ['patient:historian:start'],
              issued_at_epoch: '2000000000',
              expires_at_epoch: '2000003600',
              revoked_at: null,
              redeemed_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 1 }
    })
    const repository = createPostgresPatientAccessRepository(pool())
    const invite = record()
    const session = {
      ...record('session'),
      parentJtiHash: invite.jtiHash,
    }

    await expect(
      repository.redeemInviteAndCreateSession({
        inviteJtiHash: invite.jtiHash,
        inviteClaims: {
          iss: 'sevaro-clinical',
          aud: 'sevaro-patient-access',
          ver: 1,
          kind: 'invite',
          tenant_id: 'tenant-1',
          patient_id: PATIENT_ID,
          consult_id: CONSULT_ID,
          scopes: ['patient:historian:start'],
          jti: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          iat: 2_000_000_000,
          exp: 2_000_003_600,
        },
        sessionRecord: session,
        redeemedAtEpochSeconds: 2_000_000_100,
        correlationId: 'correlation-1',
      }),
    ).resolves.toEqual({ status: 'already_redeemed' })
    expect(
      clientQuery.mock.calls.some(
        ([sql, values]) =>
          String(sql).includes('INSERT INTO patient_access_audit_events') &&
          Array.isArray(values) &&
          values.includes('redemption_rejected'),
      ),
    ).toBe(true)
    expect(
      clientQuery.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO patient_access_capabilities'),
      ),
    ).toBe(false)
    expect(clientQuery).toHaveBeenCalledWith('COMMIT')
  })

  it('requires an exact active lifecycle record for session authorization', async () => {
    const capability = record('session')
    poolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: CAPABILITY_ID,
          token_kind: 'session',
          token_version: 1,
          tenant_id: 'tenant-1',
          patient_id: PATIENT_ID,
          consult_id: CONSULT_ID,
          scopes: ['patient:historian:start'],
          issued_at_epoch: '2000000000',
          expires_at_epoch: '2000003600',
          revoked_at: null,
          parent_revoked_at: null,
        },
      ],
    })
    const repository = createPostgresPatientAccessRepository(pool())

    await expect(
      repository.findActiveCapability({
        jtiHash: capability.jtiHash,
        kind: 'session',
        version: 1,
        tenantId: 'tenant-1',
        patientId: PATIENT_ID,
        consultId: CONSULT_ID,
        scopes: ['patient:historian:start'],
        issuedAtEpochSeconds: 2_000_000_000,
        expiresAtEpochSeconds: 2_000_003_600,
        nowEpochSeconds: 2_000_000_100,
      }),
    ).resolves.toEqual({ status: 'active', capabilityId: CAPABILITY_ID })
  })

  it('invalidates a session when its parent invitation is revoked', async () => {
    const capability = record('session')
    poolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: CAPABILITY_ID,
          token_kind: 'session',
          token_version: 1,
          tenant_id: 'tenant-1',
          patient_id: PATIENT_ID,
          consult_id: CONSULT_ID,
          scopes: ['patient:historian:start'],
          issued_at_epoch: '2000000000',
          expires_at_epoch: '2000003600',
          revoked_at: null,
          parent_revoked_at: new Date().toISOString(),
        },
      ],
    })
    const repository = createPostgresPatientAccessRepository(pool())

    await expect(
      repository.findActiveCapability({
        jtiHash: capability.jtiHash,
        kind: 'session',
        version: 1,
        tenantId: 'tenant-1',
        patientId: PATIENT_ID,
        consultId: CONSULT_ID,
        scopes: ['patient:historian:start'],
        issuedAtEpochSeconds: 2_000_000_000,
        expiresAtEpochSeconds: 2_000_003_600,
        nowEpochSeconds: 2_000_000_100,
      }),
    ).resolves.toEqual({ status: 'revoked' })
  })
})
