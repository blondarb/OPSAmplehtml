'use client'

import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

/**
 * Step 3 of the patient historian flow — pure presentation (redesign brief
 * Part 4). All session state arrives via props from NeurologicHistorian; this
 * component owns no logic so the interview screen can be rendered (and
 * design-reviewed) without a live voice session.
 *
 * Non-negotiables encoded here:
 *  - the current question is ALWAYS visible as text (never voice-only)
 *  - a live "what we heard" transcript so the patient can catch a
 *    misunderstanding
 *  - unmistakable microphone state (listening / assistant speaking / wrapping up)
 *  - progress against the question cap, and an always-available way out
 */

export interface HistorianInterviewStepProps {
  phase: 'active' | 'ending'
  questionNumber: number
  questionCap: number
  /** The current question as text; null before the first question arrives. */
  displayedQuestion: string | null
  /** The latest patient utterance the system heard; null before the first. */
  displayedHeard: string | null
  isAiSpeaking: boolean
  isUserSpeaking: boolean
  durationLabel: string
  transcript: HistorianTranscriptEntry[]
  showTranscript: boolean
  onToggleTranscript: () => void
  onEndInterview: () => void
  transcriptEndRef?: React.Ref<HTMLDivElement>
  formatTime: (seconds: number) => string
}

export default function HistorianInterviewStep({
  phase,
  questionNumber,
  questionCap,
  displayedQuestion,
  displayedHeard,
  isAiSpeaking,
  isUserSpeaking,
  durationLabel,
  transcript,
  showTranscript,
  onToggleTranscript,
  onEndInterview,
  transcriptEndRef,
  formatTime,
}: HistorianInterviewStepProps) {
  return (
    <>
      {/* The current question, always visible as text — never voice-only */}
      <div className="nn-q">
        <p className="nn-eyebrow nn-num" style={{ marginBottom: 8 }}>
          Question {questionNumber} of up to {questionCap}
        </p>
        <p className="nn-q-text" aria-live="polite">
          {displayedQuestion ?? 'Waiting for the first question…'}
        </p>
      </div>

      {/* Microphone state — listening vs speaking vs wrapping up, unmistakable */}
      <div
        role="status"
        className={
          phase === 'ending'
            ? 'nn-mic nn-mic--idle'
            : isAiSpeaking
              ? 'nn-mic nn-mic--speaking'
              : 'nn-mic'
        }
      >
        <span
          className={`nn-dot${phase !== 'ending' && (isAiSpeaking || isUserSpeaking) ? ' nn-dot--pulse' : ''}`}
          aria-hidden="true"
        />
        {phase === 'ending'
          ? 'Wrapping up…'
          : isAiSpeaking
            ? 'The assistant is speaking'
            : isUserSpeaking
              ? 'Listening — we can hear you'
              : 'Listening — speak when you’re ready'}
        <span className="nn-num" style={{ marginLeft: 'auto', fontWeight: 500 }}>
          {durationLabel}
        </span>
      </div>

      {/* Live transcript of what the system heard */}
      <div className="nn-heard">
        <span className="nn-eyebrow" style={{ display: 'block', marginBottom: 5 }}>
          What we heard
        </span>
        {displayedHeard
          ? `“${displayedHeard}”`
          : 'Your answers appear here as you speak.'}
      </div>

      <p className="nn-hint" style={{ marginBottom: 14 }}>
        You can say &ldquo;please repeat that&rdquo; or &ldquo;that&rsquo;s not what I
        meant&rdquo; at any time — the assistant will adjust.
      </p>

      <div className="nn-ctlrow">
        <button
          onClick={onToggleTranscript}
          aria-expanded={showTranscript}
          className="nn-btn nn-btn--sec"
        >
          {showTranscript ? 'Hide' : 'Show'} Transcript ({transcript.length})
        </button>
        <button
          onClick={onEndInterview}
          disabled={phase === 'ending'}
          className="nn-btn nn-btn--sec"
          style={{ color: 'var(--nn-t1)', borderColor: 'var(--nn-t1)' }}
        >
          {phase === 'ending' ? 'Ending...' : 'End Interview'}
        </button>
      </div>

      {/* Full transcript */}
      {showTranscript && (
        <div style={{
          overflowY: 'auto',
          padding: '12px 0 0',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxHeight: '300px',
        }}>
          {transcript.map((entry, i) => (
            <div
              key={i}
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                background: entry.role === 'assistant' ? 'var(--nn-accent-wash)' : 'var(--nn-surface)',
                border: '1px solid var(--nn-line-2)',
                borderLeft: `3px solid ${entry.role === 'assistant' ? 'var(--nn-accent)' : 'var(--nn-ink-3)'}`,
              }}
            >
              <div className="nn-num" style={{
                fontSize: 'var(--nn-fs-xs)',
                color: entry.role === 'assistant' ? 'var(--nn-accent-ink)' : 'var(--nn-ink-3)',
                fontWeight: 600,
                marginBottom: '2px',
              }}>
                {entry.role === 'assistant' ? 'AI Historian' : 'You'} - {formatTime(entry.timestamp)}
              </div>
              <div style={{ color: 'var(--nn-ink-2)', fontSize: 'var(--nn-fs-sm)', lineHeight: 1.5 }}>
                {entry.text}
              </div>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      )}

      <p className="nn-prog">
        Question {questionNumber} of up to {questionCap} · you can stop at any time
      </p>
    </>
  )
}
