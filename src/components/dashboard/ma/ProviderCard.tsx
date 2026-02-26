'use client'

import React, { useState } from 'react'
import type { Provider, ProviderStatus } from '@/lib/dashboard/types'

interface ProviderCardProps {
  provider: Provider
  isSelected: boolean
  onClick: () => void
}

const STATUS_COLORS: Record<ProviderStatus, string> = {
  available: '#22C55E',
  in_visit: '#EF4444',
  break: '#F59E0B',
  offline: '#94A3B8',
}

function formatContextLine(provider: Provider): string {
  switch (provider.status) {
    case 'in_visit':
      return 'Currently in visit'
    case 'available':
      if (provider.next_patient_time) {
        try {
          const d = new Date(provider.next_patient_time)
          return `Next: ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
        } catch {
          return 'Available'
        }
      }
      return 'Available'
    case 'break':
      return 'On break'
    case 'offline':
      return 'Offline'
    default:
      return ''
  }
}

export default function ProviderCard({ provider, isSelected, onClick }: ProviderCardProps) {
  const [hovered, setHovered] = useState(false)

  const behindMin = provider.stats.running_behind_minutes

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minWidth: 200,
        flex: 1,
        padding: 16,
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        borderLeft: isSelected ? '3px solid #0D9488' : '1px solid #e2e8f0',
        background: isSelected
          ? '#f0fdfa'
          : hovered
            ? '#f1f5f9'
            : '#ffffff',
        cursor: 'pointer',
        transition: 'background 0.2s, border-left 0.2s',
        userSelect: 'none',
      }}
    >
      {/* Row 1: Name + status dot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: STATUS_COLORS[provider.status],
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: '#1e293b',
            lineHeight: '20px',
          }}
        >
          {provider.name}, {provider.credentials}
        </span>
      </div>

      {/* Row 2: Context line */}
      <div
        style={{
          fontSize: 13,
          color: '#64748b',
          marginTop: 4,
          lineHeight: '18px',
        }}
      >
        {formatContextLine(provider)}
      </div>

      {/* Row 3: Stats + behind badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 6,
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: '#64748b',
            lineHeight: '16px',
          }}
        >
          {provider.stats.seen_today} seen / {provider.stats.remaining_today} remaining
        </span>

        {behindMin > 0 && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#DC2626',
              backgroundColor: '#FEE2E2',
              padding: '1px 6px',
              borderRadius: 9999,
              lineHeight: '16px',
              whiteSpace: 'nowrap',
            }}
          >
            +{behindMin} min
          </span>
        )}
      </div>
    </div>
  )
}
