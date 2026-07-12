import { describe, expect, it } from 'vitest'

import {
  enforceLongPacketEmergencyFloor,
  reduceLongPacketEmergency,
  scanLongPacketEmergency,
} from '@/lib/triage/longPacketEmergency'
import {
  planLongPacketChunks,
  type LongPacketSourceDocument,
} from '@/lib/triage/longPacketPlanner'

function packetWithPages(pageTexts: string[]): LongPacketSourceDocument[] {
  return [
    {
      packetId: 'packet-emergency-test',
      expectedDocumentCount: 1,
      documentId: 'document-referral',
      documentOrder: 1,
      expectedPageCount: pageTexts.length,
      pages: pageTexts.map((text, index) => ({
        pageNumber: index + 1,
        text,
        extractionMethod: 'native_text',
        extractionConfidence: null,
      })),
    },
  ]
}

describe('scanLongPacketEmergency', () => {
  it('scans every chunk and preserves an emergency found only on the final page', () => {
    const pageTexts = Array.from(
      { length: 24 },
      (_, index) =>
        index === 23
          ? 'Addendum today: sudden right facial droop and aphasia began 20 minutes ago.'
          : `Page ${index + 1}: stable chronic symptoms without a new complaint. `.repeat(
              5,
            ),
    )
    const documents = packetWithPages(pageTexts)
    const plan = planLongPacketChunks(documents, {
      maxChunkCharacters: 180,
      overlapCharacters: 24,
    })

    const result = scanLongPacketEmergency(plan)

    expect(result.scannedChunkCount).toBe(plan.chunks.length)
    expect(result.expectedChunkCount).toBe(plan.chunks.length)
    expect(result.carePathway).toBe('emergency_now')
    expect(result.reviewRequirement).toBe('emergency_action')
    const signal = result.signals.find(
      (candidate) => candidate.syndrome === 'acute_cerebrovascular',
    )
    expect(signal).toBeDefined()
    expect(signal?.evidence.some((evidence) => evidence.pageNumber === 24)).toBe(
      true,
    )
    for (const evidence of signal?.evidence ?? []) {
      const page = documents[0].pages[evidence.pageNumber! - 1]
      expect(page.text.slice(evidence.startOffset, evidence.endOffset)).toBe(
        evidence.quote,
      )
    }
  })

  it('detects a phrase split by a chunk boundary because the bounded overlap retains context', () => {
    const prefix = `${'Routine background. '.repeat(4)}Current update: `
    const emergency =
      'sudden right facial droop and aphasia began 20 minutes ago.'
    const documents = packetWithPages([
      `${prefix}${emergency} ${'Additional details. '.repeat(8)}`,
    ])
    const plan = planLongPacketChunks(documents, {
      maxChunkCharacters: prefix.length + 18,
      overlapCharacters: 48,
    })

    expect(plan.chunks[0].text).not.toContain(emergency)
    expect(plan.chunks[1].text).toContain(emergency)
    const result = scanLongPacketEmergency(plan)

    expect(result.carePathway).toBe('emergency_now')
    expect(
      result.signals.some(
        (signal) => signal.syndrome === 'acute_cerebrovascular',
      ),
    ).toBe(true)
  })

  it('maps one boundary-spanning emergency citation back to both source pages', () => {
    const documents = packetWithPages([
      `${'Background. '.repeat(5)}Sudden right facial`,
      `droop and aphasia began 20 minutes ago. ${'Details. '.repeat(8)}`,
    ])
    const plan = planLongPacketChunks(documents, {
      maxChunkCharacters: documents[0].pages[0].text.length + 10,
      overlapCharacters: 40,
    })
    const result = scanLongPacketEmergency(plan)
    const signal = result.signals.find(
      (candidate) => candidate.syndrome === 'acute_cerebrovascular',
    )

    expect(result.carePathway).toBe('emergency_now')
    expect(new Set(signal?.evidence.map((evidence) => evidence.pageNumber))).toEqual(
      new Set([1, 2]),
    )
  })

  it('deduplicates the same source evidence found in overlapping chunks', () => {
    const documents = packetWithPages([
      `${'Context. '.repeat(8)}Sudden right facial droop and aphasia began 20 minutes ago. ${'Tail. '.repeat(30)}`,
    ])
    const plan = planLongPacketChunks(documents, {
      maxChunkCharacters: 180,
      overlapCharacters: 110,
    })
    const result = scanLongPacketEmergency(plan)
    const matchingEvaluations = result.chunkEvaluations.filter((evaluation) =>
      evaluation.gateway.signals.some(
        (signal) => signal.syndrome === 'acute_cerebrovascular',
      ),
    )
    const evidence = result.signals.find(
      (signal) => signal.syndrome === 'acute_cerebrovascular',
    )?.evidence
    const evidenceKeys = evidence?.map(
      (item) =>
        `${item.documentId}:${item.pageNumber}:${item.startOffset}:${item.endOffset}`,
    )

    expect(matchingEvaluations.length).toBeGreaterThan(1)
    expect(new Set(evidenceKeys).size).toBe(evidenceKeys?.length)
  })

  it('orders the dominant present emergency evidence before six earlier uncertain hits', () => {
    const uncertain = Array.from(
      { length: 6 },
      (_, index) =>
        `Possible new aphasia episode ${index + 1} today, but onset and current status are unclear.`,
    ).join(' ')
    const present =
      'The patient developed sudden aphasia and right facial droop 20 minutes ago.'
    const result = scanLongPacketEmergency(
      planLongPacketChunks(packetWithPages([`${uncertain} ${present}`]), {
        maxChunkCharacters: 20_000,
        overlapCharacters: 100,
      }),
    )
    const stroke = result.signals.find(
      (signal) => signal.syndrome === 'acute_cerebrovascular',
    )

    expect(stroke).toMatchObject({
      action: 'emergency_now',
      assertion: 'present',
    })
    expect(stroke?.evidence[0]?.quote).toContain('developed sudden aphasia')
  })

  it('fails closed if a reducer is given fewer results than planned chunks', () => {
    const documents = packetWithPages([
      'Stable chronic symptoms. '.repeat(20),
    ])
    const plan = planLongPacketChunks(documents, {
      maxChunkCharacters: 100,
      overlapCharacters: 20,
    })
    const complete = scanLongPacketEmergency(plan)

    const incomplete = reduceLongPacketEmergency(
      plan,
      complete.chunkEvaluations.slice(0, -1),
    )

    expect(incomplete.status).toBe('failed')
    expect(incomplete.failureCode).toBe('incomplete_chunk_scan')
    expect(incomplete.carePathway).toBe('undetermined')
    expect(incomplete.reviewRequirement).toBe('immediate_clinician_review')
    expect(incomplete.schedulingLocked).toBe(true)
  })

  it('does not let a downstream routine summary erase the raw-packet emergency floor', () => {
    const documents = packetWithPages([
      'Today the patient developed sudden right facial droop and aphasia 20 minutes ago.',
    ])
    const packetResult = scanLongPacketEmergency(
      planLongPacketChunks(documents, {
        maxChunkCharacters: 120,
        overlapCharacters: 20,
      }),
    )

    const final = enforceLongPacketEmergencyFloor(packetResult, {
      carePathway: 'routine_outpatient',
      reviewRequirement: 'none',
      schedulingLocked: false,
    })

    expect(final.carePathway).toBe('emergency_now')
    expect(final.reviewRequirement).toBe('emergency_action')
    expect(final.schedulingLocked).toBe(true)
    expect(final.packetEmergencySignals).toEqual(packetResult.signals)
  })

  it('fails closed before scanning if planned source text is mutated in transit', () => {
    const documents = packetWithPages([
      'Stable chronic symptoms without an acute change. '.repeat(8),
    ])
    const plan = planLongPacketChunks(documents, {
      maxChunkCharacters: 120,
      overlapCharacters: 20,
    })
    plan.chunks[0].text = `X${plan.chunks[0].text.slice(1)}`

    const result = scanLongPacketEmergency(plan)

    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('invalid_chunk_provenance')
    expect(result.carePathway).toBe('undetermined')
    expect(result.schedulingLocked).toBe(true)
    expect(result.scannedChunkCount).toBe(plan.chunks.length)
  })

  it('forces emergency action when a downstream branch escalates with inconsistent review metadata', () => {
    const packetResult = scanLongPacketEmergency(
      planLongPacketChunks(
        packetWithPages(['Stable chronic symptoms without an acute change.']),
        {
          maxChunkCharacters: 120,
          overlapCharacters: 20,
        },
      ),
    )

    const final = enforceLongPacketEmergencyFloor(packetResult, {
      carePathway: 'emergency_now',
      reviewRequirement: 'none',
      schedulingLocked: false,
    })

    expect(final.carePathway).toBe('emergency_now')
    expect(final.reviewRequirement).toBe('emergency_action')
    expect(final.schedulingLocked).toBe(true)
  })
})
