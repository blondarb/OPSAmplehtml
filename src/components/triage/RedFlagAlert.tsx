'use client'

interface Props {
  redFlags: string[]
}

export default function RedFlagAlert({ redFlags }: Props) {
  if (redFlags.length === 0) {
    return (
      <div style={{
        padding: '12px 16px',
        background: 'rgba(22, 163, 74, 0.1)',
        border: '1px solid #16A34A',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <span style={{ color: '#16A34A', fontSize: '0.85rem', fontWeight: 500 }}>
          No red flags identified
        </span>
      </div>
    )
  }

  return (
    <div style={{
      padding: '16px',
      background: 'rgba(220, 38, 38, 0.08)',
      border: '2px solid #DC2626',
      borderRadius: '8px',
    }}>
      <h3 style={{
        color: '#DC2626',
        fontSize: '0.9rem',
        fontWeight: 600,
        margin: '0 0 10px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        Red Flags Identified
      </h3>
      <ul style={{ margin: 0, paddingLeft: '20px' }}>
        {redFlags.map((flag, i) => (
          <li key={i} style={{
            color: '#fca5a5',
            fontSize: '0.85rem',
            lineHeight: 1.6,
            marginBottom: i < redFlags.length - 1 ? '6px' : 0,
          }}>
            {flag}
          </li>
        ))}
      </ul>
    </div>
  )
}
