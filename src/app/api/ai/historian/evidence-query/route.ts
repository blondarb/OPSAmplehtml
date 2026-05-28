import { NextResponse } from 'next/server'
import { retrieveChunksFromKB } from '@/lib/bedrock'
import { getUser } from '@/lib/cognito/server'
import type { QueryEvidenceArgs, QueryEvidenceResponse } from '@/lib/historianTypes'

const TIMEOUT_MS = 5000

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ status: 'error', message: 'unauthorized' }, { status: 401 })
  }

  let body: QueryEvidenceArgs
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ status: 'error', message: 'invalid json' }, { status: 400 })
  }

  if (!body.question || typeof body.question !== 'string') {
    return NextResponse.json(
      { status: 'error', message: 'question is required' },
      { status: 400 },
    )
  }

  const kbId = process.env.BEDROCK_KB_ID
  if (!kbId) {
    return NextResponse.json(
      { status: 'error', message: 'BEDROCK_KB_ID not configured' },
      { status: 500 },
    )
  }

  const timeoutPromise = new Promise<QueryEvidenceResponse>((resolve) =>
    setTimeout(() => resolve({ status: 'timeout', chunks: [] }), TIMEOUT_MS),
  )

  try {
    const queryPromise = retrieveChunksFromKB({
      knowledgeBaseId: kbId,
      query: body.question,
      maxResults: 5,
    }).then(
      (r) => ({ status: 'ok' as const, chunks: r.chunks }),
    )

    const result = await Promise.race([queryPromise, timeoutPromise])
    return NextResponse.json(result, { status: 200 })
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return NextResponse.json<QueryEvidenceResponse>(
        { status: 'timeout', chunks: [] },
        { status: 200 },
      )
    }
    console.error('[evidence-query] error:', err)
    return NextResponse.json<QueryEvidenceResponse>(
      { status: 'error', chunks: [], message: err?.message ?? 'unknown error' },
      { status: 200 },
    )
  }
}
