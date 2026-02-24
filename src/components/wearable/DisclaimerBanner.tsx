'use client'

import { WEARABLE_DISCLAIMER_TEXT } from '@/lib/wearable/types'

export default function DisclaimerBanner() {
  return (
    <div
      style={{
        padding: '12px 16px',
        background: 'rgba(245, 158, 11, 0.1)',
        border: '1px solid #92400E',
        borderRadius: '8px',
        marginTop: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#92400E"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, marginTop: '1px' }}
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <p
          style={{
            color: '#92400E',
            fontSize: '0.8rem',
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {WEARABLE_DISCLAIMER_TEXT}
        </p>
      </div>
    </div>
  )
}
