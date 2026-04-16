'use client'

import { SAMPLE_PERSONAS, type SamplePersona } from '@/lib/consult/samplePersonas'

interface SamplePatientSelectorProps {
  selectedId: string | null
  onSelect: (persona: SamplePersona) => void
  disabled?: boolean
}

export default function SamplePatientSelector({
  selectedId,
  onSelect,
  disabled,
}: SamplePatientSelectorProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <span
          style={{
            color: '#CBD5E1',
            fontSize: 13,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Sample Patients
        </span>
        <span style={{ color: '#64748B', fontSize: 12 }}>
          Pick one to pre-fill a realistic referral, or write your own below.
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
        }}
      >
        {SAMPLE_PERSONAS.map((p) => {
          const isSelected = p.id === selectedId
          return (
            <button
              key={p.id}
              onClick={() => !disabled && onSelect(p)}
              disabled={disabled}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 10,
                border: isSelected
                  ? `1px solid ${p.accentColor}`
                  : '1px solid #334155',
                background: isSelected ? p.accentBg : '#0F172A',
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
                position: 'relative',
                outline: 'none',
                boxShadow: isSelected
                  ? `0 0 0 3px ${p.accentBg}`
                  : 'none',
                opacity: disabled ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSelected && !disabled) {
                  e.currentTarget.style.borderColor = '#475569'
                  e.currentTarget.style.background = '#162033'
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected && !disabled) {
                  e.currentTarget.style.borderColor = '#334155'
                  e.currentTarget.style.background = '#0F172A'
                }
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: p.accentColor,
                  }}
                />
                <span
                  style={{
                    color: p.accentColor,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {p.subspecialty}
                </span>
              </div>
              <div
                style={{
                  color: '#E2E8F0',
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 2,
                }}
              >
                {p.name}
                <span style={{ color: '#94A3B8', fontWeight: 400, marginLeft: 6 }}>
                  {p.age}
                  {p.sex}
                </span>
              </div>
              <div style={{ color: '#94A3B8', fontSize: 12, lineHeight: 1.4 }}>
                {p.headline}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
