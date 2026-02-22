'use client'

import Link from 'next/link'

// The SDNE dashboard is deployed and maintained in the SDNE repo.
// We embed it here via iframe so OPSAmplehtml always shows the latest
// without duplicating code or data across repos.
const SDNE_DASHBOARD_URL = 'https://dashboard-five-puce-49.vercel.app'

export default function SDNEPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        background: '#1e40af',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        flexShrink: 0,
      }}>
        <Link href="/" style={{
          color: '#93c5fd',
          textDecoration: 'none',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Home
        </Link>
        <div style={{ flex: 1 }}>
          <h1 style={{ color: '#fff', fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>
            SDNE Core-15 Neurologic Screening
          </h1>
          <p style={{ color: '#93c5fd', fontSize: '0.75rem', margin: '2px 0 0' }}>
            Standardized Digital Neurologic Exam &mdash; Live Dashboard
          </p>
        </div>
        <a
          href={SDNE_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#93c5fd',
            textDecoration: 'none',
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          Open in new tab
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>

      {/* Iframe — fills remaining viewport */}
      <iframe
        src={SDNE_DASHBOARD_URL}
        style={{
          flex: 1,
          width: '100%',
          border: 'none',
        }}
        title="SDNE Dashboard"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  )
}
