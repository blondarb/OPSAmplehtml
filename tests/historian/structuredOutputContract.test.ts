import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { getHistorianToolDefinition } from '@/lib/historianPrompts'
import { NOTE_IMPORT_CONSUMED_FIELDS } from '@/lib/historian/structuredOutputContract'

// Schema-drift guard: the visit-note import silently null-guards every
// structured_output field, so a renamed/dropped field on either side never
// errors in production — imported notes just quietly lose content. These
// tests make that drift loud. See structuredOutputContract.ts for the
// contract itself (typed against HistorianStructuredOutput for tsc-time
// protection; tests/ is excluded from tsc).

const IMPORT_ROUTE = path.resolve(
  __dirname,
  '../../src/app/api/visits/[id]/import-historian/route.ts',
)

function fieldsConsumedByImportRoute(): Set<string> {
  const source = readFileSync(IMPORT_ROUTE, 'utf8')
  // The route aliases `const so = session.structured_output` and reads
  // every structured field through it.
  return new Set([...source.matchAll(/\bso\.([a-z_]+)\b/g)].map(m => m[1]))
}

function savedToolProperties(sessionType?: Parameters<typeof getHistorianToolDefinition>[0]): string[] {
  const tools = getHistorianToolDefinition(sessionType) as Array<{
    name?: string
    parameters?: { properties?: Record<string, unknown>; required?: string[] }
  }>
  const save = tools.find(t => t.name === 'save_interview_output') ?? tools[0]
  const properties = save?.parameters?.properties
  expect(properties, `save_interview_output tool schema not found for sessionType=${sessionType}`).toBeTruthy()
  return Object.keys(properties!)
}

describe('historian structured_output ↔ note-import contract', () => {
  it('the import route consumes exactly the declared contract fields', () => {
    const consumed = fieldsConsumedByImportRoute()
    const declared = new Set<string>(NOTE_IMPORT_CONSUMED_FIELDS)

    const undeclared = [...consumed].filter(f => !declared.has(f))
    const unconsumed = [...declared].filter(f => !consumed.has(f))

    expect(undeclared, 'import-historian reads structured_output fields missing from NOTE_IMPORT_CONSUMED_FIELDS — add them to the contract and confirm both save-tool schemas emit them').toEqual([])
    expect(unconsumed, 'NOTE_IMPORT_CONSUMED_FIELDS lists fields the import route no longer reads — prune the contract').toEqual([])
  })

  it('the standard interview save-tool schema emits every consumed field', () => {
    const properties = new Set(savedToolProperties())
    const missing = NOTE_IMPORT_CONSUMED_FIELDS.filter(f => !properties.has(f))
    expect(missing, 'save_interview_output no longer instructs the model to emit fields the note import depends on — imported notes will silently lose this content').toEqual([])
  })

  it('the referral_clarification save-tool schema emits every consumed field', () => {
    // Today this variant spreads the standard schema (superset). This test
    // exists so that decoupling the two schemas cannot silently shrink what
    // referral-directed sessions feed the signed note.
    const properties = new Set(savedToolProperties('referral_clarification'))
    const missing = NOTE_IMPORT_CONSUMED_FIELDS.filter(f => !properties.has(f))
    expect(missing, 'referral_clarification save tool is missing fields the note import depends on — referral-session imports will silently lose this content').toEqual([])
  })

  it('core note fields stay required in the standard schema', () => {
    const tools = getHistorianToolDefinition() as Array<{
      name?: string
      parameters?: { required?: string[] }
    }>
    const save = tools.find(t => t.name === 'save_interview_output')
    const required = save?.parameters?.required ?? []
    expect(required).toContain('chief_complaint')
    expect(required).toContain('hpi')
  })
})
