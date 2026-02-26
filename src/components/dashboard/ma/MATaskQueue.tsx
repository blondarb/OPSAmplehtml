'use client'

import React, { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { MATask, Provider, PatientScheduleItem, TaskPriority } from '@/lib/dashboard/types'
import MATaskCard from './MATaskCard'

// ── Props ─────────────────────────────────────────────────────────────────────

interface MATaskQueueProps {
  tasks: MATask[]
  providers: Provider[]
  patients: PatientScheduleItem[]
  selectedProviderId: string | null
}

// ── Filter tab type ───────────────────────────────────────────────────────────

type FilterTab = 'all' | 'urgent' | 'time_sensitive' | 'routine'

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'time_sensitive', label: 'Time-Sensitive' },
  { key: 'routine', label: 'Routine' },
]

// ── Priority sort order ───────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  time_sensitive: 1,
  routine: 2,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MATaskQueue({
  tasks,
  providers,
  patients,
  selectedProviderId,
}: MATaskQueueProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [showAllRoutine, setShowAllRoutine] = useState(false)

  // Lookup helpers — memoized
  const providerMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of providers) m.set(p.id, p.name)
    return m
  }, [providers])

  const patientMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of patients) m.set(p.id, p.name)
    return m
  }, [patients])

  // Filter + sort tasks
  const filteredTasks = useMemo(() => {
    let result = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress')

    // Provider filter
    if (selectedProviderId) {
      result = result.filter((t) => t.provider_id === selectedProviderId)
    }

    // Priority tab filter
    if (activeTab !== 'all') {
      result = result.filter((t) => t.priority === activeTab)
    }

    // Sort by priority
    result.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])

    return result
  }, [tasks, selectedProviderId, activeTab])

  // Count pending tasks (before tab filter, for badge)
  const pendingCount = useMemo(() => {
    let result = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress')
    if (selectedProviderId) {
      result = result.filter((t) => t.provider_id === selectedProviderId)
    }
    return result.length
  }, [tasks, selectedProviderId])

  // Split routine vs non-routine for partial display
  const nonRoutineTasks = filteredTasks.filter((t) => t.priority !== 'routine')
  const routineTasks = filteredTasks.filter((t) => t.priority === 'routine')
  const routineVisible = showAllRoutine ? routineTasks : routineTasks.slice(0, 2)
  const routineHidden = routineTasks.length - routineVisible.length

  // When tab is not "all", show all tasks without routine collapsing
  const showRoutineSplit = activeTab === 'all'

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        border: '1px solid #E2E8F0',
        padding: 16,
      }}
    >
      {/* Header bar */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, color: '#1E293B' }}>
          Task Queue
        </span>

        {/* Pending count badge */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 22,
            height: 22,
            padding: '0 6px',
            borderRadius: 9999,
            backgroundColor: '#F0FDFA',
            color: '#0D9488',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {pendingCount}
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Collapse toggle */}
        {collapsed ? (
          <ChevronDown size={18} color="#64748B" />
        ) : (
          <ChevronUp size={18} color="#64748B" />
        )}
      </button>

      {/* Expanded content */}
      {!collapsed && (
        <div style={{ marginTop: 14 }}>
          {/* Filter tabs */}
          <div
            style={{
              display: 'flex',
              gap: 16,
              marginBottom: 14,
              borderBottom: '1px solid #F1F5F9',
              paddingBottom: 8,
            }}
          >
            {FILTER_TABS.map((tab) => {
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveTab(tab.key)
                    setShowAllRoutine(false)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '0 0 4px 0',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#0D9488' : '#64748B',
                    borderBottom: isActive ? '2px solid #0D9488' : '2px solid transparent',
                    transition: 'color 0.1s ease, border-color 0.1s ease',
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Task list */}
          {filteredTasks.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '24px 0',
                fontSize: 13,
                color: '#94A3B8',
              }}
            >
              No pending tasks
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {showRoutineSplit ? (
                <>
                  {/* Non-routine tasks */}
                  {nonRoutineTasks.map((task) => (
                    <MATaskCard
                      key={task.id}
                      task={task}
                      providerName={providerMap.get(task.provider_id) || 'Unknown Provider'}
                      patientName={patientMap.get(task.patient_id) || 'Unknown Patient'}
                    />
                  ))}

                  {/* Routine tasks (first 2 by default) */}
                  {routineVisible.map((task) => (
                    <MATaskCard
                      key={task.id}
                      task={task}
                      providerName={providerMap.get(task.provider_id) || 'Unknown Provider'}
                      patientName={patientMap.get(task.patient_id) || 'Unknown Patient'}
                    />
                  ))}

                  {/* "Show N more" link */}
                  {routineHidden > 0 && (
                    <button
                      onClick={() => setShowAllRoutine(true)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '6px 0',
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#0D9488',
                        textAlign: 'left',
                      }}
                    >
                      Show {routineHidden} more routine task{routineHidden > 1 ? 's' : ''}
                    </button>
                  )}
                </>
              ) : (
                /* When a specific tab is active, show all matching tasks */
                filteredTasks.map((task) => (
                  <MATaskCard
                    key={task.id}
                    task={task}
                    providerName={providerMap.get(task.provider_id) || 'Unknown Provider'}
                    patientName={patientMap.get(task.patient_id) || 'Unknown Patient'}
                  />
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
