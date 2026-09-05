'use client'

import '@/styles/neuro-navigator.css'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useRealtimeSession } from '@/hooks/useRealtimeSession'
import { DEMO_SCENARIOS, getInterviewBudget, type DemoScenario, type HistorianStructuredOutput, type HistorianRedFlag, type HistorianTranscriptEntry, type HistorianSessionType, type PatientContext } from '@/lib/historianTypes'
import { getTenantClient } from '@/lib/tenant'
import HistorianReportView from './HistorianReportView'
import HistorianConsentDisclosure from './HistorianConsentDisclosure'
import HistorianInterviewStep from './historian/HistorianInterviewStep'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import VoiceProviderToggle from '@/components/voice/VoiceProviderToggle'
import { useVoiceProviderPreference } from '@/lib/voice/useVoiceProviderPreference'
import { Mic } from 'lucide-react'
import { canStartInterview, referralNoteMode } from '@/lib/historian/intakeGates'
import { REFERRAL_NOTE_SAMPLES } from '@/lib/historian/referralNoteSamples'
import type { HistorianReferralInput } from '@/lib/historian/referralContext'
import {
  formatHandoffLoadedMessage,
  readHistorianHandoff,
  type HistorianHandoffDisplay,
} from '@/lib/historian/referralHandoff'
import { deriveReferredCardContent } from '@/lib/historian/referredCardContent'
import { postExtractJSON } from '@/lib/triage/pollClient'
import type { ClinicalExtraction } from '@/lib/triage/types'
import LocalizerPanel from '@/components/LocalizerPanel'

type Phase = 'loading_context' | 'scenario_select' | 'connecting' | 'active' | 'ending' | 'complete' | 'safety_escalation'

/** Unified config for both real-patient and demo-scenario flows */
interface SessionConfig {
  sessionType: HistorianSessionType
  referralReason?: string
  patientName: string
  patientId: string | null
  patientContext?: string
}

/**
 * Interview turn budget for the "Question N of about X" label, kept in step
 * with the historian prompt's depth budget (HISTORIAN_INTERVIEW_BUDGET, default
 * 45-60:70). Uses the soft target (softMax) as the "about X" the patient sees —
 * a rough expectation, not a hard stop. A turn is one exchange, not one question.
 */
const TURN_CAP = getInterviewBudget(process.env.HISTORIAN_INTERVIEW_BUDGET).softMax

const STEP_LABELS = ['Your visit', 'Consent & identity', 'Interview', 'Summary'] as const

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface NeurologicHistorianProps {
  /**
   * Set by /patient/triage-historian to pre-declare intent: this route is
   * meant to open in referred mode. This is intent only, NOT the mode
   * itself — actual referred-mode rendering is always derived from
   * `handoffDisplay !== null` (see `referredMode` below), never from this
   * prop directly. A cold open (no handoff in sessionStorage) on this route
   * therefore falls through to the ordinary picker, just like
   * /patient/historian, plus one route-specific hint (see cold-open
   * handling in the render below). The prop cannot manufacture a fake
   * referred card out of nothing — that's deliberate.
   */
  initialMode?: 'referred'
  /**
   * Clinician mirror. Turns the Localizer back on and renders the physician
   * differential panel alongside the interview.
   *
   * MUST stay false on every /patient/* route — the redesign brief (Part 4)
   * bars diagnostic content from the patient's screen, which is why
   * enableLocalizer is hard-off below by default. Only a clinician-facing,
   * auth-gated route may pass this (see /consult/triage-historian). It is a
   * prop rather than a query param precisely so a patient cannot turn it on
   * by editing the URL.
   */
  clinicianMirror?: boolean
}

export default function NeurologicHistorian({ initialMode, clinicianMirror = false }: NeurologicHistorianProps = {}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const scenarioParam = searchParams.get('scenario')
  const patientIdParam = searchParams.get('patient_id')
  const consultIdParam = searchParams.get('consult_id')
  // Developer control (redesign brief Part 4): the voice-engine selector is
  // internal-only on this patient-facing page. Reach it with ?internal=1
  // (the ?voice=nova deep link keeps working regardless via
  // useVoiceProviderPreference).
  const showEngineToggle = searchParams.get('internal') === '1'

  const [phase, setPhase] = useState<Phase>(patientIdParam ? 'loading_context' : 'scenario_select')
  const [selectedScenario, setSelectedScenario] = useState<DemoScenario | null>(null)
  const [openEnded, setOpenEnded] = useState(false)
  const explicitIntakeChoiceRef = useRef(false)
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [referralNote, setReferralNote] = useState('')
  const [referralInput, setReferralInput] = useState<HistorianReferralInput | null>(null)
  // Display-only fields from a triage handoff (tier + focus). Separate from
  // referralInput because the paste path also sets referralInput but has no
  // handoff display to show — see the "Referral loaded" message below.
  const [handoffDisplay, setHandoffDisplay] = useState<HistorianHandoffDisplay | null>(null)
  const [extracting, setExtracting] = useState(false)
  // Consent/disclosure gate — must be acknowledged before startSession() can run.
  // See handleStartInterview / handleConsentConfirm below: startSession() is only
  // ever called from handleConsentConfirm, never directly from the button handler.
  const [showConsentDisclosure, setShowConsentDisclosure] = useState(false)
  const [consentAcknowledged, setConsentAcknowledged] = useState(false)
  const [completionData, setCompletionData] = useState<{
    structuredOutput: HistorianStructuredOutput | null
    narrativeSummary: string | null
    redFlags: HistorianRedFlag[]
    safetyEscalated: boolean
    transcript: HistorianTranscriptEntry[]
    duration: number
    questionCount: number
    /** Server-minted historian_sessions id — see useRealtimeSession's onComplete. */
    sessionId: string | null
  } | null>(null)

  const transcriptEndRef = useRef<HTMLDivElement>(null)
  // Stable consult ID for session logging — generated once per component mount
  const consultIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `session-${Date.now()}`
  )
  const tenant = getTenantClient()
  // Voice engine selection — defaults to 'openai' (today's production path);
  // Nova only engages via an explicit ?voice=nova link or a toggle click.
  const [voiceProvider, setVoiceProvider, voiceProviderExplicit] = useVoiceProviderPreference()

  // Referred mode: a triage handoff was picked up on mount. `handoffDisplay`
  // is set in exactly one place (the handoff-pickup effect below) and
  // nowhere else sets it truthy — the paste-a-referral path sets
  // `referralInput` but never `handoffDisplay`, so pasting a note can never
  // trigger this. This is the sole discriminator; `initialMode` only sets
  // intent for the dedicated route's cold-open copy, never the mode itself.
  const referredMode = handoffDisplay !== null
  // Card copy derivation — pure function, unit-tested without a DOM (see
  // src/lib/historian/referredCardContent.ts).
  const referredCardContent = deriveReferredCardContent(handoffDisplay)

  // Derive active config from either real patient or demo scenario
  const activeConfig: SessionConfig = sessionConfig || {
    sessionType: selectedScenario?.session_type || 'new_patient',
    referralReason: selectedScenario?.referral_reason ?? (
      referralInput && referralNoteMode(referralInput.noteText ?? '') === 'short'
        ? referralInput.noteText
        : undefined
    ),
    patientName: selectedScenario?.patient_name || 'Demo Patient',
    patientId: null,
  }

  const handleComplete = useCallback(async (data: typeof completionData) => {
    if (!data) return
    setCompletionData(data)
    setPhase('complete')

    // Save session to database
    try {
      await fetch('/api/ai/historian/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenant,
          patient_id: activeConfig.patientId || null,
          session_type: activeConfig.sessionType,
          patient_name: activeConfig.patientName,
          referral_reason: activeConfig.referralReason || null,
          structured_output: data.structuredOutput,
          narrative_summary: data.narrativeSummary,
          transcript: data.transcript,
          red_flags: data.redFlags,
          safety_escalated: data.safetyEscalated,
          duration_seconds: data.duration,
          question_count: data.questionCount,
          status: 'completed',
          consult_id: consultIdParam || null,
          sessionId: data.sessionId,
        }),
      })
    } catch (err) {
      console.error('Failed to save historian session:', err)
    }
  }, [tenant, activeConfig])

  const handleSafetyEscalation = useCallback(() => {
    setPhase('safety_escalation')
  }, [])

  const {
    status,
    transcript,
    currentAssistantText,
    currentUserText,
    isAiSpeaking,
    isUserSpeaking,
    duration,
    error,
    interviewCompleted,
    localizerData,
    localizerLoading,
    startSession,
    endSession,
  } = useRealtimeSession({
    sessionType: activeConfig.sessionType,
    referralReason: activeConfig.referralReason,
    patientName: activeConfig.patientName,
    patientContext: activeConfig.patientContext,
    consultId: consultIdRef.current,
    // Send the provider ONLY when the user actually chose one (?voice= link
    // or the internal toggle). Otherwise omit it so the SERVER's
    // VOICE_PROVIDER decides — see useVoiceProviderPreference.
    provider: voiceProviderExplicit ? voiceProvider : undefined,
    referral: referralInput ?? undefined,
    // Patient-facing surface: the localizer drives a physician-only panel and
    // must not run here (redesign brief Part 4 — no diagnostic content on the
    // patient page). The /consult clinician surface keeps its own localizer.
    // `clinicianMirror` is the single, explicit opt-in for a clinician-facing
    // route that wants the differential mirrored — never set on /patient/*.
    enableLocalizer: clinicianMirror,
    onComplete: handleComplete,
    onSafetyEscalation: handleSafetyEscalation,
  })

  // Fetch patient context when patient_id is provided
  useEffect(() => {
    if (!patientIdParam) return

    let cancelled = false
    async function fetchContext() {
      try {
        const res = await fetch(`/api/patient/context?patient_id=${patientIdParam}`)
        if (!res.ok) throw new Error('Failed to load patient context')
        const ctx: PatientContext = await res.json()

        if (cancelled) return

        // Determine session type based on whether prior visit exists
        const sessionType: HistorianSessionType = ctx.lastVisitDate ? 'follow_up' : 'new_patient'

        // Build context string for the AI prompt
        let contextStr = `Patient: ${ctx.patientName}`
        if (ctx.referralReason) contextStr += `\nReferral reason: ${ctx.referralReason}`
        if (ctx.lastVisitDate) {
          contextStr += `\nLast visit: ${new Date(ctx.lastVisitDate).toLocaleDateString()} (${ctx.lastVisitType || 'visit'})`
        }
        if (ctx.diagnoses) contextStr += `\nActive diagnoses: ${ctx.diagnoses}`
        if (ctx.allergies) contextStr += `\nAllergies: ${ctx.allergies}`
        if (ctx.lastNoteExcerpt) contextStr += `\nPrior note excerpt:\n${ctx.lastNoteExcerpt}`
        if (ctx.lastNotePlan) contextStr += `\nPrior plan: ${ctx.lastNotePlan}`
        if (ctx.lastNoteSummary) contextStr += `\nPrior visit summary: ${ctx.lastNoteSummary}`

        setSessionConfig({
          sessionType,
          referralReason: ctx.referralReason || undefined,
          patientName: ctx.patientName,
          patientId: patientIdParam,
          patientContext: contextStr,
        })
        setPhase('scenario_select')
      } catch (err) {
        console.error('Failed to load patient context:', err)
        // Fall back to scenario select without context
        setSessionConfig({
          sessionType: 'new_patient',
          patientName: 'Patient',
          patientId: patientIdParam,
        })
        setPhase('scenario_select')
      }
    }
    fetchContext()
    return () => { cancelled = true }
  }, [patientIdParam])

  // Auto-select scenario from query param
  useEffect(() => {
    if (scenarioParam && !selectedScenario && !explicitIntakeChoiceRef.current) {
      const found = DEMO_SCENARIOS.find(s => s.id === scenarioParam)
      if (found) {
        setSelectedScenario(found)
      }
    }
  }, [scenarioParam, selectedScenario])

  // One-shot pickup of a triage → historian handoff (sessionStorage). A ref
  // guard — not just the dependency array — makes this genuinely one-shot:
  // React StrictMode double-invokes effects in dev (mount → cleanup →
  // mount), and readHistorianHandoff() removes the key on read, so a naive
  // effect would silently find nothing on the second invocation even though
  // production (single mount) works fine.
  const handoffAppliedRef = useRef(false)
  useEffect(() => {
    if (handoffAppliedRef.current) return
    handoffAppliedRef.current = true
    // ALWAYS read — reading is what deletes the key. An early return here
    // would leave a payload sitting in sessionStorage for up to 30 minutes,
    // so a later plain visit to this page could silently pick up a previous
    // patient's referral and steer an unrelated interview with it. Consume
    // first, decide second.
    const payload = readHistorianHandoff()
    // A `?scenario=` deep link still wins over a handoff arriving in the same
    // visit — but the payload is now consumed either way. Check the raw query
    // param rather than `selectedScenario` state: the scenario auto-select
    // effect above may have called setState this same flush without that
    // update having committed yet, so the state read here could be stale.
    if (scenarioParam) return
    if (!payload) return
    // Note: the "Or use a referral note" card (and this message) only
    // renders when `!sessionConfig` — a visit that somehow arrives with both
    // `?patient_id=` and a handoff would set this state with nowhere to
    // display it. Not reachable from the triage → historian button today.
    setReferralInput(payload.referral)
    setHandoffDisplay(payload.display)
  }, [scenarioParam])

  // Sync hook status to phase
  useEffect(() => {
    if (status === 'connecting') setPhase('connecting')
    else if (status === 'active') setPhase('active')
    else if (status === 'error') setPhase('scenario_select')
    else if (status === 'safety_escalation') setPhase('safety_escalation')
  }, [status])

  // Scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript, currentAssistantText])

  // Auto-end once the historian calls save_interview_output and finishes speaking.
  // Mirrors EmbeddedHistorian — wait for AI to stop, then end cleanly.
  useEffect(() => {
    if (!interviewCompleted) return
    if (phase !== 'active') return
    if (isAiSpeaking) return
    const t = setTimeout(() => {
      endSession()
    }, 1500)
    return () => clearTimeout(t)
  }, [interviewCompleted, isAiSpeaking, phase, endSession])

  async function handleUseReferralNote() {
    const mode = referralNoteMode(referralNote)
    if (mode === 'empty' || extracting) return
    explicitIntakeChoiceRef.current = true
    setOpenEnded(false)
    setSelectedScenario(null)
    if (mode === 'short') {
      setReferralInput({ steer: 'directive', noteText: referralNote, shortReason: referralNote.trim() })
      return
    }
    setExtracting(true)
    try {
      // /api/triage/extract is 202 + POLL, not a synchronous JSON response.
      // postExtractJSON posts, reads extraction_id and polls to completion —
      // a hand-rolled fetch here would read findings off the 202 ack.
      const extraction = await postExtractJSON<ClinicalExtraction>({
        referral_text: referralNote,
      })
      setReferralInput({
        steer: 'directive',
        noteText: referralNote,
        extraction: extraction.key_findings,
      })
    } catch {
      // Extraction is an enhancement, not a gate: fall back to the raw note so
      // the interview is still referral-directed.
      setReferralInput({ steer: 'directive', noteText: referralNote })
    } finally {
      setExtracting(false)
    }
  }

  const handleSelectScenario = (scenario: DemoScenario) => {
    explicitIntakeChoiceRef.current = true
    setOpenEnded(false)
    setSelectedScenario(scenario)
    // These entry points are mutually exclusive — a canned scenario and a
    // pasted referral (or a triage handoff) would otherwise both steer the
    // same interview.
    setReferralInput(null)
    setHandoffDisplay(null)
  }

  const handleSelectOpenEnded = () => {
    explicitIntakeChoiceRef.current = true
    setOpenEnded(true)
    setSelectedScenario(null)
    setReferralInput(null)
    setHandoffDisplay(null)
  }

  const handleStartInterview = () => {
    // Keep this four-entry-point guard in sync with the Start button.
    if (!canStartInterview({ hasScenario: !!selectedScenario, hasSessionConfig: !!sessionConfig, hasReferral: !!referralInput, openEnded })) return
    // Gate: show the consent/disclosure step before any session/mic start.
    // startSession() is invoked only from handleConsentConfirm.
    if (!consentAcknowledged) {
      setShowConsentDisclosure(true)
      return
    }
    void startSession()
  }

  const handleConsentConfirm = () => {
    setConsentAcknowledged(true)
    setShowConsentDisclosure(false)
    void startSession()
  }

  const handleConsentCancel = () => {
    setShowConsentDisclosure(false)
  }

  const handleEndInterview = () => {
    endSession()
  }

  const handleStartAnother = () => {
    setPhase('scenario_select')
    setOpenEnded(false)
    setSelectedScenario(null)
    setSessionConfig(null)
    setCompletionData(null)
    setShowTranscript(false)
  }

  const handleBackToPortal = () => {
    router.push('/patient')
  }

  // ── Demo-scenario + paste-a-referral picker, factored into variables so
  // referred mode can collapse it behind a disclosure without duplicating
  // this JSX (a duplicate copy is the one that drifts and stops being
  // tested — see the "do not fork" steer for this feature). Rendered either
  // directly (today's /patient/historian behavior, unchanged) or inside a
  // closed-by-default <details> when a triage handoff is already loaded. ──
  const demoScenarioCards = (
    <div style={{ display: 'grid', gap: '12px', marginBottom: '20px' }}>
      {DEMO_SCENARIOS.map(scenario => (
        <button
          key={scenario.id}
          onClick={() => handleSelectScenario(scenario)}
          disabled={extracting}
          aria-pressed={selectedScenario?.id === scenario.id}
          className={`nn-choice${selectedScenario?.id === scenario.id ? ' on' : ''}`}
        >
          <span className="nn-choice-tag">
            {scenario.session_type === 'new_patient' ? 'New' : 'Follow-up'}
          </span>
          <span style={{ display: 'block', fontWeight: 650, marginBottom: 4 }}>
            {scenario.label}
          </span>
          <span style={{ display: 'block', fontSize: 'var(--nn-fs-sm)', color: 'var(--nn-ink-2)' }}>
            {scenario.description}
          </span>
        </button>
      ))}
    </div>
  )

  const referralNoteCard = (
    <div className="nn-card" style={{ marginBottom: 20 }}>
      <h3 className="nn-card-title">Or use a referral note</h3>
      <p className="nn-hint">
        Paste a synthetic referral. The interview will open with what the patient
        was referred for, and ask about that first. A sentence is enough to start.
        Paste a full referral note for the richest interview.
      </p>
      <div className="nn-actions" style={{ marginBottom: 10 }}>
        {REFERRAL_NOTE_SAMPLES.map((sample) => (
          <button
            key={sample.id}
            className="nn-btn nn-btn--sec"
            onClick={() => setReferralNote(sample.text)}
          >
            {sample.label}
          </button>
        ))}
      </div>
      <label htmlFor="nn-referral-note" className="nn-label">
        Referral note
      </label>
      <textarea
        id="nn-referral-note"
        className="nn-textarea"
        style={{ minHeight: 160 }}
        value={referralNote}
        onChange={(e) => {
          setReferralNote(e.target.value)
          // Editing invalidates a previously prepared referral —
          // including its handoff display, so a stale "Referral
          // loaded from triage" line can't sit over freshly typed
          // text.
          if (referralInput) setReferralInput(null)
          if (handoffDisplay) setHandoffDisplay(null)
        }}
        placeholder="Paste a synthetic referral note…"
      />
      <button
        className="nn-btn nn-btn--block"
        style={{ marginTop: 10 }}
        disabled={extracting || referralNoteMode(referralNote) === 'empty'}
        onClick={handleUseReferralNote}
      >
        {extracting ? 'Reading the referral… (about 30–45s)' : 'Use this referral'}
      </button>
      {referralInput && (
        <p
          className="nn-hint"
          role="status"
          style={{ marginTop: 8, color: 'var(--nn-accent-ink)' }}
        >
          {formatHandoffLoadedMessage(handoffDisplay)}
        </p>
      )}
    </div>
  )

  const openEndedCard = (
    <button
      type="button"
      onClick={handleSelectOpenEnded}
      disabled={extracting}
      aria-pressed={openEnded}
      className={`nn-choice${openEnded ? ' on' : ''}`}
      style={{ width: '100%', marginBottom: 20 }}
    >
      <span style={{ display: 'block', fontWeight: 650, marginBottom: 4 }}>
        Start without a referral
      </span>
      <span style={{ display: 'block', fontSize: 'var(--nn-fs-sm)', color: 'var(--nn-ink-2)' }}>
        Henry will begin by asking what brings you in.
      </span>
    </button>
  )

  // ── Presentation-only derivations for the stepped patient flow ──
  const currentStep: 1 | 2 | 3 | 4 =
    phase === 'complete'
      ? 4
      : phase === 'connecting' || phase === 'active' || phase === 'ending'
        ? 3
        : showConsentDisclosure
          ? 2
          : 1
  const lastAssistantText = [...transcript].reverse().find(e => e.role === 'assistant')?.text
  const displayedQuestion = currentAssistantText || lastAssistantText || null
  const lastUserText = [...transcript].reverse().find(e => e.role === 'user')?.text
  const displayedHeard = currentUserText || lastUserText || null
  const assistantTurns = transcript.filter(e => e.role === 'assistant').length
  const currentQuestionNumber = Math.min(
    TURN_CAP,
    Math.max(1, assistantTurns + (currentAssistantText ? 1 : 0)),
  )

  // ============= RENDER =============

  // Safety Escalation overlay
  if (phase === 'safety_escalation') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #7f1d1d 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        textAlign: 'center',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '24px',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h1 style={{ color: '#fff', fontSize: '1.75rem', fontWeight: 700, margin: '0 0 16px' }}>
          We Want to Make Sure You&apos;re Safe
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '1.1rem', margin: '0 0 32px', maxWidth: '500px', lineHeight: 1.6 }}>
          If you or someone you know is in crisis, please reach out for help immediately.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '400px', marginBottom: '40px' }}>
          <a href="tel:911" style={{
            display: 'block', padding: '16px 24px', borderRadius: '12px',
            background: '#fff', color: '#991b1b', fontWeight: 700, fontSize: '1.125rem',
            textDecoration: 'none', textAlign: 'center',
          }}>
            Call 911 (Emergency)
          </a>
          <a href="tel:988" style={{
            display: 'block', padding: '16px 24px', borderRadius: '12px',
            background: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: '1.125rem',
            textDecoration: 'none', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)',
          }}>
            Call 988 (Suicide &amp; Crisis Lifeline)
          </a>
          <a href="sms:741741&body=HOME" style={{
            display: 'block', padding: '16px 24px', borderRadius: '12px',
            background: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: '1.125rem',
            textDecoration: 'none', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)',
          }}>
            Text HOME to 741741 (Crisis Text Line)
          </a>
        </div>

        <button
          onClick={handleBackToPortal}
          style={{
            padding: '12px 24px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem',
          }}
        >
          Back to Patient Portal
        </button>
      </div>
    )
  }

  return (
    <PlatformShell>
    <FeatureSubHeader
      title="AI Health Interview"
      icon={Mic}
      accentColor="#12706e"
      showDemo={false}
      nextStep={{ label: 'Patient Messaging', route: '/patient/messages' }}
    />
    <div className="nn">
      <div className="nn-hist">

        {/* Step indicator — one screen per step, always visible */}
        <div className="nn-step" aria-hidden="true">
          {[1, 2, 3, 4].map(n => (
            <i key={n} className={n <= currentStep ? 'on' : ''} />
          ))}
        </div>
        <p className="nn-hint" style={{ textAlign: 'center', marginBottom: 18 }}>
          Step {currentStep} of 4 — {STEP_LABELS[currentStep - 1]}
        </p>

        {/* ====== LOADING CONTEXT ====== */}
        {phase === 'loading_context' && (
          <div className="nn-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              border: '3px solid var(--nn-line)', borderTopColor: 'var(--nn-accent)',
              animation: 'nn-spin 1s linear infinite',
              margin: '0 auto 14px',
            }} />
            <p style={{ color: 'var(--nn-ink-2)', margin: 0 }}>Loading patient information...</p>
            <style>{`@keyframes nn-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ====== STEP 2 — CONSENT & IDENTITY (before the microphone) ====== */}
        {phase === 'scenario_select' && showConsentDisclosure && (
          <HistorianConsentDisclosure
            presentation="page"
            requireIdentity
            onConfirm={handleConsentConfirm}
            onCancel={handleConsentCancel}
          />
        )}

        {/* ====== STEP 1 — VISIT CONTEXT ====== */}
        {phase === 'scenario_select' && !showConsentDisclosure && (
          <>
            <h2 className="nn-hist-title">Start an AI Interview</h2>
            <p className="nn-lede">
              {sessionConfig
                ? 'Review your information below and begin your intake interview.'
                : referredMode
                  ? 'Loaded from triage — review below and start when ready.'
                  : 'Pick a demo scenario, type a referral reason, or start without a referral.'}
            </p>

            {error && (
              <div role="alert" className="nn-alert" style={{ marginTop: 0, marginBottom: 16 }}>
                {error}
              </div>
            )}

            {/* Referred-mode card — the primary confirmation surface that a
                triage → historian handoff succeeded. Occupies the same slot
                as the real-patient-context card below; mutually exclusive
                with it since sessionConfig (patient_id lookup) and a triage
                handoff are different entry sources. Tier and focus are
                rendered as opaque plain text — never color-coded or
                parsed — a self-contradictory tierDisplay string is shown
                verbatim rather than suppressed or reinterpreted. */}
            {!sessionConfig && referredMode && (
              <div
                className="nn-choice on"
                style={{ marginBottom: 20, cursor: 'default' }}
                data-testid="referred-mode-card"
              >
                <span className="nn-choice-tag">Referred from Triage</span>
                <span style={{ display: 'block', fontWeight: 650, marginBottom: 4 }}>
                  {referredCardContent.patientLabel}
                </span>
                {referredCardContent.tierLine && (
                  <span style={{ display: 'block', marginBottom: 4 }}>
                    {referredCardContent.tierLine}
                  </span>
                )}
                <span style={{ display: 'block' }}>
                  {referredCardContent.focusText}
                </span>
              </div>
            )}

            {/* Real patient context card */}
            {sessionConfig && (
              <div className="nn-choice on" style={{ marginBottom: 20, cursor: 'default' }}>
                <span className="nn-choice-tag">
                  {sessionConfig.sessionType === 'new_patient' ? 'New patient' : 'Follow-up'}
                </span>
                <span style={{ display: 'block', fontWeight: 650, marginBottom: 4 }}>
                  {sessionConfig.patientName}
                </span>
                {sessionConfig.referralReason && (
                  <span style={{ display: 'block', fontSize: 'var(--nn-fs-sm)', color: 'var(--nn-ink-2)' }}>
                    Referral: {sessionConfig.referralReason}
                  </span>
                )}
                {sessionConfig.patientContext && sessionConfig.patientContext.includes('Last visit:') && (
                  <span style={{ display: 'block', fontSize: 'var(--nn-fs-sm)', color: 'var(--nn-ink-2)' }}>
                    Prior visit: {sessionConfig.patientContext.split('Last visit: ')[1]?.split('\n')[0] || ''}
                  </span>
                )}
              </div>
            )}

            {/* Intake choices. Not
                rendered when a triage handoff is already loaded (referred
                mode collapses this behind a disclosure below instead). */}
            {!sessionConfig && !referredMode && (
              <>
                {initialMode === 'referred' && (
                  <p className="nn-hint" style={{ marginBottom: 14 }}>
                    No referral is loaded yet — score one on Triage, then continue here,
                    or start a demo below.
                  </p>
                )}
                {demoScenarioCards}
                {referralNoteCard}
                {openEndedCard}
              </>
            )}

            {/* Referred mode: same picker, collapsed behind a single
                disclosure (one escape hatch, not two) so a demo operator can
                still recover to the ordinary picker without it competing
                with the referred card above for attention. Closed by
                default. Picking a demo card here calls handleSelectScenario,
                which nulls referralInput/handoffDisplay — referredMode then
                goes false and the next render falls into the branch above
                instead of a separate state flag. */}
            {!sessionConfig && referredMode && (
              <details className="nn-card" style={{ marginBottom: 20 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--nn-accent-ink)' }}>
                  Use a different demo instead
                </summary>
                <div style={{ marginTop: 16 }}>
                  {demoScenarioCards}
                  {referralNoteCard}
                  {openEndedCard}
                </div>
              </details>
            )}

            {/* Internal-only engine selector (?internal=1) — never a patient control */}
            {showEngineToggle && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <VoiceProviderToggle value={voiceProvider} onChange={setVoiceProvider} />
              </div>
            )}

            <button
              onClick={handleStartInterview}
              disabled={!canStartInterview({ hasScenario: !!selectedScenario, hasSessionConfig: !!sessionConfig, hasReferral: !!referralInput, openEnded })}
              className="nn-btn nn-btn--block"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              Start Voice Interview
            </button>

            <p className="nn-prog">
              Takes about 8 minutes · Requires microphone access · You can pause or stop at any time
            </p>
          </>
        )}

        {/* ====== CONNECTING ====== */}
        {phase === 'connecting' && (
          <div className="nn-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'var(--nn-accent-wash)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
              animation: 'nn-pulse 2s infinite',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--nn-accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2" />
              </svg>
            </div>
            <h3 style={{ color: 'var(--nn-ink)', margin: '0 0 6px', fontSize: 'var(--nn-fs-lg)' }}>Connecting...</h3>
            <p style={{ color: 'var(--nn-ink-2)', margin: 0 }}>Setting up your voice interview</p>
          </div>
        )}

        {/* ====== STEP 3 — INTERVIEW ====== */}
        {(phase === 'active' || phase === 'ending') && (
          <HistorianInterviewStep
            phase={phase}
            turnNumber={currentQuestionNumber}
            turnCap={TURN_CAP}
            displayedQuestion={displayedQuestion}
            displayedHeard={displayedHeard}
            isAiSpeaking={isAiSpeaking}
            isUserSpeaking={isUserSpeaking}
            durationLabel={formatTime(duration)}
            transcript={transcript}
            showTranscript={showTranscript}
            onToggleTranscript={() => setShowTranscript(!showTranscript)}
            onEndInterview={handleEndInterview}
            transcriptEndRef={transcriptEndRef}
            formatTime={formatTime}
          />
        )}

        {/* ====== CLINICIAN MIRROR — physician differential ======
            Rendered only for an auth-gated clinician route. Updates on the
            Localizer's own cadence (every LOCALIZER_INTERVAL patient turns),
            which is the "watch it think" behaviour the /consult surface has. */}
        {clinicianMirror && (phase === 'active' || phase === 'ending') && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--nn-ink-3, #6b7280)',
              marginBottom: 8,
            }}>
              Physician view — not shown to the patient
            </div>
            <LocalizerPanel data={localizerData} isLoading={localizerLoading} />
          </div>
        )}

        {/* ====== STEP 4 — SUMMARY ====== */}
        {phase === 'complete' && completionData && (
          <HistorianReportView
            structuredOutput={completionData.structuredOutput}
            narrativeSummary={completionData.narrativeSummary}
            redFlags={completionData.redFlags}
            duration={completionData.duration}
            questionCount={completionData.questionCount}
            transcript={completionData.transcript}
            // This is the unauthenticated patient surface (/patient/historian)
            // — see design spec locked decision L1. DDx/thoroughness props
            // are never passed here; `surface="patient"` is now the
            // structural guarantee that HistorianReportView never renders
            // them even if that ever changes.
            surface="patient"
            theme="clinical"
            onStartAnother={handleStartAnother}
            onBackToPortal={handleBackToPortal}
          />
        )}
      </div>
    </div>
    </PlatformShell>
  )
}
