'use client'

import React from 'react'
import type { Provider, PatientScheduleItem, MATask, ProviderStatus } from '@/lib/dashboard/types'
import PatientFlowCard from './PatientFlowCard'
import PatientDetailPanel from './PatientDetailPanel'

interface TimelineRowProps {
  provider: Provider
  patients: PatientScheduleItem[]
  tasks: MATask[]
  expandedPatientId: string | null
  onPatientClick: (id: string) => void
  block: 'morning' | 'afternoon'
}

// ── Constants ────────────────────────────────────────────────────────────────

const SLOT_WIDTH = 140
const PROVIDER_LABEL_WIDTH = 120

const MORNING_SLOTS = ['8:00', '8:30', '9:00', '9:30', '10:00', '10:30', '11:00']
const AFTERNOON_SLOTS = ['1:00', '1:30', '2:00', '2:30', '3:00', '3:30', '4:00', '4:30']

const STATUS_DOT_COLORS: Record<ProviderStatus, string> = {
  available: '#22C55E',
  in_visit: '#EF4444',
  break: '#F59E0B',
  offline: '#94A3B8',
}

// Demo "now" indicator: 9:40 AM → 100 minutes past 8:00
// (100 / 30) * 140 = ~466.67px from left edge of first slot
const NOW_OFFSET_PX = Math.round((100 / 30) * SLOT_WIDTH)

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse appointment_time (e.g. "2026-02-26T09:00:00") and return the slot index, or -1 if not found. */
function getSlotIndex(appointmentTime: string, slots: string[]): number {
  let hours: number
  let minutes: number

  // Try ISO date string first, fall back to plain time string
  const date = new Date(appointmentTime)
  if (!isNaN(date.getTime())) {
    hours = date.getHours()
    minutes = date.getMinutes()
  } else {
    // Fallback: parse "HH:MM" or "H:MM" from the string
    const match = appointmentTime.match(/(\d{1,2}):(\d{2})/)
    if (!match) return -1
    hours = parseInt(match[1], 10)
    minutes = parseInt(match[2], 10)
  }

  // Convert to 12-hour label for matching
  const h12 = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours
  const label = `${h12}:${minutes.toString().padStart(2, '0')}`

  return slots.indexOf(label)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TimelineRow({
  provider,
  patients,
  tasks,
  expandedPatientId,
  onPatientClick,
  block,
}: TimelineRowProps) {
  const slots = block === 'morning' ? MORNING_SLOTS : AFTERNOON_SLOTS

  // Build a map: slotIndex → patient (or null)
  const slotPatientMap: (PatientScheduleItem | null)[] = slots.map(() => null)
  for (const p of patients) {
    const idx = getSlotIndex(p.appointment_time, slots)
    if (idx >= 0) {
      slotPatientMap[idx] = p
    }
  }

  // Check if expanded patient belongs to this row
  const expandedPatient = expandedPatientId
    ? patients.find((p) => p.id === expandedPatientId) ?? null
    : null

  const expandedTasks = expandedPatient
    ? tasks.filter((t) => t.patient_id === expandedPatient.id)
    : []

  const showNowLine = block === 'morning'

  return (
    <div>
      {/* Main row: provider label + slots */}
      <div style={{ display: 'flex', alignItems: 'stretch', position: 'relative' }}>
        {/* Provider label */}
        <div
          style={{
            width: PROVIDER_LABEL_WIDTH,
            minWidth: PROVIDER_LABEL_WIDTH,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingRight: 12,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: STATUS_DOT_COLORS[provider.status],
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#1e293b',
              lineHeight: '18px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {provider.name}
          </span>
        </div>

        {/* Time slot area */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            gap: 0,
          }}
        >
          {/* "Now" indicator line */}
          {showNowLine && (
            <div
              style={{
                position: 'absolute',
                left: NOW_OFFSET_PX,
                top: 0,
                bottom: 0,
                width: 2,
                borderLeft: '2px dashed #EF4444',
                zIndex: 2,
                pointerEvents: 'none',
              }}
            />
          )}

          {slots.map((_, slotIdx) => {
            const patient = slotPatientMap[slotIdx]

            return (
              <div
                key={slotIdx}
                style={{
                  width: SLOT_WIDTH,
                  minWidth: SLOT_WIDTH,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px 5px',
                  boxSizing: 'border-box',
                }}
              >
                {patient ? (
                  <PatientFlowCard
                    patient={patient}
                    isExpanded={expandedPatientId === patient.id}
                    onClick={() => onPatientClick(patient.id)}
                  />
                ) : (
                  /* Empty slot placeholder */
                  <div
                    style={{
                      width: 130,
                      height: 90,
                      borderRadius: 8,
                      border: '1px dashed rgba(148,163,184,0.2)',
                      boxSizing: 'border-box',
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Expanded patient detail panel */}
      {expandedPatient && (
        <div style={{ marginLeft: PROVIDER_LABEL_WIDTH, marginTop: 8, marginBottom: 4 }}>
          <PatientDetailPanel
            patient={expandedPatient}
            tasks={expandedTasks}
            onClose={() => onPatientClick(expandedPatient.id)}
          />
        </div>
      )}
    </div>
  )
}
