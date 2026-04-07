'use client'

import { useState } from 'react'
import type { NeurologyConsult } from '@/lib/consult/types'
import type { HistorianStructuredOutput } from '@/lib/historianTypes'

interface IntakeReviewSectionProps {
  consult: NeurologyConsult | null
}

/** Sections to display from the historian structured output */
const SECTIONS: Array<{ key: keyof HistorianStructuredOutput; label: string }> = [
  { key: 'chief_complaint', label: 'Chief Complaint' },
  { key: 'hpi', label: 'History of Present Illness' },
  { key: 'onset', label: 'Onset' },
  { key: 'location', label: 'Location' },
  { key: 'duration', label: 'Duration' },
  { key: 'character', label: 'Character' },
  { key: 'severity', label: 'Severity' },
  { key: 'aggravating_factors', label: 'Aggravating Factors' },
  { key: 'relieving_factors', label: 'Relieving Factors' },
  { key: 'timing', label: 'Timing' },
  { key: 'associated_symptoms', label: 'Associated Symptoms' },
  { key: 'current_medications', label: 'Current Medications' },
  { key: 'allergies', label: 'Allergies' },
  { key: 'past_medical_history', label: 'Past Medical History' },
  { key: 'past_surgical_history', label: 'Past Surgical History' },
  { key: 'family_history', label: 'Family History' },
  { key: 'social_history', label: 'Social History' },
  { key: 'review_of_systems', label: 'Review of Systems' },
  { key: 'functional_status', label: 'Functional Status' },
  // Follow-up fields
  { key: 'interval_changes', label: 'Interval Changes' },
  { key: 'treatment_response', label: 'Treatment Response' },
  { key: 'new_symptoms', label: 'New Symptoms' },
  { key: 'medication_changes', label: 'Medication Changes' },
  { key: 'side_effects', label: 'Side Effects' },
]

export default function IntakeReviewSection({ consult }: IntakeReviewSectionProps) {
  const [corrections, setCorrections] = useState<Record<string, string>>({})
  const [expandedCorrection, setExpandedCorrection] = useState<string | null>(null)

  const structured = consult?.historian_structured_output as HistorianStructuredOutput | null | undefined

  if (!structured) {
    return (
      <div style={{
        background: '#0F172A', border: '1px solid #334155', borderRadius: 8,
        padding: 20, textAlign: 'center',
      }}>
        <p style={{ color: '#64748B', fontSize: 13, margin: 0 }}>
          No interview data available. Complete the AI Historian interview to see your intake summary here.
        </p>
      </div>
    )
  }

  // Filter to only sections that have content
  const populatedSections = SECTIONS.filter(s => {
    const val = structured[s.key]
    return val && typeof val === 'string' && val.trim().length > 0
  })

  // Group OLDCARTS fields for HPI display
  const hpiFields: Array<keyof HistorianStructuredOutput> = [
    'onset', 'location', 'duration', 'character', 'severity',
    'aggravating_factors', 'relieving_factors', 'timing', 'associated_symptoms',
  ]
  const mainSections = populatedSections.filter(s => !hpiFields.includes(s.key))
  const hpiSubfields = populatedSections.filter(s => hpiFields.includes(s.key))

  // If we have a full HPI field, show it. Otherwise compose from OLDCARTS subfields.
  const hasFullHpi = structured.hpi && structured.hpi.trim().length > 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <h4 style={{ color: '#E2E8F0', fontSize: 14, fontWeight: 700, margin: 0 }}>
          Review Your History
        </h4>
        <span style={{ color: '#64748B', fontSize: 11, marginLeft: 'auto' }}>
          From AI interview — please review for accuracy
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Chief Complaint */}
        {structured.chief_complaint && (
          <SectionCard
            label="Chief Complaint"
            content={structured.chief_complaint}
            sectionKey="chief_complaint"
            correction={corrections.chief_complaint}
            isExpanded={expandedCorrection === 'chief_complaint'}
            onToggleCorrection={() => setExpandedCorrection(expandedCorrection === 'chief_complaint' ? null : 'chief_complaint')}
            onCorrectionChange={(val) => setCorrections(prev => ({ ...prev, chief_complaint: val }))}
          />
        )}

        {/* HPI — full or composed from OLDCARTS */}
        {hasFullHpi ? (
          <SectionCard
            label="History of Present Illness"
            content={structured.hpi!}
            sectionKey="hpi"
            correction={corrections.hpi}
            isExpanded={expandedCorrection === 'hpi'}
            onToggleCorrection={() => setExpandedCorrection(expandedCorrection === 'hpi' ? null : 'hpi')}
            onCorrectionChange={(val) => setCorrections(prev => ({ ...prev, hpi: val }))}
          />
        ) : hpiSubfields.length > 0 && (
          <div style={{
            background: '#0F172A', border: '1px solid #334155', borderRadius: 8, padding: 14,
          }}>
            <span style={{ color: '#64748B', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              History of Present Illness (OLDCARTS)
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {hpiSubfields.map(s => (
                <div key={s.key}>
                  <span style={{ color: '#94A3B8', fontSize: 12, fontWeight: 600 }}>{s.label}: </span>
                  <span style={{ color: '#CBD5E1', fontSize: 13 }}>{structured[s.key] as string}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Remaining sections (skip chief_complaint, hpi, and OLDCARTS subfields — already shown) */}
        {mainSections
          .filter(s => s.key !== 'chief_complaint' && s.key !== 'hpi')
          .map(s => (
            <SectionCard
              key={s.key}
              label={s.label}
              content={structured[s.key] as string}
              sectionKey={s.key}
              correction={corrections[s.key]}
              isExpanded={expandedCorrection === s.key}
              onToggleCorrection={() => setExpandedCorrection(expandedCorrection === s.key ? null : s.key)}
              onCorrectionChange={(val) => setCorrections(prev => ({ ...prev, [s.key]: val }))}
            />
          ))}
      </div>
    </div>
  )
}

// ── Section Card ──

interface SectionCardProps {
  label: string
  content: string
  sectionKey: string
  correction?: string
  isExpanded: boolean
  onToggleCorrection: () => void
  onCorrectionChange: (val: string) => void
}

function SectionCard({ label, content, sectionKey, correction, isExpanded, onToggleCorrection, onCorrectionChange }: SectionCardProps) {
  return (
    <div style={{ background: '#0F172A', border: '1px solid #334155', borderRadius: 8, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#64748B', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        <button
          onClick={onToggleCorrection}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: isExpanded ? '#0D9488' : '#475569', fontSize: 11, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          {isExpanded ? 'Cancel' : 'Add Note'}
        </button>
      </div>
      <p style={{ color: '#CBD5E1', fontSize: 13, margin: '6px 0 0', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
        {content}
      </p>
      {isExpanded && (
        <div style={{ marginTop: 8 }}>
          <textarea
            value={correction || ''}
            onChange={e => onCorrectionChange(e.target.value)}
            placeholder="Add a correction or note…"
            style={{
              width: '100%', minHeight: 60, padding: 10, borderRadius: 6,
              border: '1px solid #334155', background: '#1E293B',
              color: '#E2E8F0', fontSize: 13, resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>
      )}
    </div>
  )
}
