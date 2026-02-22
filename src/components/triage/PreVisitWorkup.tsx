'use client'

interface Props {
  workup: string[]
}

export default function PreVisitWorkup({ workup }: Props) {
  if (!workup.length) return null

  return (
    <div style={{
      padding: '16px',
      background: '#1e293b',
      borderRadius: '8px',
      border: '1px solid #334155',
    }}>
      <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 4px' }}>
        Suggested Pre-Visit Workup
      </h3>
      <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: '0 0 12px', fontStyle: 'italic' }}>
        Recommended workup to communicate to referring provider for ordering prior to neurology visit.
      </p>
      <ul style={{ margin: 0, paddingLeft: '20px' }}>
        {workup.map((item, i) => (
          <li key={i} style={{
            color: '#cbd5e1',
            fontSize: '0.85rem',
            lineHeight: 1.6,
            marginBottom: i < workup.length - 1 ? '6px' : 0,
          }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
