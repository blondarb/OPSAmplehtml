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
        <div style={{
          padding: '16px',
          background: 'rgba(245, 158, 11, 0.08)',
          borderRadius: '8px',
          border: '1px solid #F59E0B',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 15l-6-6-6 6" />
            </svg>
            <h3 style={{ color: '#F59E0B', fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>
              Consider Redirect to Non-Neurology Specialty
            </h3>
          </div>
          <p style={{ color: '#e2e8f0', fontSize: '0.85rem', lineHeight: 1.6, margin: 0 }}>
            <strong>Suggested: {redirectSpecialty}</strong>
            {redirectRationale && (
              <span style={{ color: '#94a3b8' }}> — {redirectRationale}</span>
            )}
          </p>
        </div>
      )}

      {/* Neurology subspecialty routing */}
      {subspecialty && (
        <div style={{
          padding: '16px',
          background: 'rgba(13, 148, 136, 0.08)',
          borderRadius: '8px',
          border: '1px solid #0D9488',
        }}>
          <h3 style={{ color: '#14B8A6', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 8px' }}>
            {redirectToNonNeuro ? 'If Neurology Evaluation Also Needed' : 'Subspecialty Routing'}
          </h3>
          <p style={{ color: '#e2e8f0', fontSize: '0.85rem', lineHeight: 1.6, margin: 0 }}>
            <strong>Route to: {subspecialty}</strong>
            <span style={{ color: '#94a3b8' }}> — {rationale}</span>
          </p>
        </div>
      )}
    </div>
  )
}
