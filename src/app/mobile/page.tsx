'use client'

import { useState, useEffect } from 'react'
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

// Sample data - in production this would come from the database
const samplePatients: Patient[] = [
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

export default function MobileHomePage() {
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>(samplePatients)
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'in-progress' | 'completed'>('all')
  const [searchQuery, setSearchQuery] = useState('')

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
      {/* Search and filter bar */}
      <div style={{
        padding: '16px',
        background: 'var(--bg-white)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        {/* Search input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          background: 'var(--bg-gray)',
          borderRadius: '12px',
          marginBottom: '12px',
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

        {/* Filter pills */}
        <div style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: '4px',
        }}>
          {[
            { id: 'all', label: 'All', count: patients.length },
            { id: 'scheduled', label: 'Scheduled', count: scheduledCount },
            { id: 'in-progress', label: 'In Progress', count: inProgressCount },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as typeof filter)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '20px',
                border: 'none',
                background: filter === f.id ? 'var(--primary)' : 'var(--bg-gray)',
                color: filter === f.id ? 'white' : 'var(--text-secondary)',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
            >
              {f.label}
              <span style={{
                background: filter === f.id ? 'rgba(255,255,255,0.2)' : 'var(--border)',
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '12px',
              }}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Today's schedule header */}
      <div style={{
        padding: '16px 16px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}>
            Today's Schedule
          </div>
          <div style={{
            fontSize: '13px',
            color: 'var(--text-muted)',
            marginTop: '2px',
          }}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric'
            })}
          </div>
        </div>
        <button style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 12px',
          borderRadius: '10px',
          border: '1px solid var(--border)',
          background: 'var(--bg-white)',
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Calendar
        </button>
      </div>

      {/* Patient list */}
      <div style={{ padding: '8px 16px 16px' }}>
        {filteredPatients.length === 0 ? (
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

      {/* Quick voice start FAB */}
      <button
        onClick={() => router.push('/mobile/voice')}
        style={{
          position: 'fixed',
          bottom: 'calc(80px + env(safe-area-inset-bottom))',
          right: '20px',
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
          border: 'none',
          boxShadow: '0 8px 24px rgba(239, 68, 68, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 50,
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="white" fill="none" strokeWidth="2" />
          <line x1="12" y1="19" x2="12" y2="23" stroke="white" strokeWidth="2" />
          <line x1="8" y1="23" x2="16" y2="23" stroke="white" strokeWidth="2" />
        </svg>
      </button>
    </MobileLayout>
  )
}
