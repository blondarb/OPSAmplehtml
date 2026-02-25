'use client'

import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  MessageCircle,
  Phone,
  ClipboardList,
  Pill,
  FileText,
  Activity,
  AlertCircle,
  Calendar,
  ChevronDown,
} from 'lucide-react'
import type { Confidence } from '@/lib/command-center/types'
import ActionItemCard from './ActionItemCard'

interface ActionBatchGroupProps {
  group: {
    batch_id: string
    action_type: string
    count: number
    all_high_confidence: boolean
    label: string
    action_ids: string[]
  }
  actions: Array<{
    id: string
    action_type: string
    confidence: Confidence
    patient_name: string
    title: string
    description: string
    drafted_content: string | null
  }>
  onBatchApprove: (actionIds: string[]) => void
  onApproveOne: (id: string) => void
  onDismissOne: (id: string) => void
}

const ACTION_ICONS: Record<string, LucideIcon> = {
  message: MessageCircle,
  call: Phone,
  order: ClipboardList,
  refill: Pill,
  pa_followup: FileText,
  scale_reminder: Activity,
  care_gap: AlertCircle,
  appointment: Calendar,
  pcp_summary: FileText,
}

export default function ActionBatchGroup({
  group,
  actions,
  onBatchApprove,
  onApproveOne,
  onDismissOne,
}: ActionBatchGroupProps) {
  const [itemsExpanded, setItemsExpanded] = useState(true)
  const [approveAllHovered, setApproveAllHovered] = useState(false)

  const IconComponent = ACTION_ICONS[group.action_type] || FileText

  return (
    <div
      style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '12px',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: itemsExpanded ? '12px' : 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <IconComponent size={18} color="#94a3b8" />
          <span
            style={{
              fontWeight: 600,
              fontSize: '0.95rem',
              color: '#e2e8f0',
            }}
          >
            {group.count} {group.label}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {group.all_high_confidence ? (
            <button
              onClick={() => onBatchApprove(group.action_ids)}
              onMouseEnter={() => setApproveAllHovered(true)}
              onMouseLeave={() => setApproveAllHovered(false)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: approveAllHovered ? '#16a34a' : '#22C55E',
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s ease',
                fontFamily: 'Inter, sans-serif',
                whiteSpace: 'nowrap',
              }}
            >
              Approve All {group.count}
            </button>
          ) : (
            <span
              style={{
                fontSize: '0.75rem',
                color: '#94a3b8',
                fontStyle: 'italic',
              }}
            >
              Mixed confidence &mdash; review individually
            </span>
          )}

          {/* Toggle items */}
          <button
            onClick={() => setItemsExpanded((prev) => !prev)}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              fontFamily: 'Inter, sans-serif',
              transition: 'color 0.15s ease',
            }}
          >
            {itemsExpanded ? 'Hide' : 'Show'} items
            <ChevronDown
              size={14}
              style={{
                transition: 'transform 0.2s ease',
                transform: itemsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
          </button>
        </div>
      </div>

      {/* Action item cards */}
      {itemsExpanded && (
        <div>
          {actions.map((action) => (
            <ActionItemCard
              key={action.id}
              action={action}
              onApprove={onApproveOne}
              onDismiss={onDismissOne}
            />
          ))}
        </div>
      )}
    </div>
  )
}
