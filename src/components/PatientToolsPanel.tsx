'use client'

import { useState, useCallback } from 'react'
import BodyMap from './BodyMap'
import FingerTappingTest from './FingerTappingTest'
import TremorDetector from './TremorDetector'
import type {
  BodyMapMarker,
  DeviceMeasurementResult,
  FingerTappingResult,
  TremorResult,
} from '@/lib/consult/patient-tools'

interface PatientToolsPanelProps {
  consultId?: string
  patientId?: string
  onSubmit?: (data: {
    markers: BodyMapMarker[]
    measurements: DeviceMeasurementResult[]
  }) => void
}

type ActiveTab = 'body_map' | 'finger_tapping' | 'tremor'

const TABS: { id: ActiveTab; label: string; icon: string }[] = [
  { id: 'body_map', label: 'Symptom Map', icon: '🫀' },
  { id: 'finger_tapping', label: 'Finger Tapping', icon: '👆' },
  { id: 'tremor', label: 'Tremor Test', icon: '📱' },
]

let markerIdCounter = 0

export default function PatientToolsPanel({ consultId, patientId, onSubmit }: PatientToolsPanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('body_map')
  const [markers, setMarkers] = useState<BodyMapMarker[]>([])
  const [measurements, setMeasurements] = useState<DeviceMeasurementResult[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleAddMarker = useCallback(
    (marker: Omit<BodyMapMarker, 'id' | 'created_at'>) => {
      const newMarker: BodyMapMarker = {
        ...marker,
        id: `marker_${++markerIdCounter}`,
        created_at: new Date().toISOString(),
      }
      setMarkers((prev) => [...prev, newMarker])
    },
    [],
  )

  const handleRemoveMarker = useCallback((markerId: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== markerId))
  }, [])

  const handleTappingComplete = useCallback((result: FingerTappingResult) => {
    setMeasurements((prev) => [...prev, result])
  }, [])

  const handleTremorComplete = useCallback((result: TremorResult) => {
    setMeasurements((prev) => [...prev, result])
  }, [])

  const handleSubmitAll = useCallback(async () => {
    if (markers.length === 0 && measurements.length === 0) return

    setSubmitting(true)

    try {
      const body = {
        consult_id: consultId,
        patient_id: patientId,
        body_map_markers: markers,
        device_measurements: measurements.map((m) => ({
          measurement_type: m.type,
          result: m,
        })),
        device_info: {
          user_agent: navigator.userAgent,
          platform: navigator.platform,
          screen_width: window.screen.width,
          screen_height: window.screen.height,
        },
      }

      const res = await fetch('/api/patient/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        setSubmitted(true)
        onSubmit?.({ markers, measurements })
      }
    } catch (err) {
      console.error('[patient-tools] submit failed:', err)
    } finally {
      setSubmitting(false)
    }
  }, [markers, measurements, consultId, patientId, onSubmit])

  // Count completed measurements by type
  const tappingCount = measurements.filter((m) => m.type === 'finger_tapping').length
  const tremorCount = measurements.filter((m) => m.type === 'tremor_detection').length

  if (submitted) {
    return (
      <div style={{
        maxWidth: '480px',
        margin: '0 auto',
        padding: '24px',
        textAlign: 'center',
      }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(34, 197, 94, 0.15)',
            border: '2px solid #22C55E',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: '1.8rem',
          }}
        >
          ✓
        </div>
        <h3 style={{ color: '#E2E8F0', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 8px' }}>
          Submitted Successfully
        </h3>
        <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 8px' }}>
          {markers.length} symptom location{markers.length !== 1 ? 's' : ''} and{' '}
          {measurements.length} measurement{measurements.length !== 1 ? 's' : ''} recorded.
        </p>
        <p style={{ color: '#64748B', fontSize: '0.75rem', margin: 0 }}>
          Your physician will review this data during your consultation.
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: '#E2E8F0', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 4px' }}>
          Pre-Visit Assessment Tools
        </h2>
        <p style={{ color: '#94A3B8', fontSize: '0.8rem', margin: 0 }}>
          Mark your symptoms and complete optional motor assessments
        </p>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '16px',
          background: '#0F172A',
          padding: '4px',
          borderRadius: '10px',
          border: '1px solid #1E293B',
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          const badge =
            tab.id === 'body_map'
              ? markers.length
              : tab.id === 'finger_tapping'
                ? tappingCount
                : tremorCount

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '8px 4px',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? '#1E293B' : 'transparent',
                color: isActive ? '#E2E8F0' : '#64748B',
                fontSize: '0.7rem',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                position: 'relative',
              }}
            >
              <span style={{ fontSize: '1rem' }}>{tab.icon}</span>
              <span>{tab.label}</span>
              {badge > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '8px',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: '#8B5CF6',
                    color: '#FFFFFF',
                    fontSize: '0.55rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content area */}
      <div
        style={{
          background: '#0F172A',
          border: '1px solid #1E293B',
          borderRadius: '12px',
          padding: '16px',
        }}
      >
        {activeTab === 'body_map' && (
          <BodyMap
            markers={markers}
            onAddMarker={handleAddMarker}
            onRemoveMarker={handleRemoveMarker}
          />
        )}

        {activeTab === 'finger_tapping' && (
          <FingerTappingTest onComplete={handleTappingComplete} />
        )}

        {activeTab === 'tremor' && (
          <TremorDetector onComplete={handleTremorComplete} />
        )}
      </div>

      {/* Submit bar */}
      {(markers.length > 0 || measurements.length > 0) && (
        <div style={{ marginTop: '16px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>
              {markers.length} symptom{markers.length !== 1 ? 's' : ''} ·{' '}
              {measurements.length} measurement{measurements.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={handleSubmitAll}
            disabled={submitting}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '10px',
              border: 'none',
              background: submitting ? '#334155' : '#8B5CF6',
              color: '#FFFFFF',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Submitting...' : 'Submit Pre-Visit Assessment'}
          </button>
        </div>
      )}
    </div>
  )
}
