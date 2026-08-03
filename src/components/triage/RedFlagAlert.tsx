'use client'

interface Props {
  redFlags: string[]
}

export default function RedFlagAlert({ redFlags }: Props) {
  if (redFlags.length === 0) {
    return (
      <div
        style={{
          padding: '10px 14px',
          background: 'var(--nn-accent-wash)',
          border: '1px solid var(--nn-accent)',
          borderRadius: 'var(--nn-radius)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--nn-accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <span style={{ color: 'var(--nn-accent-ink)', fontSize: 'var(--nn-fs-sm)', fontWeight: 600 }}>
          No red flags identified
        </span>
      </div>
    )
  }

  return (
    <div className="nn-flag" style={{ margin: 0 }} role="note" aria-label="Red flags identified">
      <h4>Red flags identified</h4>
      <ul>
        {redFlags.map((flag, i) => (
          <li key={i}>{flag}</li>
        ))}
      </ul>
    </div>
  )
}
