import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@/lib/bedrock', () => ({ invokeBedrockClinicalTool: invokeMock }))

import { runModelSafetyExtractor } from '@/lib/triage/modelSafetyExtractor'

const source = 'The patient developed sudden aphasia 20 minutes ago.'

function response(quote = source) {
  return {
    care_pathway: 'emergency_now',
    data_quality: 'sufficient',
    critical_unknowns: [],
    signals: [
      {
        code: 'acute_aphasia',
        syndrome: 'acute_cerebrovascular',
        assertion: 'present',
        temporality: 'recent',
        experiencer: 'patient',
        action: 'emergency_now',
        evidence: [{ quote, occurrence_index: 0 }],
      },
    ],
  }
}

describe('runModelSafetyExtractor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invokeMock.mockResolvedValue({ parsed: response(), stopReason: 'end_turn' })
  })

  it('uses the dedicated Sonnet 5 safety branch and validates evidence', async () => {
    const result = await runModelSafetyExtractor(source)

    expect(result.carePathway).toBe('emergency_now')
    expect(invokeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'us.anthropic.claude-sonnet-5',
        temperature: 0,
        toolName: 'emit_neurology_safety_result',
      }),
    )
  })

  it('fails closed when model evidence is not present in the source', async () => {
    invokeMock.mockResolvedValue({
      parsed: response('The patient developed a hallucinated deficit.'),
      stopReason: 'end_turn',
    })

    await expect(runModelSafetyExtractor(source)).rejects.toThrow(
      /quote occurrence/,
    )
  })
})
