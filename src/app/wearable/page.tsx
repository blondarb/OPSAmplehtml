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
          }
        } else {
          // Fallback: load demo data without patient switcher
          const res = await fetch('/api/wearable/demo-data')
          if (!res.ok) throw new Error('Failed to load wearable demo data')
          const json = await res.json()
          setData(json)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  async function handlePatientChange(patientId: string) {
    setSelectedPatientId(patientId)
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/wearable/demo-data?patient_id=${patientId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to load patient data')
      }
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
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
