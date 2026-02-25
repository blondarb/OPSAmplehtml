'use client'

import { useState, useRef, useCallback } from 'react'
import RoleToggle from './RoleToggle'
import TimeRangeSelector from './TimeRangeSelector'
import MorningBriefing from './MorningBriefing'
import StatusBar from './StatusBar'
import ActionQueue from './ActionQueue'
import PatientQueue from './PatientQueue'
import QuickAccessStrip from './QuickAccessStrip'
import DisclaimerBanner from './DisclaimerBanner'

export default function CommandCenterPage() {
  const [viewMode, setViewMode] = useState<'my_patients' | 'all_patients'>('my_patients')
  const [timeRange, setTimeRange] = useState<'today' | 'yesterday' | 'last_7_days'>('today')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const patientQueueRef = useRef<HTMLDivElement>(null)

  const handleCategoryFilter = useCallback((category: string) => {
    setCategoryFilter(category)
    patientQueueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div
      style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {/* Header area: RoleToggle + TimeRangeSelector */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 12,
          marginBottom: -16, // tighten gap to Zone 1 (net 8px with 24px gap)
        }}
      >
        <RoleToggle value={viewMode} onChange={setViewMode} />
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Zone 1: Morning Briefing */}
      <MorningBriefing viewMode={viewMode} timeRange={timeRange} />

      {/* Zone 2: Status Bar */}
      <StatusBar
        viewMode={viewMode}
        timeRange={timeRange}
        onCategoryFilter={handleCategoryFilter}
      />

      {/* Zone 3: Action Queue */}
      <ActionQueue viewMode={viewMode} timeRange={timeRange} />

      {/* Zone 4: Patient Queue */}
      <PatientQueue
        ref={patientQueueRef}
        viewMode={viewMode}
        timeRange={timeRange}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
      />

      {/* Zone 5: Quick Access Strip */}
      <QuickAccessStrip />

      {/* Footer: Disclaimer */}
      <DisclaimerBanner />
    </div>
  )
}
