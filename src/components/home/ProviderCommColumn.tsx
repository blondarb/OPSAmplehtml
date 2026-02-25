'use client'

import { useState } from 'react'

interface ProviderCommColumnProps {
  onOpenThread: (threadId: string) => void
  onCreateConsult: () => void
}

const DEMO_THREADS = [
  { id: 't1', subject: 'Linda Martinez - Fall risk', lastMessage: 'I reviewed the wearable data, her gait variability increased 30%...', sender: 'Dr. Kim', time: '10 min ago', unread: 2, patientLinked: true },
  { id: 't2', subject: 'EEG Lab Scheduling', lastMessage: 'We have an opening for the 72-hour monitoring next Tuesday.', sender: 'NP Rodriguez', time: '1 hr ago', unread: 0, patientLinked: false },
  { id: 't3', subject: 'James Wilson - Seizure meds', lastMessage: 'Levetiracetam levels came back low. Should we increase?', sender: 'PA Thompson', time: '2 hrs ago', unread: 1, patientLinked: true },
  { id: 't4', subject: 'Staff Meeting Notes', lastMessage: 'Reminder: new charting workflow goes live Monday.', sender: 'Admin', time: 'Yesterday', unread: 0, patientLinked: false },
]

const DEMO_CONSULTS = [
  { id: 'c1', type: 'EEG Review', requester: 'Dr. Patel', patient: 'Helen Park', status: 'pending', time: '1 hr ago' },
  { id: 'c2', type: 'Curbside', requester: 'NP Rodriguez', patient: 'David Thompson', status: 'answered', time: 'Yesterday' },
]

const PROVIDERS = [
  { id: 'p1', name: 'Dr. Patel' },
  { id: 'p2', name: 'Dr. Kim' },
  { id: 'p3', name: 'NP Rodriguez' },
  { id: 'p4', name: 'PA Thompson' },
]

const CONSULT_TYPES = ['Curbside', 'Formal', 'EEG Review', 'Imaging Review', 'Medication Review']
const URGENCY_OPTIONS = ['Routine', 'Soon', 'Urgent']

export default function ProviderCommColumn({ onOpenThread, onCreateConsult }: ProviderCommColumnProps) {
  const [hoveredThread, setHoveredThread] = useState<string | null>(null)
  const [selectedUrgency, setSelectedUrgency] = useState('Routine')
  const [consultQuestion, setConsultQuestion] = useState('')
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedConsultType, setSelectedConsultType] = useState('')

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-white)', minWidth: '260px', maxWidth: '340px', width: '300px',
    }}>
      {/* Team Chat Section */}
      <div style={{ borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Team Chat</span>
          <button style={{
            width: '24px', height: '24px', borderRadius: '6px', border: '1px solid var(--border)',
            background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: '16px',
          }}>+</button>
        </div>

        <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '0 8px 8px' }}>
          {DEMO_THREADS.map(thread => (
            <button
              key={thread.id}
              onClick={() => onOpenThread(thread.id)}
              onMouseEnter={() => setHoveredThread(thread.id)}
              onMouseLeave={() => setHoveredThread(null)}
              style={{
                width: '100%', textAlign: 'left', border: 'none', padding: '8px 10px',
                borderRadius: '8px', marginBottom: '2px',
                background: hoveredThread === thread.id ? 'var(--bg-gray)' : 'transparent',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {thread.subject}
                </span>
                {thread.patientLinked && (
                  <span style={{ fontSize: '9px', fontWeight: 600, padding: '1px 4px', borderRadius: '3px', background: '#CCFBF1', color: '#0D9488' }}>PT</span>
                )}
                {thread.unread > 0 && (
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '10px', background: '#3B82F6', color: 'white', minWidth: '18px', textAlign: 'center' }}>
                    {thread.unread}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {thread.sender}: {thread.lastMessage}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>{thread.time}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Quick Consult Section */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Quick Consult</span>

        {/* Provider picker */}
        <select
          value={selectedProvider}
          onChange={e => setSelectedProvider(e.target.value)}
          style={{
            padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)',
            fontSize: '12px', color: selectedProvider ? 'var(--text-primary)' : 'var(--text-muted)',
            background: 'var(--bg-white)', outline: 'none',
          }}
        >
          <option value="">Select provider...</option>
          {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {/* Consult type */}
        <select
          value={selectedConsultType}
          onChange={e => setSelectedConsultType(e.target.value)}
          style={{
            padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)',
            fontSize: '12px', color: selectedConsultType ? 'var(--text-primary)' : 'var(--text-muted)',
            background: 'var(--bg-white)', outline: 'none',
          }}
        >
          <option value="">Consult type...</option>
          {CONSULT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Urgency pills */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {URGENCY_OPTIONS.map(u => {
            const isActive = selectedUrgency === u
            const urgColor = u === 'Urgent' ? '#EF4444' : u === 'Soon' ? '#F59E0B' : '#6B7280'
            return (
              <button
                key={u}
                onClick={() => setSelectedUrgency(u)}
                style={{
                  flex: 1, padding: '5px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                  border: `1px solid ${isActive ? urgColor : 'var(--border)'}`,
                  background: isActive ? `${urgColor}15` : 'transparent',
                  color: isActive ? urgColor : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                {u}
              </button>
            )
          })}
        </div>

        {/* Question */}
        <textarea
          value={consultQuestion}
          onChange={e => setConsultQuestion(e.target.value)}
          placeholder="Describe your question..."
          style={{
            padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)',
            fontSize: '12px', minHeight: '60px', resize: 'vertical',
            outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)',
          }}
        />

        {/* Send button */}
        <button
          onClick={onCreateConsult}
          style={{
            padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
            background: '#0D9488', color: 'white', border: 'none',
            cursor: 'pointer', transition: 'opacity 0.2s',
            opacity: (selectedProvider && selectedConsultType && consultQuestion) ? 1 : 0.5,
          }}
        >
          Send Consult
        </button>

        {/* Recent consults */}
        <div style={{ marginTop: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent Consults</span>
          {DEMO_CONSULTS.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.type}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.requester} &middot; {c.patient}</div>
              </div>
              <span style={{
                fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
                background: c.status === 'pending' ? '#FEF3C7' : '#D1FAE5',
                color: c.status === 'pending' ? '#92400E' : '#065F46',
              }}>
                {c.status === 'pending' ? 'Pending' : 'Answered'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
