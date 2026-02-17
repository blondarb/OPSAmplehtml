'use client'

import { useState } from 'react'

interface IntakeForm {
  id: string
  patient_name: string
  date_of_birth?: string
  email?: string
  phone?: string
  chief_complaint?: string
  current_medications?: string
  allergies?: string
  medical_history?: string
  family_history?: string
  notes?: string
  status: string
  imported_to_note?: boolean
  created_at: string
}

interface IntakeFormPanelProps {
  forms: IntakeForm[]
  onImport?: (form: IntakeForm) => void
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function IntakeFormPanel({ forms, onImport }: IntakeFormPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!forms || forms.length === 0) return null

  const unreviewed = forms.filter(f => f.status === 'submitted')

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Section header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '8px',
        padding: '0 4px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary, #1e293b)' }}>
            Patient Intake Forms
          </span>
          {unreviewed.length > 0 && (
            <span style={{
              background: '#8B5CF6',
              color: '#fff',
              fontSize: '0.65rem',
              fontWeight: 700,
              borderRadius: '8px',
              padding: '1px 6px',
              minWidth: '16px',
              textAlign: 'center',
            }}>
              {unreviewed.length}
            </span>
          )}
        </div>
      </div>

      {/* Form cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {forms.slice(0, 5).map((form) => {
          const isExpanded = expandedId === form.id

          return (
            <div
              key={form.id}
              style={{
                background: 'var(--bg-secondary, #f8fafc)',
                borderRadius: '8px',
                border: '1px solid var(--border, #e2e8f0)',
                overflow: 'hidden',
              }}
            >
              {/* Card header - clickable */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : form.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '10px 12px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary, #1e293b)' }}>
                    {form.patient_name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)', marginTop: '2px' }}>
                    {formatTime(form.created_at)}
                    {form.chief_complaint && (
                      <span> — {form.chief_complaint.slice(0, 40)}{form.chief_complaint.length > 40 ? '...' : ''}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {form.imported_to_note && (
                    <span style={{ fontSize: '10px', color: '#22c55e' }}>✓ Imported</span>
                  )}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-secondary, #64748b)"
                    strokeWidth="2"
                    style={{
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div style={{
                  padding: '0 12px 12px',
                  fontSize: '12px',
                  color: 'var(--text-secondary, #64748b)',
                  lineHeight: '1.6',
                }}>
                  {form.date_of_birth && (
                    <div><strong>DOB:</strong> {form.date_of_birth}</div>
                  )}
                  {form.email && (
                    <div><strong>Email:</strong> {form.email}</div>
                  )}
                  {form.phone && (
                    <div><strong>Phone:</strong> {form.phone}</div>
                  )}
                  {form.chief_complaint && (
                    <div style={{ marginTop: '6px' }}><strong>Chief Complaint:</strong> {form.chief_complaint}</div>
                  )}
                  {form.current_medications && (
                    <div><strong>Medications:</strong> {form.current_medications}</div>
                  )}
                  {form.allergies && (
                    <div><strong>Allergies:</strong> {form.allergies}</div>
                  )}
                  {form.medical_history && (
                    <div><strong>Medical History:</strong> {form.medical_history}</div>
                  )}
                  {form.family_history && (
                    <div><strong>Family History:</strong> {form.family_history}</div>
                  )}
                  {form.notes && (
                    <div><strong>Notes:</strong> {form.notes}</div>
                  )}

                  {/* Import button */}
                  {onImport && !form.imported_to_note && (
                    <button
                      onClick={() => onImport(form)}
                      style={{
                        marginTop: '10px',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        background: '#8B5CF6',
                        color: '#fff',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Import to Note
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
