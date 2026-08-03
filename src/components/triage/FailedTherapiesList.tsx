'use client'

import { FailedTherapy } from '@/lib/triage/types'

interface Props {
  therapies: FailedTherapy[]
}

export default function FailedTherapiesList({ therapies }: Props) {
  if (!therapies.length) return null

  return (
    <div className="nn-card" style={{ margin: 0 }}>
      <h3 className="nn-card-title" style={{ marginBottom: 10 }}>
        Failed / Previously Tried Therapies
      </h3>
      <ul className="nn-list">
        {therapies.map((t, i) => (
          <li key={i}>
            <strong>{t.therapy}</strong>
            {t.reason_stopped && (
              <span style={{ color: 'var(--nn-ink-3)' }}> — {t.reason_stopped}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
