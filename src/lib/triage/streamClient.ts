/**
 * SSE client for triage / extract endpoints.
 *
 * Endpoints behind Amplify Hosting Compute can't return a buffered
 * response that takes longer than ~28s — CloudFront 504s before the
 * function finishes. The triage Bedrock call regularly exceeds that.
 * The endpoints stream `text/event-stream` so bytes flow within the
 * first second and a heartbeat keeps the connection alive; this
 * helper consumes the stream and resolves with the final result.
 *
 * Wire format (server-side):
 *   event: progress\ndata: {...}\n\n   ← optional status pings
 *   : heartbeat <ts>\n\n              ← anti-timeout comments
 *   event: result\ndata: {...}\n\n    ← terminal success
 *   event: error\ndata: {error: ""}\n\n  ← terminal failure
 *
 * Input-validation errors (400) still come back as plain JSON; this
 * helper handles both content types so callers don't need to branch.
 */

async function parseSSEorJSON<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') ?? ''

  if (!contentType.includes('text/event-stream')) {
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const msg = (data as { error?: string })?.error ?? `Request failed (${res.status})`
      throw new Error(msg)
    }
    return (await res.json()) as T
  }

  if (!res.body) throw new Error('No response body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      let idx: number
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        if (!block || block.startsWith(':')) continue

        let eventName = 'message'
        let dataStr = ''
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim()
          else if (line.startsWith('data:')) dataStr += line.slice(5).trimStart()
        }
        if (!dataStr) continue

        let data: unknown
        try {
          data = JSON.parse(dataStr)
        } catch {
          continue
        }

        if (eventName === 'result') return data as T
        if (eventName === 'error') {
          const msg = (data as { error?: string })?.error ?? 'Request failed'
          throw new Error(msg)
        }
        // 'progress' and other event names are intentionally ignored
      }
    }
  } finally {
    reader.releaseLock?.()
  }

  throw new Error('Stream ended without result')
}

export async function streamPostJSON<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  return parseSSEorJSON<T>(res)
}

export async function streamPostFormData<T>(
  url: string,
  formData: FormData,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, { method: 'POST', body: formData, signal })
  return parseSSEorJSON<T>(res)
}
