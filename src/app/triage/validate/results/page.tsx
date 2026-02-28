'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { BarChart3, AlertCircle, Users, CheckCircle2, ArrowRight } from 'lucide-react'
import { TIER_DISPLAY, TriageTier } from '@/lib/triage/types'
import { ValidationResults } from '@/lib/triage/validationTypes'
import Link from 'next/link'

const TIER_ORDER: TriageTier[] = [
  'emergent', 'urgent', 'semi_urgent', 'routine_priority', 'routine', 'non_urgent', 'insufficient_data'
]

function kappaColor(k: number): string {
  if (k >= 0.81) return '#16A34A'
  if (k >= 0.61) return '#22C55E'
  if (k >= 0.41) return '#F59E0B'
  if (k >= 0.21) return '#EA580C'
  return '#EF4444'
}

function formatPct(n: number): string {
  return `${Math.round(n * 100)}%`
}

export default function ResultsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [results, setResults] = useState<ValidationResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/triage/validate/results')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user) return
    async function fetchResults() {
      try {
        const res = await fetch('/api/triage/validate/results')
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to fetch results')
        }
        setResults(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load results')
      } finally {
        setLoading(false)
      }
    }
    fetchResults()
  }, [user])

  if (authLoading || loading) {
    return (
      <PlatformShell>
        <FeatureSubHeader title="Validation Results" icon={BarChart3} accentColor="#8B5CF6" homeLink="/triage/validate" />
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <p style={{ color: '#94a3b8' }}>Loading results...</p>
        </div>
      </PlatformShell>
    )
  }

  return (
    <PlatformShell>
      <FeatureSubHeader
        title="Validation Results"
        icon={BarChart3}
        accentColor="#8B5CF6"
        homeLink="/triage/validate"
      />
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>

          <h1 style={{ color: '#f1f5f9', fontSize: '1.5rem', fontWeight: 700, margin: '0 0 8px' }}>
            Inter-Rater Reliability Results
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 24px' }}>
            Statistical analysis of reviewer agreement on triage tier assignments, including comparison with the AI algorithm.
          </p>

          {error && (
            <div style={{
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '48px 24px',
              textAlign: 'center',
            }}>
              <AlertCircle size={40} color="#64748b" style={{ marginBottom: '12px' }} />
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0 0 16px' }}>{error}</p>
              <Link
                href="/triage/validate"
                style={{
                  padding: '8px 20px',
                  background: '#8B5CF6',
                  color: '#fff',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Go to Validation Page
              </Link>
            </div>
          )}

          {results && (
            <>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {/* Fleiss' Kappa */}
                <div style={{
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  padding: '20px',
                }}>
                  <div style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    Fleiss&apos; Kappa
                  </div>
                  <div style={{ color: kappaColor(results.fleiss_kappa), fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>
                    {results.fleiss_kappa.toFixed(3)}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '4px' }}>
                    {results.fleiss_kappa_interpretation}
                  </div>
                </div>

                {/* Krippendorff's Alpha */}
                <div style={{
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  padding: '20px',
                }}>
                  <div style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    Krippendorff&apos;s Alpha
                  </div>
                  <div style={{ color: kappaColor(results.krippendorff_alpha), fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>
                    {results.krippendorff_alpha.toFixed(3)}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '4px' }}>
                    {results.krippendorff_alpha_interpretation}
                  </div>
                </div>

                {/* Overall Agreement */}
                <div style={{
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  padding: '20px',
                }}>
                  <div style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    Overall Agreement
                  </div>
                  <div style={{ color: '#e2e8f0', fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>
                    {formatPct(results.overall_agreement_rate)}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '4px' }}>
                    Pairwise exact match
                  </div>
                </div>

                {/* Study Info */}
                <div style={{
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  padding: '20px',
                }}>
                  <div style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    Study
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ color: '#e2e8f0', fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>
                      {results.total_cases}
                    </span>
                    <span style={{ color: '#64748b', fontSize: '0.8rem' }}>cases</span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Users size={12} />
                    {results.total_reviewers} reviewers
                  </div>
                </div>
              </div>

              {/* Reviewer Progress */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '24px',
              }}>
                <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 14px' }}>
                  Reviewer Progress
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(results.reviewers.length, 4)}, 1fr)`, gap: '12px' }}>
                  {results.reviewers.map(r => (
                    <div key={r.reviewer_id} style={{
                      background: 'rgba(15, 23, 42, 0.5)',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      padding: '14px',
                    }}>
                      <div style={{ color: '#cbd5e1', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                        {r.reviewer_name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${r.total_cases > 0 ? (r.cases_completed / r.total_cases) * 100 : 0}%`,
                            background: r.cases_completed === r.total_cases ? '#16A34A' : '#8B5CF6',
                            borderRadius: '3px',
                          }} />
                        </div>
                        <span style={{ color: '#94a3b8', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                          {r.cases_completed}/{r.total_cases}
                        </span>
                        {r.cases_completed === r.total_cases && (
                          <CheckCircle2 size={14} color="#16A34A" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI vs Human Consensus */}
              {results.ai_vs_consensus.cases_compared > 0 && (
                <div style={{
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '24px',
                }}>
                  <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 14px' }}>
                    AI vs. Human Consensus
                  </h3>
                  <div style={{ display: 'flex', gap: '24px', marginBottom: '16px' }}>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                        Agreement Rate
                      </div>
                      <span style={{ color: '#e2e8f0', fontSize: '1.3rem', fontWeight: 700 }}>
                        {formatPct(results.ai_vs_consensus.agreement_rate)}
                      </span>
                    </div>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                        Weighted Kappa
                      </div>
                      <span style={{ color: kappaColor(results.ai_vs_consensus.weighted_kappa), fontSize: '1.3rem', fontWeight: 700 }}>
                        {results.ai_vs_consensus.weighted_kappa.toFixed(3)}
                      </span>
                    </div>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                        Cases Compared
                      </div>
                      <span style={{ color: '#e2e8f0', fontSize: '1.3rem', fontWeight: 700 }}>
                        {results.ai_vs_consensus.cases_compared}
                      </span>
                    </div>
                  </div>

                  {/* Disagreements */}
                  {results.ai_vs_consensus.disagreements.length > 0 && (
                    <div>
                      <h4 style={{ color: '#f59e0b', fontSize: '0.8rem', fontWeight: 600, margin: '0 0 8px' }}>
                        Disagreements ({results.ai_vs_consensus.disagreements.length})
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {results.ai_vs_consensus.disagreements.map(d => (
                          <div key={d.case_id} style={{
                            padding: '10px 14px',
                            background: 'rgba(245, 158, 11, 0.08)',
                            border: '1px solid rgba(245, 158, 11, 0.2)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                          }}>
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              Case {d.case_number}
                            </span>
                            <span style={{ color: '#cbd5e1', fontSize: '0.75rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {d.case_title}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                background: TIER_DISPLAY[d.ai_tier]?.bgColor || '#6B7280',
                                color: '#fff',
                              }}>
                                AI: {TIER_DISPLAY[d.ai_tier]?.label || d.ai_tier}
                              </span>
                              <ArrowRight size={12} color="#64748b" />
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                background: TIER_DISPLAY[d.consensus_tier]?.bgColor || '#6B7280',
                                color: '#fff',
                              }}>
                                Human: {TIER_DISPLAY[d.consensus_tier]?.label || d.consensus_tier}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Pairwise Reviewer Comparison */}
              {results.pairwise.length > 0 && (
                <div style={{
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '24px',
                }}>
                  <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 14px' }}>
                    Pairwise Reviewer Agreement
                  </h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid #334155' }}>
                            Reviewer A
                          </th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid #334155' }}>
                            Reviewer B
                          </th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid #334155' }}>
                            Cases
                          </th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid #334155' }}>
                            Agreement
                          </th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid #334155' }}>
                            Weighted Kappa
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.pairwise.map((p, i) => (
                          <tr key={i}>
                            <td style={{ padding: '8px 12px', color: '#cbd5e1', fontSize: '0.8rem', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>
                              {p.reviewer_a_name}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#cbd5e1', fontSize: '0.8rem', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>
                              {p.reviewer_b_name}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>
                              {p.cases_compared}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#e2e8f0', fontSize: '0.8rem', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>
                              {formatPct(p.agreement_rate)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>
                              <span style={{ color: kappaColor(p.weighted_kappa), fontWeight: 700, fontSize: '0.8rem' }}>
                                {p.weighted_kappa.toFixed(3)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Per-Tier Agreement */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '24px',
              }}>
                <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 14px' }}>
                  Agreement by Triage Tier
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {TIER_ORDER.map(tier => {
                    const ta = results.tier_agreement[tier]
                    if (!ta || ta.total === 0) return null
                    return (
                      <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '4px',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          background: TIER_DISPLAY[tier].bgColor,
                          color: '#fff',
                          width: '110px',
                          textAlign: 'center',
                          flexShrink: 0,
                        }}>
                          {TIER_DISPLAY[tier].label}
                        </span>
                        <div style={{ flex: 1, height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${ta.agreement_rate * 100}%`,
                            background: TIER_DISPLAY[tier].bgColor,
                            borderRadius: '4px',
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                        <span style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600, width: '40px', textAlign: 'right', flexShrink: 0 }}>
                          {formatPct(ta.agreement_rate)}
                        </span>
                        <span style={{ color: '#64748b', fontSize: '0.7rem', width: '50px', textAlign: 'right', flexShrink: 0 }}>
                          n={ta.total}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Per-Case Detail Table */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '24px',
              }}>
                <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 14px' }}>
                  Case-by-Case Detail
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid #334155' }}>
                          #
                        </th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid #334155' }}>
                          Case
                        </th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid #334155' }}>
                          AI Tier
                        </th>
                        {results.reviewers.map(r => (
                          <th key={r.reviewer_id} style={{ padding: '8px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid #334155' }}>
                            {r.reviewer_name.split(' ')[0]}
                          </th>
                        ))}
                        <th style={{ padding: '8px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid #334155' }}>
                          Consensus
                        </th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid #334155' }}>
                          Agree?
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.case_details.map(cd => (
                        <tr key={cd.case_id} style={{ background: cd.agreement ? 'transparent' : 'rgba(245, 158, 11, 0.05)' }}>
                          <td style={{ padding: '6px 10px', color: '#94a3b8', fontSize: '0.75rem', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>
                            {cd.case_number}
                          </td>
                          <td style={{ padding: '6px 10px', color: '#cbd5e1', fontSize: '0.75rem', borderBottom: '1px solid rgba(51, 65, 85, 0.5)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cd.case_title}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>
                            {cd.ai_tier ? (
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '3px',
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                background: TIER_DISPLAY[cd.ai_tier]?.bgColor || '#6B7280',
                                color: '#fff',
                              }}>
                                {TIER_DISPLAY[cd.ai_tier]?.label || cd.ai_tier}
                              </span>
                            ) : (
                              <span style={{ color: '#475569', fontSize: '0.7rem' }}>—</span>
                            )}
                          </td>
                          {results.reviewers.map(r => {
                            const tier = cd.reviewer_tiers[r.reviewer_name] as TriageTier | undefined
                            return (
                              <td key={r.reviewer_id} style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>
                                {tier ? (
                                  <span style={{
                                    padding: '2px 6px',
                                    borderRadius: '3px',
                                    fontSize: '0.6rem',
                                    fontWeight: 700,
                                    background: TIER_DISPLAY[tier]?.bgColor || '#6B7280',
                                    color: '#fff',
                                  }}>
                                    {TIER_DISPLAY[tier]?.label || tier}
                                  </span>
                                ) : (
                                  <span style={{ color: '#475569', fontSize: '0.7rem' }}>—</span>
                                )}
                              </td>
                            )
                          })}
                          <td style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>
                            {cd.consensus_tier ? (
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '3px',
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                background: TIER_DISPLAY[cd.consensus_tier]?.bgColor || '#6B7280',
                                color: '#fff',
                              }}>
                                {TIER_DISPLAY[cd.consensus_tier]?.label || cd.consensus_tier}
                              </span>
                            ) : (
                              <span style={{ color: '#475569', fontSize: '0.7rem' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>
                            {cd.agreement ? (
                              <CheckCircle2 size={14} color="#16A34A" />
                            ) : (
                              <span style={{ color: '#F59E0B', fontSize: '0.7rem', fontWeight: 600 }}>Disagree</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Interpretation Guide */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '20px',
              }}>
                <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 12px' }}>
                  Interpretation Guide
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <h4 style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, margin: '0 0 8px' }}>
                      Kappa / Alpha Scale
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {[
                        { range: '0.81 – 1.00', label: 'Almost perfect', color: '#16A34A' },
                        { range: '0.61 – 0.80', label: 'Substantial', color: '#22C55E' },
                        { range: '0.41 – 0.60', label: 'Moderate', color: '#F59E0B' },
                        { range: '0.21 – 0.40', label: 'Fair', color: '#EA580C' },
                        { range: '0.00 – 0.20', label: 'Slight', color: '#EF4444' },
                        { range: '< 0.00', label: 'Less than chance', color: '#EF4444' },
                      ].map(item => (
                        <div key={item.range} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: item.color, flexShrink: 0 }} />
                          <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>
                            <strong style={{ color: '#cbd5e1' }}>{item.range}</strong> — {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, margin: '0 0 8px' }}>
                      About the Metrics
                    </h4>
                    <ul style={{ color: '#94a3b8', fontSize: '0.72rem', lineHeight: 1.6, margin: 0, padding: '0 0 0 16px' }}>
                      <li><strong style={{ color: '#cbd5e1' }}>Fleiss&apos; Kappa</strong> — Measures multi-rater agreement above chance for categorical data (exact tier match).</li>
                      <li><strong style={{ color: '#cbd5e1' }}>Krippendorff&apos;s Alpha</strong> — Handles missing data and ordinal scales. Penalizes large disagreements more than small ones.</li>
                      <li><strong style={{ color: '#cbd5e1' }}>Weighted Kappa</strong> — Pairwise agreement that accounts for the ordered nature of triage tiers (being off by 1 tier is less severe than being off by 3).</li>
                      <li><strong style={{ color: '#cbd5e1' }}>Consensus</strong> — Determined by majority vote among all reviewers for each case.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </PlatformShell>
  )
}
