'use client'

import { useEffect } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

const DIMENSIONS = [
  {
    name: 'Symptom Acuity',
    weight: '30%',
    criteria: [
      { score: 5, desc: 'Acute onset (<24h), severe, potentially life-threatening' },
      { score: 4, desc: 'Subacute (days to 2 weeks), moderate, progressive' },
      { score: 3, desc: 'Gradual (2-8 weeks), moderate, non-progressive' },
      { score: 2, desc: 'Chronic (months), stable, mild-to-moderate' },
      { score: 1, desc: 'Chronic (years), stable, minimal impact' },
    ],
  },
  {
    name: 'Diagnostic Concern',
    weight: '25%',
    criteria: [
      { score: 5, desc: 'Possible life-threatening or rapidly progressive condition' },
      { score: 4, desc: 'Possible serious condition requiring timely diagnosis' },
      { score: 3, desc: 'Likely neurological condition requiring specialist evaluation' },
      { score: 2, desc: 'Known condition, stable, needs management optimization' },
      { score: 1, desc: 'Likely non-neurological or self-limiting' },
    ],
  },
  {
    name: 'Rate of Progression',
    weight: '20%',
    criteria: [
      { score: 5, desc: 'Rapidly progressive (hours to days)' },
      { score: 4, desc: 'Progressive over days to weeks' },
      { score: 3, desc: 'Progressive over weeks to months' },
      { score: 2, desc: 'Stable or slowly progressive over months to years' },
      { score: 1, desc: 'Stable, no progression' },
    ],
  },
  {
    name: 'Functional Impairment',
    weight: '15%',
    criteria: [
      { score: 5, desc: 'Unable to perform basic ADLs, bedbound, or unsafe' },
      { score: 4, desc: 'Significant ADL impairment (cannot drive, work)' },
      { score: 3, desc: 'Moderate impairment affecting work/daily activities' },
      { score: 2, desc: 'Mild impairment, most activities preserved' },
      { score: 1, desc: 'No functional impairment' },
    ],
  },
  {
    name: 'Red Flag Presence',
    weight: '10%',
    criteria: [
      { score: 5, desc: 'Multiple red flags present' },
      { score: 4, desc: 'One major red flag present' },
      { score: 3, desc: 'Possible red flag, needs clarification' },
      { score: 2, desc: 'No red flags, some concerning features' },
      { score: 1, desc: 'No red flags' },
    ],
  },
]

const TIER_THRESHOLDS = [
  { range: 'Emergent Override', tier: 'Tier 1 · Emergent', time: 'Redirect to ED', colorVar: 'var(--nn-t1)', bgVar: 'var(--nn-t1-bg)' },
  { range: '4.0 – 5.0', tier: 'Tier 2 · Urgent', time: 'Within 1 week', colorVar: 'var(--nn-t2)', bgVar: 'var(--nn-t2-bg)' },
  { range: '3.0 – 3.9', tier: 'Tier 3 · Semi-urgent', time: 'Within 2 weeks', colorVar: 'var(--nn-t3)', bgVar: 'var(--nn-t3-bg)' },
  { range: '2.5 – 2.9', tier: 'Tier 4 · Routine-priority', time: 'Within 4-6 weeks', colorVar: 'var(--nn-t4)', bgVar: 'var(--nn-t4-bg)' },
  { range: '1.5 – 2.4', tier: 'Tier 5 · Routine', time: 'Within 8-12 weeks', colorVar: 'var(--nn-t5)', bgVar: 'var(--nn-t5-bg)' },
  { range: '1.0 – 1.4', tier: 'Tier 6 · Non-urgent', time: 'Within 6 months', colorVar: 'var(--nn-t6)', bgVar: 'var(--nn-t6-bg)' },
  { range: 'Unable to score', tier: 'Tier 7 · Insufficient information', time: 'Return to referrer', colorVar: 'var(--nn-t7)', bgVar: 'var(--nn-t7-bg)' },
]

export default function AlgorithmModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      className="nn-modal-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nn-algorithm-title"
        className="nn-modal"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 id="nn-algorithm-title" style={{ fontSize: 'var(--nn-fs-lg)', fontWeight: 700, margin: 0 }}>
            Triage Algorithm
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="nn-btn--quiet"
            style={{ fontSize: '1.2rem', lineHeight: 1 }}
          >
            &times;
          </button>
        </div>

        <p style={{ color: 'var(--nn-ink-2)', fontSize: 'var(--nn-fs-sm)', marginBottom: '16px', lineHeight: 1.55 }}>
          The AI scores each clinical dimension 1-5 against the fixed rubric below. The application
          combines those scores using the published weights and maps the weighted total to a triage
          tier. Red flags and emergent conditions can override the calculated score. The rubric,
          weights, tier boundaries, and overrides never change between runs; the AI&apos;s reading
          of a borderline note may.
        </p>

        <p className="nn-num" style={{ color: 'var(--nn-ink-3)', fontSize: 'var(--nn-fs-xs)', marginBottom: '20px' }}>
          Formula: (Acuity &times; 0.30) + (Concern &times; 0.25) + (Progression &times; 0.20) + (Impairment &times; 0.15) + (Red Flags &times; 0.10)
        </p>

        {/* Dimensions */}
        {DIMENSIONS.map((dim) => (
          <div key={dim.name} style={{ marginBottom: '18px' }}>
            <h3 style={{ fontSize: 'var(--nn-fs-sm)', fontWeight: 650, margin: '0 0 8px', color: 'var(--nn-ink)' }}>
              {dim.name} <span style={{ color: 'var(--nn-ink-3)', fontWeight: 400 }}>({dim.weight})</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {dim.criteria.map((c) => (
                <div key={c.score} style={{ display: 'flex', gap: '10px', fontSize: 'var(--nn-fs-sm)' }}>
                  <span className="nn-num" style={{ color: 'var(--nn-ink)', fontWeight: 700, minWidth: '16px', textAlign: 'right' }}>
                    {c.score}
                  </span>
                  <span style={{ color: 'var(--nn-ink-2)' }}>{c.desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Tier mapping */}
        <h3 style={{ fontSize: 'var(--nn-fs-base)', fontWeight: 650, margin: '22px 0 12px', color: 'var(--nn-ink)' }}>
          Score &rarr; Tier Mapping
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {TIER_THRESHOLDS.map((t) => (
            <div key={t.range} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: 'var(--nn-fs-sm)',
              flexWrap: 'wrap',
            }}>
              <span style={{
                padding: '2px 10px',
                borderRadius: '4px',
                background: t.bgVar,
                color: t.colorVar,
                border: `1px solid ${t.colorVar}`,
                fontWeight: 700,
                minWidth: '190px',
                textAlign: 'left',
                fontSize: 'var(--nn-fs-xs)',
              }}>
                {t.tier}
              </span>
              <span className="nn-num" style={{ color: 'var(--nn-ink-3)', minWidth: '100px' }}>{t.range}</span>
              <span style={{ color: 'var(--nn-ink-2)' }}>{t.time}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="nn-btn nn-btn--sec nn-btn--block"
          style={{ marginTop: '24px' }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
