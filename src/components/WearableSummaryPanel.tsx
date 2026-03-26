'use client'

import { useState, useEffect, useCallback } from 'react'
import { Activity, Heart, Moon, Footprints, AlertTriangle, ChevronDown, ChevronUp, Link2, Unlink } from 'lucide-react'

interface WearableLink {
  id: string
  patient_id: string
  wearable_patient_id: string
  source: string
  linked_at: string
  linked_by: string | null
}

interface DailySummary {
  date: string
  metrics: {
    avg_hr: number | null
    resting_hr: number | null
    total_steps: number
    sleep_hours: number | null
    sleep_efficiency: number | null
    hrv_rmssd: number
    tremor_pct?: number
    dyskinetic_mins?: number
    spo2_avg?: number
  }
  anomalies_detected: string[]
  overall_status: string
}

interface Assessment {
  id: string
  assessed_at: string
  score?: number
  severity?: string
  tremor_score?: number
  overall_score?: number
  dominant_hand?: string
  hands?: Array<{
    hand: string
    tapsPerSecond: number
    totalTaps: number
    score?: number
  }>
}

interface Anomaly {
  id: string
  anomaly_type: string
  severity: string
  detected_at: string
  clinical_significance?: string
}

interface WearableData {
  patient: Record<string, unknown>
  dailySummaries: DailySummary[]
  anomalies: Anomaly[]
  alerts: Array<Record<string, unknown>>
  assessments: Assessment[]
  tappingAssessments: Assessment[]
  fluencyAssessments: Assessment[]
  spiralAssessments: Assessment[]
  gaitAssessments: Assessment[]
}

interface WearableSummaryPanelProps {
  patientId: string
}

export default function WearableSummaryPanel({ patientId }: WearableSummaryPanelProps) {
  const [links, setLinks] = useState<WearableLink[]>([])
  const [wearableData, setWearableData] = useState<WearableData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [linkFormOpen, setLinkFormOpen] = useState(false)
  const [wearablePatientId, setWearablePatientId] = useState('')
  const [linking, setLinking] = useState(false)

  // Fetch wearable links for this patient
  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch(`/api/wearable/link?patient_id=${patientId}`)
      if (!res.ok) return
      const data = await res.json()
      setLinks(data.links || [])
      return data.links || []
    } catch {
      return []
    }
  }, [patientId])

  // Fetch wearable data for the first linked wearable patient
  const fetchWearableData = useCallback(async (wearableId: string) => {
    try {
      const res = await fetch(`/api/wearable/demo-data?patient_id=${wearableId}`)
      if (!res.ok) throw new Error('Failed to load wearable data')
      const data = await res.json()
      setWearableData(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load wearable data'
      setError(msg)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const fetchedLinks = await fetchLinks()
      if (cancelled) return
      if (fetchedLinks && fetchedLinks.length > 0) {
        await fetchWearableData(fetchedLinks[0].wearable_patient_id)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [patientId, fetchLinks, fetchWearableData])

  const handleLink = async () => {
    if (!wearablePatientId.trim()) return
    setLinking(true)
    try {
      const res = await fetch('/api/wearable/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          wearable_patient_id: wearablePatientId.trim(),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Failed to link')
        return
      }
      setWearablePatientId('')
      setLinkFormOpen(false)
      // Reload
      const newLinks = await fetchLinks()
      if (newLinks && newLinks.length > 0) {
        await fetchWearableData(newLinks[0].wearable_patient_id)
      }
    } catch {
      setError('Failed to link wearable patient')
    } finally {
      setLinking(false)
    }
  }

  const handleUnlink = async (link: WearableLink) => {
    try {
      const res = await fetch('/api/wearable/link', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_id: link.id }),
      })
      if (!res.ok) return
      const newLinks = await fetchLinks()
      if (!newLinks || newLinks.length === 0) {
        setWearableData(null)
      } else {
        await fetchWearableData(newLinks[0].wearable_patient_id)
      }
    } catch {
      // non-fatal
    }
  }

  // If no links and not loading, show a minimal link prompt
  if (!loading && links.length === 0) {
    return (
      <div style={{ padding: '12px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '8px',
        }}>
          <span style={{ fontSize: '13px', color: 'var(--text-caption, #696a70)' }}>
            No wearable device linked
          </span>
          <button
            onClick={() => setLinkFormOpen(!linkFormOpen)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '12px', color: 'var(--primary, #3b82f6)', fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            <Link2 size={14} /> Link
          </button>
        </div>
        {linkFormOpen && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Wearable patient ID"
              value={wearablePatientId}
              onChange={(e) => setWearablePatientId(e.target.value)}
              style={{
                flex: 1, padding: '6px 8px', fontSize: '12px',
                border: '1px solid var(--border, #dedede)', borderRadius: '6px',
                background: 'var(--bg-white, #fff)', color: 'var(--text-body, #0c0f14)',
              }}
            />
            <button
              onClick={handleLink}
              disabled={linking || !wearablePatientId.trim()}
              style={{
                padding: '6px 12px', fontSize: '12px', fontWeight: 500,
                background: 'var(--primary, #3b82f6)', color: '#fff',
                border: 'none', borderRadius: '6px', cursor: 'pointer',
                opacity: linking ? 0.6 : 1,
              }}
            >
              {linking ? '...' : 'Link'}
            </button>
          </div>
        )}
        {error && (
          <p style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>{error}</p>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '12px 0', textAlign: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-caption, #696a70)' }}>
          Loading wearable data...
        </span>
      </div>
    )
  }

  if (error && !wearableData) {
    return (
      <div style={{ padding: '12px 0' }}>
        <p style={{ fontSize: '12px', color: '#ef4444' }}>{error}</p>
      </div>
    )
  }

  if (!wearableData) return null

  const latestSummary = wearableData.dailySummaries[wearableData.dailySummaries.length - 1]
  const recentAnomalies = wearableData.anomalies.slice(-5).reverse()
  const latestTremor = wearableData.assessments[wearableData.assessments.length - 1]
  const latestTapping = wearableData.tappingAssessments[wearableData.tappingAssessments.length - 1]

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Linked device info */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '10px',
      }}>
        <span style={{
          fontSize: '11px', color: 'var(--text-caption, #696a70)',
          display: 'flex', alignItems: 'center', gap: '4px',
        }}>
          <Link2 size={12} />
          {links[0]?.source || 'sevaro_monitor'}
        </span>
        <button
          onClick={() => handleUnlink(links[0])}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '11px', color: 'var(--text-caption, #696a70)',
            display: 'flex', alignItems: 'center', gap: '2px',
          }}
          title="Unlink wearable"
        >
          <Unlink size={12} />
        </button>
      </div>

      {/* Latest Daily Summary */}
      {latestSummary && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
          marginBottom: '12px',
        }}>
          <MetricTile
            icon={<Heart size={14} style={{ color: '#ef4444' }} />}
            label="Heart Rate"
            value={latestSummary.metrics.avg_hr != null ? `${Math.round(latestSummary.metrics.avg_hr)}` : '--'}
            unit="bpm"
          />
          <MetricTile
            icon={<Footprints size={14} style={{ color: '#3b82f6' }} />}
            label="Steps"
            value={latestSummary.metrics.total_steps > 0
              ? latestSummary.metrics.total_steps.toLocaleString()
              : '--'}
            unit=""
          />
          <MetricTile
            icon={<Moon size={14} style={{ color: '#8b5cf6' }} />}
            label="Sleep"
            value={latestSummary.metrics.sleep_hours != null
              ? `${latestSummary.metrics.sleep_hours.toFixed(1)}`
              : '--'}
            unit="hrs"
          />
          <MetricTile
            icon={<Activity size={14} style={{ color: '#22c55e' }} />}
            label="HRV"
            value={latestSummary.metrics.hrv_rmssd > 0
              ? `${latestSummary.metrics.hrv_rmssd.toFixed(0)}`
              : '--'}
            unit="ms"
          />
        </div>
      )}

      {/* Expand for details */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
          padding: '4px', fontSize: '12px', color: 'var(--text-caption, #696a70)',
        }}
      >
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {expanded ? 'Less' : 'More details'}
      </button>

      {expanded && (
        <div style={{ marginTop: '8px' }}>
          {/* Recent Assessments */}
          {(latestTremor || latestTapping) && (
            <div style={{ marginBottom: '10px' }}>
              <p style={{
                fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
                color: 'var(--text-caption, #696a70)', marginBottom: '6px',
              }}>
                Recent Assessments
              </p>
              {latestTremor && (
                <div style={{
                  padding: '6px 8px', background: 'var(--surface-light, #f8f8f8)',
                  borderRadius: '6px', marginBottom: '4px', fontSize: '12px',
                  color: 'var(--text-body, #0c0f14)',
                }}>
                  <strong>Tremor:</strong>{' '}
                  {latestTremor.tremor_score != null
                    ? `Score ${latestTremor.tremor_score}`
                    : latestTremor.severity || 'Assessed'}
                  <span style={{ color: 'var(--text-caption, #696a70)', marginLeft: '6px', fontSize: '11px' }}>
                    {new Date(latestTremor.assessed_at).toLocaleDateString()}
                  </span>
                </div>
              )}
              {latestTapping && (
                <div style={{
                  padding: '6px 8px', background: 'var(--surface-light, #f8f8f8)',
                  borderRadius: '6px', marginBottom: '4px', fontSize: '12px',
                  color: 'var(--text-body, #0c0f14)',
                }}>
                  <strong>Tapping:</strong>{' '}
                  {latestTapping.hands?.map(h =>
                    `${h.hand}: ${h.tapsPerSecond?.toFixed(1)}/s`
                  ).join(', ') || 'Assessed'}
                  <span style={{ color: 'var(--text-caption, #696a70)', marginLeft: '6px', fontSize: '11px' }}>
                    {new Date(latestTapping.assessed_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Recent Anomalies */}
          {recentAnomalies.length > 0 && (
            <div>
              <p style={{
                fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
                color: 'var(--text-caption, #696a70)', marginBottom: '6px',
              }}>
                Recent Anomalies
              </p>
              {recentAnomalies.map((anomaly) => (
                <div
                  key={anomaly.id}
                  style={{
                    padding: '6px 8px',
                    background: anomaly.severity === 'critical' || anomaly.severity === 'high'
                      ? 'rgba(239,68,68,0.06)'
                      : 'var(--surface-light, #f8f8f8)',
                    borderRadius: '6px',
                    marginBottom: '4px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '6px',
                  }}
                >
                  <AlertTriangle
                    size={14}
                    style={{
                      color: anomaly.severity === 'critical' || anomaly.severity === 'high'
                        ? '#ef4444' : '#eab308',
                      flexShrink: 0,
                      marginTop: '1px',
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <span style={{ color: 'var(--text-body, #0c0f14)' }}>
                      {anomaly.anomaly_type.replace(/_/g, ' ')}
                    </span>
                    {anomaly.clinical_significance && (
                      <p style={{
                        margin: '2px 0 0', fontSize: '11px',
                        color: 'var(--text-caption, #696a70)',
                      }}>
                        {anomaly.clinical_significance}
                      </p>
                    )}
                    <span style={{
                      fontSize: '10px', color: 'var(--text-caption, #696a70)',
                      display: 'block', marginTop: '2px',
                    }}>
                      {new Date(anomaly.detected_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Disease-specific metrics */}
          {latestSummary && (
            latestSummary.metrics.tremor_pct != null ||
            latestSummary.metrics.dyskinetic_mins != null
          ) && (
            <div style={{ marginTop: '10px' }}>
              <p style={{
                fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
                color: 'var(--text-caption, #696a70)', marginBottom: '6px',
              }}>
                Disease Metrics
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {latestSummary.metrics.tremor_pct != null && (
                  <div style={{
                    padding: '6px 8px', background: 'var(--surface-light, #f8f8f8)',
                    borderRadius: '6px', fontSize: '12px', color: 'var(--text-body, #0c0f14)',
                  }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-caption, #696a70)' }}>Tremor %</div>
                    <strong>{latestSummary.metrics.tremor_pct.toFixed(1)}%</strong>
                  </div>
                )}
                {latestSummary.metrics.dyskinetic_mins != null && (
                  <div style={{
                    padding: '6px 8px', background: 'var(--surface-light, #f8f8f8)',
                    borderRadius: '6px', fontSize: '12px', color: 'var(--text-body, #0c0f14)',
                  }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-caption, #696a70)' }}>Dyskinesia</div>
                    <strong>{latestSummary.metrics.dyskinetic_mins} min</strong>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* View full dashboard link */}
          <div style={{ marginTop: '10px', textAlign: 'center' }}>
            <a
              href={`/wearable?patient_id=${links[0]?.wearable_patient_id}`}
              style={{
                fontSize: '12px', color: 'var(--primary, #3b82f6)',
                textDecoration: 'none', fontWeight: 500,
              }}
            >
              View full wearable dashboard
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

/** Compact metric tile for the 2x2 grid */
function MetricTile({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode
  label: string
  value: string
  unit: string
}) {
  return (
    <div style={{
      padding: '8px',
      background: 'var(--surface-light, #f8f8f8)',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {icon}
        <span style={{ fontSize: '11px', color: 'var(--text-caption, #696a70)' }}>{label}</span>
      </div>
      <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-body, #0c0f14)' }}>
        {value}
        {unit && <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-caption, #696a70)', marginLeft: '2px' }}>{unit}</span>}
      </div>
    </div>
  )
}
