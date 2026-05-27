import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/bedrock', () => ({
  retrieveChunksFromKB: vi.fn(),
}))
vi.mock('@/lib/cognito/server', () => ({
  getUser: vi.fn(),
}))

import { POST } from '@/app/api/ai/historian/evidence-query/route'
import { retrieveChunksFromKB } from '@/lib/bedrock'
import { getUser } from '@/lib/cognito/server'

const buildReq = (body: any): Request =>
  new Request('http://localhost/api/ai/historian/evidence-query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/ai/historian/evidence-query', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BEDROCK_KB_ID = 'T4W8S8RNMN'
    ;(getUser as any).mockResolvedValue({ email: 'steve@sevaro.com' })
  })

  it('401s when not authenticated', async () => {
    ;(getUser as any).mockResolvedValue(null)
    const res = await POST(buildReq({ question: 'q' }))
    expect(res.status).toBe(401)
  })

  it('400s when question missing', async () => {
    const res = await POST(buildReq({}))
    expect(res.status).toBe(400)
  })

  it('returns chunks on success', async () => {
    ;(retrieveChunksFromKB as any).mockResolvedValue({
      chunks: [{ content: 'thunderclap', source: 's3://x', score: 0.9 }],
    })
    const res = await POST(buildReq({ question: 'migraine red flags' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('ok')
    expect(json.chunks).toHaveLength(1)
  })

  it('returns timeout shape if AbortController fires', async () => {
    ;(retrieveChunksFromKB as any).mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    )
    const res = await POST(buildReq({ question: 'migraine' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('timeout')
    expect(json.chunks).toEqual([])
  })
})
