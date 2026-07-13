#!/usr/bin/env tsx
/**
 * Regenerate src/lib/triage/demoScenarios.ts so the demo file matches the
 * corrected validation_cases DB (Option A). Same deterministic mapping as
 * scripts/reseed-validation-cases.ts: re-pairs copy existing docs, 14 gap
 * labels get fresh notes, Patterson reverts to TIA. Preserves the file's tail
 * (DEMO_CATEGORIES + getDemosByCategory) verbatim.
 *
 * Usage: tsx scripts/regenerate-demo-scenarios.ts
 */
import { readFileSync, writeFileSync } from 'fs'
import { DEMO_SCENARIOS } from '../src/lib/triage/demoScenarios'

const SEP = '\n\n--- Next Document ---\n\n'
const DEMO_PATH = 'src/lib/triage/demoScenarios.ts'
const NOTES_FILE =
  'qa/triage-validation/TRIAGE_FRESH_NOTES.md'

const REPAIR: Record<string, string> = {
  'outpatient-02-gutierrez': 'cross-07-reynolds',
  'outpatient-05-hargrove': 'outpatient-03-patterson',
  'outpatient-07-kowalski': 'outpatient-02-gutierrez',
  'cross-02-vasquez': 'cross-10-okafor',
  'cross-03-mcallister': 'outpatient-09-washington',
  'cross-07-reynolds': 'cross-09-kim',
  'cross-09-kim': 'cross-04-patel',
}
const PATTERSON_ID = 'outpatient-03-patterson'

function parseFreshNotes(md: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of md.split(/^## CARD\s+/m).slice(1)) {
    const id = part.split(/[\s(]/, 1)[0].trim()
    const fence = part.match(/```[a-z]*\n([\s\S]*?)\n```/)
    if (id && fence) out[id] = fence[1]
  }
  return out
}

// ONE-SHOT GUARD (added 2026-07-12): this migration ran 2026-07-10 against the
// SCRAMBLED demo set. The REPAIR map references pre-correction positions, so
// running it against the corrected file would re-scramble content. Abort if
// the tree is already corrected.
function assertNotAlreadyCorrected() {
  const patterson = DEMO_SCENARIOS.find((s) => s.id === 'outpatient-03-patterson')
  if (patterson?.clinicalHighlight === 'TIA presentation') {
    console.error(
      'ABORT: demoScenarios.ts is already corrected (Patterson = TIA). ' +
        'This one-shot 2026-07-10 migration must not run against the corrected set.',
    )
    process.exit(1)
  }
}

function main() {
  assertNotAlreadyCorrected()
  const fresh = parseFreshNotes(readFileSync(NOTES_FILE, 'utf-8'))
  const byId = new Map(DEMO_SCENARIOS.map((s) => [s.id, s]))

  const corrected = DEMO_SCENARIOS.map((s) => {
    const card = JSON.parse(JSON.stringify(s)) as typeof s
    if (fresh[s.id]) {
      card.files = [{ ...s.files[0], previewText: fresh[s.id] }]
    } else if (REPAIR[s.id]) {
      const src = byId.get(REPAIR[s.id])
      if (!src) throw new Error(`re-pair source not found: ${REPAIR[s.id]}`)
      const joined = src.files.map((f) => f.previewText).join(SEP)
      card.files = [{ ...s.files[0], previewText: joined }]
    }
    if (s.id === PATTERSON_ID) {
      card.briefDescription = 'HTN follow-up with two transient episodes of right arm weakness and speech difficulty.'
      card.clinicalHighlight = 'TIA presentation'
      card.expectedTier = 'urgent'
      card.demoPoints = ['Urgent vascular neurology', 'TIA recognition']
    }
    return card
  })

  const fileText = readFileSync(DEMO_PATH, 'utf-8')
  const tailIdx = fileText.indexOf('export const DEMO_CATEGORIES')
  if (tailIdx < 0) throw new Error('could not locate DEMO_CATEGORIES tail')
  const tail = fileText.slice(tailIdx)

  const out =
    `import { DemoScenario } from './types'\n\n` +
    `export const DEMO_SCENARIOS: DemoScenario[] = ${JSON.stringify(corrected, null, 2)}\n\n` +
    tail

  writeFileSync(DEMO_PATH, out)
  console.log(`Wrote ${corrected.length} scenarios to ${DEMO_PATH}; tail preserved (${tail.length} bytes).`)
}

main()
