'use client'

import {
  COMPREHENSIVE_HISTORY_DOMAINS,
  type HistorianStructuredOutput,
} from '@/lib/historianTypes'

interface HistoryCoverageCardProps {
  coverage: HistorianStructuredOutput['history_coverage'] | null | undefined
  ageYearsPatientReported?: number
  theme?: 'light' | 'dark'
}

const REASON_LABELS = {
  not_asked: 'Not asked',
  unknown: 'Patient unsure',
  declined: 'Patient declined',
  conflicting: 'Conflicting sources',
} as const

export default function HistoryCoverageCard({
  coverage,
  ageYearsPatientReported,
  theme = 'light',
}: HistoryCoverageCardProps) {
  const dark = theme === 'dark'
  const covered = new Set(coverage?.covered_domains ?? [])
  const gapByDomain = new Map((coverage?.missing_or_uncertain ?? []).map((gap) => [gap.domain, gap.reason]))
  const coveredCount = COMPREHENSIVE_HISTORY_DOMAINS.filter(({ id }) => covered.has(id)).length
  const gapCount = COMPREHENSIVE_HISTORY_DOMAINS.filter(({ id }) => gapByDomain.has(id)).length
  const unauditedCount = COMPREHENSIVE_HISTORY_DOMAINS.length - coveredCount - gapCount
  const auditComplete = coverage != null && unauditedCount === 0

  return (
    <section
      aria-label="Comprehensive history coverage"
      style={{
        border: dark ? '1px solid #334155' : '1px solid var(--border-color, #dbe3ea)',
        borderRadius: 10,
        padding: 14,
        background: dark ? '#0f172a' : 'var(--bg-white, #fff)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 750, fontSize: '0.85rem', color: dark ? '#e2e8f0' : 'var(--text-primary, #1e293b)' }}>
            Comprehensive history coverage
          </div>
          <div style={{ marginTop: 3, fontSize: '0.72rem', color: dark ? '#94a3b8' : 'var(--text-secondary, #64748b)' }}>
            Model-recorded coverage audit — physician verification required
          </div>
        </div>
        <span
          style={{
            borderRadius: 999,
            padding: '3px 8px',
            fontSize: '0.68rem',
            fontWeight: 750,
            color: auditComplete ? '#0f766e' : '#b45309',
            background: auditComplete ? 'rgba(13,148,136,0.1)' : 'rgba(245,158,11,0.12)',
            border: `1px solid ${auditComplete ? 'rgba(13,148,136,0.3)' : 'rgba(245,158,11,0.35)'}`,
          }}
        >
          {auditComplete ? 'Audit complete' : 'Review gaps'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <Metric label="Covered" value={coveredCount} color="#0f766e" dark={dark} />
        <Metric label="Important gaps" value={gapCount} color="#b45309" dark={dark} />
        <Metric label="Not audited" value={unauditedCount} color="#b91c1c" dark={dark} />
        {Number.isInteger(ageYearsPatientReported) && (
          <Metric label="Patient-reported age" value={ageYearsPatientReported!} color="#475569" dark={dark} />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(225px, 1fr))', gap: 7, marginTop: 12 }}>
        {COMPREHENSIVE_HISTORY_DOMAINS.map(({ id, label }) => {
          const reason = gapByDomain.get(id)
          const state = covered.has(id) ? 'covered' : reason ? 'gap' : 'unaudited'
          const color = state === 'covered' ? '#0f766e' : state === 'gap' ? '#b45309' : '#b91c1c'
          const stateLabel = state === 'covered' ? 'Covered' : reason ? REASON_LABELS[reason] : 'Not audited'
          return (
            <div
              key={id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 7,
                padding: '7px 8px',
                borderRadius: 7,
                background: dark ? '#111c2f' : '#f8fafc',
                border: dark ? '1px solid #253247' : '1px solid #e5eaf0',
              }}
            >
              <span aria-hidden="true" style={{ color, fontWeight: 900, lineHeight: 1.2 }}>
                {state === 'covered' ? '✓' : state === 'gap' ? '!' : '—'}
              </span>
              <div>
                <div style={{ fontSize: '0.73rem', fontWeight: 650, lineHeight: 1.25, color: dark ? '#dbe5f1' : '#334155' }}>{label}</div>
                <div style={{ fontSize: '0.64rem', marginTop: 2, color }}>{stateLabel}</div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Metric({ label, value, color, dark }: { label: string; value: number; color: string; dark: boolean }) {
  return (
    <div style={{ minWidth: 106, borderRadius: 7, padding: '7px 9px', background: dark ? '#111c2f' : '#f8fafc', border: dark ? '1px solid #253247' : '1px solid #e5eaf0' }}>
      <div style={{ fontSize: '1rem', lineHeight: 1, fontWeight: 800, color }}>{value}</div>
      <div style={{ marginTop: 3, fontSize: '0.62rem', color: dark ? '#94a3b8' : '#64748b' }}>{label}</div>
    </div>
  )
}
