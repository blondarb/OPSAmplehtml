'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { Settings, Plus, Play, Trash2, Check, AlertCircle, Upload, Loader2, RefreshCw, BarChart3, Database } from 'lucide-react'
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
  ai_dimension_scores: Record<string, number> | null
  ai_subspecialty: string | null
  ai_redirect_to_non_neuro: boolean
  ai_redirect_specialty: string | null
  ai_confidence: string | null
  ai_session_id: string | null
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

interface ConsistencyRunResult {
  run_number: number
  temperature: number
  status: 'success' | 'error'
  ai_tier?: string
  ai_score?: number
  ai_confidence?: string
  duration_ms?: number
  error?: string
}

interface ConsistencyResult {
  case_id: string
  case_number: number
  title: string
  runs: ConsistencyRunResult[]
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [cases, setCases] = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'list' | 'single' | 'bulk' | 'consistency'>('list')
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null)

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

  // Consistency testing
  const [runCount, setRunCount] = useState(3)
  const [includeBaseline, setIncludeBaseline] = useState(true)
  const [consistencyRunning, setConsistencyRunning] = useState(false)
  const [consistencyProgress, setConsistencyProgress] = useState('')
  const [consistencyResults, setConsistencyResults] = useState<ConsistencyResult[] | null>(null)
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set())

  // Seeding
  const [seeding, setSeeding] = useState(false)
  const [seedMessage, setSeedMessage] = useState('')

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

  // Seed from demo scenarios
  async function handleSeedFromDemos() {
    setSeeding(true)
    setSeedMessage('Loading 26 demo scenarios and running AI triage on each...')

    try {
      const res = await fetch('/api/triage/validate/cases/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          run_ai: true,
          clear_existing: cases.length === 0, // only clear if empty
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Seeding failed')
      }

      const data = await res.json()
      setSeedMessage(`Seeded ${data.seeded} cases (${data.with_ai_results} with AI results, ${data.errors} errors)`)
      await fetchCases()
    } catch (err) {
      setSeedMessage(err instanceof Error ? err.message : 'Seeding failed')
    } finally {
      setSeeding(false)
    }
  }

  // Toggle case selection for consistency runs
  function toggleCaseSelection(caseId: string) {
    setSelectedCaseIds(prev => {
      const next = new Set(prev)
      if (next.has(caseId)) next.delete(caseId)
      else next.add(caseId)
      return next
    })
  }

  function selectAllCases() {
    if (selectedCaseIds.size === cases.length) {
      setSelectedCaseIds(new Set())
    } else {
      setSelectedCaseIds(new Set(cases.map(c => c.id)))
    }
  }

  // Run consistency test — batches cases to stay within Vercel function timeout
  async function handleConsistencyRun() {
    const caseIds = selectedCaseIds.size > 0
      ? Array.from(selectedCaseIds)
      : cases.map(c => c.id)

    if (caseIds.length === 0) return

    setConsistencyRunning(true)
    setConsistencyResults(null)

    // Batch size: 2 cases per request — runs parallelize server-side
    const BATCH_SIZE = 2
    const batches: string[][] = []
    for (let i = 0; i < caseIds.length; i += BATCH_SIZE) {
      batches.push(caseIds.slice(i, i + BATCH_SIZE))
    }

    const runsPerCase = runCount + (includeBaseline ? 1 : 0)
    const totalCalls = caseIds.length * runsPerCase
    let completedCases = 0
    let totalSuccessful = 0
    let totalFailed = 0
    const allResults: ConsistencyResult[] = []

    try {
      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b]
        setConsistencyProgress(
          `Batch ${b + 1}/${batches.length}: running ${batch.length} cases (${completedCases}/${caseIds.length} done, ~${totalCalls - completedCases * runsPerCase} API calls remaining)...`
        )

        const res = await fetch('/api/triage/validate/cases/rerun', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            case_ids: batch,
            run_count: runCount,
            include_baseline: includeBaseline,
            clear_previous: true,
          }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `Batch ${b + 1} failed`)
        }

        const data = await res.json()
        completedCases += batch.length
        totalSuccessful += data.successful_runs || 0
        totalFailed += data.failed_runs || 0
        if (data.results) allResults.push(...data.results)

        // Update results incrementally so user sees progress
        setConsistencyResults([...allResults])
      }

      setConsistencyProgress(
        `Complete: ${totalSuccessful}/${totalSuccessful + totalFailed} runs succeeded across ${caseIds.length} cases`
      )
    } catch (err) {
      const partial = allResults.length > 0 ? ` (${completedCases}/${caseIds.length} cases completed before error)` : ''
      setConsistencyProgress((err instanceof Error ? err.message : 'Failed') + partial)
    } finally {
      setConsistencyRunning(false)
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
              {cases.length > 0 && (
                <button
                  onClick={handleSeedFromDemos}
                  disabled={seeding}
                  style={{
                    padding: '6px 14px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 500,
                    background: seeding ? 'rgba(51, 65, 85, 0.5)' : 'rgba(139, 92, 246, 0.1)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    color: seeding ? '#64748b' : '#8B5CF6', cursor: seeding ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}
                >
                  {seeding ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Database size={12} />}
                  {seeding ? 'Seeding...' : 'Re-seed Demos'}
                </button>
              )}
            </div>
            {seedMessage && cases.length > 0 && (
              <div style={{
                marginTop: '8px',
                color: seedMessage.includes('Seeded') ? '#16A34A' : seedMessage.includes('Loading') ? '#a78bfa' : '#EF4444',
                fontSize: '0.75rem', fontWeight: 500,
              }}>
                {seedMessage}
              </div>
            )}
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

          {/* Seed from Demo Scenarios */}
          {cases.length === 0 && (
            <div style={{
              background: 'rgba(139, 92, 246, 0.06)',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '20px',
              textAlign: 'center',
            }}>
              <Database size={28} color="#A78BFA" style={{ marginBottom: '8px' }} />
              <h3 style={{ color: '#e2e8f0', fontSize: '0.95rem', fontWeight: 600, margin: '0 0 6px' }}>
                No Validation Cases Yet
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0 0 14px', lineHeight: 1.5 }}>
                Seed the study with 26 pre-built demo referral scenarios. Each note will be run through the AI triage
                algorithm to establish the AI baseline. You can also add your own notes manually afterwards.
              </p>
              <button
                onClick={handleSeedFromDemos}
                disabled={seeding}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 28px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600,
                  background: seeding ? '#334155' : '#8B5CF6',
                  color: seeding ? '#64748b' : '#fff',
                  border: 'none', cursor: seeding ? 'not-allowed' : 'pointer',
                }}
              >
                {seeding ? (
                  <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Seeding &amp; Running AI...</>
                ) : (
                  <><Database size={16} /> Seed 26 Demo Cases with AI Triage</>
                )}
              </button>
              {seedMessage && (
                <div style={{
                  marginTop: '12px',
                  color: seedMessage.includes('Seeded') ? '#16A34A' : seedMessage.includes('Loading') ? '#a78bfa' : '#EF4444',
                  fontSize: '0.8rem', fontWeight: 500,
                }}>
                  {seeding && <Loader2 size={12} style={{ display: 'inline', marginRight: '6px', animation: 'spin 1s linear infinite' }} />}
                  {seedMessage}
                </div>
              )}
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Mode Tabs */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
            {[
              { key: 'list' as const, label: 'Case List', icon: null },
              { key: 'single' as const, label: 'Add Single Note', icon: Plus },
              { key: 'bulk' as const, label: 'Bulk Add', icon: Upload },
              { key: 'consistency' as const, label: 'Consistency Test', icon: BarChart3 },
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

          {/* ── Consistency Test ── */}
          {mode === 'consistency' && (
            <div style={{
              background: 'rgba(30, 41, 59, 0.6)', border: '1px solid #334155',
              borderRadius: '12px', overflow: 'hidden',
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
                <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 4px' }}>
                  AI Consistency / Intra-Rater Reliability Test
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.75rem', margin: 0, lineHeight: 1.6 }}>
                  Run each case through the triage algorithm multiple times to measure AI self-consistency.
                  Includes a deterministic baseline run at temperature=0 plus N standard runs at temperature=0.2.
                </p>
              </div>

              <div style={{ padding: '16px 20px' }}>
                {/* Controls */}
                <div style={{ display: 'flex', gap: '20px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                      Standard Runs (temp=0.2)
                    </label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          onClick={() => setRunCount(n)}
                          style={{
                            width: '36px', height: '36px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700,
                            background: runCount === n ? '#8B5CF6' : 'rgba(15, 23, 42, 0.5)',
                            color: runCount === n ? '#fff' : '#94a3b8',
                            border: runCount === n ? '1px solid #8B5CF6' : '1px solid #334155',
                            cursor: 'pointer',
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={includeBaseline}
                        onChange={e => setIncludeBaseline(e.target.checked)}
                        style={{ accentColor: '#16A34A', width: '16px', height: '16px' }}
                      />
                      <div>
                        <span style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600 }}>Include baseline (temp=0)</span>
                        <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block' }}>
                          Deterministic reference run
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Estimated total */}
                <div style={{
                  padding: '10px 14px', background: 'rgba(139, 92, 246, 0.06)', border: '1px solid rgba(139, 92, 246, 0.15)',
                  borderRadius: '8px', marginBottom: '16px',
                }}>
                  <span style={{ color: '#a78bfa', fontSize: '0.75rem' }}>
                    {selectedCaseIds.size > 0 ? selectedCaseIds.size : cases.length} cases
                    &times; {runCount + (includeBaseline ? 1 : 0)} runs each
                    = <strong>{(selectedCaseIds.size > 0 ? selectedCaseIds.size : cases.length) * (runCount + (includeBaseline ? 1 : 0))}</strong> total API calls
                  </span>
                  <span style={{ color: '#64748b', fontSize: '0.7rem', marginLeft: '12px' }}>
                    (~{Math.ceil(((selectedCaseIds.size > 0 ? selectedCaseIds.size : cases.length) * (runCount + (includeBaseline ? 1 : 0)) * 8) / 60)} min est.)
                  </span>
                </div>

                {/* Case selection */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <label style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600 }}>
                      Select Cases
                    </label>
                    <button
                      onClick={selectAllCases}
                      style={{
                        padding: '2px 10px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 600,
                        background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)',
                        color: '#a78bfa', cursor: 'pointer',
                      }}
                    >
                      {selectedCaseIds.size === cases.length ? 'Deselect All' : 'Select All'}
                    </button>
                    {selectedCaseIds.size > 0 && (
                      <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
                        {selectedCaseIds.size} selected
                      </span>
                    )}
                  </div>

                  <div style={{
                    maxHeight: '240px', overflowY: 'auto',
                    border: '1px solid #334155', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.3)',
                  }}>
                    {cases.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                        No cases available. Add cases first.
                      </div>
                    ) : (
                      cases.map(c => (
                        <label
                          key={c.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
                            cursor: 'pointer', borderBottom: '1px solid rgba(51, 65, 85, 0.3)',
                            background: selectedCaseIds.has(c.id) ? 'rgba(139, 92, 246, 0.05)' : 'transparent',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedCaseIds.has(c.id)}
                            onChange={() => toggleCaseSelection(c.id)}
                            style={{ accentColor: '#8B5CF6' }}
                          />
                          <span style={{ color: '#64748b', fontSize: '0.7rem', minWidth: '28px' }}>#{c.case_number}</span>
                          <span style={{ color: '#cbd5e1', fontSize: '0.8rem', flex: 1 }}>{c.title}</span>
                          {c.ai_triage_tier && (
                            <span style={{
                              padding: '1px 6px', borderRadius: '3px', fontSize: '0.6rem', fontWeight: 700,
                              background: TIER_DISPLAY[c.ai_triage_tier as TriageTier]?.bgColor || '#6B7280', color: '#fff',
                            }}>
                              {TIER_DISPLAY[c.ai_triage_tier as TriageTier]?.label || c.ai_triage_tier}
                            </span>
                          )}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Run button */}
                <button
                  onClick={handleConsistencyRun}
                  disabled={cases.length === 0 || consistencyRunning}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '10px 24px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
                    background: cases.length === 0 || consistencyRunning ? '#334155' : '#8B5CF6',
                    color: cases.length === 0 || consistencyRunning ? '#64748b' : '#fff',
                    border: 'none', cursor: cases.length === 0 || consistencyRunning ? 'not-allowed' : 'pointer',
                  }}
                >
                  {consistencyRunning ? (
                    <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Running...</>
                  ) : (
                    <><RefreshCw size={14} /> Run Consistency Test</>
                  )}
                </button>

                {consistencyProgress && (
                  <div style={{ marginTop: '12px', color: consistencyRunning ? '#a78bfa' : (consistencyProgress.startsWith('Complete') ? '#16A34A' : '#EF4444'), fontSize: '0.8rem', fontWeight: 500 }}>
                    {consistencyRunning && <Loader2 size={12} style={{ display: 'inline', marginRight: '6px', animation: 'spin 1s linear infinite' }} />}
                    {consistencyProgress}
                  </div>
                )}

                {/* Consistency Results */}
                {consistencyResults && consistencyResults.length > 0 && (
                  <div style={{ marginTop: '20px' }}>
                    <h4 style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, margin: '0 0 12px' }}>
                      Run Results
                    </h4>

                    {/* Summary stats */}
                    {(() => {
                      const casesWithAllSuccess = consistencyResults.filter(c => c.runs.every(r => r.status === 'success'))
                      const casesWithAllSameTier = casesWithAllSuccess.filter(c => {
                        const tiers = c.runs.map(r => r.ai_tier).filter(Boolean)
                        return tiers.length > 0 && new Set(tiers).size === 1
                      })
                      return (
                        <div style={{
                          display: 'flex', gap: '12px', marginBottom: '16px',
                        }}>
                          <div style={{
                            flex: 1, padding: '12px 16px', background: 'rgba(22, 163, 74, 0.06)',
                            border: '1px solid rgba(22, 163, 74, 0.15)', borderRadius: '8px',
                          }}>
                            <div style={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                              Perfect Agreement
                            </div>
                            <div style={{ color: '#16A34A', fontSize: '1.25rem', fontWeight: 700 }}>
                              {casesWithAllSuccess.length > 0
                                ? Math.round((casesWithAllSameTier.length / casesWithAllSuccess.length) * 100)
                                : 0}%
                            </div>
                            <div style={{ color: '#64748b', fontSize: '0.65rem' }}>
                              {casesWithAllSameTier.length}/{casesWithAllSuccess.length} cases all runs agree
                            </div>
                          </div>
                          <div style={{
                            flex: 1, padding: '12px 16px', background: 'rgba(139, 92, 246, 0.06)',
                            border: '1px solid rgba(139, 92, 246, 0.15)', borderRadius: '8px',
                          }}>
                            <div style={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                              Total Runs
                            </div>
                            <div style={{ color: '#a78bfa', fontSize: '1.25rem', fontWeight: 700 }}>
                              {consistencyResults.reduce((s, c) => s + c.runs.length, 0)}
                            </div>
                            <div style={{ color: '#64748b', fontSize: '0.65rem' }}>
                              {consistencyResults.reduce((s, c) => s + c.runs.filter(r => r.status === 'success').length, 0)} succeeded
                            </div>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Per-case detail */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {consistencyResults.map(c => {
                        const successRuns = c.runs.filter(r => r.status === 'success')
                        const tiers = successRuns.map(r => r.ai_tier!).filter(Boolean)
                        const uniqueTiers = [...new Set(tiers)]
                        const allAgree = uniqueTiers.length === 1
                        const scores = successRuns.map(r => r.ai_score).filter((s): s is number => s != null)
                        const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
                        const scoreRange = scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : 0
                        const baseline = c.runs.find(r => r.run_number === 0)

                        return (
                          <div key={c.case_id} style={{
                            padding: '12px 16px', borderRadius: '8px',
                            background: allAgree ? 'rgba(22, 163, 74, 0.04)' : 'rgba(234, 179, 8, 0.04)',
                            border: `1px solid ${allAgree ? 'rgba(22, 163, 74, 0.15)' : 'rgba(234, 179, 8, 0.2)'}`,
                          }}>
                            {/* Case header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                              <span style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 600 }}>#{c.case_number}</span>
                              <span style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600, flex: 1 }}>{c.title}</span>
                              {allAgree ? (
                                <span style={{ color: '#16A34A', fontSize: '0.68rem', fontWeight: 700 }}>
                                  <Check size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />
                                  CONSISTENT
                                </span>
                              ) : (
                                <span style={{ color: '#EAB308', fontSize: '0.68rem', fontWeight: 700 }}>
                                  <AlertCircle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />
                                  {uniqueTiers.length} TIERS
                                </span>
                              )}
                            </div>

                            {/* Run pills */}
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {baseline && baseline.status === 'success' && (
                                <span style={{
                                  padding: '3px 8px', borderRadius: '4px', fontSize: '0.62rem', fontWeight: 700,
                                  background: TIER_DISPLAY[baseline.ai_tier as TriageTier]?.bgColor || '#6B7280', color: '#fff',
                                  border: '2px solid rgba(255,255,255,0.3)',
                                }}>
                                  Baseline: {TIER_DISPLAY[baseline.ai_tier as TriageTier]?.label || baseline.ai_tier}
                                </span>
                              )}
                              {c.runs.filter(r => r.run_number > 0).map(r => (
                                <span key={r.run_number} style={{
                                  padding: '3px 8px', borderRadius: '4px', fontSize: '0.62rem', fontWeight: 600,
                                  background: r.status === 'success'
                                    ? (TIER_DISPLAY[r.ai_tier as TriageTier]?.bgColor || '#6B7280')
                                    : '#7f1d1d',
                                  color: '#fff',
                                  opacity: r.status === 'error' ? 0.6 : 1,
                                }}>
                                  Run {r.run_number}: {r.status === 'success' ? (TIER_DISPLAY[r.ai_tier as TriageTier]?.label || r.ai_tier) : 'ERR'}
                                </span>
                              ))}
                            </div>

                            {/* Score range */}
                            {scores.length > 1 && (
                              <div style={{ marginTop: '6px', color: '#64748b', fontSize: '0.68rem' }}>
                                Score: avg {avgScore?.toFixed(2)} | range {scoreRange.toFixed(2)} ({Math.min(...scores).toFixed(2)} – {Math.max(...scores).toFixed(2)})
                              </div>
                            )}
                          </div>
                        )
                      })}
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
                      {cases.map(c => {
                        const isExpanded = expandedCaseId === c.id
                        return (
                          <React.Fragment key={c.id}>
                            <tr
                              onClick={() => setExpandedCaseId(isExpanded ? null : c.id)}
                              style={{ cursor: 'pointer', background: isExpanded ? 'rgba(139, 92, 246, 0.04)' : 'transparent' }}
                            >
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
                            {isExpanded && (
                              <tr>
                                <td colSpan={6} style={{ padding: 0, border: 'none' }}>
                                  <div style={{
                                    padding: '16px 20px', background: 'rgba(15, 23, 42, 0.5)',
                                    borderBottom: '1px solid #334155',
                                  }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
                                      {/* AI Tier & Score */}
                                      <div>
                                        <div style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                                          AI Assessment
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                          {c.ai_triage_tier && (
                                            <span style={{
                                              padding: '3px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
                                              background: TIER_DISPLAY[c.ai_triage_tier as TriageTier]?.bgColor || '#6B7280', color: '#fff',
                                            }}>
                                              {TIER_DISPLAY[c.ai_triage_tier as TriageTier]?.label || c.ai_triage_tier}
                                            </span>
                                          )}
                                          <span style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600 }}>
                                            Score: {c.ai_weighted_score ?? 'N/A'}
                                          </span>
                                          {c.ai_confidence && (
                                            <span style={{
                                              padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 600,
                                              background: c.ai_confidence === 'high' ? 'rgba(22, 163, 74, 0.15)' : c.ai_confidence === 'medium' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                              color: c.ai_confidence === 'high' ? '#16A34A' : c.ai_confidence === 'medium' ? '#F59E0B' : '#EF4444',
                                            }}>
                                              {c.ai_confidence} confidence
                                            </span>
                                          )}
                                        </div>
                                        {c.ai_subspecialty && (
                                          <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                                            Subspecialty: <span style={{ color: '#cbd5e1' }}>{c.ai_subspecialty}</span>
                                          </div>
                                        )}
                                        {c.ai_redirect_to_non_neuro && (
                                          <div style={{ color: '#F59E0B', fontSize: '0.75rem', fontWeight: 600, marginTop: '4px' }}>
                                            Redirect → {c.ai_redirect_specialty || 'Non-Neuro'}
                                          </div>
                                        )}
                                      </div>

                                      {/* Dimension Scores */}
                                      {c.ai_dimension_scores && (
                                        <div>
                                          <div style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                                            Dimension Scores
                                          </div>
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            {Object.entries(c.ai_dimension_scores).map(([dim, score]) => (
                                              <div key={dim} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ color: '#64748b', fontSize: '0.68rem', width: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                  {dim.replace(/_/g, ' ')}
                                                </span>
                                                <div style={{ flex: 1, height: '5px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                                                  <div style={{
                                                    height: '100%', width: `${(score / 5) * 100}%`,
                                                    background: score >= 4 ? '#EF4444' : score >= 3 ? '#F59E0B' : '#16A34A',
                                                    borderRadius: '3px',
                                                  }} />
                                                </div>
                                                <span style={{ color: '#e2e8f0', fontSize: '0.7rem', fontWeight: 600, width: '20px', textAlign: 'right' }}>
                                                  {score}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Referral text preview */}
                                    <div>
                                      <div style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                                        Referral Note (preview)
                                      </div>
                                      <div style={{
                                        background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px',
                                        padding: '10px 12px', maxHeight: '120px', overflowY: 'auto',
                                        color: '#94a3b8', fontSize: '0.72rem', lineHeight: 1.5,
                                        whiteSpace: 'pre-wrap', fontFamily: 'monospace',
                                      }}>
                                        {c.referral_text.substring(0, 800)}{c.referral_text.length > 800 ? '...' : ''}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
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
