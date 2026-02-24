'use client'

import type { WearableAnomaly } from '@/lib/wearable/types'
import { SEVERITY_DISPLAY, ANOMALY_TYPE_DISPLAY } from '@/lib/wearable/types'

interface AnomalyDetailPanelProps {
  anomaly: WearableAnomaly
  onClose: () => void
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function parseReasoningSteps(reasoning: string): string[] {
  // Try splitting on numbered items like "1." "2." etc.
  const numbered = reasoning.split(/(?=\d+\.\s)/).filter(s => s.trim())
  if (numbered.length > 1) return numbered.map(s => s.trim())

  // Try splitting on bullet points
  const bulleted = reasoning.split(/(?=[-*]\s)/).filter(s => s.trim())
  if (bulleted.length > 1) return bulleted.map(s => s.trim())

  // Fall back to splitting on sentences (keep minimum 2 per step)
  const sentences = reasoning.split(/(?<=\.)\s+/).filter(s => s.trim())
  if (sentences.length <= 3) return sentences
  // Group into pairs for readability
  const steps: string[] = []
  for (let i = 0; i < sentences.length; i += 2) {
    const pair = sentences.slice(i, i + 2).join(' ')
    steps.push(pair)
  }
  return steps
}

const severityBorderColors: Record<string, string> = {
  urgent: '#DC2626',
  attention: '#F97316',
  informational: '#EAB308',
}

export default function AnomalyDetailPanel({ anomaly, onClose }: AnomalyDetailPanelProps) {
  const severity = SEVERITY_DISPLAY[anomaly.severity]
  const anomalyType = ANOMALY_TYPE_DISPLAY[anomaly.anomaly_type]
  const borderColor = severityBorderColors[anomaly.severity] || '#334155'
  const reasoningSteps = parseReasoningSteps(anomaly.ai_reasoning)

  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderLeft: `4px solid ${borderColor}`,
      borderRadius: '12px',
      padding: '24px',
      position: 'relative',
    }}>
      {/* Close Button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          background: 'none',
          border: 'none',
          color: '#94a3b8',
          cursor: 'pointer',
          fontSize: '18px',
          lineHeight: 1,
          padding: '4px',
        }}
        aria-label="Close anomaly detail"
      >
        X
      </button>

      {/* Section 1: Header — Type badge + Severity badge + Timestamp */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {/* Anomaly Type Badge */}
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 10px',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#e2e8f0',
          }}>
            {anomalyType.label}
          </span>

          {/* Severity Badge */}
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 10px',
            background: severity.bgColor + '22',
            border: `1px solid ${severity.color}44`,
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            color: severity.color,
          }}>
            {severity.label}
          </span>
        </div>

        <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
          Detected: {formatTimestamp(anomaly.detected_at)}
        </p>

        <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0' }}>
          {anomalyType.description}
        </p>
      </div>

      {/* Section 2: AI Assessment */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          AI Assessment
        </h4>
        <div style={{
          padding: '14px 16px',
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '8px',
          fontSize: '13px',
          lineHeight: 1.6,
          color: '#e2e8f0',
        }}>
          {anomaly.ai_assessment}
        </div>
      </div>

      {/* Section 3: AI Reasoning Chain */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          How AI Reached This Conclusion
        </h4>
        <div style={{
          padding: '14px 16px',
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '8px',
        }}>
          {reasoningSteps.map((step, i) => (
            <div key={i} style={{
              display: 'flex',
              gap: '10px',
              marginBottom: i < reasoningSteps.length - 1 ? '10px' : 0,
              alignItems: 'flex-start',
            }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '22px',
                height: '22px',
                borderRadius: '50%',
                background: '#334155',
                fontSize: '11px',
                fontWeight: 700,
                color: '#94a3b8',
                flexShrink: 0,
                marginTop: '1px',
              }}>
                {i + 1}
              </span>
              <span style={{ fontSize: '13px', lineHeight: 1.6, color: '#cbd5e1' }}>
                {step}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Section 4: Clinical Significance */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Clinical Significance
        </h4>
        <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#e2e8f0', margin: 0 }}>
          {anomaly.clinical_significance}
        </p>
      </div>

      {/* Section 5: Recommended Action */}
      <div style={{ marginBottom: anomaly.patient_message ? '20px' : 0 }}>
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Recommended Action
        </h4>
        <div style={{
          padding: '14px 16px',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: '8px',
          fontSize: '13px',
          lineHeight: 1.6,
          color: '#6ee7b7',
        }}>
          {anomaly.recommended_action}
        </div>
      </div>

      {/* Section 6: Patient Message (conditional) */}
      {anomaly.patient_message && (
        <div>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Message Sent to Patient
          </h4>
          <div style={{
            padding: '14px 16px',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '8px',
            fontSize: '13px',
            lineHeight: 1.6,
            color: '#93c5fd',
          }}>
            {anomaly.patient_message}
          </div>
        </div>
      )}
    </div>
  )
}
