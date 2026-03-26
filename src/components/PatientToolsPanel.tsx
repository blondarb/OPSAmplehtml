'use client'

import { useState, useEffect } from 'react'

interface BodyMapMarker {
  id: string
  region: string
  symptom_type: string
  severity: number
  laterality: string
  onset: string | null
  notes: string | null
  created_at: string
}

interface DeviceMeasurement {
  id: string
  measurement_type: string
  result: Record<string, unknown>
  device_info: Record<string, unknown>
  created_at: string
}

interface PatientToolsPanelProps {
  patientId?: string | null
  consultId?: string | null
}

const SEVERITY_COLORS: Record<number, string> = {
  1: '#22c55e',
  2: '#84cc16',
  3: '#eab308',
  4: '#f97316',
  5: '#ef4444',
}

const SEVERITY_LABELS: Record<number, string> = {
  1: 'Minimal',
  2: 'Mild',
  3: 'Moderate',
  4: 'Severe',
  5: 'Very Severe',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatRegion(region: string): string {
  return region
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function formatMeasurementType(type: string): string {
  const labels: Record<string, string> = {
    finger_tapping: 'Finger Tapping',
    tremor_detection: 'Tremor Detection',
    postural_sway: 'Postural Sway',
    gait_analysis: 'Gait Analysis',
    reaction_time: 'Reaction Time',
  }
  return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function PatientToolsPanel({ patientId, consultId }: PatientToolsPanelProps) {
  const [markers, setMarkers] = useState<BodyMapMarker[]>([])
  const [measurements, setMeasurements] = useState<DeviceMeasurement[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!patientId && !consultId) return

    const fetchTools = async () => {
      setLoading(true)
      try {
        const param = consultId
          ? `consult_id=${consultId}`
          : `patient_id=${patientId}`
        const res = await fetch(`/api/patient/tools?${param}`)
        if (res.ok) {
          const data = await res.json()
          setMarkers(data.markers || [])
          setMeasurements(data.measurements || [])
        }
      } catch (err) {
        console.error('[PatientToolsPanel] fetch error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTools()
  }, [patientId, consultId])

  // Don't render if no data and not loading
  if (!loading && markers.length === 0 && measurements.length === 0) return null

  const hasBodyMap = markers.length > 0
  const hasMotor = measurements.length > 0

  // Group markers by region
  const regionGroups = markers.reduce((acc, m) => {
    const key = m.region
    if (!acc[key]) acc[key] = []
    acc[key].push(m)
    return acc
  }, {} as Record<string, BodyMapMarker[]>)

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Section header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '8px',
        padding: '0 4px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          </svg>
          <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary, #1e293b)' }}>
            Patient-Reported Data
          </span>
          <span style={{
            background: '#3b82f6',
            color: '#fff',
            fontSize: '0.65rem',
            fontWeight: 700,
            borderRadius: '8px',
            padding: '1px 6px',
            minWidth: '16px',
            textAlign: 'center',
          }}>
            {markers.length + measurements.length}
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-secondary, #64748b)"
            strokeWidth="2"
            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {loading && (
        <div style={{ padding: '12px', fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
          Loading patient tools data...
        </div>
      )}

      {!loading && !expanded && (
        <div style={{
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          padding: '0 4px',
        }}>
          {hasBodyMap && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '12px',
              background: 'rgba(239,68,68,0.08)',
              color: '#ef4444',
              fontSize: '0.7rem',
              fontWeight: 600,
            }}>
              {Object.keys(regionGroups).length} region{Object.keys(regionGroups).length !== 1 ? 's' : ''} affected
            </span>
          )}
          {hasMotor && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '12px',
              background: 'rgba(59,130,246,0.08)',
              color: '#3b82f6',
              fontSize: '0.7rem',
              fontWeight: 600,
            }}>
              {measurements.length} test{measurements.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {!loading && expanded && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          {/* Body Map Results */}
          {hasBodyMap && (
            <div style={{
              borderRadius: '8px',
              border: '1px solid var(--border-color, #e2e8f0)',
              background: 'var(--card-bg, #fff)',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '8px 12px',
                background: 'rgba(239,68,68,0.04)',
                borderBottom: '1px solid var(--border-color, #e2e8f0)',
                fontWeight: 600,
                fontSize: '0.7rem',
                color: '#ef4444',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
              }}>
                Body Map
              </div>
              <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {Object.entries(regionGroups).map(([region, items]) => (
                  <div key={region} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      color: 'var(--text-primary, #1e293b)',
                    }}>
                      {formatRegion(region)}
                    </div>
                    {items.map(marker => (
                      <div key={marker.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        paddingLeft: '8px',
                        fontSize: '0.7rem',
                      }}>
                        <span style={{
                          display: 'inline-block',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: SEVERITY_COLORS[marker.severity] || '#94a3b8',
                          flexShrink: 0,
                        }} />
                        <span style={{ color: 'var(--text-primary, #1e293b)' }}>
                          {marker.symptom_type.replace(/_/g, ' ')}
                        </span>
                        <span style={{ color: 'var(--text-secondary, #64748b)' }}>
                          {SEVERITY_LABELS[marker.severity] || `${marker.severity}/5`}
                        </span>
                        {marker.laterality && marker.laterality !== 'bilateral' && (
                          <span style={{ color: 'var(--text-secondary, #64748b)' }}>
                            ({marker.laterality})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Motor Test Results */}
          {hasMotor && (
            <div style={{
              borderRadius: '8px',
              border: '1px solid var(--border-color, #e2e8f0)',
              background: 'var(--card-bg, #fff)',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '8px 12px',
                background: 'rgba(59,130,246,0.04)',
                borderBottom: '1px solid var(--border-color, #e2e8f0)',
                fontWeight: 600,
                fontSize: '0.7rem',
                color: '#3b82f6',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
              }}>
                Motor Tests
              </div>
              <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {measurements.map(m => {
                  const result = m.result as Record<string, unknown>
                  return (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}>
                        <span style={{
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          color: 'var(--text-primary, #1e293b)',
                        }}>
                          {formatMeasurementType(m.measurement_type)}
                        </span>
                        <span style={{
                          fontSize: '0.65rem',
                          color: 'var(--text-secondary, #64748b)',
                        }}>
                          {formatDate(m.created_at)}
                        </span>
                      </div>
                      {/* Display key result values */}
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        paddingLeft: '8px',
                        fontSize: '0.7rem',
                      }}>
                        {Object.entries(result).slice(0, 4).map(([key, val]) => (
                          <span key={key} style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: 'rgba(59,130,246,0.06)',
                            color: 'var(--text-primary, #1e293b)',
                          }}>
                            <span style={{ color: 'var(--text-secondary, #64748b)' }}>
                              {key.replace(/_/g, ' ')}:
                            </span>
                            {String(val)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
