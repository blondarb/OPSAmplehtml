import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeBedrockMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/bedrock', () => ({
  invokeBedrock: invokeBedrockMock,
}))

import { POST } from '../route'

describe('patient report trust boundary', () => {
  beforeEach(() => {
    invokeBedrockMock.mockReset()
  })

  it('keeps a v3 summary unavailable instead of regenerating prose from model draft fields', async () => {
    const response = await POST(new Request('http://localhost/api/ai/historian/patient-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredOutput: {
          interview_mode: 'comprehensive',
          interview_prompt_version: 'comprehensive-v3',
          current_medications: 'tirzepatide — amount: 5 mg; schedule: weekly',
          hpi: 'Untrusted draft says trazodone.',
        },
        transcript: [
          { role: 'user', text: 'Synthetic medication statement.', timestamp: 1, seq: 1 },
        ],
      }),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      patientReport: '',
      unavailable: true,
    })
    expect(invokeBedrockMock).not.toHaveBeenCalled()
  })
})
