'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { EmergencyActionView } from '@/lib/triage/emergencyActionRead'
import {
  emergencyContactStatuses,
  type EmergencyContactOutcome,
} from '@/lib/triage/emergencyActionClient'

function requestId(prefix: string): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}:${suffix}`
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString()
}

export default function EmergencyActionPanel({
  sessionId,
}: {
  sessionId: string
}) {
  const [actions, setActions] = useState<EmergencyActionView[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [channel, setChannel] = useState('patient_phone')
  const [outcomeCode, setOutcomeCode] =
    useState<EmergencyContactOutcome>('instructions_delivered')
  const [instruction, setInstruction] = useState(
    'Proceed for immediate emergency evaluation now.',
  )
  const [outcomeSummary, setOutcomeSummary] = useState('')
  const [dispositionCode, setDispositionCode] = useState(
    'emergency_evaluation_handoff_confirmed',
  )
  const [dispositionEvidence, setDispositionEvidence] = useState('')
  const [recipientOrAgency, setRecipientOrAgency] = useState('')
  const [destination, setDestination] = useState('')
  const requestKeys = useRef(new Map<string, string>())

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/triage/${encodeURIComponent(sessionId)}/emergency-actions`,
        { cache: 'no-store' },
      )
      const body = (await response.json().catch(() => ({}))) as {
        actions?: EmergencyActionView[]
        error?: string
      }
      if (!response.ok || !Array.isArray(body.actions)) {
        throw new Error(body.error || 'Emergency action record unavailable')
      }
      setActions(body.actions)
      setError('')
    } catch {
      setActions(null)
      setError(
        'The durable emergency action could not be loaded. Maintain the manual emergency hold and escalate to the triage team.',
      )
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load])

  async function command(
    actionId: string,
    operation: 'claim' | 'contact' | 'close',
    body?: Record<string, unknown>,
  ) {
    const fingerprint = `${actionId}:${operation}:${JSON.stringify(body ?? {})}`
    const idempotencyKey =
      requestKeys.current.get(fingerprint) ?? requestId(operation)
    requestKeys.current.set(fingerprint, idempotencyKey)
    setBusy(true)
    setError('')
    try {
      const response = await fetch(
        `/api/triage/${encodeURIComponent(sessionId)}/emergency-actions/${encodeURIComponent(actionId)}/${operation}`,
        {
          method: 'POST',
          headers: {
            'Idempotency-Key': idempotencyKey,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      )
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
        reason?: string
      }
      if (!response.ok) {
        throw new Error(
          result.reason
            ? `${result.error || 'Action was not applied'} (${result.reason.replace(/_/g, ' ')})`
            : result.error || 'Action was not applied',
        )
      }
      requestKeys.current.delete(fingerprint)
      await load()
    } catch (commandError) {
      setError(
        commandError instanceof Error
          ? commandError.message
          : 'Emergency action was not applied. The safety hold remains active.',
      )
    } finally {
      setBusy(false)
    }
  }

  const active = actions?.find((action) => action.status !== 'closed') ?? null
  const latest = active ?? actions?.[0] ?? null

  return (
    <section
      aria-label="Emergency action workflow"
      style={{
        marginBottom: '16px',
        padding: '16px',
        borderRadius: '8px',
        border: '2px solid #dc2626',
        background: 'rgba(127, 29, 29, 0.2)',
      }}
    >
      <h3 style={{ margin: 0, color: '#fee2e2', fontSize: '0.95rem' }}>
        Closed-loop emergency action
      </h3>
      <p style={{ color: '#fecaca', fontSize: '0.78rem', lineHeight: 1.5 }}>
        Acknowledging an alert does not close this action. Record ownership,
        contact evidence, and a confirmed disposition. Outpatient scheduling
        remains locked.
      </p>

      {error && (
        <div role="alert" style={{ color: '#fef2f2', fontSize: '0.78rem' }}>
          {error}
        </div>
      )}

      {actions === null && !error && (
        <div style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>
          Loading the durable action record…
        </div>
      )}

      {actions?.length === 0 && (
        <div role="alert" style={{ color: '#fef2f2', fontSize: '0.78rem' }}>
          No durable emergency action was found. Maintain the manual hold and
          escalate to the triage team immediately.
        </div>
      )}

      {latest && (
        <>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              color: '#e2e8f0',
              fontSize: '0.75rem',
            }}
          >
            <span>Action: {latest.id}</span>
            <span>Status: {latest.status.replace(/_/g, ' ')}</span>
            <span>Owner: {latest.ownerUserId || 'unclaimed'}</span>
            <span>Due: {formatTime(latest.dueAt)}</span>
          </div>

          {latest.status === 'closed' ? (
            <div style={{ marginTop: '12px', color: '#86efac', fontSize: '0.78rem' }}>
              Emergency action closed with disposition evidence
              {latest.closureCode ? ` (${latest.closureCode.replace(/_/g, ' ')})` : ''}.
              The triage workflow remains locked until final clinician review.
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={busy || Boolean(latest.ownerUserId)}
                onClick={() => void command(latest.id, 'claim')}
                style={{ marginTop: '12px', padding: '8px 12px' }}
              >
                {latest.ownerUserId ? 'Action claimed' : 'Claim emergency action'}
              </button>

              <details style={{ marginTop: '14px', color: '#e2e8f0' }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.8rem' }}>
                  Record contact attempt
                </summary>
                <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                  <select value={channel} onChange={(event) => setChannel(event.target.value)}>
                    <option value="patient_phone">Patient phone</option>
                    <option value="caregiver_phone">Caregiver phone</option>
                    <option value="referring_provider">Referring provider</option>
                    <option value="emergency_services">Emergency services</option>
                    <option value="patient_portal">Patient portal</option>
                    <option value="in_person">In person</option>
                    <option value="sms">SMS</option>
                    <option value="other">Other</option>
                  </select>
                  <select
                    value={outcomeCode}
                    onChange={(event) =>
                      setOutcomeCode(
                        event.target.value as EmergencyContactOutcome,
                      )
                    }
                  >
                    <option value="instructions_delivered">Instructions delivered</option>
                    <option value="handoff_initiated">Handoff initiated</option>
                    <option value="emergency_services_activated">Emergency services activated</option>
                    <option value="provider_contacted">Provider contacted</option>
                    <option value="patient_declined">Patient declined</option>
                    <option value="no_answer">No answer</option>
                    <option value="message_left">Message left</option>
                    <option value="contact_failed">Contact failed</option>
                  </select>
                  <textarea
                    aria-label="Instruction given"
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    placeholder="Exact instruction given"
                  />
                  <textarea
                    aria-label="Contact outcome summary"
                    value={outcomeSummary}
                    onChange={(event) => setOutcomeSummary(event.target.value)}
                    placeholder="What happened and who confirmed it"
                  />
                  <button
                    type="button"
                    disabled={busy || !latest.ownerUserId}
                    onClick={() => {
                      const statuses = emergencyContactStatuses(outcomeCode)
                      void command(latest.id, 'contact', {
                        channel:
                          outcomeCode === 'emergency_services_activated'
                            ? 'emergency_services'
                            : channel,
                        instruction_given: instruction,
                        ...statuses,
                        outcome_code: outcomeCode,
                        outcome_summary: outcomeSummary,
                      })
                    }}
                  >
                    Save contact evidence
                  </button>
                </div>
              </details>

              <details style={{ marginTop: '14px', color: '#e2e8f0' }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.8rem' }}>
                  Close after confirmed disposition
                </summary>
                <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                  <select
                    value={dispositionCode}
                    onChange={(event) => setDispositionCode(event.target.value)}
                  >
                    <option value="emergency_evaluation_handoff_confirmed">Emergency evaluation handoff confirmed</option>
                    <option value="emergency_services_handoff_confirmed">Emergency services handoff confirmed</option>
                    <option value="referring_clinician_handoff_confirmed">Referring clinician handoff confirmed</option>
                    <option value="patient_declined_with_escalation_plan">Patient declined with escalation plan</option>
                    <option value="unable_to_contact_emergency_services_notified">Unable to contact; emergency services notified</option>
                  </select>
                  <textarea
                    aria-label="Disposition evidence"
                    value={dispositionEvidence}
                    onChange={(event) => setDispositionEvidence(event.target.value)}
                    placeholder="Evidence supporting the disposition"
                  />
                  <input
                    aria-label="Recipient or agency"
                    value={recipientOrAgency}
                    onChange={(event) => setRecipientOrAgency(event.target.value)}
                    placeholder="Recipient or agency"
                  />
                  <input
                    aria-label="Destination"
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    placeholder="Destination"
                  />
                  <button
                    type="button"
                    disabled={busy || !latest.ownerUserId}
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Close this emergency action only if the documented disposition and handoff are confirmed. Continue?',
                        )
                      ) {
                        return
                      }
                      void command(latest.id, 'close', {
                        disposition_code: dispositionCode,
                        disposition_evidence: dispositionEvidence,
                        recipient_or_agency: recipientOrAgency,
                        destination,
                      })
                    }}
                  >
                    Close with disposition evidence
                  </button>
                </div>
              </details>
            </>
          )}
        </>
      )}
    </section>
  )
}
