/**
 * Shared AWS Bedrock utility for invoking Claude models.
 *
 * All non-Realtime AI calls route through these helpers so that
 * model IDs, region, and response parsing live in one place.
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'

// ── Model IDs ────────────────────────────────────────────────────────
// Map legacy OpenAI model names to the single Bedrock model we use.
// Every caller can just import BEDROCK_MODEL.
export const BEDROCK_MODEL = 'anthropic.claude-sonnet-4-5-20251001-v1:0'

// ── Client singleton ─────────────────────────────────────────────────
let _client: BedrockRuntimeClient | null = null

function getClient(): BedrockRuntimeClient {
  if (!_client) {
    const config: Record<string, unknown> = {
      region: process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-2',
    }
    // Amplify blocks AWS_-prefixed env vars, so we use BEDROCK_-prefixed ones
    if (process.env.BEDROCK_ACCESS_KEY_ID && process.env.BEDROCK_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID,
        secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY,
      }
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
    modelId: BEDROCK_MODEL,
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

// ── Convenience: invoke and parse JSON ───────────────────────────────

/**
 * Invoke Bedrock with JSON mode and parse the response as JSON.
 *
 * Throws if the response is not valid JSON.
 */
export async function invokeBedrockJSON<T = Record<string, unknown>>(
  opts: Omit<BedrockInvokeOptions, 'jsonMode'>
): Promise<{ parsed: T; raw: string; stopReason: string }> {
  const result = await invokeBedrock({ ...opts, jsonMode: true })

  // Strip markdown code fences if the model wraps the JSON anyway
  let cleaned = result.text.trim()
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7)
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3)
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3)
  cleaned = cleaned.trim()

  const parsed = JSON.parse(cleaned) as T

  return { parsed, raw: result.text, stopReason: result.stopReason }
}
