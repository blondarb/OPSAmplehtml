'use client'

import { useState } from 'react'
import type { WearableAlert } from '@/lib/wearable/types'

interface AutoDraftOrderPanelProps {
  patientName: string
  alert: WearableAlert
}

export default function AutoDraftOrderPanel({ patientName, alert }: AutoDraftOrderPanelProps) {
  const [orderSent, setOrderSent] = useState(false)

  const fields = [
    { label: 'Patient', value: patientName },
    { label: 'Referring Provider', value: '[To be assigned]' },
    {
      label: 'Reason',
      value:
        'Recurrent falls (2 in 9 days) in setting of Parkinson\'s Disease. Progressive motor decline on wearable monitoring.',
    },
    {
      label: 'Requested Services',
      value:
        'Fall risk assessment, gait training, balance exercises, home safety evaluation',
    },
    { label: 'Priority', value: 'Urgent' },
    {
      label: 'Notes',
      value:
        'Patient had falls on Day 19 and Day 27 of monitoring period. See wearable data timeline for full context.',
    },
  ]

  // Suppress unused variable warning — alert is accepted for interface consistency
  void alert

  return (
    <div style={{
      background: 'rgba(14, 165, 233, 0.1)',
      borderRadius: '10px',
      border: '1px solid rgba(14, 165, 233, 0.25)',
      borderLeft: '4px solid #0EA5E9',
      padding: '20px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '16px',
      }}>
        <span style={{
          fontSize: '1.1rem',
        }}>
          &#128203;
        </span>
        <h4 style={{
          color: '#f1f5f9',
          fontSize: '0.95rem',
          fontWeight: 700,
          margin: 0,
        }}>
          Auto-Draft Order &mdash; Physical Therapy Referral
        </h4>
      </div>

      {/* Pre-filled fields */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        marginBottom: '16px',
      }}>
        {fields.map((field) => (
          <div key={field.label} style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
          }}>
            <span style={{
              color: '#64748b',
              fontSize: '0.8rem',
              fontWeight: 600,
              minWidth: '130px',
              flexShrink: 0,
              paddingTop: '1px',
            }}>
              {field.label}:
            </span>
            <span style={{
              color: field.label === 'Priority' ? '#DC2626' : '#cbd5e1',
              fontSize: '0.82rem',
              lineHeight: 1.5,
              fontWeight: field.label === 'Priority' ? 700 : 400,
            }}>
              {field.value}
            </span>
          </div>
        ))}
      </div>

      {/* Sign and Send button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '12px',
      }}>
        {!orderSent ? (
          <button
            onClick={() => setOrderSent(true)}
            style={{
              background: '#0EA5E9',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 24px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            Sign and Send
          </button>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(22, 163, 74, 0.15)',
            border: '1px solid rgba(22, 163, 74, 0.3)',
            borderRadius: '8px',
            padding: '10px 20px',
          }}>
            <span style={{
              color: '#16A34A',
              fontSize: '1rem',
              fontWeight: 700,
            }}>
              &#10003;
            </span>
            <span style={{
              color: '#16A34A',
              fontSize: '0.85rem',
              fontWeight: 700,
            }}>
              Order Sent!
            </span>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <p style={{
        color: '#64748b',
        fontSize: '0.72rem',
        fontStyle: 'italic',
        margin: 0,
        lineHeight: 1.5,
      }}>
        This order was auto-drafted by AI. Review all fields before signing.
      </p>
    </div>
  )
}
