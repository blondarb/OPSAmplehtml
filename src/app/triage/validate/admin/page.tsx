'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { Settings, Plus, Play, Trash2, Check, AlertCircle, Upload, Loader2 } from 'lucide-react'
import { TIER_DISPLAY, TriageTier } from '@/lib/triage/types'
import Link from 'next/link'

interface CaseRow {
  id: string
  case_number: number
  title: string
  referral_text: string
  patient_age: number | null
  patient_sex: string | null
  ai_triage_tier: string | null
  ai_weighted_score: number | null
  ai_subspecialty: string | null
  ai_confidence: string | null
  is_calibration: boolean
  active: boolean
  study_name: string
}

interface ProcessResult {
  case_number: number
  title: string
  status: 'success' | 'error'
  ai_tier?: string
  ai_score?: number
  error?: string
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [cases, setCases] = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'list' | 'single' | 'bulk'>('list')

  // Single note form
  const [noteTitle, setNoteTitle] = useState('')
  const [noteText, setNoteText] = useState('')
  const [noteAge, setNoteAge] = useState('')
  const [noteSex, setNoteSex] = useState('')
  const [noteCalibration, setNoteCalibration] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processMessage, setProcessMessage] = useState('')

  // Bulk paste form
  const [bulkText, setBulkText] = useState('')
  const [bulkDelimiter, setBulkDelimiter] = useState('---')
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [bulkResults, setBulkResults] = useState<ProcessResult[]>([])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/triage/validate/admin')
    }
  }, [user, authLoading, router])

  const fetchCases = useCallback(async () => {
    try {
      const res = await fetch('/api/triage/validate/cases')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setCases(data.cases || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) fetchCases()
  }, [user, fetchCases])

  // Run single note through AI and add as case
  async function handleAddSingle() {
    if (!noteText.trim()) return
    setProcessing(true)
    setProcessMessage('')

    try {
      const res = await fetch('/api/triage/validate/cases/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referral_text: noteText,
          title: noteTitle || undefined,
          patient_age: noteAge ? parseInt(noteAge) : undefined,
          patient_sex: noteSex || undefined,
          is_calibration: noteCalibration,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to process')
      }

      const data = await res.json()
      const result = data.results?.[0]

      if (result?.status === 'success') {
        setProcessMessage(`Case ${result.case_number} created — AI Tier: ${result.ai_tier || 'N/A'}`)
        setNoteTitle('')
        setNoteText('')
        setNoteAge('')
        setNoteSex('')
        setNoteCalibration(false)
        await fetchCases()
      } else {
        throw new Error(result?.error || 'Processing failed')
      }
    } catch (err) {
      setProcessMessage(err instanceof Error ? err.message : 'Failed')
    } finally {
      setProcessing(false)
    }
  }

  // Run bulk notes through AI
  async function handleBulkProcess() {
    if (!bulkText.trim()) return

    const notes = bulkText
      .split(bulkDelimiter)
      .map(n => n.trim())
      .filter(n => n.length > 0)

    if (notes.length === 0) return

    setBulkProcessing(true)
    setBulkResults([])

    try {
      const res = await fetch('/api/triage/validate/cases/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: notes.map((text, i) => ({
            referral_text: text,
            title: `Case (Batch ${i + 1})`,
          })),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Batch processing failed')
      }

      const data = await res.json()
      setBulkResults(data.results || [])
      await fetchCases()
    } catch (err) {
      setBulkResults([{
        case_number: 0,
        title: 'Error',
        status: 'error',
        error: err instanceof Error ? err.message : 'Batch failed',
      }])
    } finally {
      setBulkProcessing(false)
    }
  }

  if (authLoading || loading) {
    return (
      <PlatformShell>
        <FeatureSubHeader title="Validation Admin" icon={Settings} accentColor="#8B5CF6" homeLink="/triage/validate" />
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <p style={{ color: '#94a3b8' }}>Loading...</p>
        </div>
      </PlatformShell>
    )
  }

  return (
    <PlatformShell>
      <FeatureSubHeader
        title="Validation Admin"
        icon={Settings}
        accentColor="#8B5CF6"
        homeLink="/triage/validate"
        nextStep={{ label: 'Reviewer Page', route: '/triage/validate' }}
      />
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 24px' }}>

          {/* Header */}
          <div style={{ marginBottom: '24px' }}>
            <h1 style={{ color: '#f1f5f9', fontSize: '1.5rem', fontWeight: 700, margin: '0 0 8px' }}>
              Validation Study Admin
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.6, margin: '0 0 16px' }}>
              Add clinical notes to the validation study. Each note is automatically run through the AI triage
              algorithm so the AI baseline is ready when reviewers complete their assessments.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Link href="/triage/validate" style={{
                padding: '6px 14px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 500,
                background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)',
                color: '#8B5CF6', textDecoration: 'none',
              }}>
                Reviewer Page
              </Link>
              <Link href="/triage/validate/results" style={{
                padding: '6px 14px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 500,
                background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)',
                color: '#8B5CF6', textDecoration: 'none',
              }}>
                View Results
              </Link>
            </div>
          </div>

          {/* Stats bar */}
          <div style={{
            display: 'flex', gap: '16px', marginBottom: '24px',
          }}>
            {[
              { label: 'Total Cases', value: cases.length, color: '#8B5CF6' },
              { label: 'With AI Results', value: cases.filter(c => c.ai_triage_tier).length, color: '#16A34A' },
              { label: 'Calibration', value: cases.filter(c => c.is_calibration).length, color: '#F59E0B' },
              { label: 'Missing AI', value: cases.filter(c => !c.ai_triage_tier).length, color: '#EF4444' },
            ].map(stat => (
              <div key={stat.label} style={{
                flex: 1, background: 'rgba(30, 41, 59, 0.8)', border: '1px solid #334155',
                borderRadius: '10px', padding: '14px 16px',
              }}>
                <div style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                  {stat.label}
                </div>
                <div style={{ color: stat.color, fontSize: '1.5rem', fontWeight: 700 }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Mode Tabs */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
            {[
              { key: 'list' as const, label: 'Case List', icon: null },
              { key: 'single' as const, label: 'Add Single Note', icon: Plus },
              { key: 'bulk' as const, label: 'Bulk Add', icon: Upload },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setMode(tab.key)}
                style={{
                  padding: '8px 18px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600,
                  background: mode === tab.key ? '#8B5CF6' : 'rgba(30, 41, 59, 0.6)',
                  color: mode === tab.key ? '#fff' : '#94a3b8',
                  border: mode === tab.key ? '1px solid #8B5CF6' : '1px solid #334155',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                {tab.icon && <tab.icon size={14} />}
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Add Single Note ── */}
          {mode === 'single' && (
            <div style={{
              background: 'rgba(30, 41, 59, 0.6)', border: '1px solid #334155',
              borderRadius: '12px', overflow: 'hidden',
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
                <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 4px' }}>
                  Add Note & Run AI Triage
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.75rem', margin: 0 }}>
                  Paste a referral note. The AI will triage it and the case will be added to the validation pool.
                </p>
              </div>

              <div style={{ padding: '16px 20px' }}>
                {/* Title */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Case Title (optional — auto-generated if blank)
                  </label>
                  <input
                    value={noteTitle}
                    onChange={e => setNoteTitle(e.target.value)}
                    placeholder="e.g. Headache Referral — 45yo F"
                    style={{
                      width: '100%', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155',
                      borderRadius: '6px', color: '#e2e8f0', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                {/* Metadata row */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Patient Age
                    </label>
                    <input
                      type="number"
                      value={noteAge}
                      onChange={e => setNoteAge(e.target.value)}
                      placeholder="e.g. 45"
                      style={{
                        width: '100%', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155',
                        borderRadius: '6px', color: '#e2e8f0', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Sex
                    </label>
                    <select
                      value={noteSex}
                      onChange={e => setNoteSex(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155',
                        borderRadius: '6px', color: '#e2e8f0', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box',
                        fontFamily: 'inherit',
                      }}
                    >
                      <option value="">Not specified</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={noteCalibration}
                        onChange={e => setNoteCalibration(e.target.checked)}
                        style={{ accentColor: '#F59E0B' }}
                      />
                      <span style={{ color: '#F59E0B', fontSize: '0.72rem', fontWeight: 600 }}>Calibration</span>
                    </label>
                  </div>
                </div>

                {/* Referral text */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Referral Note Text *
                  </label>
                  <textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Paste the full referral note here..."
                    style={{
                      width: '100%', minHeight: '160px', padding: '10px 12px', background: '#0f172a',
                      border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.8rem',
                      lineHeight: 1.6, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ color: '#475569', fontSize: '0.7rem', marginTop: '4px' }}>
                    {noteText.length} characters
                  </div>
                </div>

                {/* Submit */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {processMessage && (
                    <span style={{
                      color: processMessage.includes('created') ? '#16A34A' : '#EF4444',
                      fontSize: '0.8rem', fontWeight: 500,
                    }}>
                      {processMessage}
                    </span>
                  )}
                  <div style={{ marginLeft: 'auto' }} />
                  <button
                    onClick={handleAddSingle}
                    disabled={!noteText.trim() || processing}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '10px 24px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
                      background: !noteText.trim() || processing ? '#334155' : '#8B5CF6',
                      color: !noteText.trim() || processing ? '#64748b' : '#fff',
                      border: 'none', cursor: !noteText.trim() || processing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {processing ? (
                      <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Running AI Triage...</>
                    ) : (
                      <><Play size={14} /> Run AI & Add Case</>
                    )}
                  </button>
                </div>
              </div>

              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── Bulk Add ── */}
          {mode === 'bulk' && (
            <div style={{
              background: 'rgba(30, 41, 59, 0.6)', border: '1px solid #334155',
              borderRadius: '12px', overflow: 'hidden',
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
                <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 4px' }}>
                  Bulk Add Notes
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.75rem', margin: 0 }}>
                  Paste multiple referral notes separated by a delimiter. Each note will be independently triaged by the AI.
                </p>
              </div>

              <div style={{ padding: '16px 20px' }}>
                {/* Delimiter setting */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Delimiter (separator between notes)
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {['---', '===', '***', '###'].map(d => (
                      <button
                        key={d}
                        onClick={() => setBulkDelimiter(d)}
                        style={{
                          padding: '4px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                          background: bulkDelimiter === d ? '#8B5CF6' : 'rgba(15, 23, 42, 0.5)',
                          color: bulkDelimiter === d ? '#fff' : '#94a3b8',
                          border: bulkDelimiter === d ? '1px solid #8B5CF6' : '1px solid #334155',
                          cursor: 'pointer', fontFamily: 'monospace',
                        }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bulk text */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Paste All Notes (separated by &quot;{bulkDelimiter}&quot;)
                  </label>
                  <textarea
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)}
                    placeholder={`Note 1 text here...\n${bulkDelimiter}\nNote 2 text here...\n${bulkDelimiter}\nNote 3 text here...`}
                    style={{
                      width: '100%', minHeight: '250px', padding: '10px 12px', background: '#0f172a',
                      border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.8rem',
                      lineHeight: 1.6, resize: 'vertical', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ color: '#475569', fontSize: '0.7rem', marginTop: '4px' }}>
                    {bulkText.split(bulkDelimiter).map(n => n.trim()).filter(n => n.length > 0).length} notes detected
                  </div>
                </div>

                {/* Process button */}
                <button
                  onClick={handleBulkProcess}
                  disabled={!bulkText.trim() || bulkProcessing}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '10px 24px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
                    background: !bulkText.trim() || bulkProcessing ? '#334155' : '#8B5CF6',
                    color: !bulkText.trim() || bulkProcessing ? '#64748b' : '#fff',
                    border: 'none', cursor: !bulkText.trim() || bulkProcessing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {bulkProcessing ? (
                    <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Processing...</>
                  ) : (
                    <><Play size={14} /> Run AI Triage on All Notes</>
                  )}
                </button>

                {/* Bulk results */}
                {bulkResults.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h4 style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600, margin: '0 0 8px' }}>
                      Results ({bulkResults.filter(r => r.status === 'success').length}/{bulkResults.length} succeeded)
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {bulkResults.map((r, i) => (
                        <div key={i} style={{
                          padding: '8px 12px', borderRadius: '6px',
                          background: r.status === 'success' ? 'rgba(22, 163, 74, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                          border: `1px solid ${r.status === 'success' ? 'rgba(22, 163, 74, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                          display: 'flex', alignItems: 'center', gap: '8px',
                        }}>
                          {r.status === 'success' ? <Check size={14} color="#16A34A" /> : <AlertCircle size={14} color="#EF4444" />}
                          <span style={{ color: '#cbd5e1', fontSize: '0.75rem', flex: 1 }}>
                            Case {r.case_number} — {r.title}
                          </span>
                          {r.ai_tier && (
                            <span style={{
                              padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700,
                              background: TIER_DISPLAY[r.ai_tier as TriageTier]?.bgColor || '#6B7280', color: '#fff',
                            }}>
                              {TIER_DISPLAY[r.ai_tier as TriageTier]?.label || r.ai_tier}
                            </span>
                          )}
                          {r.error && <span style={{ color: '#EF4444', fontSize: '0.7rem' }}>{r.error}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── Case List ── */}
          {mode === 'list' && (
            <div style={{
              background: 'rgba(30, 41, 59, 0.6)', border: '1px solid #334155',
              borderRadius: '12px', overflow: 'hidden',
            }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
                  All Validation Cases ({cases.length})
                </h3>
              </div>

              {cases.length === 0 ? (
                <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 12px' }}>
                    No cases yet. Use &quot;Add Single Note&quot; or &quot;Bulk Add&quot; to get started.
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>#</th>
                        <th style={thStyle}>Title</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>AI Tier</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>AI Score</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Subspecialty</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cases.map(c => (
                        <tr key={c.id}>
                          <td style={tdStyle}>{c.case_number}</td>
                          <td style={{ ...tdStyle, maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.title}
                            {c.patient_age && <span style={{ color: '#64748b', marginLeft: '6px' }}>{c.patient_age}{c.patient_sex ? c.patient_sex : ''}</span>}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            {c.ai_triage_tier ? (
                              <span style={{
                                padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700,
                                background: TIER_DISPLAY[c.ai_triage_tier as TriageTier]?.bgColor || '#6B7280', color: '#fff',
                              }}>
                                {TIER_DISPLAY[c.ai_triage_tier as TriageTier]?.label || c.ai_triage_tier}
                              </span>
                            ) : (
                              <span style={{ color: '#475569', fontSize: '0.7rem' }}>Pending</span>
                            )}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                            {c.ai_weighted_score ?? '—'}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>
                            {c.ai_subspecialty || '—'}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            {c.is_calibration ? (
                              <span style={{ color: '#F59E0B', fontSize: '0.65rem', fontWeight: 700 }}>CAL</span>
                            ) : (
                              <span style={{ color: '#64748b', fontSize: '0.65rem' }}>Scored</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PlatformShell>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontSize: '0.7rem',
  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
  borderBottom: '1px solid #334155',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px', color: '#cbd5e1', fontSize: '0.8rem',
  borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
}
