'use client'

import { useState, useEffect } from 'react'

interface LeftSidebarProps {
  patient: any
  priorVisits: any[]
  scoreHistory: any[]
}

// Default summary options
const DEFAULT_SUMMARY_OPTIONS = {
  includeVisits: true,
  includeImaging: true,
  includeMedications: true,
  includeScores: true,
  includeDiagnoses: true,
}

// Sample full clinical notes for demo
const SAMPLE_FULL_NOTES: Record<string, { hpi: string; ros: string; exam: string; assessment: string; plan: string }> = {
  '1': {
    hpi: `42-year-old female presents for follow-up of chronic migraine. Patient reports significant improvement since starting topiramate 100mg daily. Headache frequency has decreased from 15 days/month to 8 days/month. Headaches are now moderate in intensity (5-6/10) compared to severe (8-9/10) previously. Patient no longer requires rescue medication more than twice weekly. No aura symptoms. Denies photophobia or phonophobia during current headaches. Sleep has improved, now getting 7-8 hours nightly. Stress levels at work have decreased. No recent ER visits for headache.`,
    ros: `Constitutional: Denies fatigue, fever, weight changes
Neurological: (+) intermittent headaches as above, (-) vision changes, (-) weakness, (-) numbness
Psychiatric: Improved mood, less anxiety, sleeping well
GI: Mild decreased appetite noted since starting topiramate (expected), no nausea/vomiting
All other systems reviewed and negative`,
    exam: `Vitals: BP 118/72, HR 68, BMI 24.2
General: Well-appearing, no acute distress
HEENT: PERRL, EOMI, no papilledema on fundoscopic exam
Neck: Supple, no meningismus, no carotid bruits
Neuro: CN II-XII intact. Motor 5/5 throughout. Sensory intact to light touch. DTRs 2+ symmetric. Gait normal. Romberg negative.
Mental Status: Alert, oriented x4, appropriate affect`,
    assessment: `1. Chronic migraine without aura (G43.709) - improving on topiramate
2. History of medication overuse headache - resolved`,
    plan: `1. Continue topiramate 100mg daily - patient tolerating well
2. Continue headache diary - bring to next visit
3. Maintain sleep hygiene and stress management
4. PRN sumatriptan 50mg for breakthrough (limit to 2x/week)
5. Return in 3 months for follow-up
6. MIDAS score today: 24 (improved from 42)`
  },
  '2': {
    hpi: `42-year-old female presents for medication adjustment. Patient has been on propranolol 40mg BID for 6 weeks with suboptimal response. Headache frequency remains at 12-15 days/month with moderate-severe intensity. Patient reports fatigue and some dizziness on propranolol. MRI brain completed last week was unremarkable. Labs including TSH, CBC, CMP all within normal limits. Patient interested in trying alternative preventive medication. Denies any new neurological symptoms. Headaches continue to be bilateral, pressure-like, worse with stress and poor sleep.`,
    ros: `Constitutional: (+) fatigue (likely medication related), (-) fever, (-) weight changes
Neurological: (+) frequent headaches as above, (-) vision changes, (-) weakness
Cardiovascular: (+) mild dizziness with standing (orthostatic from propranolol)
Psychiatric: Mild anxiety, mood stable
All other systems reviewed and negative`,
    exam: `Vitals: BP 108/68 (lower than baseline), HR 58, BMI 24.0
General: Mildly fatigued appearing, no acute distress
HEENT: PERRL, EOMI, fundi normal
Neck: Supple, no tenderness
Neuro: Cranial nerves intact. Motor strength 5/5. Sensation intact. Reflexes 2+ symmetric. Coordination normal.
Mental Status: Alert, oriented, appropriate`,
    assessment: `1. Chronic migraine without aura (G43.709) - inadequate response to propranolol
2. Propranolol side effects - fatigue, orthostatic symptoms`,
    plan: `1. Discontinue propranolol - taper over 1 week
2. Start topiramate 25mg at bedtime
3. Titrate topiramate: 25mg x 2 weeks, then 50mg x 2 weeks, target 100mg daily
4. Counsel on topiramate side effects: paresthesias, cognitive slowing, weight loss, kidney stones
5. Maintain adequate hydration (topiramate kidney stone prevention)
6. Continue acute treatment with sumatriptan PRN
7. Follow up in 6 weeks to assess response
8. Discussed lifestyle modifications: regular sleep schedule, stress management, avoiding triggers`
  },
  '3': {
    hpi: `42-year-old female new patient referral from PCP for evaluation of headaches and memory concerns. Headaches began approximately 3 months ago, occurring daily, bilateral frontal/temporal location, pressure-like quality, moderate intensity (6-7/10). Associated with light sensitivity during severe episodes. No nausea or vomiting. Headaches worse with stress and at end of workday. Has been taking ibuprofen 400mg daily for the past 2 months with minimal relief. Patient also reports subjective memory difficulties - forgetting names, misplacing items, word-finding difficulties. No confusion episodes. Work performance unchanged. Sleep disrupted due to headaches, averaging 5-6 hours nightly. High stress job as project manager. Family history positive for migraines (mother). No prior neurological history.`,
    ros: `Constitutional: (+) fatigue, (-) fever, (-) weight changes
Neurological: (+) daily headaches, (+) subjective memory concerns, (-) vision changes, (-) weakness, (-) numbness, (-) gait problems
Psychiatric: (+) stress, (+) anxiety related to symptoms, (-) depression
Sleep: (+) insomnia/poor sleep quality
All other systems reviewed and negative`,
    exam: `Vitals: BP 128/82, HR 76, BMI 24.5
General: Anxious appearing but pleasant, no acute distress
HEENT: PERRL, EOMI, fundi without papilledema
Neck: Supple, mild bilateral trapezius tenderness
Neuro:
- Mental Status: Alert, oriented x4. MoCA 26/30 (lost points on delayed recall 3/5, abstraction 1/2). Language fluent.
- CN II-XII intact
- Motor 5/5 all extremities
- Sensory intact to light touch and pinprick
- Reflexes 2+ and symmetric
- Coordination: FNF and HKS normal
- Gait: Normal, tandem intact`,
    assessment: `1. New daily persistent headache vs chronic migraine - medication overuse likely contributing
2. Subjective cognitive complaints - likely secondary to headache, poor sleep, and stress. MoCA 26/30 normal range.
3. Possible medication overuse headache from daily ibuprofen use`,
    plan: `1. Order MRI brain with and without contrast - rule out structural cause
2. Order labs: CBC, CMP, TSH, ESR, CRP
3. Start propranolol 40mg BID for migraine prevention
4. STOP daily ibuprofen - counsel on medication overuse headache
5. Allow sumatriptan 50mg PRN for severe headaches (max 2x/week)
6. Sleep hygiene counseling - target 7-8 hours
7. Start headache diary
8. Reassure regarding cognitive complaints - likely will improve with headache control and better sleep
9. Return in 6 weeks with MRI results
10. If cognitive concerns persist after headache controlled, consider formal neuropsychological testing`
  }
}

export default function LeftSidebar({ patient, priorVisits, scoreHistory }: LeftSidebarProps) {
  const [expandedVisit, setExpandedVisit] = useState<string | null>(priorVisits[0]?.id || null)
  const [aiSummaryEnabled, setAiSummaryEnabled] = useState(true)
  const [scoreHistoryOpen, setScoreHistoryOpen] = useState(true)
  const [priorVisitsOpen, setPriorVisitsOpen] = useState(true)
  const [localTime, setLocalTime] = useState<string>('--:--')
  const [viewingNoteId, setViewingNoteId] = useState<string | null>(null)

  // Prior History Summary state
  const [showHistorySummary, setShowHistorySummary] = useState(false)
  const [summaryOptions, setSummaryOptions] = useState(DEFAULT_SUMMARY_OPTIONS)
  const [showSummarySettings, setShowSummarySettings] = useState(false)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [generatedSummary, setGeneratedSummary] = useState<string | null>(null)

  // Update local time every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const timeString = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      })
      setLocalTime(timeString)
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // Generate prior history summary
  const generateHistorySummary = () => {
    setIsGeneratingSummary(true)

    // Simulate AI generation delay
    setTimeout(() => {
      const summaryParts: string[] = []

      if (summaryOptions.includeVisits) {
        summaryParts.push(`**Prior Visits (${priorVisits.length || 3}):**
- Patient established care Nov 2025 with chronic migraine and cognitive concerns
- Initial workup included MRI brain (normal), labs (unremarkable)
- Progressive treatment adjustments from propranolol to topiramate with good response`)
      }

      if (summaryOptions.includeMedications) {
        summaryParts.push(`**Medications Previously Tried:**
- Propranolol 40mg BID - discontinued due to inadequate response
- OTC analgesics - limited benefit, risk of MOH discussed
- Topiramate 100mg daily - current, good response`)
      }

      if (summaryOptions.includeImaging) {
        summaryParts.push(`**Relevant Imaging:**
- MRI Brain w/wo contrast (Dec 2025): No acute intracranial pathology, no white matter lesions
- MRA Head (Dec 2025): Normal cerebral vasculature`)
      }

      if (summaryOptions.includeScores) {
        summaryParts.push(`**Clinical Score Trends:**
- MIDAS: 56 → 42 → 24 → 18 (improving, now moderate disability)
- HIT-6: 62 → 60 → 58 (stable, substantial impact)
- PHQ-9: 11 → 6 (improved, now mild)`)
      }

      if (summaryOptions.includeDiagnoses) {
        summaryParts.push(`**Active Diagnoses:**
- Chronic migraine without aura (G43.709)
- Medication overuse headache, resolved (G44.40)`)
      }

      setGeneratedSummary(summaryParts.join('\n\n'))
      setIsGeneratingSummary(false)
    }, 1500)
  }

  const toggleSummaryOption = (key: keyof typeof DEFAULT_SUMMARY_OPTIONS) => {
    setSummaryOptions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <>
    <style>{`
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `}</style>
    <aside style={{
      width: '260px',
      background: 'var(--bg-white)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
    }}>
      {/* Hospital/Location Section with Local Time */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'var(--bg-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Marshall</h3>
            <p style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
              {localTime}
            </p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ cursor: 'pointer' }}>
            <path d="M7 17l9.2-9.2M17 17V7H7"/>
          </svg>
        </div>
      </div>

      {/* Patient Card */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'var(--bg-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {patient?.first_name || 'Test'} {patient?.last_name || 'Test'}
              </h3>
              <button style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: 'var(--text-muted)',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {patient ? `${new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear()}, ${patient.gender === 'M' ? 'M' : 'F'}` : '50, M'} #{patient?.mrn || '123123'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            border: 'none',
            background: 'var(--primary)',
            color: 'white',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
            Video
          </button>
          <button style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 12px',
            borderRadius: '8px',
            cursor: 'pointer',
            border: 'none',
            background: 'var(--primary-light)',
            color: 'white',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Quick Links */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
        <a href="#" style={{ color: 'var(--primary)', textDecoration: 'none' }}>PACS viewer</a>
        <span style={{ color: 'var(--text-muted)' }}> | </span>
        <a href="#" style={{ color: 'var(--primary)', textDecoration: 'none' }}>VizAI</a>
        <span style={{ color: 'var(--text-muted)' }}> | </span>
        <a href="#" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Epic</a>
      </div>

      {/* Prior History Summary Tool */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: showHistorySummary ? '12px' : 0,
        }}>
          <button
            onClick={() => setShowHistorySummary(!showHistorySummary)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="2"
              style={{
                transform: showHistorySummary ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.2s',
              }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            <h4 style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B">
                <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
              </svg>
              Prior History Summary
            </h4>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowSummarySettings(!showSummarySettings); }}
            title="Customize summary"
            style={{
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              border: 'none',
              background: showSummarySettings ? 'var(--bg-gray)' : 'transparent',
              cursor: 'pointer',
              color: 'var(--text-muted)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
        </div>

        {/* Summary Settings Panel */}
        {showSummarySettings && (
          <div style={{
            background: 'var(--bg-gray)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '12px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase' }}>
              Include in Summary
            </div>
            {[
              { key: 'includeVisits' as const, label: 'Visit History' },
              { key: 'includeMedications' as const, label: 'Medications Tried' },
              { key: 'includeImaging' as const, label: 'Imaging Results' },
              { key: 'includeScores' as const, label: 'Clinical Scores' },
              { key: 'includeDiagnoses' as const, label: 'Diagnoses' },
            ].map((option) => (
              <label
                key={option.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 0',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={summaryOptions[option.key]}
                  onChange={() => toggleSummaryOption(option.key)}
                  style={{ width: '14px', height: '14px', accentColor: 'var(--primary)' }}
                />
                {option.label}
              </label>
            ))}
          </div>
        )}

        {showHistorySummary && (
          <div>
            {/* Generate Button */}
            {!generatedSummary && !isGeneratingSummary && (
              <button
                onClick={generateHistorySummary}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
                </svg>
                Generate Prior History Summary
              </button>
            )}

            {/* Loading State */}
            {isGeneratingSummary && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '20px',
                background: 'var(--bg-gray)',
                borderRadius: '8px',
              }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid var(--border)',
                  borderTopColor: '#F59E0B',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Generating summary...
                </span>
              </div>
            )}

            {/* Generated Summary */}
            {generatedSummary && (
              <div style={{
                background: 'var(--ai-summary-bg, linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%))',
                border: '1px solid var(--ai-summary-border, #FCD34D)',
                borderRadius: '8px',
                padding: '14px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 600,
                    fontSize: '12px',
                    color: 'var(--ai-summary-header, #B45309)',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B">
                      <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
                    </svg>
                    AI-Generated Summary
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => navigator.clipboard.writeText(generatedSummary.replace(/\*\*/g, ''))}
                      title="Copy to clipboard"
                      style={{
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        border: 'none',
                        background: 'var(--ai-summary-btn-bg, rgba(180, 83, 9, 0.1))',
                        cursor: 'pointer',
                        color: 'var(--ai-summary-btn-color, #B45309)',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => { setGeneratedSummary(null); generateHistorySummary(); }}
                      title="Regenerate"
                      style={{
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        border: 'none',
                        background: 'var(--ai-summary-btn-bg, rgba(180, 83, 9, 0.1))',
                        cursor: 'pointer',
                        color: 'var(--ai-summary-btn-color, #B45309)',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}>
                  {generatedSummary.split('\n').map((line, i) => {
                    // Handle bold text marked with **
                    if (line.startsWith('**') && line.endsWith('**')) {
                      return (
                        <div key={i} style={{ fontWeight: 600, color: 'var(--ai-summary-section-header, #92400E)', marginTop: i > 0 ? '12px' : 0, marginBottom: '4px' }}>
                          {line.replace(/\*\*/g, '')}
                        </div>
                      )
                    }
                    return <div key={i}>{line}</div>
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Prior Visits Section */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: priorVisitsOpen ? '12px' : 0,
        }}>
          <button
            onClick={() => setPriorVisitsOpen(!priorVisitsOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="2"
              style={{
                transform: priorVisitsOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.2s',
              }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Prior Visits</h4>
          </button>
          {priorVisitsOpen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>AI Summary</span>
              <button
                onClick={() => setAiSummaryEnabled(!aiSummaryEnabled)}
                style={{
                  width: '36px',
                  height: '20px',
                  borderRadius: '10px',
                  border: 'none',
                  background: aiSummaryEnabled ? 'var(--primary)' : 'var(--border)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s',
                }}
              >
                <div style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: 'white',
                  position: 'absolute',
                  top: '2px',
                  left: aiSummaryEnabled ? '18px' : '2px',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </button>
            </div>
          )}
        </div>

        {priorVisitsOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(priorVisits.length > 0 ? priorVisits.slice(0, 4) : [
            {
              id: '1',
              visit_date: '2026-01-10',
              visit_type: 'follow_up',
              chief_complaint: ['Migraine follow-up'],
              provider: 'Dr. Martinez',
              clinical_notes: {
                ai_summary: 'Headache frequency reduced from 15 to 8 days/month on topiramate 100mg. MIDAS improved 42→24. No significant side effects. Continue current regimen, recheck in 3 months.'
              }
            },
            {
              id: '2',
              visit_date: '2025-12-15',
              visit_type: 'follow_up',
              chief_complaint: ['Chronic migraine', 'Medication adjustment'],
              provider: 'Dr. Martinez',
              clinical_notes: {
                ai_summary: 'Suboptimal response to propranolol. Transitioned to topiramate 25mg with 2-week titration to 100mg. MRI brain unremarkable. Discussed lifestyle modifications.'
              }
            },
            {
              id: '3',
              visit_date: '2025-11-01',
              visit_type: 'new_patient',
              chief_complaint: ['New onset headaches', 'Memory concerns'],
              provider: 'Dr. Smith',
              clinical_notes: {
                ai_summary: 'Initial eval for 3-month history of daily headaches with mild cognitive complaints. MoCA 26/30 (normal). Started propranolol 40mg BID. Ordered MRI brain, labs.'
              }
            },
          ]).map((visit) => {
            const isExpanded = expandedVisit === visit.id
            return (
              <div
                key={visit.id}
                onClick={() => setExpandedVisit(isExpanded ? null : visit.id)}
                style={{
                  background: isExpanded ? 'var(--bg-white)' : 'var(--bg-gray)',
                  border: isExpanded ? '1px solid var(--primary)' : '1px solid transparent',
                  borderRadius: '8px',
                  padding: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                    {formatDate(visit.visit_date)}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: visit.visit_type === 'new_patient' ? '#D1FAE5' : '#DBEAFE',
                    color: visit.visit_type === 'new_patient' ? '#059669' : '#1D4ED8',
                  }}>
                    {visit.visit_type === 'new_patient' ? 'New Patient' : 'Follow-up'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  {Array.isArray(visit.chief_complaint) ? visit.chief_complaint.join(', ') : visit.chief_complaint || 'General consultation'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{visit.provider || 'Dr. Smith'}</div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border)',
                  }}>
                    {/* AI Summary */}
                    {aiSummaryEnabled && (
                      <div style={{
                        background: 'var(--ai-summary-bg, linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%))',
                        border: '1px solid var(--ai-summary-border, #FCD34D)',
                        borderRadius: '8px',
                        padding: '12px',
                        marginBottom: '10px',
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '8px',
                          fontWeight: 600,
                          fontSize: '12px',
                          color: 'var(--ai-summary-header, #B45309)',
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B">
                            <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
                          </svg>
                          AI Summary
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {visit.clinical_notes?.ai_summary || 'Patient reports improved symptoms with current treatment. Continue current regimen and reassess at next visit.'}
                        </div>
                      </div>
                    )}

                    {/* View Full Note Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setViewingNoteId(visit.id)
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-white)',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)'
                        e.currentTarget.style.color = 'var(--primary)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)'
                        e.currentTarget.style.color = 'var(--text-secondary)'
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                      </svg>
                      View Full Note
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          </div>
        )}
      </div>

      {/* Score History Section */}
      <div style={{ padding: '12px 16px' }}>
        <button
          onClick={() => setScoreHistoryOpen(!scoreHistoryOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            marginBottom: scoreHistoryOpen ? '12px' : 0,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2"
            style={{
              transform: scoreHistoryOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.2s',
            }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          <h4 style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            margin: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
            </svg>
            Score History
          </h4>
        </button>

        {scoreHistoryOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Render actual score history or defaults */}
            {(() => {
              const scaleTypes = [...new Set(scoreHistory.map(s => s.scale_type))].filter(Boolean)
              const hasData = scaleTypes.length > 0

              const defaultScores = [
                {
                  type: 'MIDAS',
                  trend: 'improving' as const,
                  scores: [
                    { date: 'Jan 16, 2026', value: 18, interpretation: 'Moderate' },
                    { date: 'Jan 10, 2026', value: 24, interpretation: 'Moderate' },
                    { date: 'Dec 15, 2025', value: 42, interpretation: 'Severe' },
                    { date: 'Nov 1, 2025', value: 56, interpretation: 'Severe' },
                  ],
                },
                {
                  type: 'HIT-6',
                  trend: 'stable' as const,
                  scores: [
                    { date: 'Jan 16, 2026', value: 58, interpretation: 'Substantial' },
                    { date: 'Jan 10, 2026', value: 60, interpretation: 'Severe' },
                    { date: 'Dec 15, 2025', value: 62, interpretation: 'Severe' },
                  ],
                },
                {
                  type: 'PHQ-9',
                  trend: 'improving' as const,
                  scores: [
                    { date: 'Jan 16, 2026', value: 6, interpretation: 'Mild' },
                    { date: 'Dec 15, 2025', value: 11, interpretation: 'Moderate' },
                  ],
                },
              ]

              const dataToRender = hasData
                ? scaleTypes.map(scaleType => {
                    const scaleScores = scoreHistory.filter(s => s.scale_type === scaleType)
                    const lowerIsBetter = !scaleType.includes('MOCA')
                    const trend = scaleScores.length > 1
                      ? (lowerIsBetter
                        ? (scaleScores[0].score < scaleScores[1].score ? 'improving' : scaleScores[0].score > scaleScores[1].score ? 'worsening' : 'stable')
                        : (scaleScores[0].score > scaleScores[1].score ? 'improving' : scaleScores[0].score < scaleScores[1].score ? 'worsening' : 'stable'))
                      : 'stable'
                    return {
                      type: scaleType,
                      trend: trend as 'improving' | 'stable' | 'worsening',
                      scores: scaleScores.slice(0, 4).map(s => ({
                        date: formatDate(s.created_at),
                        value: s.score,
                        interpretation: s.interpretation,
                      })),
                    }
                  })
                : defaultScores

              return dataToRender.map(scale => (
                <ScoreCard key={scale.type} scale={scale} />
              ))
            })()}
          </div>
        )}
      </div>
    </aside>

    {/* Full Note Modal */}
    {viewingNoteId && SAMPLE_FULL_NOTES[viewingNoteId] && (
      <>
        <div
          onClick={() => setViewingNoteId(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 2000,
          }}
        />
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '90%',
          maxWidth: '800px',
          maxHeight: '85vh',
          background: 'var(--bg-white)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          zIndex: 2001,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Modal Header */}
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-gray)',
          }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Clinical Note
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                {(() => {
                  const visit = [
                    { id: '1', visit_date: '2026-01-10', provider: 'Dr. Martinez' },
                    { id: '2', visit_date: '2025-12-15', provider: 'Dr. Martinez' },
                    { id: '3', visit_date: '2025-11-01', provider: 'Dr. Smith' },
                  ].find(v => v.id === viewingNoteId)
                  return visit ? `${formatDate(visit.visit_date)} - ${visit.provider}` : ''
                })()}
              </p>
            </div>
            <button
              onClick={() => setViewingNoteId(null)}
              style={{
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--bg-white)',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Modal Content */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
          }}>
            {(() => {
              const note = SAMPLE_FULL_NOTES[viewingNoteId]
              const sections = [
                { title: 'History of Present Illness', content: note.hpi },
                { title: 'Review of Systems', content: note.ros },
                { title: 'Physical Examination', content: note.exam },
                { title: 'Assessment', content: note.assessment },
                { title: 'Plan', content: note.plan },
              ]

              return sections.map((section, index) => (
                <div key={section.title} style={{ marginBottom: index < sections.length - 1 ? '24px' : 0 }}>
                  <h3 style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--primary)',
                    marginBottom: '10px',
                    paddingBottom: '8px',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    {section.title}
                  </h3>
                  <div style={{
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {section.content}
                  </div>
                </div>
              ))
            })()}
          </div>

          {/* Modal Footer */}
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            background: 'var(--bg-gray)',
          }}>
            <button
              onClick={() => {
                const note = SAMPLE_FULL_NOTES[viewingNoteId]
                const fullText = `HISTORY OF PRESENT ILLNESS:\n${note.hpi}\n\nREVIEW OF SYSTEMS:\n${note.ros}\n\nPHYSICAL EXAMINATION:\n${note.exam}\n\nASSESSMENT:\n${note.assessment}\n\nPLAN:\n${note.plan}`
                navigator.clipboard.writeText(fullText)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-white)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
              Copy Note
            </button>
            <button
              onClick={() => setViewingNoteId(null)}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--primary)',
                color: 'white',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      </>
    )}
    </>
  )
}

// Score Card Component
interface ScoreCardProps {
  scale: {
    type: string
    trend: 'improving' | 'stable' | 'worsening'
    scores: { date: string; value: number; interpretation: string }[]
  }
}

function ScoreCard({ scale }: ScoreCardProps) {
  const trendColors = {
    improving: '#10B981',
    stable: '#6B7280',
    worsening: '#EF4444',
  }

  return (
    <div style={{
      background: 'var(--bg-gray)',
      borderRadius: '8px',
      padding: '12px',
    }}>
      {/* Header with title and trend */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {scale.type}
        </span>
        <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          fontWeight: 500,
          color: trendColors[scale.trend],
        }}>
          {scale.trend === 'improving' && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
              <polyline points="17 6 23 6 23 12"/>
            </svg>
          )}
          {scale.trend === 'stable' && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          )}
          {scale.trend === 'worsening' && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
              <polyline points="17 18 23 18 23 12"/>
            </svg>
          )}
          {scale.trend.charAt(0).toUpperCase() + scale.trend.slice(1)}
        </span>
      </div>

      {/* Score list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {scale.scores.map((score, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 8px',
              borderRadius: '4px',
              background: 'var(--bg-white)',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{score.date}</span>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
              {score.value}{' '}
              <span style={{
                fontWeight: 400,
                color: 'var(--text-secondary)',
                fontSize: '11px',
              }}>
                {score.interpretation}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
