'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { DemoScenario, DemoCategory } from '@/lib/triage/types'
import { DEMO_CATEGORIES, getDemosByCategory } from '@/lib/triage/demoScenarios'
import DemoPreviewModal from './DemoPreviewModal'

interface Props {
  onBeginLoad: () => void
  onLoadFiles: (files: File[]) => void
}

export interface DemoScenarioLoaderHandle {
  invalidatePendingLoad: () => void
}

export interface DemoFileLoadGate {
  generation: number
  controller: AbortController | null
}

interface DemoFileLoadAttempt {
  generation: number
  controller: AbortController
}

export type DemoFileLoadResult =
  | { status: 'success'; files: File[] }
  | { status: 'cancelled' }
  | { status: 'error' }

export function createDemoFileLoadGate(): DemoFileLoadGate {
  return { generation: 0, controller: null }
}

export function invalidateDemoFileLoad(gate: DemoFileLoadGate): void {
  gate.controller?.abort()
  gate.controller = null
  gate.generation += 1
}

function beginDemoFileLoad(gate: DemoFileLoadGate): DemoFileLoadAttempt {
  gate.controller?.abort()
  gate.generation += 1
  const controller = new AbortController()
  gate.controller = controller
  return { generation: gate.generation, controller }
}

function isCurrentDemoFileLoad(
  gate: DemoFileLoadGate,
  attempt: DemoFileLoadAttempt,
): boolean {
  return (
    gate.generation === attempt.generation &&
    gate.controller === attempt.controller &&
    !attempt.controller.signal.aborted
  )
}

function completeDemoFileLoad(
  gate: DemoFileLoadGate,
  attempt: DemoFileLoadAttempt,
): void {
  if (isCurrentDemoFileLoad(gate, attempt)) gate.controller = null
}

export async function loadDemoScenarioFiles(input: {
  scenario: Pick<DemoScenario, 'files'>
  gate: DemoFileLoadGate
  onBeginLoad: () => void
  fetchImpl?: typeof fetch
}): Promise<DemoFileLoadResult> {
  const attempt = beginDemoFileLoad(input.gate)
  const fetchImpl = input.fetchImpl ?? globalThis.fetch
  try {
    input.onBeginLoad()
    if (!isCurrentDemoFileLoad(input.gate, attempt)) {
      return { status: 'cancelled' }
    }
    const files: File[] = []
    for (const source of input.scenario.files) {
      const response = await fetchImpl(source.path, {
        signal: attempt.controller.signal,
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch ${source.filename}`)
      }
      const blob = await response.blob()
      if (!isCurrentDemoFileLoad(input.gate, attempt)) {
        return { status: 'cancelled' }
      }
      files.push(
        new File([blob], source.filename, { type: 'application/pdf' }),
      )
    }
    if (!isCurrentDemoFileLoad(input.gate, attempt)) {
      return { status: 'cancelled' }
    }
    completeDemoFileLoad(input.gate, attempt)
    return { status: 'success', files }
  } catch {
    const cancelled = !isCurrentDemoFileLoad(input.gate, attempt)
    if (!cancelled) completeDemoFileLoad(input.gate, attempt)
    return { status: cancelled ? 'cancelled' : 'error' }
  }
}

const DemoScenarioLoader = forwardRef<DemoScenarioLoaderHandle, Props>(
function DemoScenarioLoader({ onBeginLoad, onLoadFiles }, forwardedRef) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<DemoCategory>('outpatient')
  const [previewScenario, setPreviewScenario] = useState<DemoScenario | null>(null)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const loadGateRef = useRef<DemoFileLoadGate | null>(null)
  if (!loadGateRef.current) loadGateRef.current = createDemoFileLoadGate()
  const loadGate = loadGateRef.current

  const invalidatePendingLoad = useCallback(() => {
    invalidateDemoFileLoad(loadGate)
    setLoadingFiles(false)
  }, [loadGate])

  useImperativeHandle(
    forwardedRef,
    () => ({ invalidatePendingLoad }),
    [invalidatePendingLoad],
  )

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

  useEffect(
    () => () => {
      invalidateDemoFileLoad(loadGate)
    },
    [loadGate],
  )

  const handleLoad = useCallback(async (scenario: DemoScenario) => {
    const result = await loadDemoScenarioFiles({
      scenario,
      gate: loadGate,
      onBeginLoad: () => {
        onBeginLoad()
        setLoadingFiles(true)
      },
    })
    if (result.status === 'error') {
      setLoadingFiles(false)
    }
    if (result.status !== 'success') return
    setLoadingFiles(false)
    onLoadFiles(result.files)
    setPreviewScenario(null)
    setOpen(false)
  }, [loadGate, onBeginLoad, onLoadFiles])

  const handleClose = useCallback(() => {
    invalidatePendingLoad()
    setPreviewScenario(null)
  }, [invalidatePendingLoad])

  const handlePreviewScenario = useCallback(
    (scenario: DemoScenario) => {
      invalidatePendingLoad()
      setPreviewScenario(scenario)
    },
    [invalidatePendingLoad],
  )

  const scenarios = getDemosByCategory(activeTab)

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="nn-btn nn-btn--sec"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        Try a Demo
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
          background: 'var(--nn-surface)',
          border: '1px solid var(--nn-line)',
          borderRadius: 'var(--nn-radius)',
          boxShadow: '0 4px 16px rgba(20,24,26,0.08)',
          zIndex: 50,
          overflow: 'hidden',
        }}>
          {/* Category tabs */}
          <div style={{
            display: 'flex',
            gap: '2px',
            padding: '8px 8px 0',
            borderBottom: '1px solid var(--nn-line)',
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
                  fontSize: 'var(--nn-fs-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeTab === cat.key ? 'var(--nn-accent-wash)' : 'transparent',
                  color: activeTab === cat.key ? 'var(--nn-accent-ink)' : 'var(--nn-ink-3)',
                  borderBottom: activeTab === cat.key ? '2px solid var(--nn-accent)' : '2px solid transparent',
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
              return (
                <button
                  key={scenario.id}
                  onClick={() => handlePreviewScenario(scenario)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    width: '100%',
                    padding: '12px 14px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--nn-line-2)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--nn-ink)',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--nn-line-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* NO TIER BADGE — deliberately.
                      These cards used to pre-announce the tier the run was
                      expected to produce. When the engine landed elsewhere the
                      screen contradicted itself in front of the room, which is
                      exactly what happened with Gutierrez, then Okafor, Petrov
                      and Nakamura. Suppressing the badge only on the known-bad
                      cards was half a fix: the engine is nondeterministic on
                      borderline notes, and Gutierrez (3.00), Williams (4.00)
                      and Hargrove (4.00) all sit ON a tier boundary, so any of
                      them can flip on any run.
                      A pre-run tier is a promise the engine never made. The
                      result panel is the only place a tier belongs. */}

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 'var(--nn-fs-sm)' }}>
                        {scenario.patientName}
                      </span>
                      <span style={{ color: 'var(--nn-ink-3)', fontSize: 'var(--nn-fs-xs)' }}>
                        {scenario.age}{scenario.sex}
                      </span>
                      <span style={{ color: 'var(--nn-ink-3)', fontSize: 'var(--nn-fs-xs)' }}>
                        {scenario.referringSpecialty}
                      </span>
                      {scenario.files.length > 1 && (
                        <span style={{
                          padding: '1px 6px',
                          borderRadius: '10px',
                          background: 'var(--nn-line-2)',
                          color: 'var(--nn-ink-2)',
                          fontSize: '0.6rem',
                          fontWeight: 700,
                        }}>
                          {scenario.files.length} files
                        </span>
                      )}
                    </div>
                    <p style={{ color: 'var(--nn-ink-3)', fontSize: 'var(--nn-fs-xs)', margin: 0, lineHeight: 1.4 }}>
                      {scenario.clinicalHighlight}
                    </p>
                    {scenario.doNotDemo && (
                      <p style={{
                        color: 'var(--nn-ink-2)',
                        fontSize: 'var(--nn-fs-xs)',
                        margin: '4px 0 0',
                        lineHeight: 1.4,
                        fontWeight: 600,
                      }}>
                        Not for rubric demos — {scenario.doNotDemo.reason}
                      </p>
                    )}
                  </div>

                  {/* Arrow */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nn-ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: '4px' }}>
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
          onClose={handleClose}
          onLoad={handleLoad}
          loading={loadingFiles}
        />
      )}
    </div>
  )
})

DemoScenarioLoader.displayName = 'DemoScenarioLoader'

export default DemoScenarioLoader
