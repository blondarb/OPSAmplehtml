import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(process.cwd(), 'src/components/NeurologicHistorian.tsx'), 'utf8')

describe('NEXT_PUBLIC_HISTORIAN_PATIENT_STEER (patient-route localizer steer)', () => {
  it('reads the flag as a literal build-time expression so Next can inline it', () => {
    expect(SRC).toContain("process.env.NEXT_PUBLIC_HISTORIAN_PATIENT_STEER === 'true'")
  })

  it('enables the localizer for clinician mirror OR the patient-steer flag', () => {
    expect(SRC).toContain('enableLocalizer: clinicianMirror || PATIENT_STEER_ENABLED,')
  })

  it('keeps the differential panel gated on clinicianMirror only (never on the steer flag)', () => {
    const panelGate = SRC.indexOf("{clinicianMirror && (phase === 'active' || phase === 'ending') && (")
    expect(panelGate).toBeGreaterThan(-1)
    const panelBlock = SRC.slice(panelGate, SRC.indexOf('LocalizerPanel', panelGate) + 'LocalizerPanel'.length)
    expect(panelBlock).not.toContain('PATIENT_STEER_ENABLED')
  })
})
