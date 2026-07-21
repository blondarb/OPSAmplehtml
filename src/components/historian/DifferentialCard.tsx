'use client'

import { INVESTIGATIONAL_BANNER } from '@/lib/historian/eval/constants'
import type { DifferentialItem, FinalDifferential } from '@/lib/historian/eval/finalDifferential'

export interface DifferentialCardProps {
  /**
   * The historian_sessions.final_differential column value. Null/undefined
   * means the async post-session evaluator hasn't completed (or never ran)
   * for this session yet — rendered as a pending state, never an error.
   */
  finalDifferential: FinalDifferential | null | undefined
  /**
   * Called when a physician clicks a cited turn number, so the parent can
   * jump the Task-1 transcript viewer (HistorianTranscriptViewer) to that
   * turn — e.g. expand it and pass the same index as `highlightIndex`.
   * Optional; the card renders standalone without it.
   */
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

function QuoteList({
  label,
  quotes,
  onQuoteClick,
}: {
  label: string
  quotes: DifferentialItem['supporting_quotes']
  onQuoteClick?: (turn: number) => void
}) {
  if (quotes.length === 0) return null
  return (
    <div style={{ marginTop: 6 }}>
      <div
        style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
          color: 'var(--text-secondary, #64748b)',
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {quotes.map((q, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onQuoteClick?.(q.turn)}
            disabled={!onQuoteClick}
            style={{
              textAlign: 'left',
              background: 'rgba(139,92,246,0.06)',
              border: '1px solid rgba(139,92,246,0.2)',
              borderRadius: 6,
              padding: '5px 8px',
              fontSize: '0.75rem',
              color: 'var(--text-primary, #1e293b)',
              cursor: onQuoteClick ? 'pointer' : 'default',
            }}
          >
            <span style={{ fontWeight: 700, color: '#8B5CF6', marginRight: 6 }}>Turn {q.turn}</span>
            &ldquo;{q.quote}&rdquo;
          </button>
        ))}
      </div>
    </div>
  )
}

function DifferentialItemRow({
  item,
  rank,
  onQuoteClick,
}: {
  item: DifferentialItem
  rank: number
  onQuoteClick?: (turn: number) => void
}) {
  return (
    <li style={{ marginBottom: 14, listStyle: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: '0.7rem', color: 'var(--text-secondary, #64748b)' }}>
          #{rank}
        </span>
        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary, #1e293b)' }}>
          {item.diagnosis}
        </span>
        {item.icd10 && (
          <code
            style={{
              fontSize: '0.7rem',
              color: 'var(--text-secondary, #64748b)',
              background: 'rgba(100,116,139,0.12)',
              borderRadius: 4,
              padding: '1px 5px',
            }}
          >
            {item.icd10}
          </code>
        )}
        <span
          style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            color: LIKELIHOOD_COLORS[item.likelihood],
            border: `1px solid ${LIKELIHOOD_COLORS[item.likelihood]}`,
            borderRadius: 4,
            padding: '1px 6px',
          }}
        >
          {item.likelihood} · {item.likelihood_pct}%
        </span>
      </div>

      {item.rationale && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-primary, #1e293b)', margin: '4px 0 0', lineHeight: 1.4 }}>
          {item.rationale}
        </p>
      )}

      <QuoteList label="Supporting evidence" quotes={item.supporting_quotes} onQuoteClick={onQuoteClick} />
      <QuoteList label="Contradicting evidence" quotes={item.contradicting_quotes} onQuoteClick={onQuoteClick} />
    </li>
  )
}

/**
 * Physician/QA-facing card for the final full-transcript differential
 * (Historian Validation Suite Task 2). Never render this on a
 * patient-facing surface — the historian interview itself never diagnoses;
 * this is a separate, post-session evaluation pass for retrospective
 * review.
 */
export default function DifferentialCard({ finalDifferential, onQuoteClick }: DifferentialCardProps) {
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

      {!finalDifferential ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontStyle: 'italic', margin: 0 }}>
          Final differential pending — the post-session review pass has not completed yet.
        </p>
      ) : finalDifferential.status === 'insufficient_transcript' ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontStyle: 'italic', margin: 0 }}>
          Insufficient transcript — differential not generated.
        </p>
      ) : finalDifferential.differential.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontStyle: 'italic', margin: 0 }}>
          No differential was generated for this session.
        </p>
      ) : (
        <>
          {finalDifferential.summary && (
            <p
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-primary, #1e293b)',
                lineHeight: 1.5,
                margin: '0 0 12px',
              }}
            >
              {finalDifferential.summary}
            </p>
          )}

          <ol style={{ margin: 0, padding: 0 }}>
            {finalDifferential.differential.map((item, i) => (
              <DifferentialItemRow key={i} item={item} rank={i + 1} onQuoteClick={onQuoteClick} />
            ))}
          </ol>

          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: '1px solid rgba(100,116,139,0.15)',
              fontSize: '0.65rem',
              color: 'var(--text-secondary, #64748b)',
            }}
          >
            {finalDifferential.provenance.model_id} · {finalDifferential.provenance.prompt_version} ·{' '}
            {formatGeneratedAt(finalDifferential.provenance.generated_at)}
            {finalDifferential.dropped_quotes > 0 && (
              <span> · {finalDifferential.dropped_quotes} quote(s) dropped (not verbatim)</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
