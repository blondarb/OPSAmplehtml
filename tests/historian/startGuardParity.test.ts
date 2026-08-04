import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Regression guard for a defect that reached production on 2026-08-04.
 *
 * The Start button's `disabled` condition was updated to accept a loaded
 * referral, but `handleStartInterview`'s early-return guard was not. The button
 * therefore rendered ENABLED with only a referral loaded while the handler
 * returned immediately — clicking Start silently did nothing and the flow never
 * advanced to the consent gate.
 *
 * The two conditions are inverses of one another and must be changed together.
 * This test asserts both mention every entry point, so adding a future entry
 * point to one and not the other fails here instead of on stage.
 */
const SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/NeurologicHistorian.tsx'),
  'utf8',
)

const ENTRY_POINTS = ['selectedScenario', 'sessionConfig', 'referralInput'] as const

describe('start-interview guard matches the Start button', () => {
  it('the handler guard covers every entry point', () => {
    const body = SOURCE.slice(
      SOURCE.indexOf('const handleStartInterview'),
      SOURCE.indexOf('const handleConsentConfirm'),
    )
    // Anchor on the guard STATEMENT, not on the first 'return' — prose in the
    // surrounding comment can contain that word.
    const guardLine = body
      .split('\n')
      .find((line) => line.trim().startsWith('if (!selectedScenario'))
    expect(guardLine, 'early-return guard not found in handleStartInterview').toBeDefined()
    for (const entry of ENTRY_POINTS) {
      expect(guardLine).toContain(entry)
    }
  })

  it('the Start button disabled condition covers every entry point', () => {
    const marker = 'disabled={!selectedScenario'
    const start = SOURCE.indexOf(marker)
    expect(start).toBeGreaterThan(-1)
    const condition = SOURCE.slice(start, start + 120)
    for (const entry of ENTRY_POINTS) {
      expect(condition).toContain(entry)
    }
  })
})
