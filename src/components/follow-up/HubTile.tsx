'use client'

import Link from 'next/link'

interface HubTileProps {
  href: string
  icon: React.ReactNode
  title: string
  description: string
  cta: string
  accentColor: string
}

export default function HubTile({ href, icon, title, description, cta, accentColor }: HubTileProps) {
  return (
    <Link href={href} style={{ textDecoration: 'none', flex: '1 1 280px', maxWidth: '320px' }}>
      <div
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '16px',
          padding: '28px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          textAlign: 'center',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = accentColor
          e.currentTarget.style.boxShadow = `0 8px 32px ${accentColor}33`
          e.currentTarget.style.transform = 'translateY(-2px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#334155'
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '12px',
            background: `${accentColor}26`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
          }}
        >
          {icon}
        </div>
        <h3 style={{ color: '#fff', fontSize: '1.125rem', fontWeight: 600, margin: '0 0 8px' }}>
          {title}
        </h3>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0, lineHeight: 1.5, minHeight: '3em' }}>
          {description}
        </p>
        <div
          style={{
            marginTop: '18px',
            padding: '10px 20px',
            borderRadius: '8px',
            background: accentColor,
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.85rem',
            display: 'inline-block',
          }}
        >
          {cta}
        </div>
      </div>
    </Link>
  )
}
