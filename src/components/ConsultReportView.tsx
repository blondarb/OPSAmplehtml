'use client'

import { useState, useCallback } from 'react'
import type { ConsultReport, ReportSection } from '@/lib/consult/report'

interface ConsultReportViewProps {
  report: ConsultReport
  onFinalize?: () => void
}

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  triage: { label: 'Triage', color: '#F59E0B' },
  intake: { label: 'Intake', color: '#8B5CF6' },
  historian: { label: 'Historian', color: '#0D9488' },
  localizer: { label: 'Localizer', color: '#3B82F6' },
  scales: { label: 'Scales', color: '#06B6D4' },
  red_flags: { label: 'Red Flags', color: '#EF4444' },
  sdne: { label: 'SDNE', color: '#1E40AF' },
  patient_tools: { label: 'Patient', color: '#EC4899' },
  physician: { label: 'Physician', color: '#22C55E' },
  ai_synthesis: { label: 'AI', color: '#A78BFA' },
}

function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_BADGES[source] || { label: source, color: '#64748B' }
  return (
    <span
      style={{
        padding: '2px 6px',
        borderRadius: '4px',
        background: `${meta.color}15`,
        color: meta.color,
        fontSize: '0.6rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {meta.label}
    </span>
  )
}

function ReportSectionCard({ section }: { section: ReportSection }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      style={{
        background: '#1E293B',
        border: '1px solid #334155',
        borderRadius: '10px',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: '100%',
          padding: '12px 14px',
          background: 'transparent',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#E2E8F0', fontSize: '0.85rem', fontWeight: 600 }}>
            {section.title}
          </span>
          <SourceBadge source={section.source} />
        </div>
        <span style={{ color: '#64748B', fontSize: '0.8rem', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
          ▾
        </span>
      </button>

      {!collapsed && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid #334155' }}>
          <pre
            style={{
              color: '#CBD5E1',
              fontSize: '0.8rem',
              lineHeight: 1.6,
              margin: '12px 0 0',
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
            }}
          >
            {section.content}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function ConsultReportView({ report, onFinalize }: ConsultReportViewProps) {
  const [copying, setCopying] = useState(false)

  const handleCopyAll = useCallback(async () => {
    const fullText = report.sections
      .map((s) => `## ${s.title}\n\n${s.content}`)
      .join('\n\n---\n\n')

    try {
      await navigator.clipboard.writeText(fullText)
      setCopying(true)
      setTimeout(() => setCopying(false), 2000)
    } catch {
      // Fallback
      const el = document.createElement('textarea')
      el.value = fullText
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopying(true)
      setTimeout(() => setCopying(false), 2000)
    }
  }, [report])

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          background: '#1E293B',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ color: '#E2E8F0', fontSize: '1.1rem', fontWeight: 700, margin: '0 0 4px' }}>
              Neurology Consultation Report
            </h2>
            <p style={{ color: '#94A3B8', fontSize: '0.8rem', margin: 0 }}>
              {report.chief_complaint}
            </p>
          </div>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: report.status === 'final' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: report.status === 'final' ? '#22C55E' : '#F59E0B',
              fontSize: '0.7rem',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {report.status}
          </span>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
          {report.triage_tier && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: '#64748B', fontSize: '0.7rem' }}>Triage:</span>
              <span style={{ color: '#F59E0B', fontSize: '0.7rem', fontWeight: 600 }}>{report.triage_tier}</span>
            </div>
          )}
          {report.subspecialty && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: '#64748B', fontSize: '0.7rem' }}>Subspecialty:</span>
              <span style={{ color: '#A78BFA', fontSize: '0.7rem', fontWeight: 600 }}>{report.subspecialty}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#64748B', fontSize: '0.7rem' }}>Sections:</span>
            <span style={{ color: '#E2E8F0', fontSize: '0.7rem', fontWeight: 600 }}>{report.sections.length}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#64748B', fontSize: '0.7rem' }}>Words:</span>
            <span style={{ color: '#E2E8F0', fontSize: '0.7rem', fontWeight: 600 }}>{report.word_count}</span>
          </div>
        </div>

        {/* Summary badges */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
          {report.red_flags.count > 0 && (
            <span style={{
              padding: '3px 8px', borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444',
              fontSize: '0.7rem', fontWeight: 600,
            }}>
              {report.red_flags.count} Red Flag{report.red_flags.count !== 1 ? 's' : ''}
            </span>
          )}
          {report.scale_results.length > 0 && (
            <span style={{
              padding: '3px 8px', borderRadius: '6px',
              background: 'rgba(6, 182, 212, 0.15)', color: '#06B6D4',
              fontSize: '0.7rem', fontWeight: 600,
            }}>
              {report.scale_results.length} Scale{report.scale_results.length !== 1 ? 's' : ''}
            </span>
          )}
          {report.sdne_summary && (
            <span style={{
              padding: '3px 8px', borderRadius: '6px',
              background: 'rgba(30, 64, 175, 0.15)', color: '#60A5FA',
              fontSize: '0.7rem', fontWeight: 600,
            }}>
              SDNE: {report.sdne_summary.session_flag}
            </span>
          )}
          {report.body_map && (
            <span style={{
              padding: '3px 8px', borderRadius: '6px',
              background: 'rgba(236, 72, 153, 0.15)', color: '#EC4899',
              fontSize: '0.7rem', fontWeight: 600,
            }}>
              {report.body_map.total_markers} Body Map Marker{report.body_map.total_markers !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Report sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {report.sections
          .sort((a, b) => a.order - b.order)
          .map((s) => (
            <ReportSectionCard key={s.id} section={s} />
          ))}
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleCopyAll}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #334155',
            background: copying ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
            color: copying ? '#22C55E' : '#94A3B8',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {copying ? 'Copied!' : 'Copy to Clipboard'}
        </button>
        {report.status === 'draft' && onFinalize && (
          <button
            onClick={onFinalize}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              background: '#0D9488',
              color: '#FFFFFF',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Finalize Report
          </button>
        )}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: '12px',
        padding: '10px',
        borderTop: '1px solid #1E293B',
        textAlign: 'center',
      }}>
        <span style={{ color: '#475569', fontSize: '0.65rem' }}>
          Generated {new Date(report.generated_at).toLocaleString()} · {report.word_count} words · {report.sections.length} sections
        </span>
      </div>
    </div>
  )
}
