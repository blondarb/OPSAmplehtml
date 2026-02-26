'use client'

import React, { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Send,
  Users,
  Wrench,
  FileText,
  Pill,
  MessageSquare,
  ClipboardList,
  FormInput,
  Phone,
  Video,
  Check,
} from 'lucide-react'
import type { MATask, TaskType, TaskPriority } from '@/lib/dashboard/types'

// ── Props ─────────────────────────────────────────────────────────────────────

interface MATaskCardProps {
  task: MATask
  providerName: string
  patientName: string
}

// ── Icon mapping ──────────────────────────────────────────────────────────────

const TASK_TYPE_ICONS: Record<TaskType, LucideIcon> = {
  send_historian_link: Send,
  coordinate_local_ma: Users,
  tech_help: Wrench,
  prep_records: FileText,
  process_refill: Pill,
  route_message: MessageSquare,
  post_visit_task: ClipboardList,
  send_intake_form: FormInput,
  call_patient: Phone,
  check_video: Video,
}

// ── Priority badge styling ────────────────────────────────────────────────────

interface PriorityBadgeStyle {
  bg: string
  text: string
  label: string
}

const PRIORITY_STYLES: Record<TaskPriority, PriorityBadgeStyle> = {
  urgent:         { bg: '#FEE2E2', text: '#DC2626', label: 'Urgent' },
  time_sensitive: { bg: '#FEF3C7', text: '#D97706', label: 'Time-Sensitive' },
  routine:        { bg: '#F1F5F9', text: '#475569', label: 'Routine' },
}

// ── Due-time formatter ────────────────────────────────────────────────────────

function formatDueTime(iso: string): string {
  const d = new Date(iso)
  return `Due by ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MATaskCard({ task, providerName, patientName }: MATaskCardProps) {
  const [completed, setCompleted] = useState(task.status === 'completed')

  const Icon = TASK_TYPE_ICONS[task.type]
  const priority = PRIORITY_STYLES[task.priority]
  const alreadyDone = task.status === 'completed'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 12,
        border: '1px solid #E2E8F0',
        opacity: completed ? 0.7 : 1,
        transition: 'opacity 0.15s ease',
      }}
    >
      {/* Type icon */}
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        <Icon size={18} color="#475569" />
      </div>

      {/* Middle: description + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: '#1E293B',
            lineHeight: '18px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}
        >
          {task.description}
        </div>
        <div
          style={{
            fontSize: 11,
            color: '#64748B',
            marginTop: 3,
            lineHeight: '14px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {patientName} &bull; {providerName}
        </div>
      </div>

      {/* Right: priority badge + due time + complete button */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          flexShrink: 0,
          gap: 4,
        }}
      >
        {/* Priority badge */}
        <span
          style={{
            display: 'inline-block',
            fontSize: 11,
            fontWeight: 600,
            lineHeight: '16px',
            padding: '1px 7px',
            borderRadius: 9999,
            backgroundColor: priority.bg,
            color: priority.text,
            whiteSpace: 'nowrap',
          }}
        >
          {priority.label}
        </span>

        {/* Due time */}
        {task.due_by && (
          <span style={{ fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap' }}>
            {formatDueTime(task.due_by)}
          </span>
        )}

        {/* Complete button / Done indicator */}
        {alreadyDone ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 11,
              fontWeight: 600,
              color: '#22C55E',
            }}
          >
            Done <Check size={12} color="#22C55E" />
          </span>
        ) : completed ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 11,
              fontWeight: 600,
              color: '#22C55E',
            }}
          >
            <Check size={12} color="#22C55E" />
          </span>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setCompleted(true)
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 11,
              fontWeight: 600,
              lineHeight: '16px',
              padding: '2px 8px',
              borderRadius: 9999,
              backgroundColor: '#F0FDFA',
              color: '#0D9488',
              border: '1px solid #99F6E4',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background-color 0.1s ease',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = '#CCFBF1'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = '#F0FDFA'
            }}
          >
            Complete &#10003;
          </button>
        )}
      </div>
    </div>
  )
}
