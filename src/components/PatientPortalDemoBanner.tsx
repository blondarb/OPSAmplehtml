'use client'

import { useState } from 'react'
import { DEMO_SCENARIOS } from '@/lib/historianTypes'

export default function PatientPortalDemoBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return !!sessionStorage.getItem('sevaro-patient-portal-demo-banner-dismissed')
    } catch {
      return false
    }
  })

  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  if (dismissed) return null

  const dismiss = () => {
    try {
      sessionStorage.setItem('sevaro-patient-portal-demo-banner-dismissed', 'true')
    } catch {}
    setDismissed(true)
  }

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  return (
    <div style={{
      background: 'rgba(139, 92, 246, 0.1)',
      border: '1px solid rgba(139, 92, 246, 0.3)',
      borderRadius: '12px',
      padding: '16px 20px',
      marginBottom: '24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span style={{ fontWeight: 600, fontSize: '14px', color: '#8B5CF6' }}>
            Welcome to the Sevaro Clinical Demo
          </span>
        </div>
        <button onClick={dismiss} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#8B5CF6', padding: '4px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Section 1: Patient Personas */}
      <div style={{ marginBottom: '8px' }}>
        <button
          onClick={() => toggleSection('personas')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '10px 12px',
            background: 'rgba(139, 92, 246, 0.1)',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '13px', color: '#ddd6fe' }}>
            🩺 Demo Patient Personas
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ddd6fe"
            strokeWidth="2"
            style={{ transform: expandedSection === 'personas' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {expandedSection === 'personas' && (
          <div style={{ padding: '12px', fontSize: '12px', color: '#cbd5e1', lineHeight: '1.6' }}>
            {DEMO_SCENARIOS.map((scenario, i) => (
              <div key={i} style={{ marginBottom: i < DEMO_SCENARIOS.length - 1 ? '10px' : 0 }}>
                <strong style={{ color: '#ddd6fe' }}>{scenario.patient_name}</strong> - {scenario.referral_reason}
                <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                  {scenario.session_type === 'new_patient' ? '🆕 New Patient' : '🔄 Follow-Up'} | {scenario.description}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Features */}
      <div style={{ marginBottom: '8px' }}>
        <button
          onClick={() => toggleSection('features')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '10px 12px',
            background: 'rgba(139, 92, 246, 0.1)',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '13px', color: '#ddd6fe' }}>
            ✨ Portal Features
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ddd6fe"
            strokeWidth="2"
            style={{ transform: expandedSection === 'features' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {expandedSection === 'features' && (
          <div style={{ padding: '12px', fontSize: '12px', color: '#cbd5e1', lineHeight: '1.8' }}>
            <div>📋 <strong>Intake Form:</strong> Complete medical history questionnaire</div>
            <div>💬 <strong>Messages:</strong> Secure communication with your provider</div>
            <div>🎤 <strong>AI Historian:</strong> Voice-based clinical interview (try it!)</div>
          </div>
        )}
      </div>

      {/* Section 3: How to Use AI Historian */}
      <div>
        <button
          onClick={() => toggleSection('howto')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '10px 12px',
            background: 'rgba(139, 92, 246, 0.1)',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '13px', color: '#ddd6fe' }}>
            🎯 How to Use the AI Historian
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ddd6fe"
            strokeWidth="2"
            style={{ transform: expandedSection === 'howto' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {expandedSection === 'howto' && (
          <div style={{ padding: '12px', fontSize: '12px', color: '#cbd5e1', lineHeight: '1.8' }}>
            <div>1️⃣ Click the "AI Historian" tab and select a demo patient</div>
            <div>2️⃣ Allow microphone access when prompted</div>
            <div>3️⃣ Speak naturally - the AI will ask follow-up questions</div>
            <div>4️⃣ Answer one question at a time, as if speaking to a doctor</div>
            <div>5️⃣ Review the structured clinical summary when complete</div>
          </div>
        )}
      </div>
    </div>
  )
}
