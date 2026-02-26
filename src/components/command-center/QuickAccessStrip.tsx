'use client'

import { useState } from 'react'
import Link from 'next/link'

const QUICK_LINKS = [
  { label: 'AI Triage', href: '/triage', color: '#F59E0B' },
  { label: 'Clinician Cockpit', href: '/physician', color: '#0D9488' },
  { label: 'Documentation', href: '/ehr', color: '#8B5CF6' },
  { label: 'Digital Neuro Exam', href: '/sdne', color: '#1E40AF' },
  { label: 'Follow-Up Agent', href: '/follow-up', color: '#16A34A' },
  { label: 'Wearable Monitoring', href: '/wearable', color: '#0EA5E9' },
]

function QuickLinkPill({ label, href, color }: { label: string; href: string; color: string }) {
  const [hovered, setHovered] = useState(false)

  return (
    <Link
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 16px',
        borderRadius: '99px',
        background: '#1e293b',
        border: `1px solid ${hovered ? color : '#334155'}`,
        textDecoration: 'none',
        transition: 'border-color 0.2s ease',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: '0.8rem', color: '#e2e8f0', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </Link>
  )
}

export default function QuickAccessStrip() {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        justifyContent: 'center',
      }}
    >
      {QUICK_LINKS.map((link) => (
        <QuickLinkPill key={link.href} {...link} />
      ))}
    </div>
  )
}
