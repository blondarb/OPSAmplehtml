import type { Pool, PoolClient } from 'pg'

import type {
  PatientAccessCapabilityRecord,
  PatientAccessLifecycleStatus,
  PatientAccessRepository,
} from './service'

type CapabilityRow = {
  id: string
  token_kind: string
  token_version: number
  tenant_id: string
  patient_id: string
  consult_id: string | null
  scopes: string[]
  issued_at_epoch: string | number
  expires_at_epoch: string | number
  revoked_at: string | null
  parent_revoked_at?: string | null
  redeemed_at?: string | null
}

function sameScopes(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function sameOptionalId(left: string | null | undefined, right: string | undefined) {
  return (left ?? null) === (right ?? null)
}

async function insertCapabilityRow(
  client: PoolClient,
  record: PatientAccessCapabilityRecord,
  parentCapabilityId: string | null,
): Promise<string> {
  const result = await client.query(
    `INSERT INTO patient_access_capabilities (
       jti_hash,
       parent_capability_id,
       token_kind,
       token_version,
       tenant_id,
       patient_id,
       consult_id,
       scopes,
       issued_by,
       issued_by_role,
       issued_at,
       starts_at,
       expires_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10,
       to_timestamp($11), to_timestamp($12), to_timestamp($13)
     )
     RETURNING id`,
    [
      record.jtiHash,
      parentCapabilityId,
      record.kind,
      record.version,
      record.tenantId,
      record.patientId,
      record.consultId ?? null,
      [...record.scopes],
      record.issuedBy,
      record.issuedByRole,
      record.issuedAtEpochSeconds,
      record.startsAtEpochSeconds,
      record.expiresAtEpochSeconds,
    ],
  )
  const id = result.rows[0]?.id as string | undefined
  if (!id) throw new Error('patient access capability insert failed')
  return id
}

async function insertAudit(
  client: PoolClient,
  input: {
    capabilityId: string | null
    sessionCapabilityId?: string | null
    jtiHash: Buffer
    tenantId: string
    eventType: 'issued' | 'redemption_succeeded' | 'redemption_rejected' | 'revoked'
    outcome: 'success' | 'denied'
    actorKind: 'clinician' | 'admin' | 'patient' | 'system'
    actorId?: string | null
    reasonCode: string
    correlationId: string
    occurredAtEpochSeconds: number
  },
) {
  await client.query(
    `INSERT INTO patient_access_audit_events (
       capability_id,
       session_capability_id,
       jti_hash,
       tenant_id,
       event_type,
       outcome,
       actor_kind,
       actor_id,
       reason_code,
       correlation_id,
       occurred_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, to_timestamp($11))`,
    [
      input.capabilityId,
      input.sessionCapabilityId ?? null,
      input.jtiHash,
      input.tenantId,
      input.eventType,
      input.outcome,
      input.actorKind,
      input.actorId ?? null,
      input.reasonCode,
      input.correlationId,
      input.occurredAtEpochSeconds,
    ],
  )
}

function exactClaimsMatch(
  row: CapabilityRow,
  expected: {
    kind: string
    version: number
    tenantId: string
    patientId: string
    consultId?: string
    scopes: readonly string[]
    issuedAtEpochSeconds: number
    expiresAtEpochSeconds: number
  },
): boolean {
  return (
    row.token_kind === expected.kind &&
    Number(row.token_version) === expected.version &&
    row.tenant_id === expected.tenantId &&
    row.patient_id === expected.patientId &&
    sameOptionalId(row.consult_id, expected.consultId) &&
    sameScopes(row.scopes, expected.scopes) &&
    Number(row.issued_at_epoch) === expected.issuedAtEpochSeconds &&
    Number(row.expires_at_epoch) === expected.expiresAtEpochSeconds
  )
}

export function createPostgresPatientAccessRepository(
  pool: Pool,
): PatientAccessRepository {
  return {
    async validateBinding(input) {
      if (!input.consultId) {
        const result = await pool.query(
          `SELECT p.id AS patient_id
             FROM patients p
            WHERE p.id = $1
              AND p.tenant_id = $2
            LIMIT 1`,
          [input.patientId, input.tenantId],
        )
        return result.rows[0] ? 'valid' : 'patient_not_found'
      }

      const result = await pool.query(
        `SELECT p.id AS patient_id,
                c.id AS consult_id,
                c.patient_id AS consult_patient_id
           FROM patients p
           LEFT JOIN neurology_consults c
             ON c.id = $3
            AND c.tenant_id = $2
          WHERE p.id = $1
            AND p.tenant_id = $2
          LIMIT 1`,
        [input.patientId, input.tenantId, input.consultId],
      )
      const row = result.rows[0] as
        | {
            patient_id: string
            consult_id: string | null
            consult_patient_id: string | null
          }
        | undefined
      if (!row) return 'patient_not_found'
      if (!row.consult_id) return 'consult_not_found'
      if (row.consult_patient_id !== input.patientId) {
        return 'consult_patient_mismatch'
      }
      return 'valid'
    },

    async insertCapability(record) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const capabilityId = await insertCapabilityRow(client, record, null)
        await insertAudit(client, {
          capabilityId,
          jtiHash: record.jtiHash,
          tenantId: record.tenantId,
          eventType: 'issued',
          outcome: 'success',
          actorKind:
            record.issuedByRole === 'system' ? 'system' : record.issuedByRole,
          actorId: record.issuedBy,
          reasonCode: `${record.kind}_issued`,
          correlationId: `issue:${capabilityId}`,
          occurredAtEpochSeconds: record.issuedAtEpochSeconds,
        })
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    async redeemInviteAndCreateSession(input) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const lookup = await client.query(
          `SELECT id,
                  token_kind,
                  token_version,
                  tenant_id,
                  patient_id,
                  consult_id,
                  scopes,
                  extract(epoch FROM issued_at)::bigint AS issued_at_epoch,
                  extract(epoch FROM expires_at)::bigint AS expires_at_epoch,
                  revoked_at,
                  redeemed_at
             FROM patient_access_capabilities
            WHERE jti_hash = $1
            FOR UPDATE`,
          [input.inviteJtiHash],
        )
        const row = lookup.rows[0] as CapabilityRow | undefined
        let rejectedStatus: Exclude<PatientAccessLifecycleStatus, 'active'> | null = null
        if (!row) {
          rejectedStatus = 'unknown'
        } else if (row.revoked_at) {
          rejectedStatus = 'revoked'
        } else if (row.redeemed_at) {
          rejectedStatus = 'already_redeemed'
        } else if (Number(row.expires_at_epoch) <= input.redeemedAtEpochSeconds) {
          rejectedStatus = 'expired'
        } else if (
          !exactClaimsMatch(row, {
            kind: 'invite',
            version: input.inviteClaims.ver,
            tenantId: input.inviteClaims.tenant_id,
            patientId: input.inviteClaims.patient_id,
            consultId: input.inviteClaims.consult_id,
            scopes: input.inviteClaims.scopes,
            issuedAtEpochSeconds: input.inviteClaims.iat,
            expiresAtEpochSeconds: input.inviteClaims.exp,
          })
        ) {
          rejectedStatus = 'binding_mismatch'
        }

        if (rejectedStatus) {
          await insertAudit(client, {
            capabilityId: row?.id ?? null,
            jtiHash: input.inviteJtiHash,
            tenantId: input.inviteClaims.tenant_id,
            eventType: 'redemption_rejected',
            outcome: 'denied',
            actorKind: 'patient',
            reasonCode: rejectedStatus,
            correlationId: input.correlationId,
            occurredAtEpochSeconds: input.redeemedAtEpochSeconds,
          })
          await client.query('COMMIT')
          return { status: rejectedStatus }
        }

        const consume = await client.query(
          `UPDATE patient_access_capabilities
              SET redeemed_at = to_timestamp($2),
                  redemption_count = redemption_count + 1,
                  updated_at = to_timestamp($2)
            WHERE id = $1
              AND redeemed_at IS NULL
              AND revoked_at IS NULL
              AND expires_at > to_timestamp($2)
          RETURNING id`,
          [row!.id, input.redeemedAtEpochSeconds],
        )
        if (consume.rowCount !== 1) {
          throw new Error('invite redemption lost its lifecycle lock')
        }
        const sessionCapabilityId = await insertCapabilityRow(
          client,
          input.sessionRecord,
          row!.id,
        )
        await insertAudit(client, {
          capabilityId: row!.id,
          sessionCapabilityId,
          jtiHash: input.inviteJtiHash,
          tenantId: input.inviteClaims.tenant_id,
          eventType: 'redemption_succeeded',
          outcome: 'success',
          actorKind: 'patient',
          reasonCode: 'invite_redeemed',
          correlationId: input.correlationId,
          occurredAtEpochSeconds: input.redeemedAtEpochSeconds,
        })
        await insertAudit(client, {
          capabilityId: sessionCapabilityId,
          jtiHash: input.sessionRecord.jtiHash,
          tenantId: input.sessionRecord.tenantId,
          eventType: 'issued',
          outcome: 'success',
          actorKind: 'system',
          reasonCode: 'session_issued',
          correlationId: input.correlationId,
          occurredAtEpochSeconds: input.redeemedAtEpochSeconds,
        })
        await client.query('COMMIT')
        return { status: 'redeemed', sessionCapabilityId }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    async findActiveCapability(input) {
      const result = await pool.query(
        `SELECT capability.id,
                capability.token_kind,
                capability.token_version,
                capability.tenant_id,
                capability.patient_id,
                capability.consult_id,
                capability.scopes,
                extract(epoch FROM capability.issued_at)::bigint AS issued_at_epoch,
                extract(epoch FROM capability.expires_at)::bigint AS expires_at_epoch,
                capability.revoked_at,
                parent_capability.revoked_at AS parent_revoked_at
           FROM patient_access_capabilities capability
           LEFT JOIN patient_access_capabilities parent_capability
             ON parent_capability.id = capability.parent_capability_id
          WHERE capability.jti_hash = $1
          LIMIT 1`,
        [input.jtiHash],
      )
      const row = result.rows[0] as CapabilityRow | undefined
      if (!row) return { status: 'unknown' }
      if (row.revoked_at || row.parent_revoked_at) return { status: 'revoked' }
      if (Number(row.expires_at_epoch) <= input.nowEpochSeconds) {
        return { status: 'expired' }
      }
      if (!exactClaimsMatch(row, input)) {
        return { status: 'binding_mismatch' }
      }
      return { status: 'active', capabilityId: row.id }
    },

    async revokeCapability(input) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const lookup = await client.query(
          `SELECT id, jti_hash, revoked_at
             FROM patient_access_capabilities
            WHERE id = $1
              AND tenant_id = $2
            FOR UPDATE`,
          [input.capabilityId, input.tenantId],
        )
        const row = lookup.rows[0] as
          | { id: string; jti_hash: Buffer; revoked_at: string | null }
          | undefined
        if (!row) {
          await client.query('ROLLBACK')
          return 'unknown'
        }
        if (row.revoked_at) {
          await client.query('ROLLBACK')
          return 'already_revoked'
        }
        const nowEpochSeconds = Math.floor(Date.now() / 1000)
        await client.query(
          `UPDATE patient_access_capabilities
              SET revoked_at = to_timestamp($3),
                  revoked_by = $4,
                  revocation_reason = $5,
                  updated_at = to_timestamp($3)
            WHERE id = $1
              AND tenant_id = $2`,
          [
            input.capabilityId,
            input.tenantId,
            nowEpochSeconds,
            input.revokedBy,
            input.reason,
          ],
        )
        await insertAudit(client, {
          capabilityId: input.capabilityId,
          jtiHash: row.jti_hash,
          tenantId: input.tenantId,
          eventType: 'revoked',
          outcome: 'success',
          actorKind: input.revokedByRole,
          actorId: input.revokedBy,
          reasonCode: 'clinician_revocation',
          correlationId: `revoke:${input.capabilityId}:${nowEpochSeconds}`,
          occurredAtEpochSeconds: nowEpochSeconds,
        })
        await client.query('COMMIT')
        return 'revoked'
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
  }
}
