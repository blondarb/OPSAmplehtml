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
  | 'visit_signed'
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

/**
 * Notify when a visit is signed and completed.
 */
export async function notifyVisitSigned(
  visitId: string,
  patientName: string,
  providerName: string,
  patientId?: string | null,
): Promise<NotificationRecord | null> {
  return createNotification({
    sourceType: 'visit_signed',
    title: `Visit signed for ${patientName}`,
    body: `${providerName} signed the clinical note`,
    priority: 'low',
    sourceId: visitId,
    patientId: patientId || null,
    metadata: { providerName },
  })
}

/**
 * Create notifications for incomplete/unsigned notes.
 * Non-throwing — logs errors and returns results.
 */
export async function notifyIncompleteNotes(
  incompleteDocs: Array<{
    patient_name: string
    patient_id: string | null
    visit_id: string | null
    note_id: string | null
    description: string
  }>,
): Promise<NotificationRecord[]> {
  const results: NotificationRecord[] = []

  for (const doc of incompleteDocs) {
    try {
      const record = await createNotification({
        sourceType: 'incomplete_doc',
        title: `Unsigned note: ${doc.patient_name}`,
        body: doc.description,
        priority: 'normal',
        sourceId: doc.note_id || doc.visit_id || null,
        patientId: doc.patient_id || null,
        metadata: {
          visit_id: doc.visit_id,
          note_id: doc.note_id,
        },
      })
      if (record) results.push(record)
    } catch (err) {
      console.error('[notifications] notifyIncompleteNotes item error:', err)
    }
  }

  return results
}

/**
 * Notify when the follow-up agent detects an escalation during a conversation.
 */
export async function notifyFollowUpEscalation(
  sessionId: string,
  patientName: string,
  escalationType: string,
  severity: string,
  category: string,
  patientId?: string | null,
): Promise<NotificationRecord | null> {
  const isCritical = severity === 'urgent' || severity === 'same_day'

  return createNotification({
    sourceType: 'followup_escalation',
    title: `Follow-up escalation: ${patientName}`,
    body: `${category} — ${severity}. Review the follow-up conversation.`,
    priority: isCritical ? 'critical' : 'high',
    sourceId: sessionId,
    patientId: patientId || null,
    metadata: {
      escalationType,
      severity,
      category,
      conversationLink: `/follow-up?session=${sessionId}`,
    },
  })
}

/**
 * Notify when a wearable alert is detected.
 */
export async function notifyWearableAlert(
  alertId: string,
  patientName: string,
  alertType: string,
  severity: string,
  patientId?: string | null,
  metadata?: Record<string, unknown>,
): Promise<NotificationRecord | null> {
  const isCritical = severity === 'critical' || severity === 'high'

  return createNotification({
    sourceType: 'wearable_alert',
    title: `Wearable alert: ${patientName}`,
    body: `${alertType} — ${severity}`,
    priority: isCritical ? 'critical' : 'high',
    sourceId: alertId,
    patientId: patientId || null,
    metadata: { alertType, severity, ...metadata },
  })
}
