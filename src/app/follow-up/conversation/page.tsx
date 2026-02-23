'use client'

import { useState } from 'react'
import Link from 'next/link'
import PatientSelector from '@/components/follow-up/PatientSelector'
import ModeSelector from '@/components/follow-up/ModeSelector'
import ChatConversation from '@/components/follow-up/ChatConversation'
import VoiceConversation from '@/components/follow-up/VoiceConversation'
import ClinicianDashboard from '@/components/follow-up/ClinicianDashboard'
import EscalationAlert from '@/components/follow-up/EscalationAlert'
import PostCallSummary from '@/components/follow-up/PostCallSummary'
import DisclaimerBanner from '@/components/follow-up/DisclaimerBanner'
import type { PatientScenario, FollowUpMethod, DashboardUpdate, EscalationFlag } from '@/lib/follow-up/types'

type PageState = 'select' | 'active' | 'complete'

export default function FollowUpPage() {
  const [pageState, setPageState] = useState<PageState>('select')
  const [selectedScenario, setSelectedScenario] = useState<PatientScenario | null>(null)
  const [mode, setMode] = useState<FollowUpMethod>('sms')
  const [dashboard, setDashboard] = useState<DashboardUpdate | null>(null)
  const [escalationAlert, setEscalationAlert] = useState<EscalationFlag | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  function handlePatientSelect(scenario: PatientScenario) {
    setSelectedScenario(scenario)
    setPageState('active')
  }

  function handleDashboardUpdate(update: DashboardUpdate) {
    setDashboard(update)
  }

  function handleEscalation(flag: EscalationFlag) {
    setEscalationAlert(flag)
  }

  function handleConversationComplete(completedSessionId: string) {
    setSessionId(completedSessionId)
    setPageState('complete')
  }

  function handleNewFollowUp() {
    setPageState('select')
    setSelectedScenario(null)
    setMode('sms')
    setDashboard(null)
    setEscalationAlert(null)
    setSessionId(null)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        background: '#16A34A',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}>
        <Link href="/" style={{
          color: '#bbf7d0',
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
        <div style={{
          width: '1px',
          height: '20px',
          background: 'rgba(255,255,255,0.2)',
        }} />
        <h1 style={{
          color: '#fff',
          fontSize: '1rem',
          fontWeight: 600,
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#86efac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          Post-Visit Follow-Up Agent
        </h1>
        <span style={{
          color: '#16A34A',
          fontSize: '0.7rem',
          fontWeight: 500,
          padding: '2px 8px',
          background: '#fff',
          borderRadius: '4px',
        }}>
          Demo
        </span>
      </div>

      {/* Main content */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '32px 24px',
      }}>
        {/* Intro text */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <p style={{
            color: '#94a3b8',
            fontSize: '0.85rem',
            lineHeight: 1.6,
            maxWidth: '700px',
            margin: '0 auto',
          }}>
            Simulate an AI-driven post-visit follow-up call with a patient. Select a patient scenario,
            choose a communication method, and observe how the agent conducts the conversation while
            the clinician dashboard updates in real time.
          </p>
        </div>

        {/* Split panel layout */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '24px',
        }}>
          {/* Left Panel (60%) */}
          <div style={{
            flex: 0.6,
            minHeight: '500px',
          }}>
            {/* Select state */}
            {pageState === 'select' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <PatientSelector onSelect={handlePatientSelect} disabled={false} />
                <ModeSelector mode={mode} onModeChange={setMode} disabled={false} />
              </div>
            )}

            {/* Active state */}
            {pageState === 'active' && selectedScenario && (
              <>
                {mode === 'sms' ? (
                  <ChatConversation
                    scenario={selectedScenario}
                    onDashboardUpdate={handleDashboardUpdate}
                    onEscalation={handleEscalation}
                    onConversationComplete={handleConversationComplete}
                  />
                ) : (
                  <VoiceConversation
                    scenario={selectedScenario}
                    onDashboardUpdate={handleDashboardUpdate}
                    onEscalation={handleEscalation}
                    onConversationComplete={handleConversationComplete}
                  />
                )}
              </>
            )}

            {/* Complete state */}
            {pageState === 'complete' && sessionId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <PostCallSummary sessionId={sessionId} />
                <button
                  onClick={handleNewFollowUp}
                  style={{
                    padding: '12px 24px',
                    background: '#16A34A',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                  }}
                >
                  New Follow-Up
                </button>
              </div>
            )}
          </div>

          {/* Right Panel (40%) */}
          <div style={{
            flex: 0.4,
            minHeight: '500px',
          }}>
            {escalationAlert && (
              <div style={{ marginBottom: '16px' }}>
                <EscalationAlert flag={escalationAlert} onDismiss={() => setEscalationAlert(null)} />
              </div>
            )}
            <ClinicianDashboard dashboard={dashboard} escalationAlert={escalationAlert} sessionId={sessionId} />
          </div>
        </div>

        {/* Disclaimer Banner */}
        <DisclaimerBanner />
      </div>
    </div>
  )
}
