'use client'

import Link from 'next/link'

export default function LandingPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      padding: '24px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    }}>
      {/* Logo & Title */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #0D9488, #14B8A6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          boxShadow: '0 4px 24px rgba(13,148,136,0.3)',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2C8 2 4 6 4 10c0 3 2 5 4 6v2h8v-2c2-1 4-3 4-6 0-4-4-8-8-8z" />
            <path d="M10 18h4" />
            <path d="M10 22h4" />
          </svg>
        </div>
        <h1 style={{ color: '#fff', fontSize: '2rem', fontWeight: 700, margin: 0 }}>
          Sevaro Clinical
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '1rem', marginTop: '8px' }}>
          AI-Powered Clinical Documentation Demo
        </p>
        <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '12px', maxWidth: '480px', lineHeight: 1.6 }}>
          Choose a role below to explore AI-assisted clinical workflows. Each view is a standalone proof-of-concept you can demo independently.
        </p>
      </div>

      {/* Selection Cards */}
      <div style={{
        display: 'flex',
        gap: '24px',
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: '720px',
        width: '100%',
      }}>
        {/* Physician Card */}
        <Link href="/physician" style={{ textDecoration: 'none', flex: '1 1 300px', maxWidth: '340px' }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '32px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            textAlign: 'center',
          }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#0D9488'
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(13,148,136,0.2)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#334155'
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '12px',
              background: 'rgba(13,148,136,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#14B8A6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <h2 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, margin: '0 0 8px' }}>
              Physician View
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0, lineHeight: 1.5 }}>
              Full clinical documentation workspace with AI-powered charting, voice dictation, and smart recommendations.
            </p>
            <div style={{
              marginTop: '20px',
              padding: '10px 20px',
              borderRadius: '8px',
              background: '#0D9488',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.875rem',
              display: 'inline-block',
            }}>
              Enter Physician Demo
            </div>
          </div>
        </Link>

        {/* Patient Card */}
        <Link href="/patient" style={{ textDecoration: 'none', flex: '1 1 300px', maxWidth: '340px' }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '32px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            textAlign: 'center',
          }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#8B5CF6'
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(139,92,246,0.2)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#334155'
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '12px',
              background: 'rgba(139,92,246,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <h2 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, margin: '0 0 8px' }}>
              Patient View
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0, lineHeight: 1.5 }}>
              Patient portal demo with intake forms, messaging, and appointment preparation.
            </p>
            <div style={{
              marginTop: '20px',
              padding: '10px 20px',
              borderRadius: '8px',
              background: '#8B5CF6',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.875rem',
              display: 'inline-block',
            }}>
              Enter Patient Demo
            </div>
          </div>
        </Link>
      </div>

      {/* Footer */}
      <p style={{ color: '#475569', fontSize: '0.75rem', marginTop: '48px' }}>
        Sevaro Clinical &mdash; Demo Environment
      </p>
    </div>
  )
}
