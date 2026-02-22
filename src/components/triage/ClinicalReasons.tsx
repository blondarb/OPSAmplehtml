'use client'

interface Props {
  reasons: string[]
}

export default function ClinicalReasons({ reasons }: Props) {
  if (!reasons.length) return null

  return (
    <div style={{
      padding: '16px',
      background: '#1e293b',
      borderRadius: '8px',
      border: '1px solid #334155',
    }}>
      <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 12px' }}>
        Top Clinical Reasons
      </h3>
      <ol style={{ margin: 0, paddingLeft: '20px' }}>
        {reasons.map((reason, i) => (
          <li key={i} style={{
            color: '#cbd5e1',
            fontSize: '0.85rem',
            lineHeight: 1.6,
            marginBottom: i < reasons.length - 1 ? '8px' : 0,
          }}>
            {reason}
          </li>
        ))}
      </ol>
    </div>
  )
}
