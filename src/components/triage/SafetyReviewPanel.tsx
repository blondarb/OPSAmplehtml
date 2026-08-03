'use client'

import type { TriageResult } from '@/lib/triage/types'
import { buildSafetyReviewViewModel } from '@/lib/triage/safetyReviewView'

function label(value: string | undefined): string {
  return value
    ? value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
    : 'Unknown'
}

export default function SafetyReviewPanel({ result }: { result: TriageResult }) {
  const review = buildSafetyReviewViewModel(result.safety_review)
  const held = result.scheduling_locked !== false

  return (
    <section
      style={{
        padding: '16px',
        background: held ? 'var(--nn-t1-bg)' : 'var(--nn-surface)',
        borderRadius: 'var(--nn-radius)',
        border: `1px solid ${held ? 'var(--nn-t1)' : 'var(--nn-line)'}`,
        marginBottom: '16px',
      }}
      aria-label="Safety workflow review"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <h3 style={{ color: 'var(--nn-ink)', fontSize: 'var(--nn-fs-base)', margin: 0 }}>
          Safety Workflow
        </h3>
        <span style={{ color: held ? 'var(--nn-t1)' : 'var(--nn-ink-3)', fontSize: 'var(--nn-fs-xs)', fontWeight: 700 }}>
          {held ? 'SCHEDULING LOCKED' : 'LOCK RELEASED'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
        {[
          ['Pathway', result.care_pathway],
          ['Data', result.data_quality],
          ['Coverage', result.coverage_status],
          ['Review', result.review_requirement],
          ['State', result.workflow_status],
        ].map(([key, value]) => (
          <span key={key} style={{ color: 'var(--nn-ink-2)', background: 'var(--nn-surface-2)', border: '1px solid var(--nn-line)', borderRadius: '999px', padding: '4px 8px', fontSize: 'var(--nn-fs-xs)' }}>
            {key}: {label(value)}
          </span>
        ))}
      </div>

      {(review.requiresAdjudication || review.warnings.length > 0) && (
        <div style={{ marginTop: '12px', color: 'var(--nn-t3)', fontSize: 'var(--nn-fs-xs)', lineHeight: 1.5 }}>
          {review.requiresAdjudication && <div>Mandatory human review: branch adjudication was required.</div>}
          {review.warnings.map((warning) => <div key={warning}>{warning}.</div>)}
        </div>
      )}

      {review.criticalUnknowns.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ color: 'var(--nn-ink)', fontSize: 'var(--nn-fs-xs)', fontWeight: 700 }}>Critical unknowns</div>
          <ul style={{ color: 'var(--nn-t3)', fontSize: 'var(--nn-fs-xs)', lineHeight: 1.5, margin: '6px 0 0', paddingLeft: '20px' }}>
            {review.criticalUnknowns.map((unknown) => <li key={unknown}>{unknown}</li>)}
          </ul>
        </div>
      )}

      {review.evidence.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ color: 'var(--nn-ink)', fontSize: 'var(--nn-fs-xs)', fontWeight: 700 }}>
            Time-critical source evidence
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
            {review.evidence.map((item, index) => (
              <blockquote key={`${item.startOffset}-${item.endOffset}-${index}`} style={{ margin: 0, padding: '8px 10px', background: 'var(--nn-surface)', borderLeft: '3px solid var(--nn-t1)', borderRadius: '4px' }}>
                <div style={{ color: 'var(--nn-ink-3)', fontSize: 'var(--nn-fs-xs)', marginBottom: '4px' }}>
                  {label(item.syndrome)} · {label(item.action)} · {item.source === 'deterministic' ? 'Rule gateway' : 'Independent safety model'}
                  {item.pageNumber ? ` · Page ${item.pageNumber}` : ''}
                </div>
                <div style={{ color: 'var(--nn-ink)', fontSize: 'var(--nn-fs-xs)', lineHeight: 1.5 }}>
                  “{item.quote}”
                </div>
              </blockquote>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
