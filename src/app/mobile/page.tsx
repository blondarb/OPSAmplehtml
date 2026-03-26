'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import MobileLayout from '@/components/mobile/MobileLayout'
import MobilePatientCard from '@/components/mobile/MobilePatientCard'

interface Patient {
  id: string
  name: string
  age: number
  gender: string
  mrn: string
  reason?: string
  time?: string
  type?: 'new' | 'follow-up'
  status?: 'scheduled' | 'in-progress' | 'completed'
}

// Fallback sample data — used only when API is unreachable
const fallbackPatients: Patient[] = [
  {
    id: '1',
    name: 'Eleanor Martinez',
    age: 67,
    gender: 'F',
    mrn: 'MRN-2847591',
    reason: 'New onset headaches',
    time: '9:00 AM',
    type: 'new',
    status: 'scheduled',
  },
  {
    id: '2',
    name: 'Robert Chen',
    age: 52,
    gender: 'M',
    mrn: 'MRN-1938274',
    reason: 'Tremor evaluation',
    time: '9:30 AM',
    type: 'new',
    status: 'in-progress',
  },
  {
    id: '3',
    name: 'Sarah Johnson',
    age: 45,
    gender: 'F',
    mrn: 'MRN-8472615',
    reason: 'Migraine follow-up',
    time: '10:00 AM',
    type: 'follow-up',
    status: 'scheduled',
  },
  {
    id: '4',
    name: 'Michael Williams',
    age: 73,
    gender: 'M',
    mrn: 'MRN-5739182',
    reason: 'Memory concerns',
    time: '10:30 AM',
    type: 'new',
    status: 'scheduled',
  },
  {
    id: '5',
    name: 'Lisa Thompson',
    age: 38,
    gender: 'F',
    mrn: 'MRN-4628193',
    reason: 'MS follow-up',
    time: '11:00 AM',
    type: 'follow-up',
    status: 'completed',
  },
]

function mapAppointmentToPatient(appt: Record<string, unknown>): Patient {
  const patient = appt.patient as Record<string, unknown> | undefined
  const timeStr = appt.appointment_time
    ? new Date(appt.appointment_time as string).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : undefined

  // Map appointment status to our status type
  let status: Patient['status'] = 'scheduled'
  if (appt.status === 'in_progress' || appt.status === 'checked_in') status = 'in-progress'
  else if (appt.status === 'completed') status = 'completed'

  // Determine type from appointment type or visit history
  const type: Patient['type'] = (appt.appointment_type === 'follow_up' || appt.appointment_type === 'follow-up')
    ? 'follow-up'
    : 'new'

  return {
    id: (patient?.id as string) || (appt.patient_id as string) || (appt.id as string),
    name: (patient?.full_name as string) || (patient?.name as string) || (appt.patient_name as string) || 'Unknown',
    age: (patient?.age as number) || 0,
    gender: (patient?.gender as string) || 'U',
    mrn: (patient?.mrn as string) || '',
    reason: (appt.reason as string) || (appt.chief_complaint as string) || undefined,
    time: timeStr,
    type,
    status,
  }
}

export default function MobileHomePage() {
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUsingFallback, setIsUsingFallback] = useState(false)
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'in-progress' | 'completed'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchPatients = useCallback(async () => {
    setIsLoading(true)
    try {
      // Try appointments endpoint first (today's schedule)
      const res = await fetch('/api/appointments?date=today')
      if (res.ok) {
        const data = await res.json()
        const appointments = data.appointments || data.data || data
        if (Array.isArray(appointments) && appointments.length > 0) {
          const mapped = appointments.map(mapAppointmentToPatient)
          setPatients(mapped)
          setIsUsingFallback(false)
          setIsLoading(false)
          return
        }
      }

      // If no appointments, try patients list
      const patientsRes = await fetch('/api/patients/list')
      if (patientsRes.ok) {
        const data = await patientsRes.json()
        const patientList = data.patients || data.data || data
        if (Array.isArray(patientList) && patientList.length > 0) {
          const mapped: Patient[] = patientList.slice(0, 10).map((p: Record<string, unknown>) => ({
            id: p.id as string,
            name: (p.full_name as string) || (p.name as string) || 'Unknown',
            age: (p.age as number) || 0,
            gender: (p.gender as string) || 'U',
            mrn: (p.mrn as string) || '',
            reason: (p.chief_complaint as string) || undefined,
            status: 'scheduled' as const,
          }))
          setPatients(mapped)
          setIsUsingFallback(false)
          setIsLoading(false)
          return
        }
      }

      // Graceful fallback to sample data
      setPatients(fallbackPatients)
      setIsUsingFallback(true)
    } catch (err) {
      console.error('Failed to fetch patients:', err)
      setPatients(fallbackPatients)
      setIsUsingFallback(true)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchPatients()
  }, [fetchPatients])

  const filteredPatients = patients.filter(p => {
    const matchesFilter = filter === 'all' || p.status === filter
    const matchesSearch = searchQuery === '' ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.mrn.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const handlePatientClick = (patient: Patient) => {
    router.push(`/mobile/chart/${patient.id}`)
  }

  const handleCheckIn = (patient: Patient) => {
    setPatients(prev => prev.map(p =>
      p.id === patient.id ? { ...p, status: 'in-progress' as const } : p
    ))
  }

  const handleCancel = (patient: Patient) => {
    // In production, would show confirmation modal
    console.log('Cancel appointment for', patient.name)
  }

  const scheduledCount = patients.filter(p => p.status === 'scheduled').length
  const inProgressCount = patients.filter(p => p.status === 'in-progress').length

  return (
    <MobileLayout activeTab="patients">
      {/* Search and filter bar - compact */}
      <div style={{
        padding: '10px 12px',
        background: 'var(--bg-white)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        {/* Fallback indicator */}
        {isUsingFallback && (
          <div style={{
            padding: '6px 10px',
            marginBottom: '8px',
            borderRadius: '8px',
            background: '#fef3c7',
            border: '1px solid #fcd34d',
            fontSize: '11px',
            color: '#92400e',
            textAlign: 'center',
          }}>
            Showing sample data -- schedule not available
          </div>
        )}

        {/* Search input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'var(--bg-gray)',
          borderRadius: '10px',
          marginBottom: '8px',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search patients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              fontSize: '15px',
              outline: 'none',
              color: 'var(--text-primary)',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px',
                cursor: 'pointer',
                color: 'var(--text-muted)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Filter pills - compact */}
        <div style={{
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}>
          {[
            { id: 'all', label: 'All', count: patients.length },
            { id: 'scheduled', label: 'Scheduled', count: scheduledCount },
            { id: 'in-progress', label: 'Active', count: inProgressCount },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as typeof filter)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: '16px',
                border: 'none',
                background: filter === f.id ? 'var(--primary)' : 'var(--bg-gray)',
                color: filter === f.id ? 'white' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {f.label}
              <span style={{
                background: filter === f.id ? 'rgba(255,255,255,0.2)' : 'var(--border)',
                padding: '1px 6px',
                borderRadius: '8px',
                fontSize: '11px',
              }}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Today's schedule header - compact */}
      <div style={{
        padding: '10px 12px 6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}>
            Today&apos;s Schedule
          </div>
          <div style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
          }}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric'
            })}
          </div>
        </div>
        <button style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '6px 10px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: 'var(--bg-white)',
          fontSize: '12px',
          fontWeight: 500,
          color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Calendar
        </button>
      </div>

      {/* Patient list */}
      <div style={{ padding: '6px 12px 12px' }}>
        {isLoading ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: 'var(--text-muted)',
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              margin: '0 auto 16px',
              border: '3px solid var(--border)',
              borderTopColor: 'var(--primary)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ fontSize: '14px' }}>Loading schedule...</div>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: 'var(--text-muted)',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.5, margin: '0 auto 16px' }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            <div style={{ fontSize: '15px', fontWeight: 500 }}>No patients found</div>
            <div style={{ fontSize: '13px', marginTop: '4px' }}>
              Try adjusting your search or filters
            </div>
          </div>
        ) : (
          filteredPatients.map(patient => (
            <MobilePatientCard
              key={patient.id}
              patient={patient}
              onClick={() => handlePatientClick(patient)}
              onSwipeRight={() => handleCheckIn(patient)}
              onSwipeLeft={() => handleCancel(patient)}
            />
          ))
        )}
      </div>

      {/* Quick voice start FAB - smaller */}
      <button
        onClick={() => router.push('/mobile/voice')}
        style={{
          position: 'fixed',
          bottom: 'calc(70px + env(safe-area-inset-bottom))',
          right: '16px',
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
          border: 'none',
          boxShadow: '0 4px 16px rgba(239, 68, 68, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 50,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="white" stroke="none">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="white" fill="none" strokeWidth="2" />
          <line x1="12" y1="19" x2="12" y2="23" stroke="white" strokeWidth="2" />
          <line x1="8" y1="23" x2="16" y2="23" stroke="white" strokeWidth="2" />
        </svg>
      </button>
    </MobileLayout>
  )
}
