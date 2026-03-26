'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import MobileLayout from '@/components/mobile/MobileLayout'
import MobileChartView from '@/components/mobile/MobileChartView'

// Fallback sample data — used only when API is unreachable
const fallbackPatients: Record<string, {
  id: string
  name: string
  age: number
  gender: string
  reason?: string
}> = {
  '1': { id: '1', name: 'Eleanor Martinez', age: 67, gender: 'F', reason: 'New onset headaches' },
  '2': { id: '2', name: 'Robert Chen', age: 52, gender: 'M', reason: 'Tremor evaluation' },
  '3': { id: '3', name: 'Sarah Johnson', age: 45, gender: 'F', reason: 'Migraine follow-up' },
  '4': { id: '4', name: 'Michael Williams', age: 73, gender: 'M', reason: 'Memory concerns' },
  '5': { id: '5', name: 'Lisa Thompson', age: 38, gender: 'F', reason: 'MS follow-up' },
}

interface PatientData {
  id: string
  name: string
  age: number
  gender: string
  reason?: string
}

export default function MobileChartPage() {
  const router = useRouter()
  const params = useParams()
  const patientId = params.id as string

  const [patient, setPatient] = useState<PatientData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [noteData, setNoteData] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  // Fetch patient data from API with localStorage cache fallback
  const fetchPatientData = useCallback(async () => {
    setIsLoading(true)

    // Check localStorage cache first for fast display
    const cachedPatient = localStorage.getItem(`mobile-patient-${patientId}`)
    if (cachedPatient) {
      try {
        const cached = JSON.parse(cachedPatient)
        setPatient(cached)
      } catch {
        // Ignore parse errors
      }
    }

    try {
      // Try fetching real patient data
      const res = await fetch(`/api/patients/${patientId}`)
      if (res.ok) {
        const data = await res.json()
        const p = data.patient || data
        const patientData: PatientData = {
          id: p.id || patientId,
          name: p.full_name || p.name || 'Unknown Patient',
          age: p.age || 0,
          gender: p.gender || 'U',
          reason: p.chief_complaint || p.reason || undefined,
        }
        setPatient(patientData)
        // Cache for offline/fast access
        localStorage.setItem(`mobile-patient-${patientId}`, JSON.stringify(patientData))
        setIsLoading(false)
        return
      }
    } catch (err) {
      console.error('Failed to fetch patient data:', err)
    }

    // Graceful fallback to sample data if API fails
    if (!patient) {
      const fallback = fallbackPatients[patientId] || null
      setPatient(fallback)
    }
    setIsLoading(false)
  }, [patientId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchPatientData()
  }, [fetchPatientData])

  useEffect(() => {
    // Load any saved draft from localStorage
    const savedDraft = localStorage.getItem(`mobile-draft-${patientId}`)
    if (savedDraft) {
      try {
        setNoteData(JSON.parse(savedDraft))
      } catch (e) {
        console.error('Failed to load draft:', e)
      }
    }
  }, [patientId])

  const handleUpdateNote = (field: string, value: string) => {
    setNoteData(prev => {
      const updated = { ...prev, [field]: value }
      // Auto-save to localStorage
      localStorage.setItem(`mobile-draft-${patientId}`, JSON.stringify(updated))
      return updated
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Try saving to the API
      const res = await fetch(`/api/patients/${patientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_data: noteData }),
      })
      if (!res.ok) {
        console.warn('Note save to API failed, kept in localStorage')
      }
    } catch {
      console.warn('Note save to API failed, kept in localStorage')
    }
    setIsSaving(false)

    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate([50, 50, 50])
    }
  }

  const handleSign = async () => {
    setIsSaving(true)
    try {
      // Try signing via API
      await fetch(`/api/patients/${patientId}/notes/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_data: noteData }),
      })
    } catch {
      console.warn('Note sign via API failed')
    }

    // Clear draft
    localStorage.removeItem(`mobile-draft-${patientId}`)

    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100])
    }

    setIsSaving(false)

    // Navigate back
    router.push('/mobile')
  }

  if (isLoading && !patient) {
    return (
      <MobileLayout
        activeTab="chart"
        showHeader={true}
        onBack={() => router.push('/mobile')}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '40px',
          color: 'var(--text-muted)',
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            margin: '0 auto 16px',
            border: '3px solid var(--border)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ fontSize: '14px' }}>Loading patient data...</div>
        </div>
      </MobileLayout>
    )
  }

  if (!patient) {
    return (
      <MobileLayout
        activeTab="chart"
        showHeader={true}
        onBack={() => router.push('/mobile')}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '40px',
          color: 'var(--text-muted)',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.5, marginBottom: '16px' }}>
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div style={{ fontSize: '15px', fontWeight: 500 }}>Patient not found</div>
        </div>
      </MobileLayout>
    )
  }

  return (
    <MobileLayout
      activeTab="chart"
      patientName={patient.name}
      onBack={() => router.push('/mobile')}
      showHeader={false}
    >
      <MobileChartView
        patient={patient}
        noteData={noteData}
        onUpdateNote={handleUpdateNote}
        onSave={handleSave}
        onSign={handleSign}
      />
    </MobileLayout>
  )
}
