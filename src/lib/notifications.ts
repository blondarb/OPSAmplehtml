/**
 * Notification Engine — Foundation
 *
 * Provides a server-side helper to INSERT notification rows into the
 * `notifications` table. This is the write counterpart to the existing
 * GET /api/notifications route.
 *
 * All functions are non-throwing: they log errors and return null/false
 * so callers can treat notification failures as non-fatal.
 */

import { from } from '@/lib/db-query'
import { getTenantServer } from '@/lib/tenant'

// ── Types ──────────────────────────────────────────────────────────────

export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low'

export type NotificationSourceType =
  | 'patient_message'
  | 'triage_result'
  | 'historian_red_flag'
  | 'followup_escalation'
  | 'wearable_alert'
  | 'incomplete_doc'
  | 'intake_received'
  | 'system'

export interface CreateNotificationParams {
  sourceType: NotificationSourceType
  title: string
  body: string
  priority?: NotificationPriority
  sourceId?: string | null
  patientId?: string | null
  recipientUserId?: string | null
  metadata?: Record<string, unknown>
}

export interface NotificationRecord {
  id: string
  tenant_id: string
  recipient_user_id: string | null
  source_type: string
  source_id: string | null
  patient_id: string | null
  priority: string
  title: string
  body: string
  status: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ── Create ─────────────────────────────────────────────────────────────

/**
 * Insert a single notification into the `notifications` table.
 * Returns the created record, or null on failure.
 */
export async function createNotification(
  params: CreateNotificationParams,
): Promise<NotificationRecord | null> {
  try {
    const tenant = getTenantServer()

    const { data, error } = await from('notifications')
      .insert({
        tenant_id: tenant,
        recipient_user_id: params.recipientUserId || null,
        source_type: params.sourceType,
        source_id: params.sourceId || null,
        patient_id: params.patientId || null,
        priority: params.priority || 'normal',
        title: params.title,
        body: params.body,
        metadata: params.metadata || {},
      })
      .select()
      .single()

    if (error) {
      console.error('[notifications] createNotification error:', error)
      return null
    }

    return data as NotificationRecord
  } catch (err) {
    console.error('[notifications] createNotification exception:', err)
    return null
  }
}

// ── Convenience helpers for common trigger points ──────────────────────

/**
 * Notify when a patient message is received.
 */
export async function notifyPatientMessage(
  messageId: string,
  patientName: string,
  subject: string,
  patientId?: string | null,
): Promise<NotificationRecord | null> {
  return createNotification({
    sourceType: 'patient_message',
    title: `New message from ${patientName}`,
    body: subject || 'No subject',
    priority: 'normal',
    sourceId: messageId,
    patientId: patientId || null,
  })
}

/**
 * Notify when triage completes with urgent or higher severity.
 */
export async function notifyTriageUrgent(
  sessionId: string,
  tier: string,
  tierDisplay: string,
  chiefComplaint: string,
  patientId?: string | null,
): Promise<NotificationRecord | null> {
  // Only notify for urgent, emergent tiers
  const urgentTiers = ['urgent', 'emergent', 'critical']
  if (!urgentTiers.includes(tier.toLowerCase())) {
    return null
  }

  return createNotification({
    sourceType: 'triage_result',
    title: `${tierDisplay} triage result`,
    body: chiefComplaint || 'Triage completed with urgent or higher severity',
    priority: tier.toLowerCase() === 'emergent' || tier.toLowerCase() === 'critical' ? 'critical' : 'high',
    sourceId: sessionId,
    patientId: patientId || null,
    metadata: { tier, tierDisplay },
  })
}

/**
 * Notify when the AI historian detects a red flag.
 */
export async function notifyHistorianRedFlag(
  sessionId: string,
  patientName: string,
  redFlags: Array<{ flag: string; severity: string; context: string }>,
  patientId?: string | null,
): Promise<NotificationRecord | null> {
  if (!redFlags || redFlags.length === 0) return null

  const criticalFlags = redFlags.filter(f => f.severity === 'high' || f.severity === 'critical')
  const flagSummary = redFlags.map(f => f.flag).join(', ')

  return createNotification({
    sourceType: 'historian_red_flag',
    title: `Red flag${redFlags.length > 1 ? 's' : ''} detected for ${patientName}`,
    body: flagSummary,
    priority: criticalFlags.length > 0 ? 'critical' : 'high',
    sourceId: sessionId,
    patientId: patientId || null,
    metadata: { redFlagCount: redFlags.length, flags: redFlags },
  })
}
