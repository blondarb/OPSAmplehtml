'use client'

import { useState, useEffect, useCallback } from 'react'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { Activity } from 'lucide-react'
import ConnectedDevicesPanel from '@/components/rpm/ConnectedDevicesPanel'
import VitalsTimeline from '@/components/rpm/VitalsTimeline'
import GlucoseDashboard from '@/components/rpm/GlucoseDashboard'
import ClinicalAlertsFeed from '@/components/rpm/ClinicalAlertsFeed'
import BillingTracker from '@/components/rpm/BillingTracker'
import DeviceOnboarding from '@/components/rpm/DeviceOnboarding'
import type { ConnectedDevice, VitalsReading, GlucoseReading, BillingPeriod, ClinicalAlert, RPMPatientSummary } from '@/lib/rpm/types'

export default function RPMDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [patients, setPatients] = useState<RPMPatientSummary[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [devices, setDevices] = useState<ConnectedDevice[]>([])
  const [vitals, setVitals] = useState<VitalsReading[]>([])
  const [glucose, setGlucose] = useState<GlucoseReading[]>([])
  const [billing, setBilling] = useState<BillingPeriod[]>([])
  const [alerts, setAlerts] = useState<ClinicalAlert[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Load patient list on mount
  useEffect(() => {
    async function init() {
      try {
        const pRes = await fetch('/api/wearable/patients')
        if (pRes.ok) {
          const pJson = await pRes.json()
          setPatients(pJson.patients || [])
          if (pJson.patients?.length > 0) {
            setSelectedPatientId(pJson.patients[0].id)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load patients')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const loadRPMData = useCallback(async (patientId: string) => {
    const since30d = new Date(Date.now() - 30 * 86400000).toISOString()
    const since24h = new Date(Date.now() - 24 * 3600000).toISOString()

    const [devRes, vitRes, gluRes, bilRes, alertRes] = await Promise.allSettled([
      fetch(`/api/rpm/devices?patient_id=${patientId}`).then(r => r.json()),
      fetch(`/api/rpm/vitals?patient_id=${patientId}&since=${since30d}`).then(r => r.json()),
      fetch(`/api/rpm/glucose?patient_id=${patientId}&since=${since24h}&limit=288`).then(r => r.json()),
      fetch(`/api/rpm/billing?patient_id=${patientId}`).then(r => r.json()),
      fetch(`/api/rpm/alerts?patient_id=${patientId}&limit=50`).then(r => r.json()),
    ])

    setDevices(devRes.status === 'fulfilled' ? (Array.isArray(devRes.value) ? devRes.value : []) : [])
    setVitals(vitRes.status === 'fulfilled' ? (vitRes.value.readings || []) : [])
    setGlucose(gluRes.status === 'fulfilled' ? (gluRes.value.readings || []) : [])
    setBilling(bilRes.status === 'fulfilled' ? (Array.isArray(bilRes.value) ? bilRes.value : []) : [])
    setAlerts(alertRes.status === 'fulfilled' ? (alertRes.value.alerts || []) : [])
    setLastUpdated(new Date())
  }, [])

  // Load RPM data when patient changes
  useEffect(() => {
    if (!selectedPatientId) return
    loadRPMData(selectedPatientId)
  }, [selectedPatientId, loadRPMData])

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (!selectedPatientId) return
    const interval = setInterval(() => {
      if (!document.hidden) {
        loadRPMData(selectedPatientId)
      }
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [selectedPatientId, loadRPMData])

  function handlePatientChange(id: string) {
    setSelectedPatientId(id)
    setDevices([])
    setVitals([])
    setGlucose([])
    setBilling([])
    setAlerts([])
  }

  async function handleConnectDevice(provider: string) {
    if (!selectedPatientId) return
    try {
      const res = await fetch('/api/rpm/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: selectedPatientId, provider }),
      })
      const data = await res.json()
      if (data.authorization_url) {
        window.open(data.authorization_url, '_blank', 'width=600,height=700')
      }
    } catch (err) {
      console.error('Device connect error:', err)
    }
  }

  async function handleSyncDevice(deviceId: string) {
    // Manual sync trigger would go here
    if (selectedPatientId) {
      await loadRPMData(selectedPatientId)
    }
  }

  function handleOnboardingComplete() {
    if (selectedPatientId) {
      loadRPMData(selectedPatientId)
    }
  }

  const selectedPatient = patients.find(p => p.id === selectedPatientId)

  return (
    <PlatformShell>
      <FeatureSubHeader
        title="RPM Multi-Device Dashboard"
        icon={Activity}
        accentColor="#0D9488"
      />

      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Patient selector + status bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '20px', flexWrap: 'wrap', gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <select
              value={selectedPatientId || ''}
              onChange={e => handlePatientChange(e.target.value)}
              style={{
                background: '#1e293b', border: '1px solid #334155', borderRadius: '8px',
                padding: '8px 12px', color: '#f1f5f9', fontSize: '13px', minWidth: '220px',
              }}
            >
              <option value="" disabled>Select patient...</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.name} — {p.primary_diagnosis}</option>
              ))}
            </select>
            {selectedPatient && (
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                {selectedPatient.age}y {selectedPatient.sex}
              </span>
            )}
          </div>
          {lastUpdated && (
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              Updated {lastUpdated.toLocaleTimeString()} · Auto-refresh 5m
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
            Loading patients...
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#EF4444' }}>
            {error}
          </div>
        ) : !selectedPatientId ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
            Select a patient to view RPM data
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '16px' }}>
            {/* Left sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <ConnectedDevicesPanel
                devices={devices}
                onConnectDevice={handleConnectDevice}
                onSyncDevice={handleSyncDevice}
              />
              <BillingTracker periods={billing} />
              <DeviceOnboarding
                patientId={selectedPatientId}
                onComplete={handleOnboardingComplete}
              />
            </div>

            {/* Main content */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <VitalsTimeline readings={vitals} />
              <GlucoseDashboard readings={glucose} />
              <ClinicalAlertsFeed alerts={alerts} />
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .rpm-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </PlatformShell>
  )
}
