'use client'

import { FailedTherapy } from '@/lib/triage/types'

interface Props {
  therapies: FailedTherapy[]
}

export default function FailedTherapiesList({ therapies }: Props) {
  if (!therapies.length) return null

  return (
    <div style={{
      padding: '16px',
      background: '#1e293b',
      borderRadius: '8px',
      border: '1px solid #334155',
    }}>
      <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 12px' }}>
        Failed / Previously Tried Therapies
      </h3>
      <ul style={{ margin: 0, paddingLeft: '20px' }}>
        {therapies.map((t, i) => (
          <li key={i} style={{
            color: '#cbd5e1',
            fontSize: '0.85rem',
            lineHeight: 1.6,
            marginBottom: i < therapies.length - 1 ? '6px' : 0,
          }}>
            <strong style={{ color: '#f1f5f9' }}>{t.therapy}</strong>
            {t.reason_stopped && (
              <span style={{ color: '#94a3b8' }}> — {t.reason_stopped}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
