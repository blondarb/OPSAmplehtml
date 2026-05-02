/**
 * Client helper for the async + polling triage flow.
 *
 * POST /api/triage and POST /api/triage/extract return 202 + an id.
 * The client then polls GET /api/triage/[id] (or .../extract/[id])
 * until the response includes a terminal status. This helper wraps that
 * pattern so call sites stay simple.
 *
 * Each polled response carries a `status` field:
 *   - 'pending'  — still working; helper waits and re-polls
 *   - 'complete' — terminal success; helper resolves with the full payload
 *   - 'error'    — terminal failure; helper rejects with the error message
 *
 * 4xx responses (input validation) come back as plain JSON without a
 * `status` field — helper rejects with the response's `error` string.
 */

interface PollOptions {
  /** Milliseconds between polls. Default 1500. */
  intervalMs?: number
  /** Maximum number of polls before giving up. Default 80 (~2min at 1.5s). */
  maxAttempts?: number
}

interface PendingResponse {
  status: 'pending'
}

interface ErrorResponse {
  status: 'error'
  error?: string
}

type StartResponse =
  | (PendingResponse & { session_id: string })
  | (PendingResponse & { extraction_id: string })

function getId(start: StartResponse): string {
  if ('session_id' in start) return start.session_id
  if ('extraction_id' in start) return start.extraction_id
  throw new Error('Server did not return an id')
}

async function postStart(
  url: string,
  body: BodyInit | null,
  contentType: string | undefined,
  signal?: AbortSignal,
): Promise<StartResponse> {
  const headers: Record<string, string> = {}
  if (contentType) headers['Content-Type'] = contentType

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal,
  })

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? `Request failed (${res.status})`)
  }

  return (await res.json()) as StartResponse
}

async function pollUntilDone<T>(
  pollUrl: string,
  signal: AbortSignal | undefined,
  options: PollOptions,
): Promise<T> {
  const intervalMs = options.intervalMs ?? 1500
  const maxAttempts = options.maxAttempts ?? 80

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    }

    const res = await fetch(pollUrl, { signal, cache: 'no-store' })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? `Polling failed (${res.status})`)
    }

    const data = (await res.json()) as { status?: string; error?: string } & T

    if (data.status === 'complete') return data
    if (data.status === 'error') {
      throw new Error((data as ErrorResponse).error ?? 'Request failed')
    }

    // 'pending' or undefined — wait and retry
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error('Triage timed out — please try again')
}

export async function postTriage<T>(
  body: unknown,
  signal?: AbortSignal,
  options: PollOptions = {},
): Promise<T> {
  const start = await postStart('/api/triage', JSON.stringify(body), 'application/json', signal)
  const id = getId(start)
  return pollUntilDone<T>(`/api/triage/${id}`, signal, options)
}

export async function postExtractJSON<T>(
  body: unknown,
  signal?: AbortSignal,
  options: PollOptions = {},
): Promise<T> {
  const start = await postStart(
    '/api/triage/extract',
    JSON.stringify(body),
    'application/json',
    signal,
  )
  const id = getId(start)
  return pollUntilDone<T>(`/api/triage/extract/${id}`, signal, options)
}

export async function postExtractFormData<T>(
  formData: FormData,
  signal?: AbortSignal,
  options: PollOptions = {},
): Promise<T> {
  const start = await postStart('/api/triage/extract', formData, undefined, signal)
  const id = getId(start)
  return pollUntilDone<T>(`/api/triage/extract/${id}`, signal, options)
}
