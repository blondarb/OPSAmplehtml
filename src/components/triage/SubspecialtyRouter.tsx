'use client'

interface Props {
  subspecialty: string
  rationale: string
}

export default function SubspecialtyRouter({ subspecialty, rationale }: Props) {
  if (!subspecialty) return null

  return (
    <div style={{
      padding: '16px',
      background: 'rgba(13, 148, 136, 0.08)',
      borderRadius: '8px',
      border: '1px solid #0D9488',
    }}>
      <h3 style={{ color: '#14B8A6', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 8px' }}>
        Subspecialty Routing
      </h3>
      <p style={{ color: '#e2e8f0', fontSize: '0.85rem', lineHeight: 1.6, margin: 0 }}>
        <strong>Route to: {subspecialty}</strong>
        <span style={{ color: '#94a3b8' }}> — {rationale}</span>
      </p>
    </div>
  )
}
