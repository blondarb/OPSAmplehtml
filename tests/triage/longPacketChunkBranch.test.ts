import { beforeEach, describe, expect, it, vi } from 'vitest'

const { clinicalMapperMock, safetyExtractorMock } = vi.hoisted(() => ({
  clinicalMapperMock: vi.fn(),
  safetyExtractorMock: vi.fn(),
}))

vi.mock('@/lib/triage/longPacketClinicalMapper', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/triage/longPacketClinicalMapper')
  >()
  return {
    ...actual,
    runLongPacketClinicalMapper: clinicalMapperMock,
  }
})

vi.mock('@/lib/triage/modelSafetyExtractor', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/triage/modelSafetyExtractor')
  >()
  return {
    ...actual,
    runModelSafetyExtractor: safetyExtractorMock,
  }
})

import type { LongPacketChunkClinicalMap } from '@/lib/triage/longPacketClinicalMapper'
import {
  LongPacketChunkBranchError,
  runLongPacketChunkBranch,
} from '@/lib/triage/longPacketModelPipeline'
import {
  planLongPacketChunks,
  type LongPacketChunk,
  type LongPacketSourceDocument,
} from '@/lib/triage/longPacketPlanner'
import { validateModelSafetyExtraction } from '@/lib/triage/modelSafetyExtraction'
import { ClinicalModelTimeoutError } from '@/lib/triage/modelTimeout'

function packetWithPages(pageTexts: string[]) {
  const documents: LongPacketSourceDocument[] = [
    {
      packetId: 'packet-branch-runner',
      expectedDocumentCount: 1,
      documentId: 'document-branch-runner',
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
  return {
    documents,
    plan: planLongPacketChunks(documents, {
      maxChunkCharacters: 500,
      overlapCharacters: 20,
    }),
  }
}

function emptyMap(chunk: LongPacketChunk): LongPacketChunkClinicalMap {
  return {
    chunkId: chunk.id,
    chunkProvenanceSha256: chunk.provenanceSha256,
    sourceCharacterCount: chunk.text.length,
    coverageStatus: 'complete',
    facts: [],
    conflicts: [],
  }
}

describe('runLongPacketChunkBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('executes exactly the mapper branch and returns the existing canonical mapper outcome', async () => {
    const { plan } = packetWithPages(['Stable synthetic neurology history.'])
    const chunk = plan.chunks[0]
    const mapped = emptyMap(chunk)
    clinicalMapperMock.mockResolvedValue(mapped)
    const controller = new AbortController()

    await expect(
      runLongPacketChunkBranch(chunk, 'mapper', controller.signal),
    ).resolves.toEqual({
      branch: 'clinical_mapper',
      chunkId: chunk.id,
      chunkProvenanceSha256: chunk.provenanceSha256,
      status: 'completed',
      result: mapped,
      failureCode: null,
    })
    expect(clinicalMapperMock).toHaveBeenCalledWith(chunk, {
      signal: controller.signal,
    })
    expect(safetyExtractorMock).not.toHaveBeenCalled()
  })

  it('forwards the exact persisted mapper model instead of resolving the current registry', async () => {
    const { plan } = packetWithPages(['Stable synthetic neurology history.'])
    const chunk = plan.chunks[0]
    const mapped = emptyMap(chunk)
    const controller = new AbortController()
    const persistedModel = 'persisted.mapper-model:2026-07-11'
    clinicalMapperMock.mockResolvedValue(mapped)

    await expect(
      runLongPacketChunkBranch(chunk, 'mapper', {
        signal: controller.signal,
        model: persistedModel,
      }),
    ).resolves.toMatchObject({
      branch: 'clinical_mapper',
      status: 'completed',
    })
    expect(clinicalMapperMock).toHaveBeenCalledWith(chunk, {
      signal: controller.signal,
      model: persistedModel,
    })
    expect(safetyExtractorMock).not.toHaveBeenCalled()
  })

  it('executes exactly the safety branch and maps repeated local evidence to the correct source page', async () => {
    const repeated = 'The patient reports sudden monocular vision loss today.'
    const { documents, plan } = packetWithPages([repeated, repeated])
    expect(plan.chunks).toHaveLength(1)
    const chunk = plan.chunks[0]
    safetyExtractorMock.mockResolvedValue(
      validateModelSafetyExtraction(
        {
          care_pathway: 'emergency_now',
          data_quality: 'sufficient',
          critical_unknowns: [],
          signals: [
            {
              code: 'acute_vision_loss',
              syndrome: 'acute_vision_threat',
              assertion: 'present',
              temporality: 'current',
              experiencer: 'patient',
              action: 'emergency_now',
              evidence: [{ quote: repeated, occurrence_index: 1 }],
            },
          ],
        },
        chunk.text,
      ),
    )
    const controller = new AbortController()
    const persistedModel = 'persisted.safety-model:2026-07-11'

    const outcome = await runLongPacketChunkBranch(
      chunk,
      'safety',
      {
        signal: controller.signal,
        model: persistedModel,
      },
    )

    expect(outcome.branch).toBe('safety_extractor')
    expect(outcome.status).toBe('completed')
    const evidence = outcome.result?.signals[0].evidence[0]
    expect(evidence).toMatchObject({
      packetId: chunk.packetId,
      documentId: chunk.documentId,
      pageNumber: 2,
      startOffset: 0,
      endOffset: repeated.length,
      quote: repeated,
      extractionMethod: 'native_text',
      extractionConfidence: null,
    })
    expect(
      documents[0].pages[1].text.slice(
        evidence?.startOffset,
        evidence?.endOffset,
      ),
    ).toBe(repeated)
    expect(safetyExtractorMock).toHaveBeenCalledWith(chunk.text, {
      signal: controller.signal,
      model: persistedModel,
    })
    expect(clinicalMapperMock).not.toHaveBeenCalled()
  })

  it('forwards cancellation to the model and propagates the exact abort reason for durable retry handling', async () => {
    const { plan } = packetWithPages(['Stable synthetic neurology history.'])
    const chunk = plan.chunks[0]
    const controller = new AbortController()
    const abortReason = new DOMException('Worker lease cancelled', 'AbortError')
    clinicalMapperMock.mockImplementation(
      async (_chunk: LongPacketChunk, options: { signal?: AbortSignal }) => {
        expect(options.signal).toBe(controller.signal)
        controller.abort(abortReason)
        options.signal?.throwIfAborted()
        return emptyMap(chunk)
      },
    )

    await expect(
      runLongPacketChunkBranch(chunk, 'mapper', controller.signal),
    ).rejects.toBe(abortReason)
    expect(safetyExtractorMock).not.toHaveBeenCalled()
  })

  it('propagates the clinical-model timeout unchanged so a queue worker can retry it', async () => {
    const { plan } = packetWithPages(['Stable synthetic neurology history.'])
    const chunk = plan.chunks[0]
    const timeout = new ClinicalModelTimeoutError(
      'long_packet_safety',
      15_000,
    )
    safetyExtractorMock.mockRejectedValue(timeout)

    await expect(
      runLongPacketChunkBranch(chunk, 'safety'),
    ).rejects.toBe(timeout)
    expect(clinicalMapperMock).not.toHaveBeenCalled()
  })

  it('fails closed before model invocation for an invalid durable branch', async () => {
    const { plan } = packetWithPages(['Stable synthetic neurology history.'])
    const chunk = plan.chunks[0]

    await expect(
      runLongPacketChunkBranch(
        chunk,
        'not-a-real-branch' as 'mapper',
      ),
    ).rejects.toMatchObject({
      name: 'LongPacketChunkBranchError',
      code: 'invalid_branch',
    })
    await expect(
      runLongPacketChunkBranch(
        chunk,
        'not-a-real-branch' as 'mapper',
      ),
    ).rejects.toBeInstanceOf(LongPacketChunkBranchError)
    expect(clinicalMapperMock).not.toHaveBeenCalled()
    expect(safetyExtractorMock).not.toHaveBeenCalled()
  })

  it('fails closed instead of falling back to the registry when a persisted model binding is blank', async () => {
    const { plan } = packetWithPages(['Stable synthetic neurology history.'])
    const chunk = plan.chunks[0]

    await expect(
      runLongPacketChunkBranch(chunk, 'mapper', { model: '   ' }),
    ).rejects.toMatchObject({
      name: 'LongPacketChunkBranchError',
      code: 'invalid_model',
    })
    expect(clinicalMapperMock).not.toHaveBeenCalled()
    expect(safetyExtractorMock).not.toHaveBeenCalled()
  })

  it('returns a branch-specific failed outcome without model invocation for tampered chunk provenance', async () => {
    const { plan } = packetWithPages(['Stable synthetic neurology history.'])
    const chunk = plan.chunks[0]
    const tampered = { ...chunk, text: `${chunk.text} altered` }

    await expect(
      runLongPacketChunkBranch(tampered, 'mapper'),
    ).resolves.toMatchObject({
      branch: 'clinical_mapper',
      status: 'failed',
      result: null,
      failureCode: 'invalid_chunk_provenance',
    })
    expect(clinicalMapperMock).not.toHaveBeenCalled()
    expect(safetyExtractorMock).not.toHaveBeenCalled()
  })
})
