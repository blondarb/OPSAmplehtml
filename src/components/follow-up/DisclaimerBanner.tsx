'use client'

export default function DisclaimerBanner() {
  return (
    <div style={{
      background: 'rgba(234, 179, 8, 0.1)',
      border: '1px solid rgba(234, 179, 8, 0.3)',
      borderRadius: '8px',
      padding: '12px 24px',
      textAlign: 'center',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
    }}>
      <span style={{ fontSize: '14px', lineHeight: 1, flexShrink: 0 }}>
        &#8505;
      </span>
      <span style={{
        color: '#EAB308',
        fontSize: '13px',
        lineHeight: '1.5',
      }}>
        This is a demonstration of an AI-powered post-visit follow-up system. In production, all conversations are reviewed by a licensed clinician before clinical action is taken.
      </span>
    </div>
  )
}
