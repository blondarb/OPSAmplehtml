'use client'

/**
 * ClaraFeedbackReviewPanel — AI-suggested review of accumulated beta-tester
 * 👎 feedback on Clara's triage decisions (GET /api/ai/clara/feedback-review).
 *
 * SUGGEST-ONLY: clusters disagreements into themes and proposes concrete
 * script/rulebook edits for a human (Steve) to review — this panel and its
 * route NEVER apply anything to Clara's live prompts automatically.
 *
 * On-demand only for now — the "Regenerate" button re-fetches the route.
 * Scheduled 6-12h auto-generation (Steve's original ask: "check the
 * feedback every 6-12h") is a future phase; not built yet.
 *
 * Rendered as a tab from ClaraResultsHistoryView, the /rnd/clara/results
 * review page — "somewhere on the clara page, like our feedback is."
 */

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, ShieldAlert } from 'lucide-react'
import type { ClaraFeedbackReviewResult } from '@/lib/clara/feedbackReview'

const ACCENT = '#8B5CF6'

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function ClaraFeedbackReviewPanel() {
  const [result, setResult] = useState<ClaraFeedbackReviewResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/ai/clara/feedback-review')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFetchError(data?.error || `Failed to load feedback review (HTTP ${res.status})`)
        setResult(null)
      } else {
        setResult(data)
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const modelError = result?.error || null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          background: 'rgba(139,92,246,0.1)',
          border: `1px solid ${ACCENT}59`,
          borderRadius: 8,
          padding: 12,
          color: '#c4b5fd',
          fontSize: 12.5,
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
        }}
      >
        <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          AI-suggested from beta-tester feedback — review before acting. Clara&apos;s prompts are never changed automatically.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ color: '#94a3b8', fontSize: 13 }}>
          {result
            ? `${result.feedbackCount} feedback row${result.feedbackCount === 1 ? '' : 's'} reviewed · ${result.downCount} thumbs-down · generated ${fmtDate(result.generatedAt)}`
            : loading
              ? 'Analyzing accumulated feedback…'
              : ' '}
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: 'white',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          <RefreshCw size={13} />
          {loading ? 'Regenerating…' : 'Regenerate'}
        </button>
      </div>

      {fetchError && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, padding: 12, color: '#fca5a5', fontSize: 13 }}>
          {fetchError}
        </div>
      )}

      {modelError && (
        <div style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 8, padding: 12, color: '#fde68a', fontSize: 13 }}>
          {modelError}
        </div>
      )}

      {loading && !result && <div style={{ color: '#64748b', fontSize: 13 }}>Loading…</div>}

      {!loading && result && result.downCount === 0 && !modelError && (
        <div style={{ color: '#64748b', fontSize: 13 }}>{result.note || 'No thumbs-down feedback to review.'}</div>
      )}

      {result && result.themes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Themes</div>
          {result.themes.map((theme, i) => (
            <div
              key={`${theme.theme}-${i}`}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 14, fontSize: 13 }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700 }}>{theme.theme}</span>
                <span style={{ color: '#94a3b8', fontSize: 12 }}>
                  {theme.count} case{theme.count === 1 ? '' : 's'}
                </span>
              </div>
              {theme.whatWentWrong && (
                <div style={{ color: '#cbd5e1', marginBottom: 6 }}>
                  <strong style={{ color: '#94a3b8' }}>What went wrong: </strong>
                  {theme.whatWentWrong}
                </div>
              )}
              {theme.suggestedChange && (
                <div style={{ color: '#a78bfa' }}>
                  <strong style={{ color: '#94a3b8' }}>Suggested change: </strong>
                  {theme.suggestedChange}
                </div>
              )}
              {theme.exampleSessionIds.length > 0 && (
                <div style={{ color: '#64748b', fontSize: 11, marginTop: 6 }}>
                  Example sessions: {theme.exampleSessionIds.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {result && result.topFixes.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 14 }}>
          <div style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
            Top suggested fixes (prioritized)
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, color: '#e2e8f0', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {result.topFixes.map((fix, i) => (
              <li key={i}>{fix}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
