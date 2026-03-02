'use client'

import { useState, useEffect } from 'react'
import type { WearableDemoData, PatientSummary, AIAnalysisResponse } from '@/lib/wearable/types'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { Watch } from 'lucide-react'
import ConceptHero from '@/components/wearable/ConceptHero'
import DataSourceCards from '@/components/wearable/DataSourceCards'
import DataTypeMatrix from '@/components/wearable/DataTypeMatrix'
import ClinicalUseCaseTable from '@/components/wearable/ClinicalUseCaseTable'
import PatientTimeline from '@/components/wearable/PatientTimeline'
import ClinicianAlertDashboard from '@/components/wearable/ClinicianAlertDashboard'
import AIAnalysisLog from '@/components/wearable/AIAnalysisLog'
import PatientNudgePreview from '@/components/wearable/PatientNudgePreview'
import SDNEBaselineOverlay from '@/components/wearable/SDNEBaselineOverlay'
import DisclaimerBanner from '@/components/wearable/DisclaimerBanner'

export default function WearablePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<WearableDemoData | null>(null)
  const [patients, setPatients] = useState<PatientSummary[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResponse | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    async function init() {
      try {
        // Fetch patient list
        const pRes = await fetch('/api/wearable/patients')
        if (pRes.ok) {
          const pJson = await pRes.json()
          setPatients(pJson.patients || [])
          // Auto-select first patient
          if (pJson.patients?.length > 0) {
            const firstId = pJson.patients[0].id
            setSelectedPatientId(firstId)
            // Fetch data for first patient
            const dRes = await fetch(`/api/wearable/demo-data?patient_id=${firstId}`)
            if (!dRes.ok) {
              const body = await dRes.json().catch(() => ({}))
              throw new Error(body.error || 'Failed to load wearable data')
            }
            const dJson = await dRes.json()
            setData(dJson)
            setLastUpdated(new Date())
          }
        } else {
          // Fallback: load demo data without patient switcher
          const res = await fetch('/api/wearable/demo-data')
          if (!res.ok) throw new Error('Failed to load wearable demo data')
          const json = await res.json()
          setData(json)
          setLastUpdated(new Date())
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // Auto-refresh every 15 minutes, pause when tab hidden
  useEffect(() => {
    if (!selectedPatientId) return

    const POLL_INTERVAL = 15 * 60 * 1000 // 15 minutes
    let intervalId: ReturnType<typeof setInterval>
    let lastFetchTime = Date.now()

    async function silentRefresh() {
      try {
        const res = await fetch(`/api/wearable/demo-data?patient_id=${selectedPatientId}`)
        if (res.ok) {
          const json = await res.json()
          setData(json)
          setLastUpdated(new Date())
          lastFetchTime = Date.now()
        }
      } catch {
        // Silent fail — don't disrupt the UI
      }
    }

    function startPolling() {
      intervalId = setInterval(silentRefresh, POLL_INTERVAL)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // If enough time passed while hidden, refresh immediately
        if (Date.now() - lastFetchTime >= POLL_INTERVAL) {
          silentRefresh()
        }
        startPolling()
      } else {
        clearInterval(intervalId)
      }
    }

    startPolling()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [selectedPatientId])

  async function handlePatientChange(patientId: string) {
    setSelectedPatientId(patientId)
    setLoading(true)
    setError(null)
    setAnalysisResult(null)
    setAnalysisError(null)
    try {
      const res = await fetch(`/api/wearable/demo-data?patient_id=${patientId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to load patient data')
      }
      const json = await res.json()
      setData(json)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function runAnalysis() {
    if (!data?.patient?.id) return
    setAnalyzing(true)
    setAnalysisError(null)
    setAnalysisResult(null)
    try {
      const res = await fetch('/api/wearable/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: data.patient.id, analysis_window_days: 7 }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Analysis failed')
      }
      const result = await res.json()
      setAnalysisResult(result)
      // Re-fetch patient data to pick up any new anomalies/alerts
      const refreshRes = await fetch(`/api/wearable/demo-data?patient_id=${data.patient.id}`)
      if (refreshRes.ok) {
        const refreshed = await refreshRes.json()
        setData(refreshed)
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  const selectedSource = patients.find(p => p.id === selectedPatientId)?.source || 'demo'

  return (
    <PlatformShell>
    <FeatureSubHeader
      title="Wearable Monitoring"
      icon={Watch}
      accentColor="#0EA5E9"
      showDemo={selectedSource === 'demo'}
      badgeText={selectedSource === 'live' ? 'Live' : undefined}
      badgeBg={selectedSource === 'live' ? 'rgba(16, 185, 129, 0.4)' : undefined}
      nextStep={{ label: 'Command Center', route: '/dashboard' }}
    />
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    }}>

      {/* Loading State */}
      {loading && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '120px 24px',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="2" style={{ animation: 'wearable-spin 1s linear infinite', marginBottom: '16px' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <p style={{ color: '#e2e8f0', fontSize: '0.95rem', fontWeight: 500, margin: 0 }}>
            Loading wearable data...
          </p>
          <style>{`
            @keyframes wearable-spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '120px 24px',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '16px' }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <p style={{ color: '#fca5a5', fontSize: '0.95rem', fontWeight: 500, margin: '0 0 16px' }}>
            {error}
          </p>
          <button
            onClick={() => {
              setError(null)
              setLoading(true)
              fetch(`/api/wearable/demo-data${selectedPatientId ? `?patient_id=${selectedPatientId}` : ''}`)
                .then(res => {
                  if (!res.ok) throw new Error('Failed to load')
                  return res.json()
                })
                .then(json => setData(json))
                .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
                .finally(() => setLoading(false))
            }}
            style={{
              padding: '10px 28px',
              borderRadius: '8px',
              background: '#0EA5E9',
              color: '#fff',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '48px',
        }}>
          {/* Patient Switcher */}
          {patients.length > 1 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <label style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 500 }}>
                Patient:
              </label>
              <select
                value={selectedPatientId || ''}
                onChange={(e) => handlePatientChange(e.target.value)}
                style={{
                  background: '#1e293b',
                  color: '#e2e8f0',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  minWidth: '280px',
                }}
              >
                {patients.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.primary_diagnosis} [{p.source === 'live' ? '● Live' : 'Demo'}]
                  </option>
                ))}
              </select>
              {lastUpdated && (
                <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                  Last updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          )}
          <ConceptHero />
          <DataSourceCards />
          <DataTypeMatrix />
          <ClinicalUseCaseTable />
          <PatientTimeline
            dailySummaries={data.dailySummaries}
            anomalies={data.anomalies}
            patient={data.patient}
          />

          {/* AI Analysis Section */}
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
            }}>
              <div>
                <h2 style={{ color: '#fff', fontSize: '1.15rem', fontWeight: 700, margin: '0 0 4px' }}>
                  AI Analysis
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
                  Run GPT-5.2 analysis on this patient&apos;s wearable data
                </p>
              </div>
              <button
                onClick={runAnalysis}
                disabled={analyzing || !data}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  background: analyzing ? '#334155' : '#8B5CF6',
                  color: '#fff',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: analyzing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {analyzing && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'wearable-spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                )}
                {analyzing ? 'Analyzing...' : 'Run AI Analysis'}
              </button>
            </div>

            {analysisError && (
              <div style={{
                background: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '16px',
              }}>
                <p style={{ color: '#fca5a5', fontSize: '0.85rem', margin: 0 }}>{analysisError}</p>
              </div>
            )}

            {analysisResult && (
              <div style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '24px',
              }}>
                {/* Status badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '8px',
                    background: analysisResult.overall_status === 'normal' ? 'rgba(16, 185, 129, 0.15)' :
                                analysisResult.overall_status === 'watch' ? 'rgba(37, 99, 235, 0.15)' :
                                analysisResult.overall_status === 'concern' ? 'rgba(217, 119, 6, 0.15)' :
                                'rgba(220, 38, 38, 0.15)',
                    color: analysisResult.overall_status === 'normal' ? '#10B981' :
                           analysisResult.overall_status === 'watch' ? '#3B82F6' :
                           analysisResult.overall_status === 'concern' ? '#F59E0B' : '#DC2626',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}>
                    {analysisResult.overall_status.toUpperCase()}
                  </span>
                  <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
                    {analysisResult.analysis_period}
                  </span>
                </div>

                {/* Narrative */}
                <p style={{ color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.7, margin: '0 0 16px' }}>
                  {analysisResult.narrative_summary}
                </p>

                {/* Anomalies detected */}
                {analysisResult.anomalies && analysisResult.anomalies.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 8px' }}>
                      Anomalies Detected
                    </h4>
                    {analysisResult.anomalies.map((a, i) => (
                      <div key={i} style={{
                        background: '#0f172a',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        marginBottom: '8px',
                      }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600 }}>
                            {a.description}
                          </span>
                        </div>
                        <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '4px 0 0', lineHeight: 1.5 }}>
                          {a.clinical_significance}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Trends */}
                {analysisResult.trends_observed && analysisResult.trends_observed.length > 0 && (
                  <div>
                    <h4 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 8px' }}>
                      Trends Observed
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {analysisResult.trends_observed.map((t, i) => (
                        <li key={i} style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '4px', lineHeight: 1.5 }}>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Not HIPAA disclaimer */}
                <div style={{
                  marginTop: '16px',
                  padding: '8px 12px',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  borderRadius: '6px',
                }}>
                  <p style={{ color: '#F59E0B', fontSize: '0.75rem', margin: 0, fontStyle: 'italic' }}>
                    This analysis is for demonstration purposes only. This system is not HIPAA-compliant and should not be used for clinical decision-making.
                  </p>
                </div>
              </div>
            )}
          </div>

          <ClinicianAlertDashboard
            alerts={data.alerts}
            anomalies={data.anomalies}
          />
          <AIAnalysisLog
            patientId={data.patient.id}
            anomalies={data.anomalies}
          />
          <PatientNudgePreview anomalies={data.anomalies} />
          <SDNEBaselineOverlay />
          <DisclaimerBanner />
        </div>
      )}
    </div>
    </PlatformShell>
  )
}
