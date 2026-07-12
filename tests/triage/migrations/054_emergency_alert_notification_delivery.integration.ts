import { Pool } from 'pg'

import { createPostgresEmergencyAlertNotificationDelivery } from '../../../src/lib/triage/emergencyAlertNotificationDelivery'

const ACTION_ID = '54000000-0000-4000-8000-000000000199'
const PUBLISHER_LEASE = '54000000-0000-4000-8000-000000000299'
const DELIVERY_LEASE = '54000000-0000-4000-8000-000000000399'

async function main() {
  const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE || 'postgres',
    user: process.env.PGUSER || process.env.USER,
  })
  try {
    await pool.query(
      `INSERT INTO triage_emergency_actions (
         id, triage_session_id, status, owner_team, due_at,
         next_escalation_at, idempotency_key
       ) VALUES (
         $1,
         '54000000-0000-4000-8000-000000000001',
         'open', 'clinical-triage', now(), now(), 'delivery-integration-action'
       )`,
      [ACTION_ID],
    )
    await pool.query(
      `UPDATE triage_emergency_action_alerts
          SET status = 'leased',
              attempt_count = 1,
              next_attempt_at = NULL,
              lease_token = $2,
              lease_owner = 'integration-publisher',
              claimed_at = clock_timestamp(),
              lease_expires_at = clock_timestamp() + interval '5 minutes'
        WHERE emergency_action_id = $1`,
      [ACTION_ID, PUBLISHER_LEASE],
    )
    await pool.query(
      `UPDATE triage_emergency_action_alerts
          SET status = 'sent',
              outcome_lease_token = lease_token,
              lease_token = NULL,
              lease_owner = NULL,
              claimed_at = NULL,
              lease_expires_at = NULL,
              sent_at = clock_timestamp()
        WHERE emergency_action_id = $1`,
      [ACTION_ID],
    )

    const alert = await pool.query(
      `SELECT id, severity, escalation_level
         FROM triage_emergency_action_alerts
        WHERE emergency_action_id = $1`,
      [ACTION_ID],
    )
    const alertId = String(alert.rows[0]?.id)
    const delivery = createPostgresEmergencyAlertNotificationDelivery(pool, {
      now: () => new Date(),
      randomUUID: () => DELIVERY_LEASE,
    })
    const claimed = await delivery.claimCriticalUiDelivery({
      alertId,
      actionId: ACTION_ID,
      severity: 'emergency',
      level: 0,
      workerId: 'integration-critical-ui-worker',
      leaseDurationMs: 60_000,
    })
    if (claimed.kind !== 'claimed') {
      throw new Error(`Expected a delivery claim; got ${claimed.kind}.`)
    }

    const first = await delivery.deliverCriticalUiNotification(claimed.claim)
    const replay = await delivery.deliverCriticalUiNotification(claimed.claim)
    if (first.status !== 'delivered' || replay.status !== 'delivered') {
      throw new Error('Critical UI delivery did not remain idempotently delivered.')
    }

    const evidence = await pool.query(
      `SELECT count(*)::integer AS notification_count,
              min(notification.priority) AS priority,
              min(delivery.status) AS delivery_status,
              min(action.status) AS action_status
         FROM triage_emergency_alert_notification_deliveries delivery
         JOIN notifications notification
           ON notification.id::text = delivery.notification_id
         JOIN triage_emergency_actions action
           ON action.id = delivery.emergency_action_id
        WHERE delivery.emergency_alert_id = $1
          AND notification.source_id = $1::text`,
      [alertId],
    )
    const row = evidence.rows[0]
    if (
      row?.notification_count !== 1 ||
      row?.priority !== 'critical' ||
      row?.delivery_status !== 'delivered' ||
      row?.action_status !== 'open'
    ) {
      throw new Error('Critical UI delivery evidence is incomplete.')
    }
    process.stdout.write(
      'PASS: migration 054 TypeScript service inserts one critical UI notification\n',
    )
  } finally {
    await pool.end()
  }
}

main().catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : 'unknown failure'
  process.stderr.write(`FAIL: migration 054 service integration: ${message}\n`)
  process.exitCode = 1
})
