'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { PatientQueueItem } from '@/lib/command-center/types'
import UrgencyIndicator from './UrgencyIndicator'
import PendingItemBadges from './PendingItemBadges'
import SourceBadge from './SourceBadge'

interface PatientRowProps {
  patient: PatientQueueItem
  isExpanded: boolean
  onToggle: () => void
}

function formatLastContact(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return '1 day ago'
  return `${diffDays} days ago`
}

export default function PatientRow({
  patient,
  isExpanded,
  onToggle,
}: PatientRowProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label={`${patient.name}, ${patient.urgency} urgency`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        background: hovered ? '#334155' : '#1e293b',
        borderRadius: isExpanded ? '8px 8px 0 0' : '8px',
        marginBottom: isExpanded ? 0 : '4px',
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'background 0.15s ease',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Left urgency strip */}
      <UrgencyIndicator urgency={patient.urgency} />

      {/* Main content */}
      <div style={{ flex: 1, padding: '12px 16px', minWidth: 0 }}>
        {/* Row 1: Name + diagnosis */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: '0.9rem',
              color: '#e2e8f0',
              whiteSpace: 'nowrap',
            }}
          >
            {patient.name}, {patient.age}{patient.sex}
          </span>
          <span style={{ color: '#475569', fontSize: '0.85rem' }}>&middot;</span>
          <span
            style={{
              fontSize: '0.85rem',
              color: '#94a3b8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {patient.primary_diagnosis}
          </span>

          {/* Chevron */}
          <span
            style={{
              marginLeft: 'auto',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              transition: 'transform 0.2s ease',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          >
            <ChevronRight size={16} color="#64748b" />
          </span>
        </div>

        {/* Row 2: Pending items + micro summary */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginTop: '6px',
            flexWrap: 'wrap',
          }}
        >
          <PendingItemBadges items={patient.pending_items} />
          <span
            style={{
              fontSize: '0.85rem',
              color: '#64748b',
              fontStyle: 'italic',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              flex: 1,
            }}
          >
            &ldquo;{patient.ai_micro_summary}&rdquo;
          </span>
        </div>

        {/* Row 3: Source badges + last contact */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '6px',
          }}
        >
          {patient.sources.map((src) => (
            <SourceBadge key={src} source={src} />
          ))}
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '0.8rem',
              color: '#64748b',
              whiteSpace: 'nowrap',
            }}
          >
            Last: {formatLastContact(patient.last_contact.date)}
          </span>
        </div>
      </div>
    </div>
  )
}
