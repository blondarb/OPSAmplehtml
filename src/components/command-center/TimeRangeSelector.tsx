'use client'

interface TimeRangeSelectorProps {
  value: 'today' | 'yesterday' | 'last_7_days'
  onChange: (range: 'today' | 'yesterday' | 'last_7_days') => void
}

function getDisplayDate(range: 'today' | 'yesterday' | 'last_7_days'): string {
  const now = new Date()
  if (range === 'yesterday') {
    now.setDate(now.getDate() - 1)
  }
  if (range === 'last_7_days') {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 6)
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`
  }
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
        {getDisplayDate(value)}
      </span>
      <select
        value={value}
        onChange={(e) =>
          onChange(e.target.value as 'today' | 'yesterday' | 'last_7_days')
        }
        style={{
          background: '#1e293b',
          color: '#e2e8f0',
          border: '1px solid #334155',
          borderRadius: '6px',
          fontSize: '0.85rem',
          padding: '4px 8px',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="last_7_days">Last 7 Days</option>
      </select>
    </div>
  )
}
