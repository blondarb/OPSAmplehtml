'use client'

import Link from 'next/link'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { LayoutDashboard } from 'lucide-react'

const STATUS_CARDS = [
  {
    label: 'Follow-Ups Today',
    value: '12',
    sub: '3 escalated',
    color: '#16A34A',
    bg: 'rgba(22,163,74,0.1)',
    border: 'rgba(22,163,74,0.3)',
  },
  {
    label: 'Wearable Alerts',
    value: '5',
    sub: '2 critical',
    color: '#0EA5E9',
    bg: 'rgba(14,165,233,0.1)',
    border: 'rgba(14,165,233,0.3)',
  },
  {
    label: 'Triage Queue',
    value: '8',
    sub: '2 emergent',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.3)',
  },
  {
    label: 'Pending Messages',
    value: '6',
    sub: '1 urgent',
    color: '#0D9488',
    bg: 'rgba(13,148,136,0.1)',
    border: 'rgba(13,148,136,0.3)',
  },
]

const FEATURE_LINKS = [
  { label: 'AI Triage Tool', href: '/triage', color: '#F59E0B', desc: 'Score and route referrals' },
  { label: 'Physician Workspace', href: '/physician', color: '#0D9488', desc: 'Clinical documentation' },
  { label: 'Digital Neuro Exam', href: '/sdne', color: '#1E40AF', desc: 'SDNE dashboard' },
  { label: 'Patient Portal', href: '/patient', color: '#8B5CF6', desc: 'Intake, messaging, historian' },
  { label: 'Post-Visit Follow-Up', href: '/follow-up', color: '#16A34A', desc: 'AI care coordinator' },
  { label: 'Wearable Monitoring', href: '/wearable', color: '#0EA5E9', desc: 'Continuous data streams' },
]

export default function CommandCenterDashboard() {
  return (
    <PlatformShell>
    <FeatureSubHeader
      title="Command Center"
      icon={LayoutDashboard}
      accentColor="#4F46E5"
    />
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {/* Intro */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, margin: '0 0 8px' }}>
            Clinician Command Center
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: 600, margin: '0 auto' }}>
            Aggregate overview of patient follow-ups, wearable alerts, triage queue, and incoming messages.
            All data shown is simulated for demonstration purposes.
          </p>
        </div>

        {/* Status cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 40,
        }}>
          {STATUS_CARDS.map(card => (
            <div key={card.label} style={{
              background: card.bg,
              border: `1px solid ${card.border}`,
              borderRadius: 12,
              padding: '20px 20px 16px',
            }}>
              <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                {card.label}
              </div>
              <div style={{ color: card.color, fontSize: '2rem', fontWeight: 700, lineHeight: 1, marginBottom: 4 }}>
                {card.value}
              </div>
              <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
                {card.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <h2 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>
          Quick Access
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 12,
          marginBottom: 40,
        }}>
          {FEATURE_LINKS.map(link => (
            <Link key={link.href} href={link.href} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '16px 20px',
              borderRadius: 10,
              border: '1px solid #334155',
              background: '#1e293b',
              textDecoration: 'none',
              transition: 'border-color 0.15s',
            }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: link.color,
                flexShrink: 0,
              }} />
              <div>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>{link.label}</div>
                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{link.desc}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Demo disclaimer */}
        <div style={{
          background: 'rgba(79,70,229,0.08)',
          border: '1px solid rgba(79,70,229,0.25)',
          borderRadius: 10,
          padding: '14px 18px',
          textAlign: 'center',
        }}>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0, lineHeight: 1.6 }}>
            <strong style={{ color: '#a5b4fc' }}>Demo Environment</strong> — This Command Center shows simulated aggregate data.
            In production, this view would pull real-time metrics from the EHR, wearable integrations, and AI follow-up system.
          </p>
        </div>
      </div>
    </div>
    </PlatformShell>
  )
}
