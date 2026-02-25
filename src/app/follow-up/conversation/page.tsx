'use client'

import { useState } from 'react'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { HeartPulse } from 'lucide-react'
import PatientSelector from '@/components/follow-up/PatientSelector'
import ModeSelector from '@/components/follow-up/ModeSelector'
import ChatConversation from '@/components/follow-up/ChatConversation'
import VoiceConversation from '@/components/follow-up/VoiceConversation'
import ClinicianDashboard from '@/components/follow-up/ClinicianDashboard'
import LiveDemoPanel from '@/components/follow-up/LiveDemoPanel'
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
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null)

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
    setLiveSessionId(null)
  }

  function handleLiveSessionStarted(id: string) {
    setLiveSessionId(id)
  }

  const [showLanding, setShowLanding] = useState(true)

  return (
    <PlatformShell>
    <FeatureSubHeader
      title="Post-Visit Check-In"
      icon={HeartPulse}
      accentColor="#16A34A"
    />
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    }}>

      {showLanding ? (
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '60px 24px 0', textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'linear-gradient(135deg, #16A34A, #22C55E)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <HeartPulse size={32} color="white" />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, color: '#fff' }}>
            Post-Visit Check-In
          </h1>
          <p style={{ fontSize: 16, color: '#94a3b8', lineHeight: 1.6, marginBottom: 32 }}>
            After every visit, our AI care coordinator follows up with the patient to check on
            medication tolerance, symptom changes, and any new concerns. This conversation
            generates structured alerts for the care team when escalation is needed.
          </p>
          <div style={{
            background: 'rgba(22, 163, 74, 0.1)', border: '1px solid rgba(22, 163, 74, 0.3)', borderRadius: 12,
            padding: 24, marginBottom: 32, textAlign: 'left',
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#4ade80', marginBottom: 12, marginTop: 0 }}>
              What happens during a check-in:
            </h3>
            <ul style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
              <li>AI asks about medication side effects and adherence</li>
              <li>Screens for new or worsening symptoms</li>
              <li>Checks if the patient has questions about their care plan</li>
              <li>Generates a structured summary for the clinician</li>
              <li>Flags urgent concerns for immediate review</li>
            </ul>
          </div>
          <button
            onClick={() => setShowLanding(false)}
            style={{
              background: '#16A34A', color: 'white', border: 'none',
              padding: '14px 32px', borderRadius: 8, fontSize: 16,
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            Start Check-In Demo
          </button>
        </div>
      ) : (
      <>
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

                {/* Live SMS Demo */}
                <div style={{
                  marginTop: '8px',
                  borderTop: '1px solid #334155',
                  paddingTop: '24px',
                }}>
                  <LiveDemoPanel onSessionStarted={handleLiveSessionStarted} />
                </div>
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
            <ClinicianDashboard dashboard={dashboard} escalationAlert={escalationAlert} sessionId={sessionId} liveSessionId={liveSessionId} />
          </div>
        </div>

        {/* Disclaimer Banner */}
        <DisclaimerBanner />
      </div>
      </>
      )}
    </div>
    </PlatformShell>
  )
}
