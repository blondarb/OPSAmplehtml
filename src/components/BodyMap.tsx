'use client'

import { useState, useCallback } from 'react'
import type { BodyMapMarker, BodyRegion, SymptomType, Severity } from '@/lib/consult/patient-tools'
import {
  FRONT_REGIONS,
  SYMPTOM_COLORS,
  SYMPTOM_LABELS,
} from '@/lib/consult/patient-tools'

interface BodyMapProps {
  markers: BodyMapMarker[]
  onAddMarker: (marker: Omit<BodyMapMarker, 'id' | 'created_at'>) => void
  onRemoveMarker: (markerId: string) => void
  readOnly?: boolean
}

type EditingState = {
  region: BodyRegion
  regionLabel: string
} | null

const SEVERITY_OPTIONS: { value: Severity; label: string; color: string }[] = [
  { value: 'mild', label: 'Mild', color: '#22C55E' },
  { value: 'moderate', label: 'Moderate', color: '#F59E0B' },
  { value: 'severe', label: 'Severe', color: '#EF4444' },
]

export default function BodyMap({ markers, onAddMarker, onRemoveMarker, readOnly }: BodyMapProps) {
  const [editing, setEditing] = useState<EditingState>(null)
  const [selectedSymptom, setSelectedSymptom] = useState<SymptomType>('pain')
  const [selectedSeverity, setSelectedSeverity] = useState<Severity>('moderate')
  const [view, setView] = useState<'front' | 'back'>('front')

  const activeRegions = FRONT_REGIONS

  const handleRegionClick = useCallback(
    (regionId: BodyRegion, regionLabel: string) => {
      if (readOnly) return
      setEditing({ region: regionId, regionLabel })
    },
    [readOnly],
  )

  const handleConfirmMarker = useCallback(() => {
    if (!editing) return

    const region = activeRegions.find((r) => r.id === editing.region)
    if (!region) return

    onAddMarker({
      region: editing.region,
      symptom_type: selectedSymptom,
      severity: selectedSeverity,
      laterality: region.laterality,
      onset: '',
      notes: '',
    })

    setEditing(null)
  }, [editing, selectedSymptom, selectedSeverity, activeRegions, onAddMarker])

  // Group markers by region for dot display
  const markersByRegion = new Map<BodyRegion, BodyMapMarker[]>()
  for (const m of markers) {
    const existing = markersByRegion.get(m.region) || []
    existing.push(m)
    markersByRegion.set(m.region, existing)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* View Toggle */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
        <button
          onClick={() => setView('front')}
          style={{
            padding: '6px 16px',
            borderRadius: '6px',
            border: `1px solid ${view === 'front' ? '#8B5CF6' : '#334155'}`,
            background: view === 'front' ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
            color: view === 'front' ? '#A78BFA' : '#94A3B8',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Front
        </button>
        <button
          onClick={() => setView('back')}
          style={{
            padding: '6px 16px',
            borderRadius: '6px',
            border: `1px solid ${view === 'back' ? '#8B5CF6' : '#334155'}`,
            background: view === 'back' ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
            color: view === 'back' ? '#A78BFA' : '#94A3B8',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Back
        </button>
      </div>

      {/* Instruction */}
      {!readOnly && (
        <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: '0.8rem', margin: 0 }}>
          Tap a body region to mark where you feel symptoms
        </p>
      )}

      {/* SVG Body Map */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <svg
          viewBox="0 0 200 440"
          width="220"
          height="484"
          style={{ maxWidth: '100%' }}
        >
          {/* Body outline */}
          {activeRegions
            .filter((r) => {
              if (view === 'front') return r.id !== 'upper_back' && r.id !== 'lower_back'
              // In back view, show back regions instead of chest/abdomen
              if (view === 'back') return r.id !== 'chest' && r.id !== 'abdomen'
              return true
            })
            .map((region) => {
              const regionMarkers = markersByRegion.get(region.id) || []
              const isEditing = editing?.region === region.id
              const hasMarkers = regionMarkers.length > 0
              const topMarker = regionMarkers[0]

              return (
                <g key={region.id}>
                  {/* Clickable region path */}
                  <path
                    d={region.path}
                    fill={
                      isEditing
                        ? 'rgba(139, 92, 246, 0.3)'
                        : hasMarkers
                          ? `${SYMPTOM_COLORS[topMarker.symptom_type]}22`
                          : 'rgba(148, 163, 184, 0.08)'
                    }
                    stroke={
                      isEditing
                        ? '#8B5CF6'
                        : hasMarkers
                          ? SYMPTOM_COLORS[topMarker.symptom_type]
                          : '#334155'
                    }
                    strokeWidth={isEditing ? 2 : 1}
                    style={{ cursor: readOnly ? 'default' : 'pointer' }}
                    onClick={() => handleRegionClick(region.id, region.label)}
                  />

                  {/* Marker dots */}
                  {regionMarkers.map((m, i) => (
                    <circle
                      key={m.id}
                      cx={region.center.x + i * 6}
                      cy={region.center.y}
                      r={5}
                      fill={SYMPTOM_COLORS[m.symptom_type]}
                      stroke="#0F172A"
                      strokeWidth={1.5}
                      style={{ cursor: readOnly ? 'default' : 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!readOnly) onRemoveMarker(m.id)
                      }}
                    />
                  ))}

                  {/* Region label (shown on hover/editing) */}
                  {isEditing && (
                    <text
                      x={region.center.x}
                      y={region.center.y - 12}
                      textAnchor="middle"
                      fill="#A78BFA"
                      fontSize="8"
                      fontWeight="600"
                    >
                      {region.label}
                    </text>
                  )}
                </g>
              )
            })}
        </svg>
      </div>

      {/* Symptom picker (shown when a region is selected) */}
      {editing && (
        <div
          style={{
            background: '#1E293B',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: '#E2E8F0', fontSize: '0.9rem', fontWeight: 600 }}>
              {editing.regionLabel}
            </span>
            <button
              onClick={() => setEditing(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                fontSize: '1.1rem',
              }}
            >
              ✕
            </button>
          </div>

          {/* Symptom type selector */}
          <label style={{ color: '#94A3B8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
            Symptom type
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {(Object.entries(SYMPTOM_LABELS) as [SymptomType, string][]).map(([type, label]) => (
              <button
                key={type}
                onClick={() => setSelectedSymptom(type)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${selectedSymptom === type ? SYMPTOM_COLORS[type] : '#334155'}`,
                  background: selectedSymptom === type ? `${SYMPTOM_COLORS[type]}20` : 'transparent',
                  color: selectedSymptom === type ? SYMPTOM_COLORS[type] : '#94A3B8',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Severity selector */}
          <label style={{ color: '#94A3B8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
            Severity
          </label>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
            {SEVERITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedSeverity(opt.value)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${selectedSeverity === opt.value ? opt.color : '#334155'}`,
                  background: selectedSeverity === opt.value ? `${opt.color}20` : 'transparent',
                  color: selectedSeverity === opt.value ? opt.color : '#94A3B8',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Confirm button */}
          <button
            onClick={handleConfirmMarker}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              border: 'none',
              background: '#8B5CF6',
              color: '#FFFFFF',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Add Symptom
          </button>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
        {Object.entries(SYMPTOM_LABELS).map(([type, label]) => (
          <div
            key={type}
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: SYMPTOM_COLORS[type],
              }}
            />
            <span style={{ color: '#94A3B8', fontSize: '0.65rem' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Marker summary list */}
      {markers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ color: '#94A3B8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
            Marked Symptoms ({markers.length})
          </label>
          {markers.map((m) => {
            const region = activeRegions.find((r) => r.id === m.region)
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  background: '#1E293B',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  borderLeft: `3px solid ${SYMPTOM_COLORS[m.symptom_type]}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#E2E8F0', fontSize: '0.8rem' }}>
                    {region?.label || m.region}
                  </span>
                  <span
                    style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: `${SYMPTOM_COLORS[m.symptom_type]}20`,
                      color: SYMPTOM_COLORS[m.symptom_type],
                      fontSize: '0.65rem',
                      fontWeight: 600,
                    }}
                  >
                    {SYMPTOM_LABELS[m.symptom_type]}
                  </span>
                  <span
                    style={{
                      color: '#64748B',
                      fontSize: '0.65rem',
                      textTransform: 'capitalize',
                    }}
                  >
                    {m.severity}
                  </span>
                </div>
                {!readOnly && (
                  <button
                    onClick={() => onRemoveMarker(m.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748B',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      padding: '2px 4px',
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
