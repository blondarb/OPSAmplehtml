import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQSEvent } from 'aws-lambda'

const { generateFinalDifferentialMock, runThoroughnessJudgeMock, runIndependentMock } = vi.hoisted(() => ({
  generateFinalDifferentialMock: vi.fn(),
  runThoroughnessJudgeMock: vi.fn(),
  runIndependentMock: vi.fn(),
}))

vi.mock('@/lib/historian/eval/finalDifferential', () => ({
  generateFinalDifferential: generateFinalDifferentialMock,
}))
vi.mock('@/lib/historian/eval/thoroughnessJudge', () => ({
  runThoroughnessJudge: runThoroughnessJudgeMock,
}))
vi.mock('@/lib/historian/eval/independentDdx', () => ({
  runIndependentDdxAndAgreement: runIndependentMock,
}))

import { processHistorianEvalEvent } from '@/workers/historianEvalWorker'

const jobId = '11111111-1111-4111-8111-111111111111'
const event = (body: string): SQSEvent => ({
  Records: [{ messageId: 'message-1', body }] as SQSEvent['Records'],
})

const claim = {
  jobId,
  sessionId: '22222222-2222-4222-8222-222222222222',
  tenantId: 'tenant-a',
  leaseToken: '33333333-3333-4333-8333-333333333333',
  attemptCount: 1,
  transcript: [
    { role: 'assistant' as const, text: 'Why were you referred?', timestamp: 0, seq: 0 },
    { role: 'user' as const, text: 'Walking is harder.', timestamp: 1, seq: 1 },
  ],
  chiefComplaint: 'Gait concern',
  structuredOutput: { chief_complaint: 'Gait concern' },
  narrativeSummary: 'Synthetic summary.',
}

describe('durable historian evaluation worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.HISTORIAN_EVAL_QA_AUTORUN
  })

  it('persists the required final differential before completing the durable job', async () => {
    const order: string[] = []
    const service = {
      claim: vi.fn(async () => claim),
      persistFinalDifferential: vi.fn(async () => { order.push('persist') }),
      complete: vi.fn(async () => { order.push('complete') }),
      fail: vi.fn(),
    }
    generateFinalDifferentialMock.mockResolvedValueOnce({
      status: 'ok', differential: [], summary: 'Synthetic', provenance: {}, dropped_quotes: 0,
    })
    runThoroughnessJudgeMock.mockResolvedValueOnce(undefined)
    runIndependentMock.mockResolvedValueOnce(undefined)

    const result = await processHistorianEvalEvent(
      event(JSON.stringify({ v: 1, kind: 'historian_eval', job_id: jobId })),
      service as never,
    )
    expect(result.batchItemFailures).toEqual([])
    expect(order).toEqual(['persist', 'complete'])
    expect(generateFinalDifferentialMock).toHaveBeenCalledWith(claim.transcript, claim.chiefComplaint)
    expect(runThoroughnessJudgeMock).toHaveBeenCalledTimes(1)
    expect(runIndependentMock).toHaveBeenCalledTimes(1)
    expect(service.fail).not.toHaveBeenCalled()
  })

  it('persists a retry decision when required differential generation fails', async () => {
    const service = {
      claim: vi.fn(async () => claim),
      persistFinalDifferential: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(async () => undefined),
    }
    generateFinalDifferentialMock.mockRejectedValueOnce(Object.assign(new Error('provider unavailable'), { name: 'ProviderError' }))

    const result = await processHistorianEvalEvent(
      event(JSON.stringify({ v: 1, kind: 'historian_eval', job_id: jobId })),
      service as never,
    )
    expect(result.batchItemFailures).toEqual([])
    expect(service.fail).toHaveBeenCalledWith(claim, 'ProviderError')
    expect(service.complete).not.toHaveBeenCalled()
  })

  it('acknowledges duplicate delivery when the database says no work is claimable', async () => {
    const service = {
      claim: vi.fn(async () => null),
      persistFinalDifferential: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    }
    const result = await processHistorianEvalEvent(
      event(JSON.stringify({ v: 1, kind: 'historian_eval', job_id: jobId })),
      service as never,
    )
    expect(result.batchItemFailures).toEqual([])
    expect(generateFinalDifferentialMock).not.toHaveBeenCalled()
  })
})
