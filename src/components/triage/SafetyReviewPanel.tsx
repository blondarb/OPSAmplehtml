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
        background: held ? 'rgba(127, 29, 29, 0.14)' : '#1e293b',
        borderRadius: '8px',
        border: `1px solid ${held ? '#991b1b' : '#334155'}`,
        marginBottom: '16px',
      }}
      aria-label="Safety workflow review"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <h3 style={{ color: '#f8fafc', fontSize: '0.9rem', margin: 0 }}>
          Safety Workflow
        </h3>
        <span style={{ color: held ? '#fca5a5' : '#86efac', fontSize: '0.75rem', fontWeight: 700 }}>
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
          <span key={key} style={{ color: '#cbd5e1', background: '#0f172a', border: '1px solid #334155', borderRadius: '999px', padding: '4px 8px', fontSize: '0.72rem' }}>
            {key}: {label(value)}
          </span>
        ))}
      </div>

      {(review.requiresAdjudication || review.warnings.length > 0) && (
        <div style={{ marginTop: '12px', color: '#fbbf24', fontSize: '0.78rem', lineHeight: 1.5 }}>
          {review.requiresAdjudication && <div>Mandatory human review: branch adjudication was required.</div>}
          {review.warnings.map((warning) => <div key={warning}>{warning}.</div>)}
        </div>
      )}

      {review.criticalUnknowns.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ color: '#f8fafc', fontSize: '0.78rem', fontWeight: 700 }}>Critical unknowns</div>
          <ul style={{ color: '#fcd34d', fontSize: '0.76rem', lineHeight: 1.5, margin: '6px 0 0', paddingLeft: '20px' }}>
            {review.criticalUnknowns.map((unknown) => <li key={unknown}>{unknown}</li>)}
          </ul>
        </div>
      )}

      {review.evidence.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ color: '#f8fafc', fontSize: '0.78rem', fontWeight: 700 }}>
            Time-critical source evidence
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
            {review.evidence.map((item, index) => (
              <blockquote key={`${item.startOffset}-${item.endOffset}-${index}`} style={{ margin: 0, padding: '8px 10px', background: '#0f172a', borderLeft: '3px solid #ef4444', borderRadius: '4px' }}>
                <div style={{ color: '#94a3b8', fontSize: '0.68rem', marginBottom: '4px' }}>
                  {label(item.syndrome)} · {label(item.action)} · {item.source === 'deterministic' ? 'Rule gateway' : 'Independent safety model'}
                  {item.pageNumber ? ` · Page ${item.pageNumber}` : ''}
                </div>
                <div style={{ color: '#e2e8f0', fontSize: '0.78rem', lineHeight: 1.5 }}>
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
