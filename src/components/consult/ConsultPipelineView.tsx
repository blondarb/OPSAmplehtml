'use client'

import { useState, useCallback, useEffect } from 'react'
import type { NeurologyConsult, ConsultStatus } from '@/lib/consult/types'
import type { ConsultReport } from '@/lib/consult/report'
import ConsultReportView from '@/components/ConsultReportView'
import TriageStepPanel from './TriageStepPanel'
import HistorianStepPanel from './HistorianStepPanel'
import PatientToolsStepPanel from './PatientToolsStepPanel'
import ReportStepPanel from './ReportStepPanel'

/**
 * Pipeline steps in display order.
 * Each step maps to one or more ConsultStatus values.
 */
type StepId = 'triage' | 'historian' | 'patient_tools' | 'report'

const PIPELINE_STEPS: Array<{ id: StepId; label: string; statuses: string[] }> = [
  { id: 'triage', label: 'Triage', statuses: ['triage_pending', 'triage_complete'] },
  { id: 'historian', label: 'AI Historian', statuses: ['intake_pending', 'intake_in_progress', 'intake_complete', 'historian_pending', 'historian_in_progress', 'historian_complete'] },
  { id: 'patient_tools', label: 'Patient Tools', statuses: [] },
  { id: 'report', label: 'Report', statuses: ['sdne_pending', 'sdne_complete', 'complete'] },
]

interface ConsultPipelineViewProps {
  consultId: string | null
  onConsultCreated: (id: string) => void
}

function getActiveStep(status: ConsultStatus | null): StepId {
  if (!status) return 'triage'
  for (const step of PIPELINE_STEPS) {
    if (step.statuses.includes(status as string)) return step.id
  }
  return 'report'
}

function isStepComplete(stepId: StepId, status: ConsultStatus | null): boolean {
  if (!status) return false
  const stepIndex = PIPELINE_STEPS.findIndex((s) => s.id === stepId)
  const statusStep = getActiveStep(status)
  const statusIndex = PIPELINE_STEPS.findIndex((s) => s.id === statusStep)
  return statusIndex > stepIndex
}

export default function ConsultPipelineView({ consultId, onConsultCreated }: ConsultPipelineViewProps) {
  const [consult, setConsult] = useState<NeurologyConsult | null>(null)
  const [activeStep, setActiveStep] = useState<StepId>('triage')
  const [report, setReport] = useState<ConsultReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load consult when ID changes
  useEffect(() => {
    if (!consultId) return
    setLoading(true)
    fetch(`/api/neuro-consults/${consultId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.consult) {
          setConsult(data.consult)
          setActiveStep(getActiveStep(data.consult.status))
        }
      })
      .catch(() => setError('Failed to load consult'))
      .finally(() => setLoading(false))
  }, [consultId])

  const refreshConsult = useCallback(async () => {
    if (!consultId) return
    const r = await fetch(`/api/neuro-consults/${consultId}`)
    const data = await r.json()
    if (data.consult) {
      setConsult(data.consult)
    }
  }, [consultId])

  const handleTriageComplete = useCallback(
    (newConsultId: string, updatedConsult: NeurologyConsult) => {
      onConsultCreated(newConsultId)
      setConsult(updatedConsult)
      setActiveStep('historian')
    },
    [onConsultCreated],
  )

  const handleHistorianComplete = useCallback(() => {
    refreshConsult()
    setActiveStep('patient_tools')
  }, [refreshConsult])

  const handlePatientToolsComplete = useCallback(() => {
    refreshConsult()
    setActiveStep('report')
  }, [refreshConsult])

  const handleReportGenerated = useCallback((r: ConsultReport) => {
    setReport(r)
    refreshConsult()
  }, [refreshConsult])

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Pipeline Progress Bar */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          marginBottom: 24,
          background: '#1E293B',
          borderRadius: 12,
          border: '1px solid #334155',
          overflow: 'hidden',
        }}
      >
        {PIPELINE_STEPS.map((step, i) => {
          const isActive = step.id === activeStep
          const isDone = isStepComplete(step.id, consult?.status ?? null)
          const isClickable = isDone || isActive

          return (
            <button
              key={step.id}
              onClick={() => isClickable && setActiveStep(step.id)}
              disabled={!isClickable}
              style={{
                flex: 1,
                padding: '14px 12px',
                background: isActive
                  ? 'rgba(13, 148, 136, 0.15)'
                  : isDone
                    ? 'rgba(34, 197, 94, 0.08)'
                    : 'transparent',
                border: 'none',
                borderRight: i < PIPELINE_STEPS.length - 1 ? '1px solid #334155' : 'none',
                cursor: isClickable ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'background 0.2s',
              }}
            >
              {/* Step number / checkmark */}
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  background: isDone
                    ? '#22C55E'
                    : isActive
                      ? '#0D9488'
                      : '#475569',
                  color: '#FFFFFF',
                }}
              >
                {isDone ? '✓' : i + 1}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#0D9488' : isDone ? '#22C55E' : '#94A3B8',
                }}
              >
                {step.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Error display */}
      {error && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            padding: '12px 16px',
            color: '#EF4444',
            fontSize: 14,
            marginBottom: 16,
          }}
        >
          {error}
          <button
            onClick={() => setError('')}
            style={{ float: 'right', background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 48, color: '#94A3B8' }}>
          Loading consult…
        </div>
      )}

      {/* Step panels */}
      {!loading && activeStep === 'triage' && (
        <TriageStepPanel
          consult={consult}
          onTriageComplete={handleTriageComplete}
          onError={setError}
        />
      )}

      {!loading && activeStep === 'historian' && consultId && (
        <HistorianStepPanel
          consultId={consultId}
          consult={consult}
          onComplete={handleHistorianComplete}
          onError={setError}
        />
      )}

      {!loading && activeStep === 'patient_tools' && consultId && (
        <PatientToolsStepPanel
          consultId={consultId}
          onComplete={handlePatientToolsComplete}
          onSkip={handlePatientToolsComplete}
          onError={setError}
        />
      )}

      {!loading && activeStep === 'report' && consultId && (
        <ReportStepPanel
          consultId={consultId}
          consult={consult}
          report={report}
          onReportGenerated={handleReportGenerated}
          onError={setError}
        />
      )}
    </div>
  )
}
