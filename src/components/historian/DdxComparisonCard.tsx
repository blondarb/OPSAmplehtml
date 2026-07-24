'use client'

import { INVESTIGATIONAL_BANNER } from '@/lib/historian/eval/constants'
import type { DifferentialItem, FinalDifferential } from '@/lib/historian/eval/finalDifferential'
import type { IndependentDifferential } from '@/lib/historian/eval/independentDdx'
import type { AgreementResult } from '@/lib/historian/eval/agreement'

export interface DdxComparisonCardProps {
  /** Task 2's pipeline differential (historian_sessions.final_differential). Null/undefined = pending. */
  finalDifferential: FinalDifferential | null | undefined
  /** Task 4's independent DeepSeek-R1 differential (historian_evaluations, evaluator='independent_ddx'). Null/undefined = pending. */
  independentDdx: IndependentDifferential | null | undefined
  /** Task 4's agreement metrics between the two above (historian_evaluations, evaluator='agreement'). Null/undefined = pending (or skipped — e.g. one side never completed). */
  agreement: AgreementResult | null | undefined
  /** Same turn-jump wiring as DifferentialCard's onQuoteClick — called with a cited turn index from either column. */
  onQuoteClick?: (turn: number) => void
}

const LIKELIHOOD_COLORS: Record<DifferentialItem['likelihood'], string> = {
  High: '#ef4444',
  Moderate: '#f59e0b',
  Low: '#64748b',
}

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function QuoteChips({
  quotes,
  onQuoteClick,
}: {
  quotes: DifferentialItem['supporting_quotes']
  onQuoteClick?: (turn: number) => void
}) {
  if (quotes.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {quotes.map((q, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onQuoteClick?.(q.turn)}
          disabled={!onQuoteClick}
          title={q.quote}
          style={{
            fontSize: '0.62rem',
            fontWeight: 700,
            color: '#8B5CF6',
            background: 'rgba(139,92,246,0.08)',
            border: '1px solid rgba(139,92,246,0.25)',
            borderRadius: 4,
            padding: '1px 5px',
            cursor: onQuoteClick ? 'pointer' : 'default',
          }}
        >
          Turn {q.turn}
        </button>
      ))}
    </div>
  )
}

function CompactDifferentialItem({
  item,
  rank,
  onQuoteClick,
}: {
  item: DifferentialItem
  rank: number
  onQuoteClick?: (turn: number) => void
}) {
  return (
    <li style={{ listStyle: 'none', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(100,116,139,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: '0.65rem', color: 'var(--text-secondary, #64748b)' }}>#{rank}</span>
        <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-primary, #1e293b)' }}>{item.diagnosis}</span>
        {item.icd10 && (
          <code
            style={{
              fontSize: '0.62rem',
              color: 'var(--text-secondary, #64748b)',
              background: 'rgba(100,116,139,0.12)',
              borderRadius: 4,
              padding: '0px 4px',
            }}
          >
            {item.icd10}
          </code>
        )}
        <span
          style={{
            fontSize: '0.6rem',
            fontWeight: 700,
            color: LIKELIHOOD_COLORS[item.likelihood],
            border: `1px solid ${LIKELIHOOD_COLORS[item.likelihood]}`,
            borderRadius: 4,
            padding: '0px 5px',
          }}
        >
          {item.likelihood} · {item.likelihood_pct}%
        </span>
      </div>
      {item.rationale && (
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748b)', margin: '3px 0 0', lineHeight: 1.35 }}>
          {item.rationale}
        </p>
      )}
      <QuoteChips quotes={item.supporting_quotes} onQuoteClick={onQuoteClick} />
    </li>
  )
}

function DifferentialColumn({
  title,
  modelBadge,
  differential,
  summary,
  provenance,
  pendingLabel,
  onQuoteClick,
}: {
  title: string
  modelBadge: string
  differential: DifferentialItem[] | undefined
  summary: string | undefined
  provenance: { model_id: string; prompt_version: string; generated_at: string } | undefined
  pendingLabel: string
  onQuoteClick?: (turn: number) => void
}) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-primary, #1e293b)' }}>
          {title}
        </span>
        <span
          style={{
            fontSize: '0.58rem',
            fontWeight: 700,
            color: '#0d9488',
            background: 'rgba(13,148,136,0.1)',
            border: '1px solid rgba(13,148,136,0.25)',
            borderRadius: 4,
            padding: '1px 5px',
          }}
        >
          {modelBadge}
        </span>
      </div>

      {!differential ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)', fontStyle: 'italic', margin: 0 }}>
          {pendingLabel}
        </p>
      ) : differential.length === 0 ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)', fontStyle: 'italic', margin: 0 }}>
          No differential was generated.
        </p>
      ) : (
        <>
          {summary && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-primary, #1e293b)', lineHeight: 1.4, margin: '0 0 8px' }}>
              {summary}
            </p>
          )}
          <ol style={{ margin: 0, padding: 0 }}>
            {differential.map((item, i) => (
              <CompactDifferentialItem key={i} item={item} rank={i + 1} onQuoteClick={onQuoteClick} />
            ))}
          </ol>
          {provenance && (
            <div style={{ marginTop: 4, fontSize: '0.6rem', color: 'var(--text-secondary, #64748b)' }}>
              {provenance.model_id} · {provenance.prompt_version} · {formatGeneratedAt(provenance.generated_at)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AgreementBadge({ agreement }: { agreement: AgreementResult | null | undefined }) {
  if (!agreement) {
    return (
      <span
        style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          color: 'var(--text-secondary, #64748b)',
          background: 'rgba(100,116,139,0.1)',
          border: '1px solid rgba(100,116,139,0.25)',
          borderRadius: 6,
          padding: '3px 8px',
        }}
      >
        Agreement pending
      </span>
    )
  }

  const pct = Math.round(agreement.jaccardTop3 * 100)
  const color = agreement.top1Match ? '#22c55e' : '#f59e0b'

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      <span
        style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          color,
          background: `${color}1a`,
          border: `1px solid ${color}66`,
          borderRadius: 6,
          padding: '3px 8px',
        }}
      >
        {agreement.top1Match ? 'Top-1 Match' : 'Top-1 Disagreement'}
      </span>
      <span
        style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          color: 'var(--text-secondary, #64748b)',
          background: 'rgba(100,116,139,0.1)',
          border: '1px solid rgba(100,116,139,0.25)',
          borderRadius: 6,
          padding: '3px 8px',
        }}
      >
        Top-3 overlap {agreement.top3Overlap}/3 · Jaccard {pct}%
      </span>
    </div>
  )
}

/**
 * Physician/QA-facing side-by-side comparison of the pipeline differential
 * (Task 2, Sonnet) and the independent differential (Task 4, DeepSeek-R1),
 * plus their agreement metrics — the cross-family independence check at
 * the heart of the validation suite. Never render on a patient-facing
 * surface. Same wiring pattern as DifferentialCard: nullable/undefined
 * props render a graceful pending state rather than an error.
 */
export default function DdxComparisonCard({
  finalDifferential,
  independentDdx,
  agreement,
  onQuoteClick,
}: DdxComparisonCardProps) {
  const disagreements = agreement?.disagreements ?? []
  const showDisagreementFlag = !!agreement && (!agreement.top1Match || disagreements.length > 0)

  return (
    <div
      style={{
        border: '1px solid rgba(139,92,246,0.3)',
        borderRadius: 10,
        padding: 14,
        background: 'rgba(139,92,246,0.04)',
      }}
    >
      <div
        style={{
          fontSize: '0.7rem',
          lineHeight: 1.4,
          color: '#8B5CF6',
          background: 'rgba(139,92,246,0.1)',
          border: '1px solid rgba(139,92,246,0.25)',
          borderRadius: 6,
          padding: '6px 9px',
          marginBottom: 12,
          fontWeight: 600,
        }}
      >
        {INVESTIGATIONAL_BANNER}
      </div>

      <div style={{ marginBottom: 12 }}>
        <AgreementBadge agreement={agreement} />
      </div>

      {showDisagreementFlag && (
        <div
          style={{
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 6,
            padding: '8px 10px',
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.68rem', color: '#f59e0b', marginBottom: disagreements.length > 0 ? 4 : 0 }}>
            Cross-model disagreement detected
          </div>
          {disagreements.map((d, i) => (
            <div key={i} style={{ fontSize: '0.7rem', color: 'var(--text-primary, #1e293b)', marginBottom: 2 }}>
              {d}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <DifferentialColumn
          title="Pipeline Differential"
          modelBadge="Sonnet"
          differential={finalDifferential?.differential}
          summary={finalDifferential?.summary}
          provenance={finalDifferential?.provenance}
          pendingLabel="Pipeline differential pending — the post-session review pass has not completed yet."
          onQuoteClick={onQuoteClick}
        />
        <div style={{ width: 1, background: 'rgba(100,116,139,0.15)', alignSelf: 'stretch' }} />
        <DifferentialColumn
          title="Independent Differential"
          modelBadge="DeepSeek-R1"
          differential={independentDdx?.differential}
          summary={independentDdx?.summary}
          provenance={independentDdx?.provenance}
          pendingLabel="Independent differential pending — the cross-family review pass has not completed yet."
          onQuoteClick={onQuoteClick}
        />
      </div>
    </div>
  )
}
