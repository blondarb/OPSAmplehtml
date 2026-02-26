'use client'

import { useEffect, useState } from 'react'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import type {
  DashboardUpdate,
  EscalationFlag,
  FollowUpModule,
  EscalationTier,
  MedicationStatus,
  CaregiverInfo,
} from '@/lib/follow-up/types'

interface ClinicianDashboardProps {
  dashboard: DashboardUpdate | null
  escalationAlert: EscalationFlag | null
  sessionId: string | null
  liveSessionId?: string | null
}

const MODULE_LABELS: Record<FollowUpModule, string> = {
  greeting: 'Greeting',
  medication: 'Medication Check',
  side_effects: 'Side Effects Assessment',
  symptoms: 'Symptom Review',
  functional: 'Functional Status',
  questions: 'Patient Questions',
  wrapup: 'Wrap-Up',
}

const TIER_COLORS: Record<EscalationTier, string> = {
  urgent: '#DC2626',
  same_day: '#EA580C',
  next_visit: '#EAB308',
  informational: '#16A34A',
}

const TIER_LABELS: Record<EscalationTier, string> = {
  urgent: 'URGENT',
  same_day: 'SAME-DAY',
  next_visit: 'NEXT VISIT',
  informational: 'INFO',
}

function StatusIcon({ filled, taking }: { filled: boolean | null; taking: boolean | null }) {
  const renderIcon = (value: boolean | null) => {
    if (value === true) {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )
    }
    if (value === false) {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )
    }
    return <span style={{ color: '#64748b', fontSize: '16px', lineHeight: 1 }}>&mdash;</span>
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ color: '#64748b', fontSize: '11px' }}>Filled:</span>
        {renderIcon(filled)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ color: '#64748b', fontSize: '11px' }}>Taking:</span>
        {renderIcon(taking)}
      </div>
    </div>
  )
}

export default function ClinicianDashboard({
  dashboard,
  escalationAlert,
  sessionId,
  liveSessionId,
}: ClinicianDashboardProps) {
  const [liveDashboard, setLiveDashboard] = useState<DashboardUpdate | null>(null)

  // Subscribe to Supabase Realtime when a live session is active
  useEffect(() => {
    if (!liveSessionId) {
      setLiveDashboard(null)
      return
    }

    const supabase = createBrowserClient()
    const channel = supabase
      .channel(`followup-live-${liveSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'followup_sessions',
          filter: `id=eq.${liveSessionId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          // Map DB row to DashboardUpdate
          const update: DashboardUpdate = {
            status: (row.status as DashboardUpdate['status']) || 'in_progress',
            currentModule: (row.current_module as FollowUpModule) || 'greeting',
            flags: [],
            medicationStatus: (row.medication_status as MedicationStatus[]) || [],
            functionalStatus: (row.functional_status as string) || null,
            functionalDetails: (row.functional_details as string) || null,
            patientQuestions: (row.patient_questions as string[]) || [],
            caregiverInfo: (row.caregiver_info as CaregiverInfo) || { isCaregiver: false, name: null, relationship: null },
          }
          setLiveDashboard(update)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [liveSessionId])

  const activeDashboard = liveDashboard ?? dashboard

  if (!activeDashboard) {
    return (
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '40px 24px',
        textAlign: 'center',
      }}>
        <div style={{ color: '#64748b', fontSize: '14px', lineHeight: '1.6' }}>
          Start a conversation to see live dashboard updates.
        </div>
      </div>
    )
  }

  const statusColor = activeDashboard.status === 'in_progress' ? '#22C55E' : '#64748b'

  const functionalColor = activeDashboard.functionalStatus === 'better'
    ? '#22C55E'
    : activeDashboard.functionalStatus === 'worse'
      ? '#EF4444'
      : activeDashboard.functionalStatus === 'about the same'
        ? '#EAB308'
        : '#64748b'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Section 1: Conversation Status */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '16px',
      }}>
        <div style={{
          color: '#64748b',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '10px',
        }}>
          Conversation Status
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '8px',
            background: `${statusColor}1A`,
            color: statusColor,
            fontSize: '12px',
            fontWeight: 600,
          }}>
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: statusColor,
              display: 'inline-block',
            }} />
            {activeDashboard.status.replace('_', ' ').toUpperCase()}
          </span>
          <span style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>
            {MODULE_LABELS[activeDashboard.currentModule]}
          </span>
        </div>
      </div>

      {/* Section 2: Medication Status */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '16px',
      }}>
        <div style={{
          color: '#64748b',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '10px',
        }}>
          Medication Status
        </div>
        {activeDashboard.medicationStatus.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '13px' }}>Pending</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {activeDashboard.medicationStatus.map((med, i) => (
              <div key={i} style={{
                background: '#334155',
                borderRadius: '8px',
                padding: '10px 12px',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: med.sideEffects.length > 0 ? '8px' : 0,
                }}>
                  <span style={{ color: 'white', fontSize: '13px', fontWeight: 500 }}>
                    {med.medication}
                  </span>
                  <StatusIcon filled={med.filled} taking={med.taking} />
                </div>
                {med.sideEffects.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {med.sideEffects.map((se, j) => (
                      <span key={j} style={{
                        fontSize: '11px',
                        color: '#F87171',
                        background: 'rgba(239, 68, 68, 0.12)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}>
                        {se}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3: Functional Status */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '16px',
      }}>
        <div style={{
          color: '#64748b',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '10px',
        }}>
          Functional Status
        </div>
        {activeDashboard.functionalStatus ? (
          <div>
            <span style={{
              display: 'inline-block',
              padding: '4px 10px',
              borderRadius: '8px',
              background: `${functionalColor}1A`,
              color: functionalColor,
              fontSize: '13px',
              fontWeight: 600,
            }}>
              {activeDashboard.functionalStatus.charAt(0).toUpperCase() + activeDashboard.functionalStatus.slice(1)}
            </span>
            {activeDashboard.functionalDetails && (
              <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '8px', lineHeight: '1.5' }}>
                {activeDashboard.functionalDetails}
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: '#64748b', fontSize: '13px' }}>Pending</div>
        )}
      </div>

      {/* Section 4: Patient Questions */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '16px',
      }}>
        <div style={{
          color: '#64748b',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '10px',
        }}>
          Patient Questions
        </div>
        {activeDashboard.patientQuestions.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '13px' }}>None</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {activeDashboard.patientQuestions.map((q, i) => (
              <div key={i} style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
              }}>
                <span style={{
                  color: '#64748b',
                  fontSize: '12px',
                  fontWeight: 600,
                  minWidth: '20px',
                }}>
                  {i + 1}.
                </span>
                <span style={{ color: '#e2e8f0', fontSize: '13px', lineHeight: '1.5' }}>
                  {q}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 5: Escalation Flags */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '16px',
      }}>
        <div style={{
          color: '#64748b',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '10px',
        }}>
          Escalation Flags
        </div>
        {activeDashboard.flags.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '13px' }}>&mdash;</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {activeDashboard.flags.map((flag, i) => {
              const tierColor = TIER_COLORS[flag.tier]
              return (
                <div key={i} style={{
                  background: '#334155',
                  borderRadius: '8px',
                  padding: '12px',
                  borderLeft: `3px solid ${tierColor}`,
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                  }}>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: 'white',
                      background: tierColor,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                    }}>
                      {TIER_LABELS[flag.tier]}
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                      {flag.category}
                    </span>
                  </div>
                  <div style={{ color: '#e2e8f0', fontSize: '13px', marginBottom: '6px', lineHeight: '1.5' }}>
                    &ldquo;{flag.triggerText}&rdquo;
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '12px', lineHeight: '1.5' }}>
                    <strong style={{ color: '#94a3b8' }}>Action:</strong> {flag.recommendedAction}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Section 6: Caregiver Info */}
      {activeDashboard.caregiverInfo.isCaregiver && (
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '16px',
        }}>
          <div style={{
            color: '#64748b',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '10px',
          }}>
            Caregiver Info
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            borderRadius: '8px',
            background: 'rgba(59, 130, 246, 0.12)',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            <span style={{ color: '#60A5FA', fontSize: '13px', fontWeight: 500 }}>
              {activeDashboard.caregiverInfo.name || 'Unknown'}
              {activeDashboard.caregiverInfo.relationship && (
                <span style={{ color: '#94a3b8', fontWeight: 400 }}>
                  {' '}({activeDashboard.caregiverInfo.relationship})
                </span>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
