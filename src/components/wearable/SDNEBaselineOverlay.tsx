'use client'

export default function SDNEBaselineOverlay() {
  return (
    <div
      style={{
        background: 'rgba(59, 130, 246, 0.08)',
        borderLeft: '4px solid #3B82F6',
        borderRadius: '8px',
        padding: '16px',
        position: 'relative',
      }}
    >
      {/* MOCKUP badge */}
      <span
        style={{
          position: 'absolute',
          top: '10px',
          right: '12px',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '0.6rem',
          fontWeight: 700,
          color: '#3B82F6',
          background: 'rgba(59, 130, 246, 0.15)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        Mockup
      </span>

      {/* Title */}
      <h4
        style={{
          color: '#93C5FD',
          fontSize: '1rem',
          fontWeight: 600,
          margin: '0 0 12px 0',
        }}
      >
        SDNE Integration (Phase 2)
      </h4>

      {/* Markers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
        {/* Day 1 marker */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="#3B82F6"
            style={{ flexShrink: 0, marginTop: '2px' }}
          >
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
          <div>
            <div style={{ color: '#E2E8F0', fontSize: '0.85rem', fontWeight: 600 }}>
              Day 1 — Initial SDNE Exam
            </div>
            <div style={{ color: '#94A3B8', fontSize: '0.75rem', lineHeight: 1.5, marginTop: '2px' }}>
              Standardized Digital Neurological Examination establishes clinical baseline. Objective motor, sensory, and cognitive benchmarks recorded.
            </div>
          </div>
        </div>

        {/* Day 30 marker */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="#3B82F6"
            style={{ flexShrink: 0, marginTop: '2px' }}
          >
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
          <div>
            <div style={{ color: '#E2E8F0', fontSize: '0.85rem', fontWeight: 600 }}>
              Day 30 — Follow-up SDNE Exam
            </div>
            <div style={{ color: '#94A3B8', fontSize: '0.75rem', lineHeight: 1.5, marginTop: '2px' }}>
              Repeat examination quantifies interval change. AI correlates wearable trend data with objective exam findings.
            </div>
          </div>
        </div>
      </div>

      {/* Note */}
      <p
        style={{
          color: '#64748B',
          fontSize: '0.75rem',
          lineHeight: 1.5,
          margin: 0,
          fontStyle: 'italic',
        }}
      >
        Cross-card integration with Card 5 (SDNE). Clinical exam provides ground truth for AI interpretation of wearable data trends.
      </p>
    </div>
  )
}
