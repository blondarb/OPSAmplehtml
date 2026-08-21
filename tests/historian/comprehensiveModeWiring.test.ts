import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const hookSource = readFileSync(
  join(__dirname, '..', '..', 'src/hooks/useRealtimeSession.ts'),
  'utf8',
)
const componentSource = readFileSync(
  join(__dirname, '..', '..', 'src/components/NeurologicHistorian.tsx'),
  'utf8',
)
const clinicianStepSource = readFileSync(
  join(__dirname, '..', '..', 'src/components/consult/HistorianStepPanel.tsx'),
  'utf8',
)

describe('comprehensive historian mode wiring', () => {
  it('sends the selected mode to the voice-session creation route', () => {
    const sessionRequest = hookSource.match(
      /fetch\('\/api\/ai\/historian\/session',[\s\S]*?body: JSON\.stringify\(\{([\s\S]*?)\}\),/,
    )
    expect(sessionRequest?.[1]).toContain('interviewMode: options.interviewMode')
  })

  it('does not send interview mode only to the unrelated localizer request', () => {
    const localizerRequest = hookSource.match(
      /fetch\('\/api\/ai\/historian\/localizer',[\s\S]*?body: JSON\.stringify\(\{([\s\S]*?)\}\),/,
    )
    expect(localizerRequest?.[1]).not.toContain('interviewMode')
  })

  it('keeps the Comprehensive selector off the anonymous patient surface', () => {
    expect(componentSource).toContain('{clinicianMirror && !invitation && (')
    expect(componentSource).toContain('Interview depth')
  })

  it('forces Comprehensive sessions to Nova and hides the engine selector', () => {
    expect(componentSource).toContain("interviewMode === 'comprehensive'\n      ? 'nova'")
    expect(componentSource).toContain("showEngineToggle && !invitation && interviewMode === 'standard'")
  })

  it('assigns the production transcript a contiguous one-based sequence', () => {
    expect(hookSource.match(/seq: \+\+seqCounterRef\.current/g)).toHaveLength(2)
    expect(hookSource).toContain('seqCounterRef.current = 0')
  })

  it('durably alerts and finalizes when the deterministic safety screen fires', () => {
    expect(hookSource).toContain("fetch('/api/ai/historian/safety-escalation'")
    expect(hookSource).toContain("flag: 'Patient-stated active safety trigger'")
    expect(hookSource).toContain('applyHistorianTurnDecision(turnDecision')
    expect(hookSource).toContain('void endSessionRef.current(reason)')
    expect(hookSource).not.toContain('setTimeout(() => { void endSessionRef.current() }, 0)')
  })

  it('never previews a live one-time token and offers governed clinician reissue', () => {
    expect(clinicianStepSource).not.toContain('Preview Patient View')
    expect(clinicianStepSource).toContain('Revoke Old Link and Create New')
    expect(clinicianStepSource).toContain('opening it redeems the patient')
  })

  it('keeps the unauthenticated invite out of the clinician platform shell', () => {
    expect(componentSource).toContain("? <div className=\"min-h-screen\">{historianPage}</div>")
    expect(componentSource).toContain(': <PlatformShell>{historianPage}</PlatformShell>')
    expect(componentSource).toContain('Secure history intake')
  })
})
