'use client'

import React, { useState } from 'react'
import { Building2, Home, AlertTriangle } from 'lucide-react'
import type { PatientScheduleItem, FlowStage, VisitType, AIReadiness } from '@/lib/dashboard/types'

interface PatientFlowCardProps {
  patient: PatientScheduleItem
  isExpanded: boolean
  onClick: () => void
}

// ── Visual encoding per flow stage ──────────────────────────────────────────

interface StageStyle {
  borderColor: string
  borderStyle: 'solid' | 'dashed'
  backgroundColor: string
  textDecoration?: string
}

const STAGE_STYLES: Record<FlowStage, StageStyle> = {
  completed:       { borderColor: '#22C55E', borderStyle: 'solid',  backgroundColor: '#F0FDF4' },
  in_visit:        { borderColor: '#0D9488', borderStyle: 'solid',  backgroundColor: '#FFFFFF' },
  ready_for_video: { borderColor: '#F59E0B', borderStyle: 'solid',  backgroundColor: '#FFFBEB' },
  vitals_done:     { borderColor: '#F59E0B', borderStyle: 'solid',  backgroundColor: '#FFFBEB' },
  checked_in:      { borderColor: '#F59E0B', borderStyle: 'solid',  backgroundColor: '#FFFBEB' },
  not_arrived:     { borderColor: '#94A3B8', borderStyle: 'dashed', backgroundColor: '#F8FAFC' },
  no_show:         { borderColor: '#EF4444', borderStyle: 'solid',  backgroundColor: '#FEF2F2' },
  cancelled:       { borderColor: '#CBD5E1', borderStyle: 'solid',  backgroundColor: '#F1F5F9', textDecoration: 'line-through' },
  post_visit:      { borderColor: '#3B82F6', borderStyle: 'solid',  backgroundColor: '#EFF6FF' },
}

// ── Visit type badge colors ─────────────────────────────────────────────────

interface BadgeStyle {
  bg: string
  text: string
  label: string
}

const VISIT_TYPE_BADGES: Record<VisitType, BadgeStyle> = {
  new:       { bg: '#EEF2FF', text: '#4F46E5', label: 'New' },
  follow_up: { bg: '#F1F5F9', text: '#475569', label: 'F-U' },
  urgent:    { bg: '#FEF2F2', text: '#DC2626', label: 'Urgent' },
}

// ── AI readiness dot color logic ────────────────────────────────────────────

function historianDotColor(status: AIReadiness['historian_status']): { filled: boolean; color: string } {
  if (status === 'completed' || status === 'imported') return { filled: true, color: '#22C55E' }
  if (status === 'sent') return { filled: true, color: '#F59E0B' }
  return { filled: false, color: '#D1D5DB' }
}

function sdneDotColor(status: AIReadiness['sdne_status']): { filled: boolean; color: string } {
  if (status === 'completed') return { filled: true, color: '#22C55E' }
  return { filled: false, color: '#D1D5DB' }
}

function chartPrepDotColor(status: AIReadiness['chart_prep_status']): { filled: boolean; color: string } {
  if (status === 'ready') return { filled: true, color: '#22C55E' }
  if (status === 'in_progress') return { filled: true, color: '#F59E0B' }
  return { filled: false, color: '#D1D5DB' }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function PatientFlowCard({ patient, isExpanded, onClick }: PatientFlowCardProps) {
  const [hovered, setHovered] = useState(false)

  const stage = STAGE_STYLES[patient.flow_stage]
  const badge = VISIT_TYPE_BADGES[patient.visit_type]
  const isNoShow = patient.flow_stage === 'no_show'
  const isCancelled = patient.flow_stage === 'cancelled'

  const historian = historianDotColor(patient.ai_readiness.historian_status)
  const sdne = sdneDotColor(patient.ai_readiness.sdne_status)
  const chartPrep = chartPrepDotColor(patient.ai_readiness.chart_prep_status)

  // Truncate name for display
  const displayName = patient.name.length > 15
    ? patient.name.slice(0, 14) + '\u2026'
    : patient.name

  const LocationIcon = patient.location === 'clinic' ? Building2 : Home

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        width: 130,
        minHeight: 90,
        padding: '8px 10px',
        borderRadius: 8,
        backgroundColor: stage.backgroundColor,
        borderLeft: `3px ${stage.borderStyle} ${stage.borderColor}`,
        cursor: 'pointer',
        transition: 'box-shadow 0.15s ease',
        boxShadow: isExpanded
          ? '0 4px 12px rgba(0,0,0,0.12), 0 0 0 2px #0D9488'
          : hovered
            ? '0 2px 8px rgba(0,0,0,0.1)'
            : '0 1px 3px rgba(0,0,0,0.06)',
        boxSizing: 'border-box',
      }}
    >
      {/* No-show alert flag */}
      {isNoShow && (
        <div style={{ position: 'absolute', top: 4, right: 4 }}>
          <AlertTriangle size={12} color="#EF4444" />
        </div>
      )}

      {/* Patient name */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: isCancelled ? '#94A3B8' : '#1E293B',
          textDecoration: stage.textDecoration || 'none',
          lineHeight: '16px',
          marginBottom: 4,
          paddingRight: isNoShow ? 16 : 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {displayName}
      </div>

      {/* Visit type badge + location icon row */}
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
            display: 'inline-block',
            fontSize: 10,
            fontWeight: 600,
            lineHeight: '14px',
            padding: '1px 5px',
            borderRadius: 9999,
            backgroundColor: badge.bg,
            color: badge.text,
            whiteSpace: 'nowrap',
          }}
        >
          {badge.label}
        </span>
        <LocationIcon size={12} color="#94A3B8" />
      </div>

      {/* AI readiness dots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {[historian, sdne, chartPrep].map((dot, i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: dot.filled ? dot.color : 'transparent',
              border: dot.filled ? 'none' : `1.5px solid ${dot.color}`,
              boxSizing: 'border-box',
            }}
          />
        ))}
      </div>
    </div>
  )
}
