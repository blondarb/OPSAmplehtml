'use client'

import { useState, useEffect } from 'react'
import type { NeurologyConsult } from '@/lib/consult/types'
import type { ConsultReport } from '@/lib/consult/report'
import ConsultReportView from '@/components/ConsultReportView'

interface ReportStepPanelProps {
  consultId: string
  consult: NeurologyConsult | null
  report: ConsultReport | null
  onReportGenerated: (report: ConsultReport) => void
  onError: (msg: string) => void
}

export default function ReportStepPanel({ consultId, consult, report, onReportGenerated, onError }: ReportStepPanelProps) {
  const [generating, setGenerating] = useState(false)
  const [loadedReport, setLoadedReport] = useState<ConsultReport | null>(report)

  // Try to load existing report on mount
  useEffect(() => {
    if (loadedReport) return
    fetch(`/api/neuro-consults/${consultId}/report`)
      .then((r) => r.json())
      .then((data) => {
        if (data.report) {
          setLoadedReport(data.report)
          onReportGenerated(data.report)
        }
      })
      .catch(() => {})
  }, [consultId, loadedReport, onReportGenerated])

  async function handleGenerate() {
    setGenerating(true)
    onError('')

    try {
      const res = await fetch(`/api/neuro-consults/${consultId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Report generation failed' }))
        throw new Error(err.error || 'Report generation failed')
      }

      const data = await res.json()
      setLoadedReport(data.report)
      onReportGenerated(data.report)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  async function handleFinalize() {
    // Mark report as final
    try {
      await fetch(`/api/neuro-consults/${consultId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'complete' }),
      })
      if (loadedReport) {
        setLoadedReport({ ...loadedReport, status: 'final' })
      }
    } catch {
      onError('Failed to finalize report')
    }
  }

  // Show the report if available
  if (loadedReport) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ color: '#E2E8F0', fontSize: 16, fontWeight: 700, margin: 0 }}>
            Consultation Report
          </h3>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: 'transparent',
              color: '#94A3B8',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {generating ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
        <ConsultReportView report={loadedReport} onFinalize={handleFinalize} />
      </div>
    )
  }

  // No report yet — show generate button
  return (
    <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 12, padding: 24 }}>
      <h3 style={{ color: '#E2E8F0', fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
        Step 4: Generate Report
      </h3>
      <p style={{ color: '#94A3B8', fontSize: 13, margin: '0 0 16px' }}>
        Assemble all pipeline data — triage, historian interview, patient tools, clinical scales, red flags,
        and SDNE results — into a unified consultation report.
      </p>

      {/* Summary of available data */}
      <div
        style={{
          background: '#0F172A',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: 14,
          marginBottom: 16,
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <DataBadge label="Triage" available={!!consult?.triage_completed_at} />
        <DataBadge label="Historian" available={!!consult?.historian_completed_at} />
        <DataBadge label="SDNE" available={!!consult?.sdne_completed_at} />
        <DataBadge label="Patient Tools" available={false} hint="Check after generation" />
      </div>

      <button
        onClick={handleGenerate}
        disabled={generating}
        style={{
          padding: '12px 32px',
          borderRadius: 8,
          border: 'none',
          background: generating ? '#475569' : '#0D9488',
          color: '#FFFFFF',
          fontSize: 14,
          fontWeight: 600,
          cursor: generating ? 'not-allowed' : 'pointer',
        }}
      >
        {generating ? 'Generating Report…' : 'Generate Consultation Report'}
      </button>
    </div>
  )
}

function DataBadge({ label, available, hint }: { label: string; available: boolean; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: available ? '#22C55E' : '#475569',
        }}
      />
      <span style={{ color: available ? '#22C55E' : '#64748B', fontSize: 12, fontWeight: 500 }}>
        {label}
      </span>
      {hint && !available && (
        <span style={{ color: '#475569', fontSize: 11, fontStyle: 'italic' }}>({hint})</span>
      )}
    </div>
  )
}
