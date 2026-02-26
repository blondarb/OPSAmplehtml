'use client'

import { useState } from 'react'

interface NotificationFeedProps {
  activeFilter: string
  onFilterChange: (filter: string) => void
  onAction: (notificationId: string, action: string) => void
  onNavigateToPatient: (patientId: string) => void
}

interface DemoNotification {
  id: string
  sourceType: string
  priority: 'critical' | 'high' | 'normal' | 'low'
  title: string
  body: string
  time: string
  patientName?: string
  aiDraft?: string
  clinicalSnippet?: string
  detailText?: string
  actionLabel: string
  secondaryAction?: string
  filterGroup: string
}

const DEMO_NOTIFICATIONS: DemoNotification[] = [
  { id: 'n1', sourceType: 'wearable_alert', priority: 'critical', title: 'Fall detected', body: '2 fall events in 4 hours. Last event 22 min ago.', time: '22 min ago', patientName: 'Linda Martinez', clinicalSnippet: 'BP: 142/88 · HR: 92 · Last fall: 4h ago', detailText: 'Wearable detected 2 fall events in 4 hours. First event at 5:48 AM (moderate impact), second at 9:32 AM (high impact). Patient heart rate elevated post-event at 92 bpm. Automated check-in prompt sent — no response after 5 minutes. Baseline tremor score has increased from 2.1 to 3.4 over the past 9 days.', actionLabel: 'View Details', filterGroup: 'urgent' },
  { id: 'n2', sourceType: 'wearable_alert', priority: 'critical', title: 'Seizure-like activity cluster', body: 'HR spike + accelerometer pattern at 6:14 AM and 7:02 AM.', time: '1 hr ago', patientName: 'James Wilson', clinicalSnippet: 'HR spike: 145 bpm · Duration: 2m 14s', detailText: 'Accelerometer pattern consistent with tonic-clonic activity detected at 6:14 AM and 7:02 AM. Heart rate peak 145 bpm during first event, 138 bpm during second. Events lasted 2m14s and 1m48s respectively. SpO2 dipped to 91% briefly during first event.', actionLabel: 'View Details', filterGroup: 'urgent' },
  { id: 'n3', sourceType: 'patient_message', priority: 'high', title: 'Question about medication side effects', body: '"I\'ve been experiencing dizziness since starting the new dosage. Should I..."', time: '45 min ago', patientName: 'Maria Garcia', clinicalSnippet: 'Re: Topiramate 100mg dosage change', aiDraft: 'Thank you for reaching out about the dizziness. This can be a common side effect when adjusting Topiramate dosage...', actionLabel: 'Review & Send', filterGroup: 'messages' },
  { id: 'n4', sourceType: 'patient_message', priority: 'normal', title: 'Appointment rescheduling request', body: '"I need to reschedule my appointment next Thursday. Is Friday available?"', time: '2 hrs ago', patientName: 'Frank Russo', aiDraft: 'We\'d be happy to help reschedule your appointment. I\'ve checked our availability for Friday...', actionLabel: 'Review & Send', filterGroup: 'messages' },
  { id: 'n5', sourceType: 'consult_request', priority: 'high', title: 'EEG Review Request', body: 'Abnormal EEG findings - requesting your interpretation of temporal lobe activity.', time: '1 hr ago', patientName: 'Helen Park', clinicalSnippet: 'Left temporal sharp waves · Abnormal', actionLabel: 'Respond', filterGroup: 'urgent' },
  { id: 'n6', sourceType: 'incomplete_doc', priority: 'normal', title: 'Unsigned note (2 days overdue)', body: 'Visit on Feb 22 - Assessment and Plan sections missing.', time: '2 days', patientName: 'Robert Chen', clinicalSnippet: 'Missing: Assessment, Plan sections', detailText: 'Visit on Feb 22 with Robert Chen. Chief complaint: Headache evaluation. HPI and ROS completed. Physical exam documented. Assessment and Plan sections are empty. Note has been unsigned for 2 days.', actionLabel: 'Complete Now', filterGroup: 'tasks' },
  { id: 'n7', sourceType: 'incomplete_doc', priority: 'normal', title: 'Unsigned note', body: 'Follow-up visit on Feb 21 - awaiting signature.', time: '3 days', patientName: 'Helen Park', actionLabel: 'Complete Now', filterGroup: 'tasks' },
  { id: 'n8', sourceType: 'lab_result', priority: 'normal', title: 'MRI Brain results ready', body: 'Completed Feb 23 - impression pending physician review.', time: '3 hrs ago', patientName: 'Sarah Kim', clinicalSnippet: 'MRI Brain · Completed Feb 23', detailText: 'MRI Brain without contrast completed Feb 23 at Regional Medical Center. Impression pending physician review. Prior MRI (Nov 2025) showed no significant abnormalities.', actionLabel: 'Review', filterGroup: 'tasks' },
  { id: 'n9', sourceType: 'refill_request', priority: 'normal', title: 'Topiramate 50mg refill request', body: 'Pharmacy-forwarded. 90-day supply. Last filled Dec 2025.', time: '4 hrs ago', patientName: 'James Wilson', clinicalSnippet: 'Topiramate 50mg · 90-day · Last: Dec 2025', actionLabel: 'Approve', secondaryAction: 'Deny', filterGroup: 'tasks' },
  { id: 'n10', sourceType: 'patient_message', priority: 'normal', title: 'Thank you note', body: '"Thank you for explaining the treatment plan so clearly. I feel much better..."', time: '5 hrs ago', patientName: 'David Thompson', actionLabel: 'Review & Send', filterGroup: 'messages' },
  { id: 'n11', sourceType: 'care_gap', priority: 'normal', title: 'PHQ-9 reassessment overdue', body: 'Last completed Sep 2025 (3 months overdue). Score was 12 (moderate).', time: 'Overdue', patientName: 'Maria Garcia', clinicalSnippet: 'PHQ-9 · Last: Sep 2025 (score: 12) · 90d overdue', actionLabel: 'Address', filterGroup: 'tasks' },
  { id: 'n12', sourceType: 'incomplete_doc', priority: 'low', title: 'Follow-up not scheduled', body: 'Treatment plan recommended 3-month follow-up but no appointment exists.', time: '5 days', patientName: 'Frank Russo', clinicalSnippet: '3-month follow-up recommended · None scheduled', actionLabel: 'Schedule', filterGroup: 'tasks' },
]

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'messages', label: 'Messages' },
  { key: 'tasks', label: 'Tasks' },
]

function getAccentColor(sourceType: string) {
  switch (sourceType) {
    case 'wearable_alert': return '#EF4444'
    case 'patient_message': return '#3B82F6'
    case 'consult_request': return '#8B5CF6'
    case 'incomplete_doc': return '#F59E0B'
    case 'lab_result': return '#10B981'
    case 'refill_request': return '#F59E0B'
    case 'care_gap': return '#0D9488'
    default: return '#9CA3AF'
  }
}

function getSourceIcon(sourceType: string) {
  const color = getAccentColor(sourceType)
  const props = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2 }
  switch (sourceType) {
    case 'wearable_alert': return <svg {...props}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    case 'patient_message': return <svg {...props}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    case 'consult_request': return <svg {...props}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
    case 'incomplete_doc': return <svg {...props}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    case 'lab_result': return <svg {...props}><path d="M9 2h6l3 7H6z"/><path d="M6 9l-3 11a1 1 0 001 1h16a1 1 0 001-1L18 9"/></svg>
    case 'refill_request': return <svg {...props}><circle cx="12" cy="12" r="10"/><path d="M16 12H8m4-4v8"/></svg>
    case 'care_gap': return <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    default: return <svg {...props}><circle cx="12" cy="12" r="10"/></svg>
  }
}

export default function NotificationFeed({ activeFilter, onFilterChange, onAction, onNavigateToPatient }: NotificationFeedProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null)
  const [expandedDetail, setExpandedDetail] = useState<string | null>(null)
  const [hoveredTab, setHoveredTab] = useState<string | null>(null)

  const filtered = activeFilter === 'all'
    ? DEMO_NOTIFICATIONS
    : DEMO_NOTIFICATIONS.filter(n => n.filterGroup === activeFilter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-white)', height: '100%' }}>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '4px', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        {FILTER_TABS.map(tab => {
          const isActive = activeFilter === tab.key
          const count = tab.key === 'all' ? DEMO_NOTIFICATIONS.length : DEMO_NOTIFICATIONS.filter(n => n.filterGroup === tab.key).length
          return (
            <button
              key={tab.key}
              onClick={() => onFilterChange(tab.key)}
              onMouseEnter={() => setHoveredTab(tab.key)}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, border: 'none',
                background: isActive ? '#0D9488' : hoveredTab === tab.key ? 'var(--bg-gray)' : 'transparent',
                color: isActive ? 'white' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              {tab.label}
              <span style={{
                fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '10px',
                background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg-gray)',
                color: isActive ? 'white' : 'var(--text-muted)',
              }}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Notification list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {filtered.map(notif => {
          const accent = getAccentColor(notif.sourceType)
          return (
            <div
              key={notif.id}
              onMouseEnter={() => setHoveredId(notif.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: 'flex', gap: '10px', padding: '12px',
                borderRadius: '10px', marginBottom: '6px',
                background: hoveredId === notif.id ? 'var(--bg-gray)' : 'transparent',
                borderLeft: `3px solid ${accent}`,
                transition: 'background 0.15s',
              }}
            >
              {/* Icon */}
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: `${accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {getSourceIcon(notif.sourceType)}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{notif.title}</span>
                  {notif.priority === 'critical' && (
                    <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: '#FEE2E2', color: '#DC2626', textTransform: 'uppercase' }}>Critical</span>
                  )}
                </div>
                {notif.patientName && (
                  <button
                    onClick={() => onNavigateToPatient(notif.id)}
                    style={{ fontSize: '11px', fontWeight: 600, color: '#0D9488', background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginBottom: '2px' }}
                  >
                    {notif.patientName}
                  </button>
                )}
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>{notif.body}</p>

                {/* Clinical snippet */}
                {notif.clinicalSnippet && (
                  <div style={{
                    marginTop: '4px', padding: '4px 8px',
                    borderRadius: '4px', background: 'var(--bg-gray)',
                    fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                    {notif.clinicalSnippet}
                  </div>
                )}

                {/* AI Draft preview for patient messages */}
                {notif.aiDraft && (
                  <div style={{ marginTop: '6px' }}>
                    <button
                      onClick={() => setExpandedDraft(expandedDraft === notif.id ? null : notif.id)}
                      style={{ fontSize: '11px', fontWeight: 600, color: '#0D9488', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                      </svg>
                      AI Draft {expandedDraft === notif.id ? '▴' : '▾'}
                    </button>
                    {expandedDraft === notif.id && (
                      <div style={{
                        marginTop: '4px', padding: '8px 10px', borderRadius: '6px',
                        background: '#F0FDFA', border: '1px solid #99F6E4',
                        fontSize: '12px', color: '#115E59', lineHeight: 1.5,
                      }}>
                        {notif.aiDraft}
                      </div>
                    )}
                  </div>
                )}

                {/* Expandable detail section */}
                {notif.detailText && (
                  <div style={{ marginTop: '6px' }}>
                    <button
                      onClick={() => setExpandedDetail(expandedDetail === notif.id ? null : notif.id)}
                      style={{
                        fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      {expandedDetail === notif.id ? 'Less detail \u25B4' : 'More detail \u25BE'}
                    </button>
                    {expandedDetail === notif.id && (
                      <div style={{
                        marginTop: '4px', padding: '8px 10px', borderRadius: '6px',
                        background: '#F8FAFC', border: '1px solid var(--border)',
                        fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.5,
                      }}>
                        {notif.detailText}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <button
                    onClick={() => onAction(notif.id, 'primary')}
                    style={{
                      fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '6px',
                      background: accent, color: 'white', border: 'none', cursor: 'pointer',
                      transition: 'opacity 0.2s',
                    }}
                  >
                    {notif.actionLabel}
                  </button>
                  {notif.secondaryAction && (
                    <button
                      onClick={() => onAction(notif.id, 'secondary')}
                      style={{
                        fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '6px',
                        background: 'transparent', color: accent, border: `1px solid ${accent}`,
                        cursor: 'pointer', transition: 'all 0.2s',
                      }}
                    >
                      {notif.secondaryAction}
                    </button>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>{notif.time}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
