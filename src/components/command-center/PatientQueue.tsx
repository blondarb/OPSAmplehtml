'use client'

import { useState, useEffect, forwardRef } from 'react'
import { Search } from 'lucide-react'
import type { PatientQueueItem, PatientsResponse, PatientUrgency } from '@/lib/command-center/types'
import PatientRow from './PatientRow'
import PatientDetailCard from './PatientDetailCard'

// ─── Props ───────────────────────────────────────────────────────────────────

interface PatientQueueProps {
  viewMode: 'my_patients' | 'all_patients'
  timeRange: 'today' | 'yesterday' | 'last_7_days'
  categoryFilter: string   // 'all' | 'messages' | 'refills' | etc.
  onCategoryFilterChange: (category: string) => void
}

// ─── Category filter pill definitions ────────────────────────────────────────

const CATEGORY_PILLS = [
  { key: 'all', label: 'All' },
  { key: 'messages', label: 'Messages' },
  { key: 'refills', label: 'Refills' },
  { key: 'results', label: 'Results' },
  { key: 'wearables', label: 'Wearables' },
  { key: 'followups', label: 'Follow-ups' },
  { key: 'triage', label: 'Triage' },
  { key: 'ehr', label: 'EHR' },
]

// ─── Urgency filter pill definitions ─────────────────────────────────────────

const URGENCY_PILLS: { key: PatientUrgency | 'all'; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: '#4F46E5' },
  { key: 'urgent', label: 'Urgent', color: '#EF4444' },
  { key: 'attention', label: 'Attention', color: '#F59E0B' },
  { key: 'watch', label: 'Watch', color: '#EAB308' },
  { key: 'stable', label: 'Stable', color: '#22C55E' },
]

// ─── Demo fallback data ──────────────────────────────────────────────────────

const DEMO_PATIENTS: PatientQueueItem[] = [
  {
    id: 'demo-1',
    name: 'Maria Santos',
    age: 68,
    sex: 'F',
    primary_diagnosis: "Parkinson's Disease",
    urgency: 'urgent',
    pending_items: { messages: 0, refills: 1, results: 1, wearables: 2, followups: 0, triage: 0, scales: 1, ehr: 0 },
    ai_micro_summary: 'Progressive tremor worsening + 2 falls. PT referral needed.',
    last_contact: { date: '2026-02-23', method: 'wearable_alert' },
    sources: ['sevaro', 'wearable'],
  },
  {
    id: 'demo-2',
    name: 'James Okonkwo',
    age: 34,
    sex: 'M',
    primary_diagnosis: 'Epilepsy',
    urgency: 'urgent',
    pending_items: { messages: 1, refills: 0, results: 1, wearables: 0, followups: 1, triage: 0, scales: 0, ehr: 1 },
    ai_micro_summary: 'Breakthrough seizure reported 2 days ago. Levetiracetam level pending.',
    last_contact: { date: '2026-02-22', method: 'patient_message' },
    sources: ['sevaro', 'ehr'],
  },
  {
    id: 'demo-3',
    name: 'Dorothy Chen',
    age: 81,
    sex: 'F',
    primary_diagnosis: "Alzheimer's Disease",
    urgency: 'attention',
    pending_items: { messages: 1, refills: 0, results: 0, wearables: 0, followups: 0, triage: 0, scales: 1, ehr: 0 },
    ai_micro_summary: 'Family message unread 2 days. MoCA overdue (last 8 months ago).',
    last_contact: { date: '2026-02-22', method: 'family_message' },
    sources: ['sevaro'],
  },
  {
    id: 'demo-4',
    name: 'Thomas Wright',
    age: 48,
    sex: 'M',
    primary_diagnosis: 'Peripheral Neuropathy',
    urgency: 'watch',
    pending_items: { messages: 0, refills: 1, results: 1, wearables: 0, followups: 0, triage: 0, scales: 0, ehr: 1 },
    ai_micro_summary: 'EMG results pending 10 days. Gabapentin refill due.',
    last_contact: { date: '2026-02-14', method: 'office_visit' },
    sources: ['sevaro', 'ehr'],
  },
  {
    id: 'demo-5',
    name: 'Susan Williams',
    age: 58,
    sex: 'F',
    primary_diagnosis: 'Tension Headache',
    urgency: 'stable',
    pending_items: { messages: 0, refills: 0, results: 0, wearables: 0, followups: 0, triage: 0, scales: 0, ehr: 0 },
    ai_micro_summary: 'Routine follow-up. All scales complete, stable on current regimen.',
    last_contact: { date: '2026-02-20', method: 'office_visit' },
    sources: ['sevaro'],
  },
]

// ─── Skeleton row for loading state ──────────────────────────────────────────

function SkeletonRow() {
  return (
    <div
      style={{
        background: '#1e293b',
        borderRadius: '8px',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <div
          style={{
            width: '160px',
            height: '14px',
            borderRadius: '4px',
            background: 'linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)',
            backgroundSize: '200% 100%',
            animation: 'patientQueueShimmer 1.5s ease-in-out infinite',
          }}
        />
        <div
          style={{
            width: '120px',
            height: '12px',
            borderRadius: '4px',
            background: 'linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)',
            backgroundSize: '200% 100%',
            animation: 'patientQueueShimmer 1.5s ease-in-out infinite',
            animationDelay: '0.2s',
          }}
        />
      </div>
      <div
        style={{
          width: '80%',
          height: '12px',
          borderRadius: '4px',
          background: 'linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)',
          backgroundSize: '200% 100%',
          animation: 'patientQueueShimmer 1.5s ease-in-out infinite',
          animationDelay: '0.4s',
        }}
      />
    </div>
  )
}

// ─── PatientQueue component ──────────────────────────────────────────────────

const PatientQueue = forwardRef<HTMLDivElement, PatientQueueProps>(
  function PatientQueue({ viewMode, timeRange, categoryFilter, onCategoryFilterChange }, ref) {
    // ── Local state ────────────────────────────────────────────────────────────
    const [patients, setPatients] = useState<PatientQueueItem[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null)
    const [urgencyFilter, setUrgencyFilter] = useState<PatientUrgency | 'all'>('all')
    const [searchQuery, setSearchQuery] = useState('')

    // ── Data fetching ──────────────────────────────────────────────────────────
    useEffect(() => {
      let cancelled = false

      async function fetchPatients() {
        setLoading(true)
        try {
          const params = new URLSearchParams({
            view_mode: viewMode,
            time_range: timeRange,
          })
          const res = await fetch(`/api/command-center/patients?${params}`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data: PatientsResponse = await res.json()
          if (!cancelled) {
            setPatients(data.patients)
          }
        } catch {
          // Fall back to demo data on error
          if (!cancelled) {
            setPatients(DEMO_PATIENTS)
          }
        } finally {
          if (!cancelled) {
            setLoading(false)
          }
        }
      }

      fetchPatients()
      return () => { cancelled = true }
    }, [viewMode, timeRange])

    // ── Client-side filtering ──────────────────────────────────────────────────
    const filteredPatients = patients.filter((p) => {
      // Category filter: only show patients with pending items in that category
      if (categoryFilter && categoryFilter !== 'all') {
        const key = categoryFilter as keyof typeof p.pending_items
        if (!(key in p.pending_items) || p.pending_items[key] === 0) {
          return false
        }
      }

      // Urgency filter
      if (urgencyFilter !== 'all' && p.urgency !== urgencyFilter) {
        return false
      }

      // Search filter: case-insensitive match on patient name
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim()
        if (!p.name.toLowerCase().includes(q)) {
          return false
        }
      }

      return true
    })

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
      <div ref={ref} style={{ fontFamily: 'Inter, sans-serif' }}>
        {/* Shimmer animation */}
        <style>{`
          @keyframes patientQueueShimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>

        {/* Patient Count Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '12px',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: '1.1rem',
              fontWeight: 600,
              color: '#e2e8f0',
            }}
          >
            Priority Patients
          </h3>
          {!loading && (
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 500,
                color: '#94a3b8',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '99px',
                padding: '2px 10px',
              }}
            >
              {filteredPatients.length} patient{filteredPatients.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Category filter pills */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            marginBottom: '8px',
          }}
        >
          {CATEGORY_PILLS.map((pill) => {
            const isActive = categoryFilter === pill.key
            return (
              <button
                key={pill.key}
                onClick={() => onCategoryFilterChange(pill.key)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '99px',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  border: isActive ? 'none' : '1px solid #334155',
                  background: isActive ? '#4F46E5' : '#1e293b',
                  color: isActive ? '#ffffff' : '#94a3b8',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {pill.label}
              </button>
            )
          })}
        </div>

        {/* Urgency filter pills + search */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            marginBottom: '12px',
            alignItems: 'center',
          }}
        >
          {URGENCY_PILLS.map((pill) => {
            const isActive = urgencyFilter === pill.key
            return (
              <button
                key={pill.key}
                onClick={() => setUrgencyFilter(pill.key)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '99px',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  border: `1px solid ${isActive ? pill.color : '#334155'}`,
                  background: isActive ? `${pill.color}20` : '#1e293b',
                  color: isActive ? pill.color : '#94a3b8',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {pill.label}
              </button>
            )
          })}

          {/* Search input */}
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '6px 12px',
            }}
          >
            <Search size={14} color="#64748b" />
            <input
              type="text"
              placeholder="Search patient..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#e2e8f0',
                fontSize: '0.85rem',
                fontFamily: 'Inter, sans-serif',
                width: '160px',
              }}
            />
          </div>
        </div>

        {/* Patient list */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : filteredPatients.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: '#64748b',
              fontSize: '0.9rem',
            }}
          >
            No patients match the current filters
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {filteredPatients.map((patient) => {
              const isExpanded = expandedPatientId === patient.id
              return (
                <div key={patient.id}>
                  <PatientRow
                    patient={patient}
                    isExpanded={isExpanded}
                    onToggle={() =>
                      setExpandedPatientId(isExpanded ? null : patient.id)
                    }
                  />
                  {isExpanded && (
                    <PatientDetailCard
                      patientId={patient.id}
                      patientName={patient.name}
                      urgency={patient.urgency}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }
)

export default PatientQueue
