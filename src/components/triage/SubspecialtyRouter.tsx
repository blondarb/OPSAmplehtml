'use client'

interface Props {
  subspecialty: string
  rationale: string
  redirectToNonNeuro?: boolean
  redirectSpecialty?: string | null
  redirectRationale?: string | null
}

export default function SubspecialtyRouter({
  subspecialty,
  rationale,
  redirectToNonNeuro,
  redirectSpecialty,
  redirectRationale,
}: Props) {
  if (!subspecialty && !redirectToNonNeuro) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Non-neuro redirect alert */}
      {redirectToNonNeuro && redirectSpecialty && (
        <div className="nn-note" style={{ margin: 0 }}>
          <h3>Consider redirect to non-neurology specialty</h3>
          <p style={{ margin: 0 }}>
            <strong>Suggested: {redirectSpecialty}</strong>
            {redirectRationale && <span> — {redirectRationale}</span>}
          </p>
        </div>
      )}

      {/* Neurology subspecialty routing */}
      {subspecialty && (
        <div className="nn-card" style={{ margin: 0 }}>
          <h3 className="nn-card-title">
            {redirectToNonNeuro ? 'If neurology evaluation is also needed' : 'Routing'}
          </h3>
          <dl className="nn-kv" style={{ marginTop: 10 }}>
            <dt>Subspecialist</dt>
            <dd><strong>{subspecialty}</strong></dd>
            <dt>Rationale</dt>
            <dd>{rationale}</dd>
          </dl>
        </div>
      )}
    </div>
  )
}
