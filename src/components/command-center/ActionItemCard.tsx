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
  Check,
  X,
} from 'lucide-react'
import type { Confidence } from '@/lib/command-center/types'
import ConfidenceBadge from './ConfidenceBadge'
import DraftedContentPreview from './DraftedContentPreview'

interface ActionItemCardProps {
  action: {
    id: string
    action_type: string
    confidence: Confidence
    patient_name: string
    title: string
    description: string
    drafted_content: string | null
  }
  onApprove: (id: string) => void
  onDismiss: (id: string) => void
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

export default function ActionItemCard({
  action,
  onApprove,
  onDismiss,
}: ActionItemCardProps) {
  const [draftExpanded, setDraftExpanded] = useState(false)
  const [hoveredBtn, setHoveredBtn] = useState<'approve' | 'dismiss' | null>(null)

  const IconComponent = ACTION_ICONS[action.action_type] || FileText

  return (
    <div
      style={{
        background: '#1e293b',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '8px',
        fontFamily: 'Inter, sans-serif',
        display: 'flex',
        gap: '12px',
      }}
    >
      {/* Left icon */}
      <div style={{ flexShrink: 0, paddingTop: '2px' }}>
        <IconComponent size={16} color="#94a3b8" />
      </div>

      {/* Center content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top line: patient name + title + confidence badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: '0.9rem',
              color: '#e2e8f0',
            }}
          >
            {action.patient_name}
          </span>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            &mdash; {action.title}
          </span>
          <ConfidenceBadge confidence={action.confidence} />
        </div>

        {/* Description */}
        <p
          style={{
            margin: '6px 0 0',
            fontSize: '0.85rem',
            color: '#64748b',
            lineHeight: 1.5,
          }}
        >
          {action.description}
        </p>

        {/* Draft preview */}
        {action.drafted_content && (
          <DraftedContentPreview
            content={action.drafted_content}
            isExpanded={draftExpanded}
            onToggle={() => setDraftExpanded((prev) => !prev)}
          />
        )}
      </div>

      {/* Right side buttons */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          flexShrink: 0,
          alignItems: 'flex-end',
        }}
      >
        {/* Approve button */}
        <button
          onClick={() => onApprove(action.id)}
          onMouseEnter={() => setHoveredBtn('approve')}
          onMouseLeave={() => setHoveredBtn(null)}
          aria-label={`Approve action for ${action.patient_name}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 12px',
            borderRadius: '6px',
            border: '1px solid #22C55E',
            background: hoveredBtn === 'approve' ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
            color: '#22C55E',
            fontSize: '0.8rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.15s ease',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <Check size={14} />
          Approve
        </button>

        {/* Dismiss button */}
        <button
          onClick={() => onDismiss(action.id)}
          onMouseEnter={() => setHoveredBtn('dismiss')}
          onMouseLeave={() => setHoveredBtn(null)}
          aria-label={`Dismiss action for ${action.patient_name}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 12px',
            borderRadius: '6px',
            border: '1px solid #64748b',
            background: hoveredBtn === 'dismiss' ? 'rgba(100, 116, 139, 0.15)' : 'transparent',
            color: '#64748b',
            fontSize: '0.8rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.15s ease',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <X size={14} />
          Dismiss
        </button>
      </div>
    </div>
  )
}
