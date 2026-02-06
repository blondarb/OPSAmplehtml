'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import MobileLayout from '@/components/mobile/MobileLayout'
import MobileChartView from '@/components/mobile/MobileChartView'

// Sample patient data - in production would come from database
const samplePatients: Record<string, {
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

export default function MobileChartPage() {
  const router = useRouter()
  const params = useParams()
  const patientId = params.id as string

  const [patient, setPatient] = useState(samplePatients[patientId] || null)
  const [noteData, setNoteData] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

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
    // Simulate saving
    await new Promise(resolve => setTimeout(resolve, 1000))
    setIsSaving(false)

    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate([50, 50, 50])
    }
  }

  const handleSign = async () => {
    setIsSaving(true)
    // Simulate signing
    await new Promise(resolve => setTimeout(resolve, 1500))

    // Clear draft
    localStorage.removeItem(`mobile-draft-${patientId}`)

    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100])
    }

    // Navigate back
    router.push('/mobile')
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
