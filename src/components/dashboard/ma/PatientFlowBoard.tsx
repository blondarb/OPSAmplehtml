'use client'

import React, { useState } from 'react'
import type { Provider, PatientScheduleItem, MATask } from '@/lib/dashboard/types'
import TimelineRow from './TimelineRow'

interface PatientFlowBoardProps {
  providers: Provider[]
  patients: PatientScheduleItem[]
  tasks: MATask[]
  selectedProviderId: string | null
  block: 'morning' | 'afternoon'
  onBlockChange: (block: 'morning' | 'afternoon') => void
}

// ── Constants ────────────────────────────────────────────────────────────────

const SLOT_WIDTH = 140
const PROVIDER_LABEL_WIDTH = 120

const MORNING_SLOTS = ['8:00', '8:30', '9:00', '9:30', '10:00', '10:30', '11:00']
const AFTERNOON_SLOTS = ['1:00', '1:30', '2:00', '2:30', '3:00', '3:30', '4:00', '4:30']

// ── Component ────────────────────────────────────────────────────────────────

export default function PatientFlowBoard({
  providers,
  patients,
  tasks,
  selectedProviderId,
  block,
  onBlockChange,
}: PatientFlowBoardProps) {
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null)

  const slots = block === 'morning' ? MORNING_SLOTS : AFTERNOON_SLOTS

  // Filter providers if one is selected
  const visibleProviders = selectedProviderId
    ? providers.filter((p) => p.id === selectedProviderId)
    : providers

  function handlePatientClick(id: string) {
    setExpandedPatientId((prev) => (prev === id ? null : id))
  }

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 12,
        border: '1px solid #E2E8F0',
        padding: 16,
        overflowX: 'auto',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
          Patient Flow Board
        </span>

        {/* Block toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => onBlockChange('morning')}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 16px',
              borderRadius: 9999,
              border: block === 'morning' ? 'none' : '1px solid #0D9488',
              backgroundColor: block === 'morning' ? '#0D9488' : '#ffffff',
              color: block === 'morning' ? '#ffffff' : '#0D9488',
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
              lineHeight: '16px',
            }}
          >
            Morning (8-12)
          </button>
          <button
            onClick={() => onBlockChange('afternoon')}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 16px',
              borderRadius: 9999,
              border: block === 'afternoon' ? 'none' : '1px solid #0D9488',
              backgroundColor: block === 'afternoon' ? '#0D9488' : '#ffffff',
              color: block === 'afternoon' ? '#ffffff' : '#0D9488',
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
              lineHeight: '16px',
            }}
          >
            Afternoon (1-5)
          </button>
        </div>
      </div>

      {/* Time header */}
      <div style={{ display: 'flex', marginBottom: 8 }}>
        {/* Spacer matching provider label width */}
        <div style={{ width: PROVIDER_LABEL_WIDTH, minWidth: PROVIDER_LABEL_WIDTH, flexShrink: 0 }} />

        {/* Time labels */}
        <div style={{ display: 'flex' }}>
          {slots.map((label) => (
            <div
              key={label}
              style={{
                width: SLOT_WIDTH,
                minWidth: SLOT_WIDTH,
                textAlign: 'center',
                fontSize: 12,
                color: '#64748B',
                lineHeight: '16px',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Afternoon empty state */}
      {block === 'afternoon' ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 0',
            color: '#94A3B8',
            fontSize: 14,
          }}
        >
          Afternoon schedule data coming soon
        </div>
      ) : (
        /* Timeline rows */
        <div>
          {visibleProviders.map((provider, idx) => {
            const providerPatients = patients.filter((p) => p.provider_id === provider.id)
            return (
              <div key={provider.id}>
                {idx > 0 && (
                  <div
                    style={{
                      height: 1,
                      backgroundColor: '#F1F5F9',
                      marginTop: 8,
                      marginBottom: 8,
                    }}
                  />
                )}
                <TimelineRow
                  provider={provider}
                  patients={providerPatients}
                  tasks={tasks}
                  expandedPatientId={expandedPatientId}
                  onPatientClick={handlePatientClick}
                  block={block}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
