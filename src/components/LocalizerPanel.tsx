'use client'

/**
 * LocalizerPanel — Physician-facing live differential diagnosis panel.
 *
 * Shown alongside the AI Historian during an active session. Updates
 * in real-time as the localizer pipeline runs every 3 patient turns.
 *
 * Displays:
 *  • Top differential diagnoses with likelihood badges
 *  • Neuroanatomical localization hypothesis
 *  • Suggested follow-up questions
 *  • Evidence sources cited from the KB
 */

import type { LocalizerResponse } from '@/lib/consult/localizer-types'

interface LocalizerPanelProps {
  data: LocalizerResponse | null
  isLoading: boolean
}

function likelihoodColor(level: 'high' | 'medium' | 'low'): string {
  if (level === 'high') return '#22c55e'
  if (level === 'medium') return '#f59e0b'
  return '#64748b'
}

function likelihoodWidth(level: 'high' | 'medium' | 'low'): number {
  if (level === 'high') return 85
  if (level === 'medium') return 55
  return 25
}

export default function LocalizerPanel({ data, isLoading }: LocalizerPanelProps) {
  const hasData = data !== null
  const isEmpty = hasData && data.differential.length === 0 && !data.localizationHypothesis

  return (
    <div style={{
      width: '340px',
      flexShrink: 0,
      background: 'rgba(15,23,42,0.8)',
      border: '1px solid rgba(51,65,85,0.8)',
      borderRadius: '12px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid rgba(51,65,85,0.6)',
        background: 'rgba(13,148,136,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.02em' }}>
            Physician View
          </span>
          <span style={{
            padding: '1px 6px',
            borderRadius: '4px',
            background: 'rgba(13,148,136,0.2)',
            color: '#5eead4',
            fontSize: '0.65rem',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}>
            Live
          </span>
        </div>

        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#0d9488',
              animation: 'localizerPulse 1.2s ease-in-out infinite',
            }} />
            <span style={{ color: '#5eead4', fontSize: '0.65rem' }}>Analyzing…</span>
          </div>
        )}
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}>

        {/* Empty / waiting state */}
        {!hasData && !isLoading && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 16px',
            gap: '8px',
            opacity: 0.5,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span style={{ color: '#64748b', fontSize: '0.8rem', textAlign: 'center', lineHeight: 1.4 }}>
              Analysis updates after every 3 patient responses
            </span>
          </div>
        )}

        {/* Loading skeleton */}
        {!hasData && isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[80, 60, 70].map((w, i) => (
              <div key={i} style={{
                height: 12,
                borderRadius: 6,
                background: 'rgba(51,65,85,0.6)',
                width: `${w}%`,
                animation: 'localizerSkeleton 1.5s ease-in-out infinite',
              }} />
            ))}
          </div>
        )}

        {/* Insufficient data */}
        {hasData && isEmpty && (
          <div style={{ color: '#64748b', fontSize: '0.78rem', textAlign: 'center', padding: '16px 8px' }}>
            Gathering more clinical information…
          </div>
        )}

        {hasData && !isEmpty && (
          <>
            {/* ── Differential Diagnosis ───────────────────────────── */}
            {data!.differential.length > 0 && (
              <section>
                <div style={{
                  color: '#94a3b8',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  marginBottom: '8px',
                }}>
                  Differential
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data!.differential.map((dx, i) => (
                    <div key={i}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: '3px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            width: 16, height: 16, borderRadius: '50%',
                            background: 'rgba(51,65,85,0.8)',
                            color: '#94a3b8',
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {i + 1}
                          </span>
                          <span style={{ color: '#e2e8f0', fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.3 }}>
                            {dx.diagnosis}
                          </span>
                        </div>
                        <span style={{
                          color: likelihoodColor(dx.likelihood),
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          flexShrink: 0,
                          marginLeft: '8px',
                          textTransform: 'uppercase',
                        }}>
                          {dx.likelihood}
                        </span>
                      </div>

                      {/* Likelihood bar */}
                      <div style={{
                        height: 3,
                        background: 'rgba(51,65,85,0.6)',
                        borderRadius: 2,
                        marginBottom: '4px',
                        marginLeft: '22px',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${likelihoodWidth(dx.likelihood)}%`,
                          background: likelihoodColor(dx.likelihood),
                          borderRadius: 2,
                          transition: 'width 0.5s ease',
                        }} />
                      </div>

                      {/* ICD-10 + rationale */}
                      <div style={{ marginLeft: '22px', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                        {dx.icd10 && (
                          <span style={{
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: 'rgba(51,65,85,0.5)',
                            color: '#64748b',
                            fontSize: '0.6rem',
                            fontFamily: 'monospace',
                          }}>
                            {dx.icd10}
                          </span>
                        )}
                      </div>
                      {dx.rationale && (
                        <p style={{ marginLeft: '22px', color: '#64748b', fontSize: '0.68rem', margin: '2px 0 0 22px', lineHeight: 1.3 }}>
                          {dx.rationale}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Localization ─────────────────────────────────────── */}
            {data!.localizationHypothesis && (
              <section>
                <div style={{
                  color: '#94a3b8',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  marginBottom: '8px',
                }}>
                  Localization
                </div>
                <div style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'rgba(139,92,246,0.08)',
                  border: '1px solid rgba(139,92,246,0.2)',
                }}>
                  <p style={{ color: '#c4b5fd', fontWeight: 600, fontSize: '0.78rem', margin: 0, lineHeight: 1.5 }}>
                    {data!.localizationHypothesis}
                  </p>
                </div>
              </section>
            )}

            {/* ── Suggested Questions ───────────────────────────────── */}
            {data!.followUpQuestions.length > 0 && (
              <section>
                <div style={{
                  color: '#94a3b8',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  marginBottom: '8px',
                }}>
                  Suggested Questions
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {data!.followUpQuestions.map((q, i) => (
                    <div key={i} style={{
                      padding: '8px 10px',
                      borderRadius: '7px',
                      background: 'rgba(30,41,59,0.6)',
                      border: '1px solid rgba(51,65,85,0.6)',
                    }}>
                      <span style={{ color: '#e2e8f0', fontSize: '0.76rem', lineHeight: 1.4 }}>
                        {q}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── KB Sources ───────────────────────────────────────── */}
            {data!.kbSources.length > 0 && (
              <section>
                <div style={{
                  color: '#94a3b8',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  marginBottom: '6px',
                }}>
                  Evidence Sources
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {data!.kbSources.map((src, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '5px 8px',
                      borderRadius: '6px',
                      background: 'rgba(30,41,59,0.4)',
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                      </svg>
                      <span style={{ color: '#94a3b8', fontSize: '0.7rem', lineHeight: 1.3 }}>{src}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

      </div>

      {/* Footer — timing */}
      {data && (
        <div style={{
          padding: '6px 14px',
          borderTop: '1px solid rgba(51,65,85,0.4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ color: '#334155', fontSize: '0.6rem' }}>
            {data.confidence} confidence
          </span>
          <span style={{ color: '#334155', fontSize: '0.6rem' }}>
            {data.processingMs}ms
          </span>
        </div>
      )}

      <style>{`
        @keyframes localizerPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        @keyframes localizerSkeleton {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}
