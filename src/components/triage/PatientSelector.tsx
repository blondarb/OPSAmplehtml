'use client'

import { useState, useEffect } from 'react'

interface Patient {
  id: string
  first_name: string
  last_name: string
  date_of_birth: string | null
}

interface Props {
  sessionId: string
}

export default function PatientSelector({ sessionId }: Props) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadPatients() {
      try {
        const res = await fetch('/api/patients/list')
        if (res.ok) {
          const { patients: data } = await res.json()
          if (data) setPatients(data)
        }
      } catch {
        // Non-critical — patient list may not be available in demo mode
      }
    }
    loadPatients()
  }, [])

  async function handleSave() {
    if (!selectedId) return
    setSaving(true)
    setError('')

    try {
      const res = await fetch(`/api/triage/${sessionId}/patient`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: selectedId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
      setSaved(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div style={{
        padding: '10px 14px',
        background: 'rgba(22, 163, 74, 0.1)',
        border: '1px solid #16A34A',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span style={{ color: '#16A34A', fontSize: '0.8rem', fontWeight: 500 }}>
          Saved to patient record
        </span>
      </div>
    )
  }

  if (patients.length === 0) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px 0',
    }}>
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        style={{
          flex: 1,
          padding: '8px 12px',
          borderRadius: '6px',
          background: '#1e293b',
          color: '#e2e8f0',
          border: '1px solid #475569',
          fontSize: '0.8rem',
        }}
      >
        <option value="">Link to patient record...</option>
        {patients.map(p => (
          <option key={p.id} value={p.id}>
            {p.last_name}, {p.first_name}
            {p.date_of_birth ? ` (DOB: ${p.date_of_birth})` : ''}
          </option>
        ))}
      </select>

      <button
        onClick={handleSave}
        disabled={!selectedId || saving}
        style={{
          padding: '8px 16px',
          borderRadius: '6px',
          background: selectedId ? '#0D9488' : '#334155',
          color: '#fff',
          border: 'none',
          fontSize: '0.8rem',
          fontWeight: 500,
          cursor: selectedId ? 'pointer' : 'not-allowed',
          opacity: saving ? 0.6 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {saving ? 'Saving...' : 'Save'}
      </button>

      {error && (
        <span style={{ color: '#DC2626', fontSize: '0.75rem' }}>{error}</span>
      )}
    </div>
  )
}
