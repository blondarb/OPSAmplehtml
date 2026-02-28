'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { ClipboardCheck, ChevronRight, Check, AlertCircle, Clock, BarChart3, Settings } from 'lucide-react'
import { TIER_DISPLAY, TriageTier } from '@/lib/triage/types'
import { ValidationCaseWithStatus, KEY_FACTOR_OPTIONS, SUBSPECIALTY_OPTIONS } from '@/lib/triage/validationTypes'
import Link from 'next/link'

const TRIAGE_TIERS: { value: TriageTier; label: string; color: string; timeframe: string }[] = [
  { value: 'emergent', label: 'EMERGENT', color: TIER_DISPLAY.emergent.bgColor, timeframe: 'Redirect to ED Immediately' },
  { value: 'urgent', label: 'URGENT', color: TIER_DISPLAY.urgent.bgColor, timeframe: 'Within 1 Week' },
  { value: 'semi_urgent', label: 'SEMI-URGENT', color: TIER_DISPLAY.semi_urgent.bgColor, timeframe: 'Within 2 Weeks' },
  { value: 'routine_priority', label: 'ROUTINE-PRIORITY', color: TIER_DISPLAY.routine_priority.bgColor, timeframe: 'Within 4-6 Weeks' },
  { value: 'routine', label: 'ROUTINE', color: TIER_DISPLAY.routine.bgColor, timeframe: 'Within 8-12 Weeks' },
  { value: 'non_urgent', label: 'NON-URGENT', color: TIER_DISPLAY.non_urgent.bgColor, timeframe: 'Within 6 Months / Redirect to PCP' },
  { value: 'insufficient_data', label: 'INSUFFICIENT DATA', color: TIER_DISPLAY.insufficient_data.bgColor, timeframe: 'Return to Referring Provider' },
]

export default function ValidationPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [cases, setCases] = useState<ValidationCaseWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [completedCount, setCompletedCount] = useState(0)
  const [selectedCase, setSelectedCase] = useState<ValidationCaseWithStatus | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')

  // Form state
  const [selectedTier, setSelectedTier] = useState<TriageTier | ''>('')
  const [selectedSubspecialty, setSelectedSubspecialty] = useState('')
  const [selectedConfidence, setSelectedConfidence] = useState<'high' | 'moderate' | 'low' | ''>('')
  const [selectedFactors, setSelectedFactors] = useState<string[]>([])
  const [reasoning, setReasoning] = useState('')
  const [feedback, setFeedback] = useState('')

  // Timer
  const startTimeRef = useRef<Date | null>(null)

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/triage/validate')
    }
  }, [user, authLoading, router])

  const fetchCases = useCallback(async () => {
    try {
      const res = await fetch('/api/triage/validate/cases')
      if (!res.ok) throw new Error('Failed to fetch cases')
      const data = await res.json()
      setCases(data.cases || [])
      setCompletedCount(data.completed || 0)
    } catch {
      // silently fail — empty state shown
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) fetchCases()
  }, [user, fetchCases])

  function openCase(c: ValidationCaseWithStatus) {
    setSelectedCase(c)
    startTimeRef.current = new Date()
    setSubmitMessage('')

    // Pre-fill if already reviewed
    if (c.review) {
      setSelectedTier(c.review.triage_tier)
      setSelectedSubspecialty(c.review.subspecialty || '')
      setSelectedConfidence((c.review.confidence as 'high' | 'moderate' | 'low') || '')
      setSelectedFactors(c.review.key_factors || [])
      setReasoning(c.review.reasoning || '')
      setFeedback('')
    } else {
      setSelectedTier('')
      setSelectedSubspecialty('')
      setSelectedConfidence('')
      setSelectedFactors([])
      setReasoning('')
      setFeedback('')
    }
  }

  function toggleFactor(factor: string) {
    setSelectedFactors(prev =>
      prev.includes(factor) ? prev.filter(f => f !== factor) : [...prev, factor]
    )
  }

  async function handleSubmitReview() {
    if (!selectedCase || !selectedTier) return

    setSubmitting(true)
    setSubmitMessage('')

    const durationSeconds = startTimeRef.current
      ? Math.round((new Date().getTime() - startTimeRef.current.getTime()) / 1000)
      : null

    try {
      const res = await fetch('/api/triage/validate/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_id: selectedCase.id,
          triage_tier: selectedTier,
          subspecialty: selectedSubspecialty || null,
          confidence: selectedConfidence || null,
          key_factors: selectedFactors,
          reasoning: [reasoning, feedback].filter(Boolean).join('\n\n---\nAlgorithm Feedback:\n') || null,
          started_at: startTimeRef.current?.toISOString() || null,
          duration_seconds: durationSeconds,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to submit review')
      }

      setSubmitMessage('Review saved successfully!')

      // Move to next unreviewed case
      const currentIdx = cases.findIndex(c => c.id === selectedCase.id)
      const nextUnreviewed = cases.find((c, i) => i > currentIdx && !c.reviewed)

      // Refresh cases
      await fetchCases()

      if (nextUnreviewed) {
        // Auto-advance after a short delay
        setTimeout(() => {
          const refreshedCase = cases.find(c => c.id === nextUnreviewed.id)
          if (refreshedCase) openCase(refreshedCase)
          else setSelectedCase(null)
        }, 800)
      } else {
        setTimeout(() => setSelectedCase(null), 1200)
      }
    } catch (err) {
      setSubmitMessage(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading || loading) {
    return (
      <PlatformShell>
        <FeatureSubHeader title="Triage Validation" icon={ClipboardCheck} accentColor="#8B5CF6" homeLink="/triage" />
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <p style={{ color: '#94a3b8' }}>Loading...</p>
        </div>
      </PlatformShell>
    )
  }

  return (
    <PlatformShell>
      <FeatureSubHeader
        title="Triage Validation"
        icon={ClipboardCheck}
        accentColor="#8B5CF6"
        homeLink="/triage"
        nextStep={{ label: 'View Results', route: '/triage/validate/results' }}
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
              Independent Reviewer Validation
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.6, margin: 0 }}>
              Review each clinical referral note independently. For each case, select the triage tier you believe
              is most appropriate, along with the recommended subspecialty and the clinical factors that influenced
              your decision. Your responses are blinded — you cannot see other reviewers&apos; answers until all
              reviews are complete.
            </p>
          </div>

          {/* Progress Bar */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.8)',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '20px 24px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600 }}>
                  Your Progress
                </span>
                <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                  {completedCount} / {cases.length} cases reviewed
                </span>
              </div>
              <div style={{
                height: '8px',
                background: '#1e293b',
                borderRadius: '4px',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${cases.length > 0 ? (completedCount / cases.length) * 100 : 0}%`,
                  background: 'linear-gradient(90deg, #8B5CF6, #6D28D9)',
                  borderRadius: '4px',
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <Link
              href="/triage/validate/admin"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '8px 12px',
                background: 'rgba(100, 116, 139, 0.15)',
                color: '#94a3b8',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 500,
                textDecoration: 'none',
                border: '1px solid rgba(100, 116, 139, 0.2)',
                whiteSpace: 'nowrap',
              }}
            >
              <Settings size={13} />
              Admin
            </Link>
            <Link
              href="/triage/validate/results"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: completedCount === cases.length && cases.length > 0 ? '#8B5CF6' : 'rgba(139, 92, 246, 0.2)',
                color: completedCount === cases.length && cases.length > 0 ? '#fff' : '#8B5CF6',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                textDecoration: 'none',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              <BarChart3 size={14} />
              Results
            </Link>
            </div>
          </div>

          {/* Empty state */}
          {cases.length === 0 && (
            <div style={{
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '48px 24px',
              textAlign: 'center',
            }}>
              <AlertCircle size={40} color="#64748b" style={{ marginBottom: '12px' }} />
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0 0 8px' }}>
                No validation cases available yet.
              </p>
              <p style={{ color: '#64748b', fontSize: '0.8rem', margin: 0 }}>
                Cases will appear here once the study administrator uploads them via the API.
              </p>
            </div>
          )}

          {/* Two-column layout: Case List + Review Form */}
          {cases.length > 0 && (
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>

              {/* Left: Case List */}
              <div style={{ width: '340px', flexShrink: 0 }}>
                <div style={{
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #334155' }}>
                    <h3 style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
                      Cases ({cases.length})
                    </h3>
                  </div>
                  <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
                    {cases.map((c) => {
                      const isSelected = selectedCase?.id === c.id
                      return (
                        <button
                          key={c.id}
                          onClick={() => openCase(c)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            width: '100%',
                            padding: '12px 16px',
                            background: isSelected ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                            border: 'none',
                            borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          {/* Status icon */}
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: c.reviewed ? '#16A34A' : isSelected ? '#8B5CF6' : '#334155',
                            flexShrink: 0,
                          }}>
                            {c.reviewed ? (
                              <Check size={12} color="#fff" />
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600 }}>
                                {c.case_number}
                              </span>
                            )}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              color: isSelected ? '#e2e8f0' : '#cbd5e1',
                              fontSize: '0.8rem',
                              fontWeight: isSelected ? 600 : 400,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}>
                              {c.title}
                            </div>
                            {c.is_calibration && (
                              <span style={{
                                fontSize: '0.65rem',
                                color: '#F59E0B',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                              }}>
                                Calibration
                              </span>
                            )}
                          </div>

                          <ChevronRight size={14} color={isSelected ? '#8B5CF6' : '#475569'} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Right: Review Form */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {!selectedCase ? (
                  <div style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    padding: '64px 24px',
                    textAlign: 'center',
                  }}>
                    <ClipboardCheck size={40} color="#64748b" style={{ marginBottom: '12px' }} />
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>
                      Select a case from the list to begin your review.
                    </p>
                  </div>
                ) : (
                  <div style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    overflow: 'hidden',
                  }}>
                    {/* Case header */}
                    <div style={{
                      padding: '16px 20px',
                      borderBottom: '1px solid #334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div>
                        <h3 style={{ color: '#f1f5f9', fontSize: '0.95rem', fontWeight: 600, margin: '0 0 4px' }}>
                          Case {selectedCase.case_number}: {selectedCase.title}
                        </h3>
                        <div style={{ display: 'flex', gap: '12px', color: '#64748b', fontSize: '0.75rem' }}>
                          {selectedCase.patient_age && <span>Age: {selectedCase.patient_age}</span>}
                          {selectedCase.patient_sex && <span>Sex: {selectedCase.patient_sex}</span>}
                          {selectedCase.is_calibration && (
                            <span style={{ color: '#F59E0B', fontWeight: 600 }}>CALIBRATION — not scored</span>
                          )}
                        </div>
                      </div>
                      {selectedCase.reviewed && (
                        <span style={{
                          padding: '4px 10px',
                          background: 'rgba(22, 163, 74, 0.15)',
                          color: '#16A34A',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          borderRadius: '4px',
                          border: '1px solid rgba(22, 163, 74, 0.3)',
                        }}>
                          REVIEWED
                        </span>
                      )}
                    </div>

                    {/* Referral text */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
                      <label style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Referral Note
                      </label>
                      <div style={{
                        marginTop: '8px',
                        padding: '14px 16px',
                        background: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '8px',
                        color: '#e2e8f0',
                        fontSize: '0.85rem',
                        lineHeight: 1.7,
                        maxHeight: '250px',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {selectedCase.referral_text}
                      </div>
                    </div>

                    {/* Triage Tier Selection */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
                      <label style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '10px' }}>
                        Your Triage Recommendation *
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {TRIAGE_TIERS.map(tier => {
                          const isSelected = selectedTier === tier.value
                          return (
                            <button
                              key={tier.value}
                              onClick={() => setSelectedTier(tier.value)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 14px',
                                background: isSelected ? `${tier.color}20` : 'rgba(15, 23, 42, 0.5)',
                                border: isSelected ? `2px solid ${tier.color}` : '1px solid #334155',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                            >
                              <div style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                border: isSelected ? `2px solid ${tier.color}` : '2px solid #475569',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}>
                                {isSelected && (
                                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: tier.color }} />
                                )}
                              </div>
                              <div>
                                <span style={{
                                  color: isSelected ? tier.color : '#cbd5e1',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                }}>
                                  {tier.label}
                                </span>
                                <span style={{ color: '#64748b', fontSize: '0.7rem', marginLeft: '8px' }}>
                                  {tier.timeframe}
                                </span>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Subspecialty */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
                      <label style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '10px' }}>
                        Recommended Subspecialty
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {SUBSPECIALTY_OPTIONS.map(sub => {
                          const isSelected = selectedSubspecialty === sub
                          return (
                            <button
                              key={sub}
                              onClick={() => setSelectedSubspecialty(isSelected ? '' : sub)}
                              style={{
                                padding: '6px 14px',
                                background: isSelected ? 'rgba(139, 92, 246, 0.2)' : 'rgba(15, 23, 42, 0.5)',
                                border: isSelected ? '1px solid #8B5CF6' : '1px solid #334155',
                                borderRadius: '6px',
                                color: isSelected ? '#8B5CF6' : '#94a3b8',
                                fontSize: '0.75rem',
                                fontWeight: isSelected ? 600 : 400,
                                cursor: 'pointer',
                              }}
                            >
                              {sub}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Key Clinical Factors */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
                      <label style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '10px' }}>
                        Key Factors Influencing Your Decision (select all that apply)
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {KEY_FACTOR_OPTIONS.map(factor => {
                          const isChecked = selectedFactors.includes(factor)
                          return (
                            <button
                              key={factor}
                              onClick={() => toggleFactor(factor)}
                              style={{
                                padding: '6px 12px',
                                background: isChecked ? 'rgba(13, 148, 136, 0.15)' : 'rgba(15, 23, 42, 0.5)',
                                border: isChecked ? '1px solid #0D9488' : '1px solid #334155',
                                borderRadius: '6px',
                                color: isChecked ? '#0D9488' : '#94a3b8',
                                fontSize: '0.72rem',
                                fontWeight: isChecked ? 600 : 400,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              {isChecked && <Check size={10} />}
                              {factor}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Confidence */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
                      <label style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '10px' }}>
                        Your Confidence Level
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {(['high', 'moderate', 'low'] as const).map(level => {
                          const isSelected = selectedConfidence === level
                          const colors = { high: '#16A34A', moderate: '#F59E0B', low: '#EF4444' }
                          return (
                            <button
                              key={level}
                              onClick={() => setSelectedConfidence(isSelected ? '' : level)}
                              style={{
                                padding: '8px 20px',
                                background: isSelected ? `${colors[level]}20` : 'rgba(15, 23, 42, 0.5)',
                                border: isSelected ? `1px solid ${colors[level]}` : '1px solid #334155',
                                borderRadius: '6px',
                                color: isSelected ? colors[level] : '#94a3b8',
                                fontSize: '0.8rem',
                                fontWeight: isSelected ? 600 : 400,
                                cursor: 'pointer',
                                textTransform: 'capitalize',
                              }}
                            >
                              {level}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Reasoning */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
                      <label style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
                        Clinical Reasoning (optional)
                      </label>
                      <textarea
                        value={reasoning}
                        onChange={e => setReasoning(e.target.value)}
                        placeholder="Explain the key clinical features that drove your triage recommendation..."
                        style={{
                          width: '100%',
                          minHeight: '80px',
                          padding: '10px 12px',
                          background: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          color: '#e2e8f0',
                          fontSize: '0.8rem',
                          lineHeight: 1.5,
                          resize: 'vertical',
                          outline: 'none',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Feedback for Algorithm Improvement */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
                      <label style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                        Feedback for Algorithm (optional)
                      </label>
                      <p style={{ color: '#64748b', fontSize: '0.7rem', margin: '0 0 8px', lineHeight: 1.4 }}>
                        Is anything missing from this note that would change your triage? Would you weigh certain factors differently?
                        Any suggestions for how the scoring algorithm could be improved?
                      </p>
                      <textarea
                        value={feedback}
                        onChange={e => setFeedback(e.target.value)}
                        placeholder="e.g. The note doesn't mention whether imaging was done. I weighed functional impairment more heavily here because..."
                        style={{
                          width: '100%',
                          minHeight: '70px',
                          padding: '10px 12px',
                          background: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          color: '#e2e8f0',
                          fontSize: '0.8rem',
                          lineHeight: 1.5,
                          resize: 'vertical',
                          outline: 'none',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Submit */}
                    <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {startTimeRef.current && (
                          <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} />
                            Timer running
                          </span>
                        )}
                        {submitMessage && (
                          <span style={{
                            color: submitMessage.includes('success') ? '#16A34A' : '#EF4444',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                          }}>
                            {submitMessage}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={handleSubmitReview}
                        disabled={!selectedTier || submitting}
                        style={{
                          padding: '10px 28px',
                          background: !selectedTier ? '#334155' : '#8B5CF6',
                          color: !selectedTier ? '#64748b' : '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          cursor: !selectedTier ? 'not-allowed' : 'pointer',
                          opacity: submitting ? 0.7 : 1,
                        }}
                      >
                        {submitting ? 'Saving...' : selectedCase.reviewed ? 'Update Review' : 'Submit Review'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </PlatformShell>
  )
}
