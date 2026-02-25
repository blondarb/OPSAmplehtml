import { Info } from 'lucide-react'

export default function DisclaimerBanner() {
  return (
    <div
      style={{
        width: '100%',
        background: '#1e293b',
        padding: '12px 24px',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
      }}
    >
      <Info size={14} color="#64748b" style={{ flexShrink: 0 }} />
      <span
        style={{
          fontSize: '0.75rem',
          color: '#64748b',
          fontStyle: 'italic',
        }}
      >
        Demo Environment — All data shown is simulated for demonstration purposes.
      </span>
    </div>
  )
}
