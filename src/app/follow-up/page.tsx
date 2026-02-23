'use client'

import Link from 'next/link'
import HubTile from '@/components/follow-up/HubTile'
import DisclaimerBanner from '@/components/follow-up/DisclaimerBanner'

export default function FollowUpHub() {
  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff' }}>
      {/* Header */}
      <div style={{ background: '#16A34A', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Link href="/" style={{ color: '#fff', textDecoration: 'none', fontSize: '0.875rem', opacity: 0.9 }}>
          ← Home
        </Link>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, flex: 1 }}>
          Post-Visit Follow-Up Center
        </h1>
        <span style={{
          background: 'rgba(255,255,255,0.2)',
          padding: '4px 12px',
          borderRadius: '12px',
          fontSize: '0.75rem',
          fontWeight: 600,
        }}>
          DEMO
        </span>
      </div>

      {/* Intro */}
      <div style={{ textAlign: 'center', padding: '40px 24px 16px', maxWidth: '700px', margin: '0 auto' }}>
        <p style={{ color: '#94a3b8', fontSize: '1rem', lineHeight: 1.6, margin: 0 }}>
          AI-powered post-visit follow-up for neurology patients — check medication tolerance, detect side effects, and flag escalations. Track billing for CCM and TCM programs.
        </p>
      </div>

      {/* Hub Tiles */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: '24px',
        padding: '32px 24px 48px',
        maxWidth: '1080px',
        margin: '0 auto',
      }}>
        <HubTile
          href="/follow-up/conversation"
          accentColor="#16A34A"
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          }
          title="Start Follow-Up"
          description="Initiate a patient follow-up call via SMS or voice with real-time escalation monitoring."
          cta="Launch Follow-Up →"
        />

        <HubTile
          href="/follow-up/analytics"
          accentColor="#3B82F6"
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          }
          title="Analytics Dashboard"
          description="Completion rates, escalation trends, medication adherence patterns, and outcome tracking."
          cta="View Analytics →"
        />

        <HubTile
          href="/follow-up/billing"
          accentColor="#F59E0B"
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          }
          title="Billing & Time Tracking"
          description="TCM/CCM billing worksheets, phased time tracking, CPT code suggestions, and CSV export."
          cta="Open Billing →"
        />
      </div>

      {/* Disclaimer */}
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 24px 40px' }}>
        <DisclaimerBanner />
      </div>
    </div>
  )
}
