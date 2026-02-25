'use client'

import { useState } from 'react'

interface StatusTileProps {
  label: string
  total: number
  sublabel: string
  color: string
  trend?: 'up' | 'down' | 'flat'
  onClick?: () => void
}

export default function StatusTile({ label, total, sublabel, color, trend, onClick }: StatusTileProps) {
  const [hovered, setHovered] = useState(false)

  const trendArrow = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : trend === 'flat' ? '\u2192' : null
  const trendColor = trend === 'up' ? '#EF4444' : trend === 'down' ? '#22C55E' : '#64748b'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#334155' : '#1e293b',
        borderRadius: '12px',
        padding: '16px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.2s',
        position: 'relative',
        minWidth: 0,
      }}
    >
      {/* Label row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#94a3b8',
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {label}
        </span>
      </div>

      {/* Number row with trend */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: '2rem',
            fontWeight: 700,
            color: color,
            lineHeight: 1.1,
          }}
        >
          {total}
        </span>
        {trendArrow && (
          <span
            style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: trendColor,
            }}
          >
            {trendArrow}
          </span>
        )}
      </div>

      {/* Sublabel */}
      <div
        style={{
          fontSize: '0.8rem',
          color: '#64748b',
          marginTop: '4px',
          lineHeight: 1.3,
        }}
      >
        {sublabel}
      </div>
    </div>
  )
}
