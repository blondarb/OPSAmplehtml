'use client'

interface HistorianSessionCompleteProps {
  duration: number
  questionCount: number
  onStartAnother: () => void
  onBackToPortal: () => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default function HistorianSessionComplete({
  duration,
  questionCount,
  onStartAnother,
  onBackToPortal,
}: HistorianSessionCompleteProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '32px 24px',
      textAlign: 'center',
    }}>
      {/* Success checkmark */}
      <div style={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: 'rgba(34, 197, 94, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '24px',
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <h2 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, margin: '0 0 8px' }}>
        Interview Complete
      </h2>
      <p style={{ color: '#94a3b8', fontSize: '1rem', margin: '0 0 32px', maxWidth: '400px' }}>
        Thank you for completing the intake interview. Your physician will review this information before your appointment.
      </p>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '32px', marginBottom: '40px' }}>
        <div>
          <div style={{ color: '#0d9488', fontSize: '1.5rem', fontWeight: 700 }}>
            {formatDuration(duration)}
          </div>
          <div style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Duration
          </div>
        </div>
        <div>
          <div style={{ color: '#0d9488', fontSize: '1.5rem', fontWeight: 700 }}>
            {questionCount}
          </div>
          <div style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Questions
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={onStartAnother}
          style={{
            padding: '12px 24px',
            borderRadius: '8px',
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#e2e8f0',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Start Another Interview
        </button>
        <button
          onClick={onBackToPortal}
          style={{
            padding: '12px 24px',
            borderRadius: '8px',
            background: '#0d9488',
            border: 'none',
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Back to Patient Portal
        </button>
      </div>
    </div>
  )
}
