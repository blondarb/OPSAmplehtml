import { describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/ai/historian/coverage/route'

const request = (body: unknown) => new Request('http://localhost/api/ai/historian/coverage', { method: 'POST', body: JSON.stringify(body) })
const turn = { role: 'assistant', text: 'Hello', timestamp: 0 }
describe('coverage POST (in-process, no network)', () => {
  it('returns deterministic coverage and the 200 shape using the real rubric', async () => {
    const response = await POST(request({ transcript: [turn], chiefComplaint: 'headache' }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Object.keys(body).sort()).toEqual(['checked', 'unmatched'])
    expect(body.checked).toBeGreaterThanOrEqual(4)
    expect(body.unmatched).toHaveLength(3)
    for (const gap of body.unmatched) expect(gap).toEqual({ id: expect.any(String), label: expect.any(String) })
  })
  it.each([null, [], {}, { transcript: 'bad' }, { transcript: [null] },
    { transcript: [{ ...turn, role: 'system' }] }, { transcript: [{ ...turn, text: 2 }] },
    { transcript: [{ role: 'user', text: 'hello' }] }, { transcript: [], chiefComplaint: 3 },
    { transcript: Array(401).fill(turn) }, { transcript: [{ ...turn, text: 'a'.repeat(200_001) }] },
  ])('rejects malformed or oversized bodies: %#', async body => {
    const response = await POST(request(body))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: expect.any(String) })
  })
  it('rejects an oversized content-length before reading the body', async () => {
    const req = new Request('http://localhost', {
      method: 'POST', headers: { 'content-length': '200001' }, body: '{}',
    })
    const read = vi.spyOn(req, 'text')
    expect((await POST(req)).status).toBe(413)
    expect(read).not.toHaveBeenCalled()
  })
  it('retains the actual-body cap when content-length understates the size', async () => {
    const req = new Request('http://localhost', {
      method: 'POST', headers: { 'content-length': '2' },
      body: JSON.stringify({ transcript: [{ ...turn, text: 'a'.repeat(200001) }] }),
    })
    expect((await POST(req)).status).toBe(400)
  })
  it('rejects invalid JSON', async () => {
    expect((await POST(new Request('http://localhost', { method: 'POST', body: '{' }))).status).toBe(400)
  })
  it('accepts 400 turns and an empty transcript', async () => {
    expect((await POST(request({ transcript: Array(400).fill(turn) }))).status).toBe(200)
    expect((await POST(request({ transcript: [] }))).status).toBe(200)
  })
})
