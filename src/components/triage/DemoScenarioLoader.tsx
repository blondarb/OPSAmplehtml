'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { DemoScenario, DemoCategory, TIER_DISPLAY } from '@/lib/triage/types'
import { DEMO_SCENARIOS, DEMO_CATEGORIES, getDemosByCategory } from '@/lib/triage/demoScenarios'
import DemoPreviewModal from './DemoPreviewModal'

interface Props {
  onLoadFiles: (files: File[]) => void
}

async function fetchScenarioFiles(scenario: DemoScenario): Promise<File[]> {
  const files: File[] = []
  for (const f of scenario.files) {
    const res = await fetch(f.path)
    if (!res.ok) throw new Error(`Failed to fetch ${f.filename}`)
    const blob = await res.blob()
    files.push(new File([blob], f.filename, { type: 'application/pdf' }))
  }
  return files
}

export default function DemoScenarioLoader({ onLoadFiles }: Props) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<DemoCategory>('outpatient')
  const [previewScenario, setPreviewScenario] = useState<DemoScenario | null>(null)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !previewScenario) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open && !previewScenario) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [previewScenario, open])

  const handleLoad = useCallback(async (scenario: DemoScenario) => {
    setLoadingFiles(true)
    try {
      const files = await fetchScenarioFiles(scenario)
      onLoadFiles(files)
      setPreviewScenario(null)
      setOpen(false)
    } catch {
      // Keep modal open on error — user can retry or close
    } finally {
      setLoadingFiles(false)
    }
  }, [onLoadFiles])

  const scenarios = getDemosByCategory(activeTab)

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: '8px 16px',
          borderRadius: '8px',
          background: '#EA580C',
          color: '#fff',
          border: 'none',
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        Try a Demo
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && !previewScenario && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: '4px',
          width: 'min(480px, calc(100vw - 48px))',
          maxHeight: '520px',
          display: 'flex',
          flexDirection: 'column',
          background: '#0f172a',
          border: '1px solid #475569',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 50,
          overflow: 'hidden',
        }}>
          {/* Category tabs */}
          <div style={{
            display: 'flex',
            gap: '2px',
            padding: '8px 8px 0',
            borderBottom: '1px solid #334155',
            flexShrink: 0,
          }}>
            {DEMO_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveTab(cat.key)}
                style={{
                  flex: 1,
                  padding: '8px 4px 10px',
                  borderRadius: '6px 6px 0 0',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeTab === cat.key ? '#1e293b' : 'transparent',
                  color: activeTab === cat.key ? '#e2e8f0' : '#94a3b8',
                  borderBottom: activeTab === cat.key ? '2px solid #EA580C' : '2px solid transparent',
                  transition: 'all 0.15s ease',
                }}
              >
                {cat.label} ({cat.count})
              </button>
            ))}
          </div>

          {/* Scenario list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {scenarios.map((scenario) => {
              const tierConfig = TIER_DISPLAY[scenario.expectedTier]
              return (
                <button
                  key={scenario.id}
                  onClick={() => setPreviewScenario(scenario)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    width: '100%',
                    padding: '12px 14px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid #1e293b',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: '#e2e8f0',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#1e293b')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Tier badge */}
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: tierConfig.bgColor,
                    color: tierConfig.textColor,
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    flexShrink: 0,
                    minWidth: '52px',
                    textAlign: 'center',
                    marginTop: '2px',
                  }}>
                    {tierConfig.label}
                  </span>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                        {scenario.patientName}
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                        {scenario.age}{scenario.sex}
                      </span>
                      <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
                        {scenario.referringSpecialty}
                      </span>
                      {scenario.files.length > 1 && (
                        <span style={{
                          padding: '1px 6px',
                          borderRadius: '10px',
                          background: 'rgba(234, 88, 12, 0.2)',
                          color: '#fdba74',
                          fontSize: '0.6rem',
                          fontWeight: 700,
                        }}>
                          {scenario.files.length} files
                        </span>
                      )}
                    </div>
                    <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: 0, lineHeight: 1.4 }}>
                      {scenario.clinicalHighlight}
                    </p>
                  </div>

                  {/* Arrow */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '4px' }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewScenario && (
        <DemoPreviewModal
          scenario={previewScenario}
          onClose={() => setPreviewScenario(null)}
          onLoad={handleLoad}
          loading={loadingFiles}
        />
      )}
    </div>
  )
}
