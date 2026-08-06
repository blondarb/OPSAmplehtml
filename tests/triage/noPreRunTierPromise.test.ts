import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Nothing may announce a triage tier BEFORE the run.
 *
 * The demo cards used to show an `expectedTier` badge. When the engine landed
 * somewhere else, the screen contradicted itself in front of the room — first
 * with Gutierrez, then Okafor, Petrov and Nakamura. A first fix suppressed the
 * badge only on the three known-bad cards, which was half a fix: the engine is
 * nondeterministic on borderline notes, and Gutierrez (3.00), Williams (4.00)
 * and Hargrove (4.00) all sit exactly ON a tier boundary. Any of them can flip
 * on any run.
 *
 * `expectedTier` remains in the DATA — it is the reference label the bake-off
 * measures against. It just must never reach the pre-run UI. The result panel
 * is the only place a tier belongs.
 *
 * Source-text assertions: this repo's vitest runs in a node environment with no
 * DOM, so there is nothing to render. Same approach as startGuardParity.
 */

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const PRE_RUN_SURFACES = [
  'src/components/triage/DemoScenarioLoader.tsx',
  'src/components/triage/DemoPreviewModal.tsx',
]

describe('no pre-run tier promise on the demo surfaces', () => {
  for (const path of PRE_RUN_SURFACES) {
    it(`${path} does not render a tier before the run`, () => {
      const source = read(path)

      // TIER_DISPLAY is the label/color map. Its presence on a pre-run surface
      // means a tier is being shown before anything has been scored.
      expect(
        source.includes('TIER_DISPLAY'),
        `${path} references TIER_DISPLAY — that renders a tier before the run, ` +
          `which is the contradiction this test exists to prevent.`,
      ).toBe(false)

      // Belt and braces: the scenario's reference label must not be read for
      // display either, under any alias.
      expect(
        source.includes('scenario.expectedTier'),
        `${path} reads scenario.expectedTier — the reference label is bake-off ` +
          `ground truth, not something to show a demo audience pre-run.`,
      ).toBe(false)
    })
  }

  it('expectedTier still exists in the data, because the bake-off measures against it', () => {
    // The fix is to stop DISPLAYING it, not to delete it.
    const scenarios = read('src/lib/triage/demoScenarios.ts')
    expect(scenarios).toContain('"expectedTier"')
  })

  it('SampleNoteLoader keeps its tier hints off by default', () => {
    // A second pre-run surface. It already defaults to hidden; pin that so the
    // default cannot quietly flip to true.
    const source = read('src/components/triage/SampleNoteLoader.tsx')
    expect(source).toContain('showTierHints = false')
  })
})
