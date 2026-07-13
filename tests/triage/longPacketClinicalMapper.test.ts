import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@/lib/bedrock', () => ({ invokeBedrockClinicalTool: invokeMock }))

import {
  runLongPacketClinicalMapper,
  validateLongPacketClinicalMapOutput,
} from '@/lib/triage/longPacketClinicalMapper'
import {
  LONG_PACKET_NARRATIVE_REDUCER_MODEL,
  runLongPacketNarrativeReducer,
} from '@/lib/triage/longPacketModelPipeline'
import { planLongPacketChunks } from '@/lib/triage/longPacketPlanner'

function chunkFixture() {
  const text =
    'Medication: aspirin 81 mg daily. MRI brain was normal. ' +
    'Medication: aspirin 81 mg daily.'
  return planLongPacketChunks(
    [
      {
        packetId: 'packet-mapper',
        expectedDocumentCount: 1,
        documentId: 'document-mapper',
        documentOrder: 1,
        expectedPageCount: 1,
        pages: [
          {
            pageNumber: 1,
            text,
            extractionMethod: 'native_text' as const,
            extractionConfidence: null,
          },
        ],
      },
    ],
    { maxChunkCharacters: 500, overlapCharacters: 20 },
  ).chunks[0]
}

function validRawOutput() {
  const chunk = chunkFixture()
  return {
    chunk_id: chunk.id,
    provenance_sha256: chunk.provenanceSha256,
    source_character_count: chunk.text.length,
    coverage_status: 'complete',
    facts: [
      {
        category: 'medication',
        key: 'aspirin',
        statement: 'aspirin 81 mg daily',
        assertion: 'present',
        temporality: 'current',
        event_date_text: null,
        evidence: [
          {
            quote: 'Medication: aspirin 81 mg daily.',
            occurrence_index: 1,
          },
        ],
      },
    ],
    conflicts: [],
  }
}

describe('long-packet clinical mapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invokeMock.mockResolvedValue({
      parsed: validRawOutput(),
      stopReason: 'tool_use',
    })
  })

  it('uses the configured Haiku 4.5 mapper through the strict forced-tool path', async () => {
    const chunk = chunkFixture()

    const result = await runLongPacketClinicalMapper(chunk)

    expect(result.coverageStatus).toBe('complete')
    expect(result.facts[0].evidence[0]).toMatchObject({
      packetId: 'packet-mapper',
      documentId: 'document-mapper',
      pageNumber: 1,
    })
    expect(invokeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        temperature: 0,
        toolName: 'emit_long_packet_clinical_facts',
      }),
    )
  })

  it('resolves repeated evidence to the exact requested occurrence and page offset', () => {
    const chunk = chunkFixture()

    const result = validateLongPacketClinicalMapOutput(validRawOutput(), chunk)
    const evidence = result.facts[0].evidence[0]

    expect(evidence.startOffset).toBe(
      chunk.text.lastIndexOf('Medication: aspirin 81 mg daily.'),
    )
    expect(chunk.text.slice(evidence.startOffset, evidence.endOffset)).toBe(
      evidence.quote,
    )
  })

  it('rejects a mapper envelope whose chunk provenance was copied or tampered', () => {
    const raw = validRawOutput()
    raw.provenance_sha256 = '0'.repeat(64)

    expect(() =>
      validateLongPacketClinicalMapOutput(raw, chunkFixture()),
    ).toThrow(/provenance/i)
  })

  it('rejects a clinical fact whose evidence is not an exact source span', () => {
    const raw = validRawOutput()
    raw.facts[0].evidence = [
      { quote: 'Hallucinated medication.', occurrence_index: 0 },
    ]

    expect(() =>
      validateLongPacketClinicalMapOutput(raw, chunkFixture()),
    ).toThrow(/evidence/i)
  })

  it('pins narrative-only fusion to Sonnet 4.6 and the strict forced-tool path', async () => {
    invokeMock.mockResolvedValue({
      parsed: {
        narrative: 'Synthetic fused narrative.',
        timelineNarrative: '',
        medicationNarrative: '',
        testNarrative: '',
        functionalNarrative: '',
        conflictNarrative: '',
        preservedSafetyEvidenceIds: ['safety:abc'],
      },
      stopReason: 'tool_use',
    })

    await runLongPacketNarrativeReducer({
      stage: 0,
      units: [],
      fragments: [],
      requiredSafetyEvidenceIds: ['safety:abc'],
    })

    expect(invokeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: LONG_PACKET_NARRATIVE_REDUCER_MODEL,
        temperature: 0,
        toolName: 'emit_long_packet_narrative_fusion',
      }),
    )
  })
})
