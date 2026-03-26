'use client'

import { useState, useEffect, useCallback } from 'react'

interface HistorianSessionSummary {
  id: string
  patient_name: string
  patient_id: string | null
  session_type: string
  created_at: string
  duration_seconds: number
  question_count: number
  red_flags: Array<{ flag: string; severity: string; context: string }> | null
  imported_to_note: boolean
  structured_output: Record<string, string> | null
  narrative_summary: string | null
  patient?: {
    id: string
    first_name: string
    last_name: string
    mrn: string
  } | null
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default function HistorianSessionsList() {
  const [sessions, setSessions] = useState<HistorianSessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/historian/save')
      if (res.ok) {
        const data = await res.json()
        // Filter to only completed sessions
        const completed = (data.sessions || []).filter(
          (s: HistorianSessionSummary) => s.structured_output !== null
        )
        setSessions(completed)
      }
    } catch (err) {
      console.error('[HistorianSessionsList] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const handleImportToNote = useCallback(async (session: HistorianSessionSummary) => {
    // We need a visit to import into — for now, show guidance
    // In a real flow, the physician would select the visit from the appointment
    setImportingId(session.id)

    // For demonstration, mark it as imported via a lightweight approach
    // In production, this would trigger via the visit's import-historian endpoint
    try {
      // Navigate to EHR with this patient to trigger the import flow there
      const patientId = session.patient?.id || session.patient_id
      if (patientId) {
        window.location.href = `/ehr?patient=${patientId}`
      }
    } catch {
      // Silently fail — not critical
    } finally {
      setImportingId(null)
    }
  }, [])

  if (loading) {
    return (
      <div style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted, #6B7280)' }}>
        Loading historian sessions...
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted, #6B7280)', fontStyle: 'italic' }}>
        No completed historian sessions found.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      {sessions.map(session => {
        const isExpanded = expandedId === session.id
        const hasRedFlags = session.red_flags && session.red_flags.length > 0
        const displayName = session.patient
          ? `${session.patient.first_name} ${session.patient.last_name}`
          : (session.patient_name || 'Patient')
        const chiefComplaint = session.structured_output?.chief_complaint || session.narrative_summary?.substring(0, 80) || 'No chief complaint'

        return (
          <div key={session.id} style={{
            background: 'var(--bg-white, #fff)',
            borderBottom: '1px solid var(--border, #e5e7eb)',
          }}>
            {/* Row */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : session.id)}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {/* Left indicators */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '32px', flexShrink: 0 }}>
                {hasRedFlags && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                )}
                {!hasRedFlags && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2">
                    <path d="M9.5 2A5.5 5.5 0 005 7.5c0 .88.21 1.71.58 2.45" />
                    <path d="M14.5 2A5.5 5.5 0 0120 7.5c0 .88-.21 1.71-.58 2.45" />
                    <path d="M12 2v20" />
                  </svg>
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary, #111827)' }}>
                    {displayName}
                  </span>
                  <span style={{
                    padding: '1px 5px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    background: session.session_type === 'new_patient' ? 'rgba(139,92,246,0.12)' : 'rgba(13,148,136,0.12)',
                    color: session.session_type === 'new_patient' ? '#7c3aed' : '#0d9488',
                  }}>
                    {session.session_type === 'new_patient' ? 'New' : 'F/U'}
                  </span>
                  {session.imported_to_note && (
                    <span style={{
                      padding: '1px 5px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 600,
                      background: 'rgba(34,197,94,0.12)',
                      color: '#16a34a',
                    }}>
                      Imported
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted, #6B7280)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {chiefComplaint}
                </div>
              </div>

              {/* Right meta */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #6B7280)' }}>
                  {formatDate(session.created_at)}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #9CA3AF)' }}>
                  {formatDuration(session.duration_seconds)} / {session.question_count}q
                </span>
              </div>

              {/* Expand chevron */}
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted, #9CA3AF)" strokeWidth="2"
                style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ padding: '0 16px 12px 58px' }}>
                {/* Red flags */}
                {hasRedFlags && (
                  <div style={{
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    marginBottom: '8px',
                  }}>
                    <div style={{ fontWeight: 600, fontSize: '11px', color: '#ef4444', marginBottom: '4px' }}>
                      Red Flags
                    </div>
                    {session.red_flags!.map((rf, i) => (
                      <div key={i} style={{ fontSize: '12px', color: 'var(--text-primary, #111827)', marginBottom: '1px' }}>
                        <span style={{
                          display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                          background: rf.severity === 'high' ? '#ef4444' : rf.severity === 'medium' ? '#f59e0b' : '#94a3b8',
                          marginRight: '4px',
                        }} />
                        {rf.flag}
                      </div>
                    ))}
                  </div>
                )}

                {/* Narrative summary */}
                {session.narrative_summary && (
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary, #4B5563)', lineHeight: 1.5, margin: '0 0 8px' }}>
                    {session.narrative_summary}
                  </p>
                )}

                {/* Import button */}
                {!session.imported_to_note && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleImportToNote(session)
                    }}
                    disabled={importingId === session.id}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      background: '#0d9488',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: importingId === session.id ? 'wait' : 'pointer',
                      opacity: importingId === session.id ? 0.6 : 1,
                    }}
                  >
                    {importingId === session.id ? 'Opening chart...' : 'Import to Note'}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
