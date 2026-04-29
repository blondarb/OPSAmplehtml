/**
 * Shared AWS Bedrock utility for invoking Claude models and querying Knowledge Bases.
 *
 * All non-Realtime AI calls route through these helpers so that
 * model IDs, region, and response parsing live in one place.
 *
 * Exports:
 *   - invokeBedrock()      — raw text generation
 *   - invokeBedrockJSON()  — JSON-mode generation with parse + repair
 *   - retrieveFromKB()     — Evidence Engine Knowledge Base retrieval
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime'
import {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommand,
  type RetrieveAndGenerateCommandInput,
} from '@aws-sdk/client-bedrock-agent-runtime'

// ── Model IDs ────────────────────────────────────────────────────────
// Every caller can just import BEDROCK_MODEL.
export const BEDROCK_MODEL = 'us.anthropic.claude-sonnet-4-6'

// ── Client singleton ─────────────────────────────────────────────────
let _client: BedrockRuntimeClient | null = null

function getClient(): BedrockRuntimeClient {
  if (!_client) {
    const region = process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-2'
    const accessKeyId = process.env.BEDROCK_ACCESS_KEY_ID
    const secretAccessKey = process.env.BEDROCK_SECRET_ACCESS_KEY

    const config: Record<string, unknown> = { region }
    if (accessKeyId && secretAccessKey) {
      const sessionToken = process.env.AWS_SESSION_TOKEN
      config.credentials = sessionToken
        ? { accessKeyId, secretAccessKey, sessionToken }
        : { accessKeyId, secretAccessKey }
    }
    _client = new BedrockRuntimeClient(config)
  }
  return _client
}

// ── Types ────────────────────────────────────────────────────────────

export interface BedrockMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface BedrockInvokeOptions {
  /** System prompt — passed as a top-level `system` string to Claude. */
  system: string
  /** Conversation messages (user/assistant only — no "system" role). */
  messages: BedrockMessage[]
  /** Maximum tokens to generate. Default 2000. */
  maxTokens?: number
  /** Sampling temperature. Default 0.2. */
  temperature?: number
  /**
   * When true, " Respond with ONLY valid JSON, no markdown." is appended
   * to the system prompt. Use this as a replacement for OpenAI's
   * `response_format: { type: 'json_object' }`.
   */
  jsonMode?: boolean
  /** AbortSignal for timeout control. */
  signal?: AbortSignal
  /** Override the default model ID for this call. */
  model?: string
}

export interface BedrockResponse {
  /** The raw text content returned by the model. */
  text: string
  /** The stop reason (e.g. "end_turn", "max_tokens"). */
  stopReason: string
  /** Input token count (if returned by the model). */
  inputTokens?: number
  /** Output token count (if returned by the model). */
  outputTokens?: number
}

// ── Core invoke function ─────────────────────────────────────────────

/**
 * Invoke a Bedrock Claude model and return the text response.
 *
 * Throws on network/auth errors. Callers should wrap in try/catch.
 */
export async function invokeBedrock(
  opts: BedrockInvokeOptions
): Promise<BedrockResponse> {
  const client = getClient()

  let systemPrompt = opts.system
  if (opts.jsonMode) {
    systemPrompt += '\n\nRespond with ONLY valid JSON. Do not wrap in markdown code blocks.'
  }

  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: opts.maxTokens ?? 2000,
    system: systemPrompt,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
  })

  const command = new InvokeModelCommand({
    modelId: opts.model || BEDROCK_MODEL,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(body),
  })

  const response = await client.send(command, {
    abortSignal: opts.signal,
  })

  const decoded = JSON.parse(new TextDecoder().decode(response.body))

  return {
    text: decoded.content?.[0]?.text ?? '',
    stopReason: decoded.stop_reason ?? 'unknown',
    inputTokens: decoded.usage?.input_tokens,
    outputTokens: decoded.usage?.output_tokens,
  }
}

// ── JSON repair for truncated responses ──────────────────────────────

/**
 * Attempt to repair truncated JSON from a model that hit max_tokens.
 *
 * Strategy: walk the string tracking open braces/brackets/strings,
 * then close everything that was left open.
 */
function repairTruncatedJSON(text: string): string {
  let inString = false
  let escaped = false
  const stack: ('{' | '[')[] = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (ch === '\\' && inString) {
      escaped = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (ch === '{') stack.push('{')
    else if (ch === '[') stack.push('[')
    else if (ch === '}' && stack.length && stack[stack.length - 1] === '{') stack.pop()
    else if (ch === ']' && stack.length && stack[stack.length - 1] === '[') stack.pop()
  }

  let repaired = text

  // Close an unterminated string
  if (inString) repaired += '"'

  // If we ended mid-value after a colon or comma, add null to make it valid
  const trimmed = repaired.trimEnd()
  const lastChar = trimmed[trimmed.length - 1]
  if (lastChar === ':' || lastChar === ',') {
    repaired = trimmed.slice(0, -1)
  }

  // Close all open brackets/braces in reverse order
  while (stack.length) {
    const open = stack.pop()
    repaired += open === '{' ? '}' : ']'
  }

  return repaired
}

// ── Convenience: invoke and parse JSON ───────────────────────────────

/**
 * Invoke Bedrock with JSON mode and parse the response as JSON.
 *
 * If the model hits max_tokens and returns truncated JSON, this will
 * attempt to repair it before throwing.
 */
export async function invokeBedrockJSON<T = Record<string, unknown>>(
  opts: Omit<BedrockInvokeOptions, 'jsonMode'>
): Promise<{ parsed: T; raw: string; stopReason: string; inputTokens?: number; outputTokens?: number }> {
  const result = await invokeBedrock({ ...opts, jsonMode: true })

  // Strip markdown code fences if the model wraps the JSON anyway
  let cleaned = result.text.trim()
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7)
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3)
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3)
  cleaned = cleaned.trim()

  const tokenInfo = { inputTokens: result.inputTokens, outputTokens: result.outputTokens }

  // Try direct parse first
  try {
    const parsed = JSON.parse(cleaned) as T
    return { parsed, raw: result.text, stopReason: result.stopReason, ...tokenInfo }
  } catch {
    // If the response was truncated (hit token limit), attempt repair
    if (result.stopReason === 'max_tokens') {
      console.warn(
        `[bedrock] Response truncated (max_tokens). Attempting JSON repair. ` +
        `Output tokens: ${result.outputTokens}, max requested: ${opts.maxTokens ?? 2000}`
      )
      const repaired = repairTruncatedJSON(cleaned)
      try {
        const parsed = JSON.parse(repaired) as T
        return { parsed, raw: result.text, stopReason: result.stopReason, ...tokenInfo }
      } catch (repairErr) {
        throw new Error(
          `AI response was truncated at ${opts.maxTokens ?? 2000} tokens and could not be repaired. ` +
          `Try again with a shorter document.`
        )
      }
    }
    // Not a truncation issue — re-throw the original parse error
    throw new Error(
      `Invalid JSON in AI response: ${cleaned.slice(0, 200)}...`
    )
  }
}

// ── Streaming invoke for long-running calls behind a 28s gateway ─────
//
// Amplify Hosting Compute caps buffered responses at ~28s (CloudFront
// read timeout). For Bedrock calls that can exceed that — triage,
// extraction — we stream the model response. Bytes start flowing
// within a second, so the gateway never times out, and we can
// optionally surface progress via the onChunk callback.
//
// The JSON parse + repair logic mirrors invokeBedrockJSON.

export async function invokeBedrockJSONStreaming<T = Record<string, unknown>>(
  opts: Omit<BedrockInvokeOptions, 'jsonMode'> & { onChunk?: (textSoFar: string) => void }
): Promise<{ parsed: T; raw: string; stopReason: string; inputTokens?: number; outputTokens?: number }> {
  const client = getClient()

  const systemPrompt =
    opts.system + '\n\nRespond with ONLY valid JSON. Do not wrap in markdown code blocks.'

  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: opts.maxTokens ?? 2000,
    system: systemPrompt,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
  })

  const command = new InvokeModelWithResponseStreamCommand({
    modelId: opts.model || BEDROCK_MODEL,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(body),
  })

  const response = await client.send(command, { abortSignal: opts.signal })
  if (!response.body) throw new Error('Bedrock streaming response had no body')

  let text = ''
  let stopReason = 'unknown'
  let inputTokens: number | undefined
  let outputTokens: number | undefined
  const decoder = new TextDecoder()

  for await (const event of response.body) {
    if (opts.signal?.aborted) {
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    }
    if (!event.chunk?.bytes) continue

    const decoded = JSON.parse(decoder.decode(event.chunk.bytes)) as {
      type?: string
      delta?: { type?: string; text?: string; stop_reason?: string }
      message?: { usage?: { input_tokens?: number } }
      usage?: { output_tokens?: number }
    }

    switch (decoded.type) {
      case 'message_start':
        if (decoded.message?.usage?.input_tokens !== undefined) {
          inputTokens = decoded.message.usage.input_tokens
        }
        break
      case 'content_block_delta':
        if (decoded.delta?.type === 'text_delta' && decoded.delta.text) {
          text += decoded.delta.text
          opts.onChunk?.(text)
        }
        break
      case 'message_delta':
        if (decoded.delta?.stop_reason) stopReason = decoded.delta.stop_reason
        if (decoded.usage?.output_tokens !== undefined) {
          outputTokens = decoded.usage.output_tokens
        }
        break
    }
  }

  // Strip markdown fences if the model wraps despite instructions
  let cleaned = text.trim()
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7)
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3)
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3)
  cleaned = cleaned.trim()

  const tokenInfo = { inputTokens, outputTokens }

  try {
    const parsed = JSON.parse(cleaned) as T
    return { parsed, raw: text, stopReason, ...tokenInfo }
  } catch {
    if (stopReason === 'max_tokens') {
      console.warn(
        `[bedrock] Streaming response truncated (max_tokens). Attempting JSON repair. ` +
        `Output tokens: ${outputTokens}, max requested: ${opts.maxTokens ?? 2000}`
      )
      const repaired = repairTruncatedJSON(cleaned)
      try {
        const parsed = JSON.parse(repaired) as T
        return { parsed, raw: text, stopReason, ...tokenInfo }
      } catch {
        throw new Error(
          `AI response was truncated at ${opts.maxTokens ?? 2000} tokens and could not be repaired. ` +
          `Try again with a shorter document.`
        )
      }
    }
    throw new Error(`Invalid JSON in AI response: ${cleaned.slice(0, 200)}...`)
  }
}

// ── Bedrock Agent Runtime (Knowledge Base) ────────────────────────────────────

let _agentClient: BedrockAgentRuntimeClient | null = null

function getAgentClient(): BedrockAgentRuntimeClient {
  if (!_agentClient) {
    const region = process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-2'
    const accessKeyId = process.env.BEDROCK_ACCESS_KEY_ID
    const secretAccessKey = process.env.BEDROCK_SECRET_ACCESS_KEY

    const config: Record<string, unknown> = { region }
    if (accessKeyId && secretAccessKey) {
      const sessionToken = process.env.AWS_SESSION_TOKEN
      config.credentials = sessionToken
        ? { accessKeyId, secretAccessKey, sessionToken }
        : { accessKeyId, secretAccessKey }
    }
    _agentClient = new BedrockAgentRuntimeClient(config)
  }
  return _agentClient
}

export interface KBRetrievalOptions {
  /** The Bedrock Knowledge Base ID (BEDROCK_KB_ID env var). */
  knowledgeBaseId: string
  /** Natural-language query to retrieve relevant guideline content for. */
  query: string
  /** Model to use for the RetrieveAndGenerate generation step. Defaults to Claude Sonnet 4.6. */
  modelArn?: string
  /** Number of KB results to retrieve. Defaults to 5. */
  numberOfResults?: number
  /** AbortSignal for timeout control. */
  signal?: AbortSignal
}

export interface KBRetrievalResult {
  /** Generated answer synthesized from the retrieved KB chunks. */
  generatedText: string
  /** Source document citations from the KB. */
  citations: Array<{
    text: string
    sourceUri?: string
    documentTitle?: string
  }>
}

/**
 * Query the Bedrock Evidence Engine Knowledge Base using RetrieveAndGenerate.
 *
 * Sends a natural-language query, retrieves relevant guideline chunks from
 * OpenSearch Serverless, and generates a grounded clinical response. Returns
 * both the generated answer and the source citations for auditability.
 *
 * Throws on network/auth/KB errors. Callers should wrap in try/catch.
 */
export async function retrieveFromKB(
  opts: KBRetrievalOptions
): Promise<KBRetrievalResult> {
  const client = getAgentClient()

  const region = process.env.BEDROCK_REGION || 'us-east-2'
  const modelArn =
    opts.modelArn ??
    `arn:aws:bedrock:${region}::foundation-model/us.anthropic.claude-sonnet-4-6`

  const input: RetrieveAndGenerateCommandInput = {
    input: { text: opts.query },
    retrieveAndGenerateConfiguration: {
      type: 'KNOWLEDGE_BASE',
      knowledgeBaseConfiguration: {
        knowledgeBaseId: opts.knowledgeBaseId,
        modelArn,
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            numberOfResults: opts.numberOfResults ?? 5,
          },
        },
      },
    },
  }

  const command = new RetrieveAndGenerateCommand(input)
  const response = await client.send(command, {
    abortSignal: opts.signal,
  })

  const generatedText = response.output?.text ?? ''

  const citations = (response.citations ?? []).flatMap((citation) =>
    (citation.retrievedReferences ?? []).map((ref) => ({
      text: ref.content?.text ?? '',
      sourceUri: ref.location?.s3Location?.uri,
      documentTitle: ref.metadata?.['x-amz-bedrock-kb-source-uri'] as string | undefined,
    }))
  )

  return { generatedText, citations }
}
