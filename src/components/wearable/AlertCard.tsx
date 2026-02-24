'use client'

import { useState } from 'react'
import type { WearableAlert, WearableAnomaly } from '@/lib/wearable/types'
import { SEVERITY_DISPLAY } from '@/lib/wearable/types'

interface AlertCardProps {
  alert: WearableAlert
  anomaly?: WearableAnomaly
  onAcknowledge?: (id: string) => void
  onEscalate?: (id: string) => void
}

function getRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`
  return date.toLocaleDateString()
}

export default function AlertCard({ alert, anomaly, onAcknowledge, onEscalate }: AlertCardProps) {
  const [acknowledged, setAcknowledged] = useState(alert.acknowledged)
  const [escalated, setEscalated] = useState(alert.escalated_to_md)
  const [showAssessment, setShowAssessment] = useState(false)
  const [followUpScheduled, setFollowUpScheduled] = useState(false)

  const severity = SEVERITY_DISPLAY[alert.severity]

  const handleAcknowledge = () => {
    setAcknowledged(!acknowledged)
    onAcknowledge?.(alert.id)
  }

  const handleEscalate = () => {
    setEscalated(true)
    onEscalate?.(alert.id)
  }

  return (
    <div style={{
      background: acknowledged ? '#1a2536' : '#1e293b',
      borderRadius: '10px',
      border: '1px solid #334155',
      borderLeft: `4px solid ${severity.color}`,
      padding: '16px',
      opacity: acknowledged ? 0.75 : 1,
      position: 'relative',
      transition: 'opacity 0.2s ease',
    }}>
      {/* Acknowledged overlay checkmark */}
      {acknowledged && (
        <div style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: '#16A34A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          color: '#fff',
          fontWeight: 700,
        }}>
          &#10003;
        </div>
      )}

      {/* Header: severity badge + title + timestamp */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '8px',
        flexWrap: 'wrap',
      }}>
        <span style={{
          background: severity.bgColor,
          color: severity.color,
          fontSize: '0.7rem',
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: '9999px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {severity.label}
        </span>
        <span style={{
          color: '#f1f5f9',
          fontSize: '0.9rem',
          fontWeight: 600,
          flex: 1,
        }}>
          {alert.title}
        </span>
        <span style={{
          color: '#64748b',
          fontSize: '0.75rem',
          whiteSpace: 'nowrap',
        }}>
          {getRelativeTime(alert.created_at)}
        </span>
      </div>

      {/* Body */}
      <p style={{
        color: '#94a3b8',
        fontSize: '0.82rem',
        lineHeight: 1.5,
        margin: '0 0 12px',
      }}>
        {alert.body}
      </p>

      {/* AI Assessment expandable */}
      {anomaly && (
        <div style={{ marginBottom: '12px' }}>
          <button
            onClick={() => setShowAssessment(!showAssessment)}
            style={{
              background: 'none',
              border: 'none',
              color: '#0EA5E9',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '4px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{
              display: 'inline-block',
              transform: showAssessment ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
              fontSize: '0.7rem',
            }}>
              &#9654;
            </span>
            View AI Assessment
          </button>
          {showAssessment && (
            <div style={{
              background: 'rgba(14, 165, 233, 0.06)',
              border: '1px solid rgba(14, 165, 233, 0.2)',
              borderRadius: '8px',
              padding: '12px',
              marginTop: '8px',
            }}>
              <p style={{
                color: '#cbd5e1',
                fontSize: '0.8rem',
                lineHeight: 1.6,
                margin: 0,
              }}>
                {anomaly.ai_assessment}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
      }}>
        <button
          onClick={handleAcknowledge}
          style={{
            background: acknowledged ? '#16A34A' : '#334155',
            color: acknowledged ? '#fff' : '#94a3b8',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 14px',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {acknowledged ? '&#10003; Reviewed' : 'Reviewed'}
        </button>

        <button
          onClick={handleEscalate}
          disabled={escalated}
          style={{
            background: escalated ? 'rgba(220, 38, 38, 0.15)' : '#334155',
            color: escalated ? '#DC2626' : '#94a3b8',
            border: escalated ? '1px solid rgba(220, 38, 38, 0.3)' : '1px solid transparent',
            borderRadius: '6px',
            padding: '6px 14px',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: escalated ? 'default' : 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {escalated ? 'Escalated' : 'Escalate to MD'}
        </button>

        <button
          onClick={() => setFollowUpScheduled(true)}
          disabled={followUpScheduled}
          style={{
            background: followUpScheduled ? 'rgba(14, 165, 233, 0.15)' : '#334155',
            color: followUpScheduled ? '#0EA5E9' : '#94a3b8',
            border: followUpScheduled ? '1px solid rgba(14, 165, 233, 0.3)' : '1px solid transparent',
            borderRadius: '6px',
            padding: '6px 14px',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: followUpScheduled ? 'default' : 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {followUpScheduled ? 'Follow-up Scheduled' : 'Schedule Follow-up'}
        </button>
      </div>
    </div>
  )
}
