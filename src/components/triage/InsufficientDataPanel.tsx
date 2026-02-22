'use client'

interface Props {
  missingInformation: string[] | null
}

export default function InsufficientDataPanel({ missingInformation }: Props) {
  return (
    <div style={{
      padding: '24px',
      background: '#1e293b',
      borderRadius: '12px',
      border: '2px solid #6B7280',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: '#6B7280',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div>
          <h3 style={{ color: '#e2e8f0', fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
            Insufficient Data
          </h3>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', margin: '2px 0 0' }}>
            Return to Referring Provider for Clarification
          </p>
        </div>
      </div>

      <p style={{
        color: '#cbd5e1',
        fontSize: '0.85rem',
        lineHeight: 1.6,
        margin: '0 0 16px',
      }}>
        This referral does not contain enough clinical information to triage safely.
        Consider returning to the referring provider requesting the following:
      </p>

      {missingInformation && missingInformation.length > 0 && (
        <ul style={{
          margin: 0,
          paddingLeft: '20px',
          background: 'rgba(107, 114, 128, 0.1)',
          borderRadius: '8px',
          padding: '12px 12px 12px 32px',
        }}>
          {missingInformation.map((item, i) => (
            <li key={i} style={{
              color: '#e2e8f0',
              fontSize: '0.85rem',
              lineHeight: 1.7,
              marginBottom: i < missingInformation.length - 1 ? '4px' : 0,
            }}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
