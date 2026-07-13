'use client'

/**
 * ClaraResultsHistoryView — the /rnd/clara/results review page body.
 *
 * Lists past Clara test calls (clara_test_sessions, migrations/048) with
 * every classified turn rendered as a decision card, showing any feedback
 * already recorded (clara_test_feedback, migrations/049) and letting the
 * reviewer add more. R&D-only, synthetic data — never PHI.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bot, ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import ClaraDecisionCard from './ClaraDecisionCard'
import ClaraFeedbackReviewPanel from './ClaraFeedbackReviewPanel'
import type { ClaraFeedbackRow } from '@/lib/clara/feedbackTypes'
import type { ClaraTurn } from '@/hooks/useClaraVoiceSession'

const ACCENT = '#8B5CF6'

interface ClaraTestSessionRow {
  id: string
  test_label: string | null
  turns: ClaraTurn[]
  consult_type: string | null
  confidence: number | null
  urgency_level: string | null
  gate0_fired: boolean
  duration_seconds: number | null
  turn_count: number | null
  created_at: string
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function ClaraResultsHistoryView() {
  const [sessions, setSessions] = useState<ClaraTestSessionRow[]>([])
  const [feedbackBySession, setFeedbackBySession] = useState<Record<string, ClaraFeedbackRow[]>>({})
  const [loading, setLoading] = useState(true)
  const [pendingMigration, setPendingMigration] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<'history' | 'review'>('history')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPendingMigration(null)
    try {
      const [sessionsRes, feedbackRes] = await Promise.all([
        fetch('/api/ai/clara/log?limit=50'),
        fetch('/api/ai/clara/feedback?limit=500'),
      ])
      const sessionsData = await sessionsRes.json().catch(() => ({}))
      const feedbackData = await feedbackRes.json().catch(() => ({}))

      if (sessionsRes.status === 503 || feedbackRes.status === 503) {
        setPendingMigration(sessionsData?.error || feedbackData?.error || 'Required migration not applied.')
      } else if (!sessionsRes.ok) {
        setError(sessionsData?.error || `Failed to load sessions (HTTP ${sessionsRes.status})`)
      } else if (!feedbackRes.ok) {
        setError(feedbackData?.error || `Failed to load feedback (HTTP ${feedbackRes.status})`)
      }

      const loadedSessions: ClaraTestSessionRow[] = Array.isArray(sessionsData?.sessions) ? sessionsData.sessions : []
      setSessions(loadedSessions)

      const grouped: Record<string, ClaraFeedbackRow[]> = {}
      const loadedFeedback: ClaraFeedbackRow[] = Array.isArray(feedbackData?.feedback) ? feedbackData.feedback : []
      for (const fb of loadedFeedback) {
        if (!fb.session_id) continue
        ;(grouped[fb.session_id] ||= []).push(fb)
      }
      setFeedbackBySession(grouped)

      // Auto-expand the most recent session so a just-finished call is immediately visible.
      if (loadedSessions[0]) setExpanded({ [loadedSessions[0].id]: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)', color: 'white' }}>
      <FeatureSubHeader title="Clara Results & Feedback" icon={Bot} accentColor={ACCENT} badgeText="R&D" homeLink="/rnd/clara" />

      <div style={{ padding: '16px 24px 60px', maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
            Past test calls with Clara&apos;s triage decisions, confidence, and any 👍/👎 feedback logged so far.
          </p>
          <Link href="/rnd/clara" style={{ color: '#a78bfa', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            ← New test call
          </Link>
        </div>

        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'history' ? `2px solid ${ACCENT}` : '2px solid transparent',
              color: activeTab === 'history' ? 'white' : '#94a3b8',
              fontWeight: activeTab === 'history' ? 700 : 500,
              fontSize: 13,
              padding: '8px 10px',
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            Session History
          </button>
          <button
            onClick={() => setActiveTab('review')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'review' ? `2px solid ${ACCENT}` : '2px solid transparent',
              color: activeTab === 'review' ? 'white' : '#94a3b8',
              fontWeight: activeTab === 'review' ? 700 : 500,
              fontSize: 13,
              padding: '8px 10px',
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            Feedback Review
          </button>
        </div>

        {activeTab === 'review' && <ClaraFeedbackReviewPanel />}

        {activeTab === 'history' && (
          <>
            {pendingMigration && (
              <div style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 8, padding: 12, color: '#fde68a', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <TriangleAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>{pendingMigration}</div>
              </div>
            )}

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, padding: 12, color: '#fca5a5', fontSize: 13 }}>
                {error}
              </div>
            )}

            {loading && <div style={{ color: '#64748b', fontSize: 13 }}>Loading…</div>}

            {!loading && !pendingMigration && !error && sessions.length === 0 && (
              <div style={{ color: '#64748b', fontSize: 13 }}>No test calls logged yet — start one from the main test page.</div>
            )}

            {sessions.map((session) => {
              const isOpen = !!expanded[session.id]
              const sessionFeedback = feedbackBySession[session.id] || []
              const classifiedTurns = (session.turns || [])
                .map((t, i) => ({ turn: t, index: i }))
                .filter(({ turn }) => turn.role === 'user' && turn.classification)

              return (
                <div key={session.id} style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpanded((e) => ({ ...e, [session.id]: !e[session.id] }))}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      background: 'rgba(255,255,255,0.04)',
                      border: 'none',
                      color: 'white',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{session.test_label || fmtDate(session.created_at)}</span>
                      {session.consult_type && <span style={{ color: '#94a3b8', fontSize: 12 }}>{session.consult_type}</span>}
                      {session.gate0_fired && <span style={{ color: '#fca5a5', fontSize: 12, fontWeight: 700 }}>GATE 0</span>}
                      <span style={{ color: '#64748b', fontSize: 12 }}>{session.turn_count ?? 0} turns</span>
                      {typeof session.duration_seconds === 'number' && (
                        <span style={{ color: '#64748b', fontSize: 12 }}>{session.duration_seconds}s</span>
                      )}
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>
                      {sessionFeedback.length > 0 ? `${sessionFeedback.length} feedback` : 'no feedback yet'}
                    </span>
                  </button>

                  {isOpen && (
                    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {classifiedTurns.length === 0 && (
                        <div style={{ color: '#64748b', fontSize: 13 }}>No classified turns in this call.</div>
                      )}
                      {classifiedTurns.map(({ turn, index }, i) => (
                        <ClaraDecisionCard
                          key={index}
                          heading={`Turn ${i + 1} — "${turn.text.slice(0, 80)}${turn.text.length > 80 ? '…' : ''}"`}
                          decision={{
                            consultType: turn.classification!.consultType,
                            confidence: turn.classification!.confidence,
                            rationale: turn.classification!.rationale,
                            urgencyLevel: turn.classification!.urgencyLevel,
                            statLevel: turn.classification!.statLevel,
                            redFlags: turn.classification!.redFlags,
                            gate0Fired: !!turn.gate0?.fired,
                          }}
                          routingActionLabel={turn.classification!.routing?.label}
                          sessionId={session.id}
                          turnIndex={index}
                          existingFeedback={sessionFeedback.filter((fb) => fb.turn_index === index)}
                          onSubmitted={(row) =>
                            setFeedbackBySession((prev) => ({ ...prev, [session.id]: [row, ...(prev[session.id] || [])] }))
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
