'use client'

import type { WearableAnomaly } from '@/lib/wearable/types'
import { ANOMALY_TYPE_DISPLAY } from '@/lib/wearable/types'

const FALLBACK_MESSAGES = [
  {
    type: 'activity_nudge' as const,
    label: 'Activity Nudge',
    message:
      "Hi! We noticed you've been a little less active the past few days. Even a short 10-minute walk can make a big difference. Would you like some gentle activity ideas?",
    timestamp: '10:15 AM',
  },
  {
    type: 'fall_safety' as const,
    label: 'Fall Safety',
    message:
      'Your watch noticed something that looked like a stumble earlier today. Are you okay? If you need help, please call your care team or 911. We are here for you.',
    timestamp: '2:32 PM',
  },
  {
    type: 'medication_reminder' as const,
    label: 'Medication Reminder',
    message:
      "Good morning! Just a friendly check-in. Your sleep has been a bit different lately. Have you been taking your evening medication at the usual time? Let us know if you'd like to chat with your care team.",
    timestamp: '8:00 AM',
  },
]

export default function PatientNudgePreview({
  anomalies,
}: {
  anomalies: WearableAnomaly[]
}) {
  if (!anomalies || anomalies.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h3 style={{ color: '#F1F5F9', fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
            Patient Communication Examples
          </h3>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '4px 0 0 0', lineHeight: 1.5 }}>
            All messages are empathetic, actionable, and at a 6th-grade reading level. Raw metrics are never shared with patients.
          </p>
        </div>
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '48px 24px',
          textAlign: 'center',
        }}>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
            No data yet — sync from the Sevaro Monitor app to see results here.
          </p>
        </div>
      </div>
    )
  }

  const anomaliesWithMessages = anomalies.filter((a) => a.patient_message !== null)
  const hasRealMessages = anomaliesWithMessages.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div>
        <h3 style={{ color: '#F1F5F9', fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
          Patient Communication Examples
        </h3>
        <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '4px 0 0 0', lineHeight: 1.5 }}>
          All messages are empathetic, actionable, and at a 6th-grade reading level. Raw metrics are never shared with patients.
        </p>
      </div>

      {/* Messages */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {hasRealMessages
          ? anomaliesWithMessages.map((anomaly) => {
              const aType = ANOMALY_TYPE_DISPLAY[anomaly.anomaly_type]
              const timestamp = new Date(anomaly.detected_at).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })
              return (
                <PhonePreview
                  key={anomaly.id}
                  message={anomaly.patient_message!}
                  timestamp={timestamp}
                  contextLabel={aType.label}
                />
              )
            })
          : FALLBACK_MESSAGES.map((msg, i) => (
              <PhonePreview
                key={i}
                message={msg.message}
                timestamp={msg.timestamp}
                contextLabel={msg.label}
              />
            ))}
      </div>
    </div>
  )
}

function PhonePreview({
  message,
  timestamp,
  contextLabel,
}: {
  message: string
  timestamp: string
  contextLabel: string
}) {
  return (
    <div
      style={{
        background: '#0F172A',
        border: '2px solid #334155',
        borderRadius: '20px',
        padding: '4px',
        maxWidth: '340px',
      }}
    >
      {/* Phone bezel top */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '6px 0 4px 0',
        }}
      >
        <div
          style={{
            width: '60px',
            height: '4px',
            borderRadius: '2px',
            background: '#334155',
          }}
        />
      </div>

      {/* Phone screen */}
      <div
        style={{
          background: '#1E293B',
          borderRadius: '14px',
          padding: '12px 14px',
        }}
      >
        {/* SMS header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px',
            paddingBottom: '8px',
            borderBottom: '1px solid #334155',
          }}
        >
          <span style={{ color: '#94A3B8', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            SMS Message
          </span>
          <span style={{ color: '#64748B', fontSize: '0.65rem' }}>{timestamp}</span>
        </div>

        {/* Message bubble */}
        <div
          style={{
            background: '#334155',
            borderRadius: '12px 12px 12px 4px',
            padding: '10px 12px',
            marginBottom: '10px',
          }}
        >
          <p
            style={{
              color: '#E2E8F0',
              fontSize: '0.8rem',
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            {message}
          </p>
        </div>

        {/* Context tag */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '0.6rem',
              fontWeight: 500,
              color: '#94A3B8',
              background: 'rgba(51, 65, 85, 0.5)',
              border: '1px solid #334155',
            }}
          >
            Triggered by: {contextLabel}
          </span>
        </div>
      </div>

      {/* Phone bezel bottom */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 4px 0' }}>
        <div
          style={{
            width: '40px',
            height: '4px',
            borderRadius: '2px',
            background: '#334155',
          }}
        />
      </div>
    </div>
  )
}
