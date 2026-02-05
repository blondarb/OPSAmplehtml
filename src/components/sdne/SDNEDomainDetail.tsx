'use client'

import { useState } from 'react'
import {
  SDNEDomain,
  SDNETaskResult,
  SDNE_DOMAIN_LABELS,
  SDNE_FLAG_THEME,
  SDNE_FLAG_KEY,
  SDNE_FLAG_LABELS,
} from '@/lib/sdneTypes'

interface SDNEDomainDetailProps {
  domain: SDNEDomain
  tasks: SDNETaskResult[]
  onClose: () => void
}

/**
 * Format metric value for display
 */
function formatMetricValue(key: string, value: unknown): string {
  if (typeof value === 'number') {
    // Format based on metric type
    if (key.includes('_pct') || key.includes('percent') || key.includes('asymmetry')) {
      return `${value.toFixed(1)}%`
    }
    if (key.includes('_ms')) {
      return `${value.toFixed(0)} ms`
    }
    if (key.includes('_s') || key.includes('time') || key.includes('duration')) {
      return `${value.toFixed(1)}s`
    }
    if (key.includes('_hz') || key.includes('frequency') || key.includes('rate')) {
      return `${value.toFixed(1)} Hz`
    }
    if (key.includes('_mm')) {
      return `${value.toFixed(1)} mm`
    }
    if (key.includes('_cm')) {
      return `${value.toFixed(1)} cm`
    }
    if (key.includes('_m_s') || key.includes('speed')) {
      return `${value.toFixed(2)} m/s`
    }
    if (key.includes('_deg')) {
      return `${value.toFixed(2)}°`
    }
    if (key.includes('count') || key.includes('span') || key.includes('words')) {
      return value.toString()
    }
    // Default numeric formatting
    return value.toFixed(2)
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  return String(value)
}

/**
 * Format metric key for display (snake_case → Title Case)
 */
function formatMetricKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace('Pct', '%')
    .replace('Ms', '(ms)')
    .replace('Hz', '(Hz)')
    .replace('Mm', '(mm)')
    .replace('Cm', '(cm)')
    .replace('Deg', '(°)')
    .replace('M S', '(m/s)')
}

/**
 * Domain detail panel showing all tasks for a selected domain
 * Displays metrics, quality data, and clinical notes
 */
export function SDNEDomainDetail({ domain, tasks, onClose }: SDNEDomainDetailProps) {
  const [expandedTask, setExpandedTask] = useState<string | null>(null)

  if (tasks.length === 0) {
    return (
      <div style={{
        padding: '16px',
        borderRadius: '8px',
        backgroundColor: 'var(--bg-gray)',
        border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {SDNE_DOMAIN_LABELS[domain]} - No Tasks
          </h4>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              color: 'var(--text-muted)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
          No tasks were performed for this domain.
        </p>
      </div>
    )
  }

  return (
    <div style={{
      padding: '16px',
      borderRadius: '8px',
      backgroundColor: 'var(--bg-white)',
      border: '1px solid var(--border)',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {SDNE_DOMAIN_LABELS[domain]}
          </h4>
          <span style={{
            fontSize: '11px',
            fontWeight: 500,
            padding: '2px 8px',
            borderRadius: '10px',
            backgroundColor: 'var(--bg-gray)',
            color: 'var(--text-secondary)',
          }}>
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '4px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Close details"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Task List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {tasks.map((task) => {
          const colors = SDNE_FLAG_THEME[SDNE_FLAG_KEY[task.flag]]
          const isExpanded = expandedTask === task.taskId
          const hasQcNotes = task.quality.qcNotes && task.quality.qcNotes.length > 0
          const metricEntries = Object.entries(task.metrics)

          return (
            <div
              key={task.taskId}
              style={{
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bg,
                overflow: 'hidden',
              }}
            >
              {/* Task Header - Clickable */}
              <button
                type="button"
                onClick={() => setExpandedTask(isExpanded ? null : task.taskId)}
                style={{
                  width: '100%',
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* Task ID badge */}
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: colors.main,
                    color: '#fff',
                  }}>
                    {task.taskId}
                  </span>

                  {/* Task name */}
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {task.taskName}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Status label */}
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: colors.text,
                  }}>
                    {SDNE_FLAG_LABELS[task.flag]}
                  </span>

                  {/* Duration */}
                  {task.durationSeconds && (
                    <span style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      fontFamily: 'monospace',
                    }}>
                      {Math.floor(task.durationSeconds / 60)}:{(task.durationSeconds % 60).toString().padStart(2, '0')}
                    </span>
                  )}

                  {/* Expand chevron */}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-muted)"
                    strokeWidth="2"
                    style={{
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>

              {/* Expanded Task Details */}
              {isExpanded && (
                <div style={{
                  padding: '0 12px 12px 12px',
                  borderTop: `1px solid ${colors.border}`,
                }}>
                  {/* QC Notes / Clinical Observations */}
                  {hasQcNotes && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        marginBottom: '6px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        Clinical Observations
                      </div>
                      <ul style={{
                        margin: 0,
                        paddingLeft: '16px',
                        fontSize: '12px',
                        color: colors.text,
                        lineHeight: 1.5,
                      }}>
                        {task.quality.qcNotes.map((note, idx) => (
                          <li key={idx} style={{ marginBottom: '4px' }}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Metrics Grid */}
                  {metricEntries.length > 0 && (
                    <div style={{ marginTop: hasQcNotes ? '16px' : '12px' }}>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        Measurements
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                        gap: '8px',
                      }}>
                        {metricEntries.map(([key, value]) => (
                          <div
                            key={key}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(255,255,255,0.6)',
                              border: '1px solid rgba(0,0,0,0.05)',
                            }}
                          >
                            <div style={{
                              fontSize: '10px',
                              color: 'var(--text-muted)',
                              marginBottom: '2px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}>
                              {formatMetricKey(key)}
                            </div>
                            <div style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              fontFamily: 'monospace',
                            }}>
                              {formatMetricValue(key, value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quality Metrics */}
                  <div style={{ marginTop: '16px' }}>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      marginBottom: '8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      Data Quality
                    </div>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Validity:</span>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: task.quality.validity >= 0.9 ? '#16A34A' : task.quality.validity >= 0.8 ? '#EAB308' : '#DC2626',
                        }}>
                          {(task.quality.validity * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sensor:</span>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: task.quality.sensorAvailability >= 0.95 ? '#16A34A' : task.quality.sensorAvailability >= 0.85 ? '#EAB308' : '#DC2626',
                        }}>
                          {(task.quality.sensorAvailability * 100).toFixed(0)}%
                        </span>
                      </div>
                      {task.quality.artifactCount > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Artifacts:</span>
                          <span style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: task.quality.artifactCount <= 1 ? '#EAB308' : '#DC2626',
                          }}>
                            {task.quality.artifactCount}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
