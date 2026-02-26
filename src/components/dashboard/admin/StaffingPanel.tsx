'use client'

import { DEMO_VIRTUAL_MAS, DEMO_CLINIC_SITES, DEMO_PROVIDERS } from '@/lib/dashboard/demoProviders'

/**
 * StaffingPanel — Practice Manager staffing & coverage overview
 *
 * Dark glassmorphic card with two sub-sections:
 * 1. Virtual MA Assignments — role, assigned providers, active task count
 * 2. Clinic Sites — local MA, patient count, EHR badge
 */
export default function StaffingPanel() {
  // Build a quick lookup map for provider names
  const providerNameMap = new Map(DEMO_PROVIDERS.map((p) => [p.id, p.name]))

  return (
    <div
      style={{
        background: 'rgba(30, 41, 59, 0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: 20,
      }}
    >
      {/* Card header */}
      <h3
        style={{
          margin: 0,
          marginBottom: 20,
          fontSize: 16,
          fontWeight: 700,
          color: '#FFFFFF',
        }}
      >
        Staffing &amp; Coverage
      </h3>

      {/* ── Section 1: Virtual MA Assignments ── */}
      <h4
        style={{
          margin: 0,
          marginBottom: 12,
          fontSize: 13,
          fontWeight: 600,
          color: '#94A3B8',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Virtual MA Assignments
      </h4>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {DEMO_VIRTUAL_MAS.map((ma) => {
          const providerNames = ma.assigned_provider_ids
            .map((pid) => providerNameMap.get(pid) ?? pid)
            .join(', ')

          const roleBg = ma.role === 'primary' ? 'rgba(13,148,136,0.15)' : 'rgba(245,158,11,0.15)'
          const roleColor = ma.role === 'primary' ? '#14B8A6' : '#F59E0B'
          const roleLabel = ma.role === 'primary' ? 'Primary' : 'Float'

          return (
            <div
              key={ma.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              {/* Left: name + role badge + providers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9' }}>
                    {ma.name}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: roleColor,
                      background: roleBg,
                      padding: '2px 8px',
                      borderRadius: 9999,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {roleLabel}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    color: '#94A3B8',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {providerNames}
                </span>
              </div>

              {/* Right: active task count badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  flexShrink: 0,
                  marginLeft: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#E2E8F0',
                    background: 'rgba(99,102,241,0.2)',
                    padding: '2px 10px',
                    borderRadius: 9999,
                  }}
                >
                  {ma.active_task_count} tasks
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Section 2: Clinic Sites ── */}
      <h4
        style={{
          margin: 0,
          marginBottom: 12,
          fontSize: 13,
          fontWeight: 600,
          color: '#94A3B8',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Clinic Sites
      </h4>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {DEMO_CLINIC_SITES.map((site) => {
          const maLabel = site.local_ma_on_site && site.local_ma_name
            ? site.local_ma_name
            : 'Virtual Only'

          let ehrLabel: string
          let ehrBg: string
          let ehrColor: string
          if (site.ehr_integration === 'epic_fhir') {
            ehrLabel = 'Epic'
            ehrBg = 'rgba(59,130,246,0.15)'
            ehrColor = '#60A5FA'
          } else if (site.ehr_integration === 'cerner_fhir') {
            ehrLabel = 'Cerner'
            ehrBg = 'rgba(34,197,94,0.15)'
            ehrColor = '#4ADE80'
          } else {
            ehrLabel = 'None'
            ehrBg = 'rgba(148,163,184,0.12)'
            ehrColor = '#94A3B8'
          }

          return (
            <div
              key={site.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              {/* Left: site name + local MA */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9' }}>
                  {site.name}
                </span>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>
                  MA: {maLabel}
                </span>
              </div>

              {/* Right: patient count + EHR badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexShrink: 0,
                  marginLeft: 12,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0' }}>
                  {site.patients_today} pts
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: ehrColor,
                    background: ehrBg,
                    padding: '2px 8px',
                    borderRadius: 9999,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ehrLabel}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
