'use client'

import Link from 'next/link'
import { Users, BarChart3 } from 'lucide-react'
import { useState } from 'react'
import DisclaimerBanner from '@/components/command-center/DisclaimerBanner'
import { DEMO_PATIENTS } from '@/lib/dashboard/demoPatients'
import { DEMO_PROVIDERS } from '@/lib/dashboard/demoProviders'
import { DEMO_PRACTICE_METRICS } from '@/lib/dashboard/demoMetrics'
import { DEMO_CLINIC_SITES } from '@/lib/dashboard/demoProviders'

// Compute teaser metrics from demo data
const activePatientCount = DEMO_PATIENTS.filter(p => p.flow_stage !== 'cancelled').length
const providerCount = DEMO_PROVIDERS.length
const utilizationPct = DEMO_PRACTICE_METRICS.utilization.value
const activeSites = DEMO_CLINIC_SITES.length

interface CardDef {
  title: string
  description: string
  teaser: string
  href: string
  icon: typeof Users
}

const cards: CardDef[] = [
  {
    title: 'MA Dashboard',
    description: 'Manage patient flow and tasks across your providers',
    teaser: `${activePatientCount} patients across ${providerCount} providers today`,
    href: '/dashboard/ma',
    icon: Users,
  },
  {
    title: 'Practice Manager',
    description: 'Practice-wide metrics, staffing, and performance',
    teaser: `${utilizationPct}% utilization, ${activeSites} sites active`,
    href: '/dashboard/admin',
    icon: BarChart3,
  },
]

function RoleCard({ card }: { card: CardDef }) {
  const [hovered, setHovered] = useState(false)
  const Icon = card.icon

  return (
    <div
      style={{
        flex: '1 1 380px',
        maxWidth: 420,
        background: hovered ? 'rgba(30, 41, 59, 0.95)' : 'rgba(30, 41, 59, 0.8)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 16,
        transition: 'background 0.2s ease',
        cursor: 'default',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Icon size={40} color="#ffffff" strokeWidth={1.5} />

      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#ffffff' }}>
        {card.title}
      </h2>

      <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', lineHeight: 1.5 }}>
        {card.description}
      </p>

      <p style={{ margin: 0, fontSize: 14, color: '#0D9488', fontWeight: 500 }}>
        {card.teaser}
      </p>

      <Link
        href={card.href}
        style={{
          marginTop: 8,
          display: 'inline-block',
          padding: '8px 24px',
          background: '#0D9488',
          color: '#ffffff',
          fontSize: 14,
          fontWeight: 600,
          borderRadius: 999,
          textDecoration: 'none',
          transition: 'background 0.2s ease',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#0B7C72' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#0D9488' }}
      >
        Enter
      </Link>
    </div>
  )
}

export default function RoleChooserPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minHeight: '100%',
        padding: '80px 24px 0',
      }}
    >
      {/* Header */}
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#ffffff' }}>
        Operations Dashboard
      </h1>
      <p style={{ margin: '8px 0 0', fontSize: 16, color: '#94a3b8' }}>
        Choose your view
      </p>

      {/* Cards */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 24,
          marginTop: 48,
          maxWidth: 900,
          width: '100%',
        }}
      >
        {cards.map((card) => (
          <RoleCard key={card.href} card={card} />
        ))}
      </div>

      {/* Disclaimer */}
      <div style={{ marginTop: 'auto', paddingTop: 48, width: '100%' }}>
        <DisclaimerBanner />
      </div>
    </div>
  )
}
