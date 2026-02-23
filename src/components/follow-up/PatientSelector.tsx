'use client'

import { useState } from 'react'
import type { PatientScenario } from '@/lib/follow-up/types'
import { DEMO_SCENARIOS } from '@/lib/follow-up/demoScenarios'

interface PatientSelectorProps {
  onSelect: (scenario: PatientScenario) => void
  disabled: boolean
}

export default function PatientSelector({ onSelect, disabled }: PatientSelectorProps) {
  const [selectedId, setSelectedId] = useState<string>('')

  const selectedScenario = DEMO_SCENARIOS.find(s => s.id === selectedId) || null

  return (
    <div>
      {/* Section header */}
      <h3 style={{
        color: 'white',
        fontSize: '15px',
        fontWeight: 600,
        marginBottom: '12px',
        marginTop: 0,
      }}>
        Select Patient
      </h3>

      {/* Dropdown */}
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: '8px',
          background: '#334155',
          border: '1px solid #475569',
          color: selectedId ? 'white' : '#94a3b8',
          fontSize: '14px',
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          paddingRight: '36px',
        }}
      >
        <option value="" disabled>Choose a patient...</option>
        {DEMO_SCENARIOS.map((scenario) => (
          <option key={scenario.id} value={scenario.id}>
            {scenario.name}
          </option>
        ))}
      </select>

      {/* Context card */}
      {selectedScenario && (
        <div style={{
          marginTop: '16px',
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '16px',
        }}>
          {/* Patient name + demographics */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '12px',
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'rgba(22,163,74,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <div style={{ color: 'white', fontWeight: 600, fontSize: '14px' }}>
                {selectedScenario.name}
              </div>
              <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                {selectedScenario.age} y/o {selectedScenario.gender === 'F' ? 'Female' : 'Male'}
              </div>
            </div>
          </div>

          {/* Diagnosis */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Diagnosis
            </div>
            <div style={{ color: '#e2e8f0', fontSize: '13px' }}>
              {selectedScenario.diagnosis}
            </div>
          </div>

          {/* Provider */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Provider
            </div>
            <div style={{ color: '#e2e8f0', fontSize: '13px' }}>
              Dr. {selectedScenario.providerName}
            </div>
          </div>

          {/* Medications */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
              Medications
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {selectedScenario.medications.map((med, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: med.isNew ? '#22C55E' : '#64748b',
                    flexShrink: 0,
                  }} />
                  <span style={{ color: '#e2e8f0', fontSize: '13px' }}>
                    {med.name} — {med.dose}
                  </span>
                  {med.isNew && (
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: '#22C55E',
                      background: 'rgba(22,163,74,0.15)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                    }}>
                      NEW
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Visit Summary */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Visit Summary
            </div>
            <div style={{ color: '#94a3b8', fontSize: '13px', lineHeight: '1.5' }}>
              {selectedScenario.visitSummary}
            </div>
          </div>

          {/* Role-play suggestions */}
          {selectedScenario.scenarioHint && (
            <div style={{
              background: 'rgba(13, 148, 136, 0.08)',
              border: '1px solid rgba(13, 148, 136, 0.25)',
              borderRadius: '8px',
              padding: '10px 12px',
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-start',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <div style={{ color: '#0D9488', fontSize: '12px', lineHeight: '1.5' }}>
                <span style={{ fontWeight: 600 }}>Role-play ideas: </span>{selectedScenario.scenarioHint}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Initiate Follow-Up button */}
      <button
        onClick={() => selectedScenario && onSelect(selectedScenario)}
        disabled={!selectedScenario || disabled}
        style={{
          width: '100%',
          marginTop: '16px',
          padding: '12px',
          borderRadius: '8px',
          background: (!selectedScenario || disabled) ? '#334155' : '#16A34A',
          color: (!selectedScenario || disabled) ? '#64748b' : 'white',
          border: 'none',
          fontSize: '14px',
          fontWeight: 600,
          cursor: (!selectedScenario || disabled) ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s ease',
        }}
      >
        Initiate Follow-Up
      </button>
    </div>
  )
}
