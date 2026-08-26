'use client'

import { useEffect, useState } from 'react'
import type {
  HistorianRedFlag,
  HistorianStructuredOutput,
  HistorianTerminationReason,
  HistorianTranscriptEntry,
} from '@/lib/historianTypes'
import { historianPatientCompletionPresentation } from '@/lib/historian/completionPresentation'
import type { FinalDifferential } from '@/lib/historian/eval/finalDifferential'
import type { IndependentDifferential } from '@/lib/historian/eval/independentDdx'
import type { AgreementResult } from '@/lib/historian/eval/agreement'
import type { ThoroughnessEvaluation } from '@/lib/historian/eval/thoroughnessJudge'
import IntakeReviewSection from './consult/IntakeReviewSection'
import HistorianTranscriptViewer from './historian/HistorianTranscriptViewer'
import DifferentialCard from './historian/DifferentialCard'
import DdxComparisonCard from './historian/DdxComparisonCard'
import HistoryCoverageCard from './historian/HistoryCoverageCard'

interface HistorianReportViewProps {
  structuredOutput: HistorianStructuredOutput | null
  narrativeSummary: string | null
  redFlags: HistorianRedFlag[]
  duration: number
  questionCount: number
  endedEarly: boolean
  terminationReason: HistorianTerminationReason
  /** Optional — included when available so the Patient Report fallback has more to work with. */
  transcript?: HistorianTranscriptEntry[]
  /**
   * Historian Validation Suite design spec locked decision L1: DDx/
   * thoroughness content is physician/QA-facing ONLY, never patient-facing.
   * REQUIRED (no default) so every call site must make an explicit choice.
   * `'physician'` renders the DifferentialCard/DdxComparisonCard/
   * thoroughness content below when the corresponding data is populated;
   * `'patient'` NEVER renders them, structurally — the render gate below
   * checks this prop directly, not whether the data props happen to be
   * populated. See the runtime invariant in the component body.
   */
  surface: 'physician' | 'patient'
  /**
   * Historian Validation Suite Task 2 — the post-session final differential
   * (historian_sessions.final_differential). Physician Report tab only;
   * never surfaced on the Patient Report tab. Undefined/null renders a
   * pending state (DifferentialCard's own default — this component doesn't
   * poll for it, since the async evaluator typically hasn't finished by
   * the moment this "Interview Complete" screen first renders).
   */
  finalDifferential?: FinalDifferential | null
  /**
   * Historian Validation Suite Task 4 — the independent DeepSeek-R1
   * differential and its agreement metrics against finalDifferential above.
   * Same optionality/pending-state handling as finalDifferential: neither
   * is fetched by this component, and (like finalDifferential) neither is
   * currently passed by NeurologicHistorian.tsx's call site either, since
   * the async eval pipeline typically hasn't finished by the moment this
   * "Interview Complete" screen first renders. DdxComparisonCard renders
   * its own pending state for null/undefined.
   */
  independentDdx?: IndependentDifferential | null
  agreement?: AgreementResult | null
  /**
   * Historian Validation Suite Task 3 — the thoroughness judge result. Not
   * currently wired to any rendered card here (no thoroughness UI exists on
   * this view yet), but included in the surface prop's contract now so a
   * future addition is automatically covered by the same structural guard
   * as finalDifferential/independentDdx/agreement, rather than needing a
   * second pass to remember the DDx/thoroughness-never-patient-facing rule.
   */
  thoroughness?: ThoroughnessEvaluation | null
  /**
   * Visual theme. 'dark' (default) — the original slate styling used on the
   * clinician /consult surfaces. 'clinical' — the light nn design system for
   * the patient-facing /patient/historian page (must render inside a `.nn`
   * scope). Content and structure are identical in both themes.
   */
  theme?: 'dark' | 'clinical'
  onStartAnother?: () => void
  onBackToPortal: () => void
}

type ReportTab = 'physician' | 'patient' | 'transcript'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default function HistorianReportView({
  structuredOutput,
  narrativeSummary,
  redFlags,
  duration,
  questionCount,
  endedEarly,
  terminationReason,
  transcript,
  surface,
  finalDifferential,
  independentDdx,
  agreement,
  thoroughness,
  theme = 'dark',
  onStartAnother,
  onBackToPortal,
}: HistorianReportViewProps) {
  // Patients land on their own plain-language summary; the intake detail
  // stays one tab away. Clinicians keep the physician report first.
  const [activeTab, setActiveTab] = useState<ReportTab>(
    surface === 'patient' ? 'patient' : 'physician',
  )
  const clinical = theme === 'clinical'
  const completionPresentation = historianPatientCompletionPresentation(
    endedEarly,
    terminationReason,
  )
  const [patientReport, setPatientReport] = useState<string | null>(null)
  const [patientReportLoading, setPatientReportLoading] = useState(true)
  const [patientReportError, setPatientReportError] = useState(false)

  // ── Structural DDx/thoroughness guard (design spec locked decision L1) ──
  // The PRIMARY control is that PhysicianReportTab below gates
  // DifferentialCard/DdxComparisonCard/thoroughness content directly on
  // `surface === 'physician'` — never on whether these values happen to be
  // populated. This block is a fail-safe backstop: if a future call site
  // mistakenly threads a populated DDx/thoroughness prop into a
  // surface="patient" instance, that is loudly caught here (console.error,
  // no patient text) rather than silently relying on "it happens not to
  // pass the props" — which is exactly the gap this fix closes. Never
  // throws in prod — throwing would break the patient's report view; the
  // refuse-to-render in PhysicianReportTab is the actual guard.
  if (
    surface !== 'physician' &&
    (finalDifferential != null || independentDdx != null || agreement != null || thoroughness != null)
  ) {
    console.error(
      '[HistorianReportView] SURFACE VIOLATION: surface="patient" but a physician-only prop ' +
        '(finalDifferential/independentDdx/agreement/thoroughness) was populated — refusing to ' +
        'render it. This must never happen; audit the call site that constructed these props.',
    )
  }

  // Generate the patient-facing recap once, on mount. A generator failure is
  // displayed as unavailable; transcript/notes are never relabeled as a
  // generated report.
  useEffect(() => {
    let cancelled = false

    async function generatePatientReport() {
      try {
        const res = await fetch('/api/ai/historian/patient-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structuredOutput, narrativeSummary, transcript }),
        })
        if (!res.ok) throw new Error(`patient-report request failed: ${res.status}`)
        const data = await res.json()
        if (cancelled) return
        if (data.unavailable === true) {
          setPatientReportError(true)
          setPatientReport('')
        } else {
          setPatientReport(data.patientReport || '')
        }
      } catch (err) {
        console.error('Failed to generate patient report:', err)
        if (cancelled) return
        setPatientReportError(true)
        setPatientReport('')
      } finally {
        if (!cancelled) setPatientReportLoading(false)
      }
    }

    void generatePatientReport()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generate once per completed interview
  }, [])

  const tabs: Array<{ key: ReportTab; label: string }> = surface === 'patient'
    ? [
        { key: 'patient', label: 'Your Summary' },
        { key: 'transcript', label: 'Interview Transcript' },
      ]
    : [
        { key: 'physician', label: 'Clinician History Report' },
        { key: 'transcript', label: 'Interview Transcript' },
      ]

  return (
    <div style={clinical
      ? { width: '100%' }
      : { maxWidth: '720px', margin: '0 auto', padding: '32px 24px', width: '100%' }}>
      {/* Success header */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '24px' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: completionPresentation.tone === 'warning'
            ? (clinical ? '#fffbeb' : 'rgba(245, 158, 11, 0.15)')
            : (clinical ? 'var(--nn-accent-wash)' : 'rgba(34, 197, 94, 0.15)'),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '16px',
        }}>
          {completionPresentation.tone === 'warning' ? (
            <span aria-hidden="true" style={{ color: '#b45309', fontSize: 28, fontWeight: 800 }}>!</span>
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={clinical ? 'var(--nn-accent-ink)' : '#22c55e'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
        <h2 style={{ color: clinical ? 'var(--nn-ink)' : '#fff', fontSize: '1.375rem', fontWeight: 700, margin: '0 0 8px' }}>
          {completionPresentation.title}
        </h2>
        <p style={{ color: clinical ? 'var(--nn-ink-2)' : '#94a3b8', fontSize: '0.9rem', margin: '0 0 16px', maxWidth: '440px' }}>
          {completionPresentation.body}
        </p>

        <div style={{ display: 'flex', gap: '32px' }}>
          <div>
            <div style={{ color: clinical ? 'var(--nn-accent-ink)' : '#0d9488', fontSize: '1.25rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatDuration(duration)}</div>
            <div style={{ color: clinical ? 'var(--nn-ink-3)' : '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duration</div>
          </div>
          <div>
            <div style={{ color: clinical ? 'var(--nn-accent-ink)' : '#0d9488', fontSize: '1.25rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{questionCount}</div>
            <div style={{ color: clinical ? 'var(--nn-ink-3)' : '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Questions</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: clinical ? '1px solid var(--nn-line)' : '1px solid #334155' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            aria-pressed={activeTab === tab.key}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              color: activeTab === tab.key
                ? (clinical ? 'var(--nn-accent-ink)' : '#5eead4')
                : (clinical ? 'var(--nn-ink-3)' : '#94a3b8'),
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              borderBottom: activeTab === tab.key
                ? (clinical ? '2px solid var(--nn-accent)' : '2px solid #0d9488')
                : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={clinical
        ? { background: 'var(--nn-surface)', border: '1px solid var(--nn-line)', borderRadius: '12px', padding: '20px', marginBottom: '24px', minHeight: '200px' }
        : { background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px', marginBottom: '24px', minHeight: '200px' }}>
        {activeTab === 'physician' ? (
          <PhysicianReportTab
            surface={surface}
            structuredOutput={structuredOutput}
            narrativeSummary={narrativeSummary}
            redFlags={redFlags}
            transcript={transcript}
            finalDifferential={finalDifferential}
            independentDdx={independentDdx}
            agreement={agreement}
            endedEarly={endedEarly}
            terminationReason={terminationReason}
          />
        ) : activeTab === 'transcript' ? (
          transcript && transcript.length > 0 ? (
            <HistorianTranscriptViewer entries={transcript} />
          ) : (
            <p style={{ color: clinical ? 'var(--nn-ink-3)' : '#64748B', fontSize: 13, margin: 0 }}>
              No interview transcript is available.
            </p>
          )
        ) : (
          <PatientReportTab
            loading={patientReportLoading}
            error={patientReportError}
            report={patientReport}
            narrativeSummary={narrativeSummary}
            clinical={clinical}
          />
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {onStartAnother && (
          <button
            onClick={onStartAnother}
            className={clinical ? 'nn-btn nn-btn--sec' : undefined}
            style={clinical ? undefined : {
              padding: '12px 24px', borderRadius: '8px',
              background: '#1e293b', border: '1px solid #334155',
              color: '#e2e8f0', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
            }}
          >
            Start Another Interview
          </button>
        )}
        <button
          onClick={onBackToPortal}
          className={clinical ? 'nn-btn' : undefined}
          style={clinical ? undefined : {
            padding: '12px 24px', borderRadius: '8px',
            background: '#0d9488', border: 'none',
            color: '#fff', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
          }}
        >
          Back to Patient Portal
        </button>
      </div>
    </div>
  )
}

// ── Physician Report tab ─────────────────────────────────────────────

interface PhysicianReportTabProps {
  surface: 'physician' | 'patient'
  structuredOutput: HistorianStructuredOutput | null
  narrativeSummary: string | null
  redFlags: HistorianRedFlag[]
  transcript?: HistorianTranscriptEntry[]
  finalDifferential?: FinalDifferential | null
  independentDdx?: IndependentDifferential | null
  agreement?: AgreementResult | null
  endedEarly: boolean
  terminationReason: HistorianTerminationReason
}

function PhysicianReportTab({
  surface,
  structuredOutput,
  narrativeSummary,
  redFlags,
  transcript,
  finalDifferential,
  independentDdx,
  agreement,
  endedEarly,
  terminationReason,
}: PhysicianReportTabProps) {
  // Turn-link state: clicking a cited quote in DifferentialCard jumps the
  // transcript viewer below to that turn (see HistorianTranscriptViewer's
  // highlightIndex prop).
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null)
  const adaptiveReportPending =
    (structuredOutput?.interview_prompt_version === 'comprehensive-v3' ||
      structuredOutput?.interview_prompt_version === 'comprehensive-v4') &&
    !narrativeSummary

  return (
    <div>
      {redFlags.length > 0 && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 12,
        }}>
          <div style={{ color: '#f87171', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Red Flags Detected
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {redFlags.map((flag, i) => (
              <div key={i} style={{ fontSize: 12.5, color: '#fecaca' }}>
                <span style={{ fontWeight: 600, textTransform: 'uppercase', marginRight: 6 }}>[{flag.severity}]</span>
                {flag.flag}
                {flag.context && <span style={{ color: '#fca5a5' }}> — {flag.context}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {(!structuredOutput && !narrativeSummary) || adaptiveReportPending ? (
        <div role="status" style={{
          background: '#0F172A',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: 16,
          color: '#CBD5E1',
          fontSize: 13,
          lineHeight: 1.5,
        }}>
          {surface === 'patient'
            ? 'Your interview summary is not available yet. Your answers were preserved for your neurologist to review.'
            : 'Clinician history report generation is pending. Verified interview evidence and the separate transcript were preserved for review.'}
        </div>
      ) : (
        <IntakeReviewSection
          consult={{
            historian_structured_output: structuredOutput as Record<string, unknown> | null,
            historian_summary: narrativeSummary,
            interview_completion_status: endedEarly ? 'ended_early' : 'complete',
            interview_termination_reason: terminationReason,
          }}
        />
      )}

      {surface === 'physician' && adaptiveReportPending && structuredOutput?.current_medications && (
        <div style={{
          marginTop: 16,
          background: '#0F172A',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: 16,
          color: '#E2E8F0',
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Verified medication reconciliation</div>
          {structuredOutput.current_medications}
        </div>
      )}

      {surface === 'physician' &&
        (structuredOutput?.interview_prompt_version === 'comprehensive-v3' ||
          structuredOutput?.interview_prompt_version === 'comprehensive-v4') &&
        structuredOutput.medication_reconciliation_has_uncertainty === true && (
          <div role="alert" style={{
            marginTop: 16,
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.55)',
            borderRadius: 8,
            padding: 16,
            color: '#FDE68A',
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Medication reconciliation needs review</div>
            Medication reconciliation has unresolved information; review the interview transcript.
          </div>
        )}

      {surface === 'physician' && structuredOutput?.interview_mode === 'comprehensive' && (
        <div style={{ marginTop: 16 }}>
          <HistoryCoverageCard
            coverage={structuredOutput.history_coverage}
            ageYearsPatientReported={structuredOutput.age_years_patient_reported}
            theme="dark"
          />
        </div>
      )}

      {/* Design spec locked decision L1: DDx/thoroughness content is
          physician/QA-facing ONLY, never patient-facing. Gated directly on
          `surface`, never on whether finalDifferential/independentDdx/
          agreement happen to be populated — see HistorianReportView's
          runtime invariant for the defense-in-depth backstop that catches a
          call site which mistakenly populates these on a patient surface. */}
      {surface === 'physician' && (
        <>
          <div style={{ marginTop: 16 }}>
            <DifferentialCard
              finalDifferential={finalDifferential}
              onQuoteClick={(turn) => setHighlightIndex(turn)}
            />
          </div>

          {/* Cross-family comparison (Historian Validation Suite Task 4) —
              pipeline (Sonnet) vs independent (DeepSeek-R1) + agreement. */}
          <div style={{ marginTop: 16 }}>
            <DdxComparisonCard
              finalDifferential={finalDifferential}
              independentDdx={independentDdx}
              agreement={agreement}
              onQuoteClick={(turn) => setHighlightIndex(turn)}
            />
          </div>
        </>
      )}

      {highlightIndex != null && transcript && transcript.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <HistorianTranscriptViewer entries={transcript} highlightIndex={highlightIndex} />
        </div>
      )}
    </div>
  )
}

// ── Patient Report tab ───────────────────────────────────────────────

interface PatientReportTabProps {
  loading: boolean
  error: boolean
  report: string | null
  narrativeSummary: string | null
  clinical?: boolean
}

function PatientReportTab({ loading, error, report, narrativeSummary, clinical = false }: PatientReportTabProps) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: clinical ? '3px solid var(--nn-line)' : '3px solid #334155',
          borderTopColor: clinical ? 'var(--nn-accent)' : '#0d9488',
          animation: 'spin 1s linear infinite',
          marginBottom: '12px',
        }} />
        <p style={{ color: clinical ? 'var(--nn-ink-2)' : '#94a3b8', fontSize: '0.85rem' }}>Preparing your summary...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const text = report ?? narrativeSummary ?? ''

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={clinical ? 'var(--nn-accent-ink)' : '#0D9488'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.42 4.58a5.4 5.4 0 00-7.65 0L12 5.35l-.77-.77a5.4 5.4 0 10-7.65 7.65L4.35 13l7.65 7.65L19.65 13l.77-.77a5.4 5.4 0 000-7.65z" />
        </svg>
        <h4 style={{ color: clinical ? 'var(--nn-ink)' : '#E2E8F0', fontSize: clinical ? 15 : 14, fontWeight: 700, margin: 0 }}>
          Here&apos;s a Summary of What You Shared
        </h4>
      </div>

      {text ? (
        <div style={clinical
          ? { background: 'var(--nn-surface-2)', border: '1px solid var(--nn-line)', borderRadius: 8, padding: 16 }
          : { background: '#0F172A', border: '1px solid rgba(13,148,136,0.3)', borderRadius: 8, padding: 16 }}>
          <p style={{ color: clinical ? 'var(--nn-ink)' : '#CBD5E1', fontSize: clinical ? 15 : 13.5, margin: 0, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {text}
          </p>
        </div>
      ) : (
        <div style={clinical
          ? { background: 'var(--nn-surface-2)', border: '1px solid var(--nn-line)', borderRadius: 8, padding: 16, textAlign: 'center' as const }
          : { background: '#0F172A', border: '1px solid #334155', borderRadius: 8, padding: 16, textAlign: 'center' as const }}>
          <p style={{ color: clinical ? 'var(--nn-ink-3)' : '#64748B', fontSize: 13, margin: 0 }}>
            No summary is available for this interview yet.
          </p>
        </div>
      )}

      {error && (
        <p style={{ color: clinical ? 'var(--nn-ink-3)' : '#64748b', fontSize: '0.7rem', marginTop: 10 }}>
          We couldn&apos;t generate a personalized summary right now. Your interview transcript was still preserved for the clinic.
        </p>
      )}

      <p style={{ color: clinical ? 'var(--nn-ink-2)' : '#64748b', fontSize: clinical ? '0.845rem' : '0.75rem', marginTop: 14, lineHeight: 1.5 }}>
        Your neurologist will review this information before your visit. If you have questions, please contact your doctor&apos;s office. If this is a medical emergency, call 911.
      </p>
    </div>
  )
}
