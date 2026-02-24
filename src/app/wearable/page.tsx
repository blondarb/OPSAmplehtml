'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { WearableDemoData } from '@/lib/wearable/types'
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

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/wearable/demo-data')
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Failed to load wearable demo data')
        }
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        background: '#0EA5E9',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}>
        <Link href="/" style={{
          color: 'rgba(255,255,255,0.9)',
          textDecoration: 'none',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Home
        </Link>
        <div style={{
          width: '1px',
          height: '20px',
          background: 'rgba(255,255,255,0.3)',
        }} />
        <h1 style={{
          color: '#fff',
          fontSize: '1rem',
          fontWeight: 600,
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flex: 1,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M7 12h2l2-4 2 8 2-4h2" />
          </svg>
          Wearable Monitoring
        </h1>
        <span style={{
          color: '#0EA5E9',
          fontSize: '0.7rem',
          fontWeight: 600,
          padding: '2px 10px',
          background: '#fff',
          borderRadius: '10px',
          letterSpacing: '0.5px',
        }}>
          DEMO
        </span>
      </div>

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
            Loading wearable demo data...
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
              fetch('/api/wearable/demo-data')
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
  )
}
