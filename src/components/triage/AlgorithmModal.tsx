'use client'

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
  { range: 'Emergent Override', tier: 'Emergent', time: 'Redirect to ED', color: '#DC2626' },
  { range: '4.0 – 5.0', tier: 'Urgent', time: 'Within 1 week', color: '#DC2626' },
  { range: '3.0 – 3.9', tier: 'Semi-urgent', time: 'Within 2 weeks', color: '#EA580C' },
  { range: '2.5 – 2.9', tier: 'Routine-priority', time: 'Within 4-6 weeks', color: '#CA8A04' },
  { range: '1.5 – 2.4', tier: 'Routine', time: 'Within 8-12 weeks', color: '#16A34A' },
  { range: '1.0 – 1.4', tier: 'Non-urgent', time: 'Within 6 months', color: '#2563EB' },
]

export default function AlgorithmModal({ open, onClose }: Props) {
  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '720px',
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto',
          background: '#0f172a',
          borderRadius: '12px',
          border: '1px solid #334155',
          padding: '32px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ color: '#e2e8f0', fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
            Triage Algorithm
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '1.2rem',
            }}
          >
            &times;
          </button>
        </div>

        <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '20px', lineHeight: 1.5 }}>
          The AI scores each clinical dimension 1-5. The application calculates a weighted score
          deterministically and maps it to a triage tier. Red flags and emergent conditions
          can override the calculated score.
        </p>

        <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '24px', fontStyle: 'italic' }}>
          Formula: (Acuity &times; 0.30) + (Concern &times; 0.25) + (Progression &times; 0.20) + (Impairment &times; 0.15) + (Red Flags &times; 0.10)
        </p>

        {/* Dimensions */}
        {DIMENSIONS.map((dim) => (
          <div key={dim.name} style={{ marginBottom: '20px' }}>
            <h3 style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, margin: '0 0 8px' }}>
              {dim.name} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({dim.weight})</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {dim.criteria.map((c) => (
                <div key={c.score} style={{ display: 'flex', gap: '10px', fontSize: '0.78rem' }}>
                  <span style={{
                    color: '#e2e8f0',
                    fontWeight: 700,
                    minWidth: '16px',
                    textAlign: 'right',
                  }}>
                    {c.score}
                  </span>
                  <span style={{ color: '#94a3b8' }}>{c.desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Tier mapping */}
        <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '24px 0 12px' }}>
          Score &rarr; Tier Mapping
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {TIER_THRESHOLDS.map((t) => (
            <div key={t.range} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '0.8rem',
            }}>
              <span style={{
                padding: '2px 10px',
                borderRadius: '4px',
                background: t.color,
                color: '#fff',
                fontWeight: 700,
                minWidth: '110px',
                textAlign: 'center',
                fontSize: '0.7rem',
              }}>
                {t.tier}
              </span>
              <span style={{ color: '#94a3b8', minWidth: '100px' }}>{t.range}</span>
              <span style={{ color: '#cbd5e1' }}>{t.time}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: '28px',
            padding: '10px 24px',
            borderRadius: '8px',
            background: '#334155',
            color: '#e2e8f0',
            border: '1px solid #475569',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
