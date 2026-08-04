import { describe, expect, it } from 'vitest'

import {
  deriveLongPacketMapperSafetyFloor,
  tryDeriveLongPacketMapperSafetyFloor,
} from '@/lib/triage/longPacketPartialSafetyHold'
import type { LongPacketMapperBranchOutcome } from '@/lib/triage/longPacketModelPipeline'

/**
 * Contract for the mapper safety floor (audit 2026-08-04).
 *
 * The benign "this chunk has nothing to escalate" case used to be signalled by
 * throwing, so callers wrapping the call in `try { } catch { return }` could not
 * distinguish a clean chunk from a genuine defect. These tests pin BOTH forms:
 * the non-throwing one returns a discriminated value for every expected
 * outcome, and the throwing one keeps its original fail-closed contract for the
 * persisted-projection validation paths that depend on it.
 */

const EVIDENCE = [
  {
    packetId: 'packet-1',
    documentId: 'doc-1',
    pageNumber: 1,
    startOffset: 0,
    endOffset: 10,
    quote: 'synthetic',
    extractionMethod: 'text' as const,
    extractionConfidence: 1,
  },
]

function outcomeWith(
  facts: unknown[],
  conflicts: unknown[] = [],
): LongPacketMapperBranchOutcome {
  return {
    branch: 'clinical_mapper',
    chunkId: 'chunk-1',
    chunkProvenanceSha256: 'a'.repeat(64),
    result: { facts, conflicts },
  } as unknown as LongPacketMapperBranchOutcome
}

const ACTIONABLE_RED_FLAG = {
  category: 'red_flag',
  key: 'k',
  statement: 'Current red flag.',
  assertion: 'present',
  temporality: 'current',
  eventDateText: null,
  evidence: EVIDENCE,
}

describe('mapper safety floor — expected outcomes are values, not throws', () => {
  it('escalates when the chunk carries an actionable red flag', () => {
    const derived = tryDeriveLongPacketMapperSafetyFloor(outcomeWith([ACTIONABLE_RED_FLAG]))
    expect(derived.kind).toBe('escalate')
    if (derived.kind === 'escalate') {
      expect(derived.safetyResult.carePathway).toBe('same_day_clinician_review')
      expect(derived.safetyResult.criticalUnknowns.length).toBeGreaterThan(0)
    }
  })

  it('reports a clean chunk as a value instead of throwing', () => {
    // The common case: no red flags, no critical unknowns, no conflicts.
    expect(() => tryDeriveLongPacketMapperSafetyFloor(outcomeWith([]))).not.toThrow()
    expect(tryDeriveLongPacketMapperSafetyFloor(outcomeWith([])).kind).toBe(
      'no_actionable_findings',
    )
  })

  it('treats negated and historical red flags as nothing to escalate', () => {
    const negated = { ...ACTIONABLE_RED_FLAG, assertion: 'negated' }
    const historical = { ...ACTIONABLE_RED_FLAG, temporality: 'historical' }
    expect(tryDeriveLongPacketMapperSafetyFloor(outcomeWith([negated])).kind).toBe(
      'no_actionable_findings',
    )
    expect(tryDeriveLongPacketMapperSafetyFloor(outcomeWith([historical])).kind).toBe(
      'no_actionable_findings',
    )
  })

  it('reports a missing result as unusable rather than throwing', () => {
    const outcome = { branch: 'clinical_mapper', chunkId: 'c', result: null } as unknown as LongPacketMapperBranchOutcome
    expect(tryDeriveLongPacketMapperSafetyFloor(outcome).kind).toBe('unusable_outcome')
  })

  it('still THROWS on a genuine defect — malformed facts must not look clean', () => {
    // A caller that swallows this would hide a real bug. `facts` not being an
    // array is a defect, not a benign empty chunk.
    const malformed = outcomeWith(undefined as unknown as unknown[])
    expect(() => tryDeriveLongPacketMapperSafetyFloor(malformed)).toThrow()
  })
})

describe('throwing form keeps its fail-closed contract', () => {
  it('returns the safety result when there is something to escalate', () => {
    const result = deriveLongPacketMapperSafetyFloor(outcomeWith([ACTIONABLE_RED_FLAG]))
    expect(result.carePathway).toBe('same_day_clinician_review')
  })

  it('throws for a clean chunk, exactly as before the refactor', () => {
    // Validation paths rely on this: a persisted projection claiming a mapper
    // floor it cannot reproduce must fail closed, never return empty.
    expect(() => deriveLongPacketMapperSafetyFloor(outcomeWith([]))).toThrow()
  })

  it('throws for a missing result, exactly as before the refactor', () => {
    const outcome = { branch: 'clinical_mapper', chunkId: 'c', result: null } as unknown as LongPacketMapperBranchOutcome
    expect(() => deriveLongPacketMapperSafetyFloor(outcome)).toThrow()
  })
})
