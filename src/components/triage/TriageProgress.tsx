'use client'

import { useEffect, useState } from 'react'

/**
 * Staged progress display for the 50–60s model call (redesign brief Part 3:
 * never a dead button). Stages mirror the actual pipeline order; advancement
 * is elapsed-time based because the triage route is 202+poll with no
 * intermediate stage events (SSE was reverted in PR #111 — Amplify gateway
 * timeout). Long-packet extraction passes real progress via `detail`.
 */

const STAGES: Record<'extracting' | 'triaging', readonly string[]> = {
  extracting: [
    'Reading the referral',
    'Extracting clinical information',
    'Identifying key findings',
    'Building the clinical summary',
  ],
  triaging: [
    'Reading the referral',
    'Scoring the five dimensions',
    'Checking red-flag overrides',
    'Building the recommendation',
  ],
}

/** Seconds at which each stage becomes active. */
const STAGE_THRESHOLDS = [0, 10, 25, 40]

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface Props {
  mode: 'extracting' | 'triaging'
  /** Real progress line (long-packet extraction) — overrides the stage hint. */
  detail?: string
  onCancel?: () => void
}

export default function TriageProgress({ mode, detail, onCancel }: Props) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    setElapsed(0)
    const interval = setInterval(() => setElapsed(prev => prev + 1), 1000)
    return () => clearInterval(interval)
  }, [mode])

  const stages = STAGES[mode]
  const activeIndex = STAGE_THRESHOLDS.reduce(
    (active, threshold, index) => (elapsed >= threshold ? index : active),
    0,
  )

  return (
    <div className="nn-card nn-progress" aria-busy="true">
      <h3 className="nn-card-title">
        {mode === 'extracting' ? 'Extracting the referral' : 'Scoring the referral'}
      </h3>
      <p className="nn-hint">
        This model call typically takes 50–60 seconds. The rubric applied is
        shown with the result.
      </p>

      <div role="status" aria-live="polite">
        {stages.map((stage, index) => (
          <div
            key={stage}
            className={`nn-stage${index < activeIndex ? ' done' : ''}${index === activeIndex ? ' active' : ''}`}
          >
            <span className="nn-stage-dot" aria-hidden="true" />
            <span>
              {stage}
              {index === activeIndex ? '…' : ''}
            </span>
          </div>
        ))}
        {detail && (
          <p className="nn-progress-meta">{detail}</p>
        )}
      </div>

      <p className="nn-progress-meta nn-num">Elapsed {formatElapsed(elapsed)}</p>

      {onCancel && (
        <div style={{ marginTop: 14 }}>
          <button type="button" className="nn-btn--sec nn-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
