'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  X,
  Building2,
  Home,
  Send,
  Phone,
  Video,
  FileText,
  AlertTriangle,
  ClipboardList,
  MessageSquare,
  Clock,
  UserCheck,
  Stethoscope,
  RefreshCw,
  PhoneCall,
  MonitorCheck,
  Inbox,
  FileSearch,
} from 'lucide-react'
import type {
  PatientScheduleItem,
  MATask,
  FlowStage,
  TaskType,
  TaskPriority,
} from '@/lib/dashboard/types'

// ── Props ────────────────────────────────────────────────────────────────────

interface PatientDetailPanelProps {
  patient: PatientScheduleItem
  tasks: MATask[]
  onClose: () => void
}

// ── Demo provider lookup (matches demo data) ────────────────────────────────

const PROVIDER_NAMES: Record<string, string> = {
  'prov-chen': 'Dr. Chen',
  'prov-patel': 'Dr. Patel',
  'prov-rivera': 'Dr. Rivera',
}

// ── Flow stages for the step indicator ──────────────────────────────────────

const FLOW_STAGES_ORDER: FlowStage[] = [
  'checked_in',
  'vitals_done',
  'ready_for_video',
  'in_visit',
  'post_visit',
  'completed',
]

const FLOW_STAGE_LABELS: Record<FlowStage, string> = {
  not_arrived: 'Not Arrived',
  checked_in: 'Checked In',
  vitals_done: 'Vitals',
  ready_for_video: 'Ready',
  in_visit: 'In Visit',
  post_visit: 'Post-Visit',
  completed: 'Complete',
  no_show: 'No Show',
  cancelled: 'Cancelled',
}

// ── Non-linear statuses shown as label instead of in the flow ───────────────

const NON_LINEAR_STAGES: FlowStage[] = ['not_arrived', 'no_show', 'cancelled']

// ── Task type icons ─────────────────────────────────────────────────────────

function taskTypeIcon(type: TaskType): React.ReactNode {
  const size = 14
  const color = '#64748B'
  switch (type) {
    case 'send_historian_link': return <Send size={size} color={color} />
    case 'coordinate_local_ma': return <UserCheck size={size} color={color} />
    case 'tech_help': return <MonitorCheck size={size} color={color} />
    case 'prep_records': return <FileSearch size={size} color={color} />
    case 'process_refill': return <RefreshCw size={size} color={color} />
    case 'route_message': return <Inbox size={size} color={color} />
    case 'post_visit_task': return <ClipboardList size={size} color={color} />
    case 'send_intake_form': return <FileText size={size} color={color} />
    case 'call_patient': return <PhoneCall size={size} color={color} />
    case 'check_video': return <Video size={size} color={color} />
    default: return <Clock size={size} color={color} />
  }
}

// ── Priority badge ──────────────────────────────────────────────────────────

function priorityBadge(priority: TaskPriority): React.ReactNode {
  const styles: Record<TaskPriority, { bg: string; text: string; label: string }> = {
    urgent: { bg: '#FEE2E2', text: '#DC2626', label: 'Urgent' },
    time_sensitive: { bg: '#FEF3C7', text: '#D97706', label: 'Time-Sensitive' },
    routine: { bg: '#F1F5F9', text: '#64748B', label: 'Routine' },
  }
  const s = styles[priority]
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: s.bg,
        color: s.text,
        borderRadius: 9999,
        padding: '2px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  )
}

// ── Readiness badge ─────────────────────────────────────────────────────────

interface BadgeDef {
  bg: string
  text: string
  label: string
}

function readinessBadge(def: BadgeDef): React.ReactNode {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: def.bg,
        color: def.text,
        borderRadius: 9999,
        padding: '2px 10px',
        whiteSpace: 'nowrap',
      }}
    >
      {def.label}
    </span>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function PatientDetailPanel({
  patient,
  tasks,
  onClose,
}: PatientDetailPanelProps) {
  // Quick-action toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Auto-dismiss toast after 2 seconds
  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(() => setToastMessage(null), 2000)
    return () => clearTimeout(timer)
  }, [toastMessage])

  const handleQuickAction = useCallback((label: string) => {
    setToastMessage(`${label} sent`)
  }, [])

  // ── Determine flow stage index ─────────────────────────────────────────

  const currentStageIndex = FLOW_STAGES_ORDER.indexOf(patient.flow_stage)
  const isNonLinear = NON_LINEAR_STAGES.includes(patient.flow_stage)

  // ── Readiness data ─────────────────────────────────────────────────────

  const { ai_readiness } = patient

  const historianBadge: Record<typeof ai_readiness.historian_status, BadgeDef> = {
    not_sent: { bg: '#F1F5F9', text: '#64748B', label: 'Not Sent' },
    sent: { bg: '#FEF3C7', text: '#D97706', label: 'Sent \u2014 Awaiting' },
    completed: { bg: '#DCFCE7', text: '#16A34A', label: 'Completed' },
    imported: { bg: '#CCFBF1', text: '#0D9488', label: 'Imported to Note' },
  }

  const sdneBadge: Record<typeof ai_readiness.sdne_status, BadgeDef> = {
    not_applicable: { bg: '#F1F5F9', text: '#64748B', label: 'N/A' },
    pending: { bg: '#FEF3C7', text: '#D97706', label: 'Pending' },
    completed: { bg: '#DCFCE7', text: '#16A34A', label: 'Completed' },
  }

  const chartPrepBadge: Record<typeof ai_readiness.chart_prep_status, BadgeDef> = {
    not_started: { bg: '#F1F5F9', text: '#64748B', label: 'Not Started' },
    in_progress: { bg: '#FEF3C7', text: '#D97706', label: 'In Progress' },
    ready: { bg: '#DCFCE7', text: '#16A34A', label: 'Ready' },
  }

  // ── Provider name ──────────────────────────────────────────────────────

  const providerName = PROVIDER_NAMES[patient.provider_id] ?? patient.provider_id

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
        padding: 16,
        width: '100%',
        position: 'relative',
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        aria-label="Close detail panel"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 4,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={18} color="#94A3B8" />
      </button>

      {/* ── Section 1: Header ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          paddingRight: 28, // room for close button
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>
              {patient.name}
            </span>
            <span style={{ fontSize: 14, color: '#64748B' }}>
              {patient.age}{patient.sex}
            </span>
          </div>
          <div style={{ fontSize: 13, fontStyle: 'italic', color: '#475569', marginTop: 2 }}>
            {patient.chief_complaint}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
            {providerName}
          </div>
          <div style={{ fontSize: 13, color: '#64748B' }}>
            {patient.appointment_time}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #E2E8F0', margin: '12px 0' }} />

      {/* ── Section 2: Location row ──────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          fontSize: 13,
          color: '#475569',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {patient.location === 'clinic' ? (
            <>
              <Building2 size={14} color="#64748B" />
              <span>Clinic</span>
            </>
          ) : (
            <>
              <Home size={14} color="#64748B" />
              <span>Home Visit</span>
            </>
          )}
        </span>

        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: patient.video_link_active ? '#22C55E' : '#94A3B8',
            }}
          />
          <span>
            {patient.video_link_active ? 'Video Active' : 'Video Not Connected'}
          </span>
        </span>

        {patient.location === 'home' && !patient.video_link_active && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: '#D97706',
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            <AlertTriangle size={13} color="#D97706" />
            Video not connected
          </span>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #E2E8F0', margin: '12px 0' }} />

      {/* ── Section 3: AI Readiness Checklist ────────────────────────── */}
      <div style={{ marginBottom: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#94A3B8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 8,
          }}
        >
          AI Readiness
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Historian */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: '#334155' }}>AI Historian</span>
            {readinessBadge(historianBadge[ai_readiness.historian_status])}
          </div>
          {/* SDNE */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: '#334155' }}>Digital Neuro Exam (SDNE)</span>
            {readinessBadge(sdneBadge[ai_readiness.sdne_status])}
          </div>
          {/* Chart Prep */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: '#334155' }}>Chart Prep</span>
            {readinessBadge(chartPrepBadge[ai_readiness.chart_prep_status])}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #E2E8F0', margin: '12px 0' }} />

      {/* ── Section 4: Flow Status ───────────────────────────────────── */}
      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#94A3B8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 8,
          }}
        >
          Flow Status
        </div>

        {/* Non-linear status label */}
        {isNonLinear && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: patient.flow_stage === 'no_show' ? '#DC2626' : '#64748B',
              marginBottom: 6,
            }}
          >
            {FLOW_STAGE_LABELS[patient.flow_stage]}
          </div>
        )}

        {/* Step indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 0,
          }}
        >
          {FLOW_STAGES_ORDER.map((stage, idx) => {
            const isPast = !isNonLinear && currentStageIndex > idx
            const isCurrent = !isNonLinear && currentStageIndex === idx
            const isFuture = isNonLinear || currentStageIndex < idx

            let dotColor = '#CBD5E1' // hollow gray
            let dotBorder = '2px solid #CBD5E1'
            let dotBg = '#FFFFFF'
            if (isPast) {
              dotColor = '#22C55E'
              dotBorder = 'none'
              dotBg = '#22C55E'
            } else if (isCurrent) {
              dotColor = '#0D9488'
              dotBorder = 'none'
              dotBg = '#0D9488'
            }

            return (
              <React.Fragment key={stage}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: dotBg,
                      border: (isPast || isCurrent) ? 'none' : dotBorder,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      color: isCurrent ? '#0D9488' : isPast ? '#22C55E' : '#94A3B8',
                      fontWeight: isCurrent ? 700 : 500,
                      marginTop: 4,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {FLOW_STAGE_LABELS[stage]}
                  </span>
                </div>
                {idx < FLOW_STAGES_ORDER.length - 1 && (
                  <div
                    style={{
                      height: 2,
                      flex: 0.5,
                      backgroundColor: isPast ? '#22C55E' : '#E2E8F0',
                      marginTop: -14,
                    }}
                  />
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #E2E8F0', margin: '12px 0' }} />

      {/* ── Section 5: Tasks ─────────────────────────────────────────── */}
      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#94A3B8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 8,
          }}
        >
          Tasks
        </div>
        {tasks.length === 0 ? (
          <div style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic' }}>
            No pending tasks
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tasks.map((task) => (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: '#334155',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  {taskTypeIcon(task.type)}
                </span>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {task.description}
                </span>
                {priorityBadge(task.priority)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #E2E8F0', margin: '12px 0' }} />

      {/* ── Section 6: Quick Actions ─────────────────────────────────── */}
      <div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            position: 'relative',
          }}
        >
          <QuickActionButton
            icon={<Send size={14} />}
            label="Send Historian Link"
            onClick={() => handleQuickAction('Historian link')}
          />
          <QuickActionButton
            icon={<Phone size={14} />}
            label="Call Patient"
            onClick={() => handleQuickAction('Call')}
          />
          <QuickActionButton
            icon={<Video size={14} />}
            label="Check Video"
            onClick={() => handleQuickAction('Video check')}
          />
          <QuickActionButton
            icon={<FileText size={14} />}
            label="Open Chart"
            onClick={() => handleQuickAction('Chart opened')}
          />
        </div>

        {/* Inline toast */}
        {toastMessage && (
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              fontWeight: 600,
              color: '#16A34A',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {toastMessage} &#x2713;
          </div>
        )}
      </div>
    </div>
  )
}

// ── Quick action button sub-component ───────────────────────────────────────

function QuickActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        fontWeight: 500,
        color: '#0D9488',
        backgroundColor: hovered ? '#F0FDFA' : '#FFFFFF',
        border: '1px solid #0D9488',
        borderRadius: 8,
        padding: '6px 12px',
        cursor: 'pointer',
        transition: 'background-color 150ms ease',
      }}
    >
      {icon}
      {label}
    </button>
  )
}
