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
} from '@aws-sdk/client-bedrock-runtime'
import {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommand,
  RetrieveCommand,
  type RetrieveAndGenerateCommandInput,
} from '@aws-sdk/client-bedrock-agent-runtime'

// ── Model IDs ────────────────────────────────────────────────────────
// Every caller can just import BEDROCK_MODEL.
export const BEDROCK_MODEL = 'us.anthropic.claude-sonnet-4-6'

// ── Client singleton ─────────────────────────────────────────────────
let _client: BedrockRuntimeClient | null = null

export function buildBedrockClientConfig(
  env: Record<string, string | undefined> = process.env,
): Record<string, unknown> {
  const region = env.BEDROCK_REGION || env.AWS_REGION || 'us-east-2'
  const config: Record<string, unknown> = { region }
  const accessKeyId = env.BEDROCK_ACCESS_KEY_ID
  const secretAccessKey = env.BEDROCK_SECRET_ACCESS_KEY
  if (env.NODE_ENV !== 'production' && accessKeyId && secretAccessKey) {
    config.credentials = env.AWS_SESSION_TOKEN
      ? {
          accessKeyId,
          secretAccessKey,
          sessionToken: env.AWS_SESSION_TOKEN,
        }
      : { accessKeyId, secretAccessKey }
  }
  return config
}

function getClient(): BedrockRuntimeClient {
  if (!_client) {
    // Production must use the SSR/Lambda/ECS execution role's temporary
    // credentials. Static credentials remain a local-development escape hatch
    // only and are never embedded by next.config.ts.
    _client = new BedrockRuntimeClient(buildBedrockClientConfig())
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
  /**
   * When true, the system prompt is sent as a cached content block
   * (`cache_control: ephemeral`) so Bedrock reuses the prefill across calls
   * within the ~5-min TTL. Use for large static system prompts (≥1024 tokens)
   * that are identical call-to-call — e.g. the triage scoring prompt. Cuts
   * time-to-first-token and input cost on repeated back-to-back calls.
   */
  cacheSystem?: boolean
}

export interface BedrockTokenUsage {
  /** Non-cached input tokens. */
  inputTokens?: number
  outputTokens?: number
  cacheWriteInputTokens?: number
  cacheReadInputTokens?: number
  cacheWrite5mInputTokens?: number
  cacheWrite1hInputTokens?: number
}

export interface BedrockResponse extends BedrockTokenUsage {
  /** The raw text content returned by the model. */
  text: string
  /** The stop reason (e.g. "end_turn", "max_tokens"). */
  stopReason: string
}

export function copyBedrockTokenUsage(
  value: BedrockTokenUsage,
): BedrockTokenUsage {
  return {
    ...(value.inputTokens !== undefined
      ? { inputTokens: value.inputTokens }
      : {}),
    ...(value.outputTokens !== undefined
      ? { outputTokens: value.outputTokens }
      : {}),
    ...(value.cacheWriteInputTokens !== undefined
      ? { cacheWriteInputTokens: value.cacheWriteInputTokens }
      : {}),
    ...(value.cacheReadInputTokens !== undefined
      ? { cacheReadInputTokens: value.cacheReadInputTokens }
      : {}),
    ...(value.cacheWrite5mInputTokens !== undefined
      ? { cacheWrite5mInputTokens: value.cacheWrite5mInputTokens }
      : {}),
    ...(value.cacheWrite1hInputTokens !== undefined
      ? { cacheWrite1hInputTokens: value.cacheWrite1hInputTokens }
      : {}),
  }
}

interface AnthropicContentBlock {
  type?: string
  text?: string
  name?: string
  input?: unknown
}

interface AnthropicModelResponse {
  content?: AnthropicContentBlock[]
  stop_reason?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
    cache_creation?: {
      ephemeral_5m_input_tokens?: number
      ephemeral_1h_input_tokens?: number
    }
  }
}

function validTokenCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function parseBedrockTokenUsage(
  usage: AnthropicModelResponse['usage'],
): BedrockTokenUsage {
  if (!usage) return {}
  const parsed: BedrockTokenUsage = {}
  if (validTokenCount(usage.input_tokens)) {
    parsed.inputTokens = usage.input_tokens
  }
  if (validTokenCount(usage.output_tokens)) {
    parsed.outputTokens = usage.output_tokens
  }
  if (validTokenCount(usage.cache_creation_input_tokens)) {
    parsed.cacheWriteInputTokens = usage.cache_creation_input_tokens
  }
  if (validTokenCount(usage.cache_read_input_tokens)) {
    parsed.cacheReadInputTokens = usage.cache_read_input_tokens
  }
  if (validTokenCount(usage.cache_creation?.ephemeral_5m_input_tokens)) {
    parsed.cacheWrite5mInputTokens =
      usage.cache_creation.ephemeral_5m_input_tokens
  }
  if (validTokenCount(usage.cache_creation?.ephemeral_1h_input_tokens)) {
    parsed.cacheWrite1hInputTokens =
      usage.cache_creation.ephemeral_1h_input_tokens
  }
  return parsed
}

function modelOmitsTemperature(modelId: string): boolean {
  return (
    modelId.includes('claude-sonnet-5') ||
    modelId.includes('claude-opus-4-8') ||
    modelId.includes('claude-fable-5')
  )
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

  // Send the system prompt as a cached content block when requested, so Bedrock
  // reuses the prefill across back-to-back calls (ephemeral, ~5-min TTL). Falls
  // back to the plain string form otherwise — identical output either way.
  const systemField = opts.cacheSystem
    ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
    : systemPrompt

  const modelId = opts.model || BEDROCK_MODEL
  // Current Bedrock Sonnet 5 and Opus 4.8 profiles reject `temperature`
  // rather than ignoring it. Keep sampling controls for evaluated legacy
  // profiles while omitting the deprecated field for these reasoning models.
  const omitsTemperature = modelOmitsTemperature(modelId)
  const requestBody = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: opts.maxTokens ?? 2000,
    system: systemField,
    messages: opts.messages,
    ...(!omitsTemperature
      ? { temperature: opts.temperature ?? 0.2 }
      : {}),
  }
  const body = JSON.stringify(requestBody)

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(body),
  })

  const response = await client.send(command, {
    abortSignal: opts.signal,
  })

  const decoded = JSON.parse(
    new TextDecoder().decode(response.body),
  ) as AnthropicModelResponse
  const text = (decoded.content ?? [])
    .filter(
      (block): block is AnthropicContentBlock & { text: string } =>
        (block.type === 'text' || block.type === undefined) &&
        typeof block.text === 'string',
    )
    .map((block) => block.text)
    .join('')

  return {
    text,
    stopReason: decoded.stop_reason ?? 'unknown',
    ...parseBedrockTokenUsage(decoded.usage),
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

export class ClinicalModelOutputError extends Error {
  readonly name = 'ClinicalModelOutputError'

  constructor(
    public readonly code: 'incomplete' | 'malformed',
    public readonly stopReason: string,
    message: string
  ) {
    super(message)
  }
}

export function parseCompleteClinicalJSON<T>(text: string, stopReason: string): T {
  if (stopReason !== 'end_turn') {
    throw new ClinicalModelOutputError(
      'incomplete',
      stopReason,
      `Clinical model output was incomplete (stop reason: ${stopReason}).`
    )
  }

  try {
    return JSON.parse(text.trim()) as T
  } catch {
    throw new ClinicalModelOutputError(
      'malformed',
      stopReason,
      'Clinical model output was not valid JSON.'
    )
  }
}

export async function invokeBedrockClinicalJSON<T>(
  opts: Omit<BedrockInvokeOptions, 'jsonMode'>
): Promise<{
  parsed: T
  raw: string
  stopReason: string
} & BedrockTokenUsage> {
  const result = await invokeBedrock({ ...opts, jsonMode: true })
  const parsed = parseCompleteClinicalJSON<T>(result.text, result.stopReason)

  return {
    parsed,
    raw: result.text,
    stopReason: result.stopReason,
    ...parseBedrockTokenUsage({
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cache_creation_input_tokens: result.cacheWriteInputTokens,
      cache_read_input_tokens: result.cacheReadInputTokens,
      cache_creation: {
        ephemeral_5m_input_tokens: result.cacheWrite5mInputTokens,
        ephemeral_1h_input_tokens: result.cacheWrite1hInputTokens,
      },
    }),
  }
}

export interface BedrockClinicalToolOptions
  extends Omit<BedrockInvokeOptions, 'jsonMode'> {
  toolName: string
  toolDescription: string
  inputSchema: Record<string, unknown>
}

/**
 * Force a single schema-described tool call and treat its input as the
 * structured clinical result. This is the strict path for Bedrock models
 * that lack native structured output and routinely emit thinking blocks or
 * markdown around text JSON. `tool_use` is complete only when exactly one
 * matching tool block is present; every other stop/result shape is rejected.
 */
export async function invokeBedrockClinicalTool<T>(
  opts: BedrockClinicalToolOptions,
): Promise<{
  parsed: T
  raw: string
  stopReason: string
} & BedrockTokenUsage> {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(opts.toolName)) {
    throw new ClinicalModelOutputError(
      'malformed',
      'configuration',
      'Clinical tool name is invalid.',
    )
  }
  if (!opts.toolDescription || opts.toolDescription.length > 1_000) {
    throw new ClinicalModelOutputError(
      'malformed',
      'configuration',
      'Clinical tool description is invalid.',
    )
  }

  const client = getClient()
  const modelId = opts.model || BEDROCK_MODEL
  const systemField = opts.cacheSystem
    ? [
        {
          type: 'text',
          text: opts.system,
          cache_control: { type: 'ephemeral' },
        },
      ]
    : opts.system
  const requestBody = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: opts.maxTokens ?? 2_000,
    system: systemField,
    messages: opts.messages,
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: opts.inputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: opts.toolName },
    ...(!modelOmitsTemperature(modelId)
      ? { temperature: opts.temperature ?? 0.2 }
      : {}),
  }
  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(JSON.stringify(requestBody)),
  })
  const response = await client.send(command, { abortSignal: opts.signal })
  const decoded = JSON.parse(
    new TextDecoder().decode(response.body),
  ) as AnthropicModelResponse
  const stopReason = decoded.stop_reason ?? 'unknown'
  if (stopReason !== 'tool_use') {
    throw new ClinicalModelOutputError(
      'incomplete',
      stopReason,
      `Clinical tool output was incomplete (stop reason: ${stopReason}).`,
    )
  }
  const matchingBlocks = (decoded.content ?? []).filter(
    (block) => block.type === 'tool_use' && block.name === opts.toolName,
  )
  if (
    matchingBlocks.length !== 1 ||
    typeof matchingBlocks[0].input !== 'object' ||
    matchingBlocks[0].input === null ||
    Array.isArray(matchingBlocks[0].input)
  ) {
    throw new ClinicalModelOutputError(
      'malformed',
      stopReason,
      'Clinical tool output did not contain exactly one matching object.',
    )
  }
  const parsed = matchingBlocks[0].input as T
  return {
    parsed,
    raw: JSON.stringify(parsed),
    stopReason,
    ...parseBedrockTokenUsage(decoded.usage),
  }
}

/**
 * Invoke Bedrock with JSON mode and parse the response as JSON.
 *
 * If the model hits max_tokens and returns truncated JSON, this will
 * attempt to repair it before throwing.
 */
export async function invokeBedrockJSON<T = Record<string, unknown>>(
  opts: Omit<BedrockInvokeOptions, 'jsonMode'>
): Promise<{ parsed: T; raw: string; stopReason: string } & BedrockTokenUsage> {
  const result = await invokeBedrock({ ...opts, jsonMode: true })

  // Strip markdown code fences if the model wraps the JSON anyway
  let cleaned = result.text.trim()
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7)
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3)
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3)
  cleaned = cleaned.trim()

  const tokenInfo: BedrockTokenUsage = {
    ...(result.inputTokens !== undefined
      ? { inputTokens: result.inputTokens }
      : {}),
    ...(result.outputTokens !== undefined
      ? { outputTokens: result.outputTokens }
      : {}),
    ...(result.cacheWriteInputTokens !== undefined
      ? { cacheWriteInputTokens: result.cacheWriteInputTokens }
      : {}),
    ...(result.cacheReadInputTokens !== undefined
      ? { cacheReadInputTokens: result.cacheReadInputTokens }
      : {}),
    ...(result.cacheWrite5mInputTokens !== undefined
      ? { cacheWrite5mInputTokens: result.cacheWrite5mInputTokens }
      : {}),
    ...(result.cacheWrite1hInputTokens !== undefined
      ? { cacheWrite1hInputTokens: result.cacheWrite1hInputTokens }
      : {}),
  }

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
      } catch {
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

// ── Bedrock Agent Runtime (Knowledge Base) ────────────────────────────────────

let _agentClient: BedrockAgentRuntimeClient | null = null

function getAgentClient(): BedrockAgentRuntimeClient {
  if (!_agentClient) {
    _agentClient = new BedrockAgentRuntimeClient(buildBedrockClientConfig())
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

// ─── Retrieve-only KB query (no synthesis) ──────────────────────────────────
// Sibling of retrieveFromKB(). Skips the RetrieveAndGenerate step — returns
// raw chunks for the caller to synthesize in-context. ~5× faster than the
// full RetrieveAndGenerate flow because no generation step is invoked.
// Used by the AI Historian's query_evidence tool where latency matters.

export interface KBChunkRetrievalOptions {
  knowledgeBaseId: string
  query: string
  /** Default 5 (matches KB_RESULTS in localizer route for consistency) */
  maxResults?: number
}

export interface KBChunk {
  content: string
  source: string
  score?: number
}

export interface KBChunkRetrievalResult {
  chunks: KBChunk[]
}

export async function retrieveChunksFromKB(
  opts: KBChunkRetrievalOptions,
): Promise<KBChunkRetrievalResult> {
  const region = process.env.BEDROCK_REGION || 'us-east-2'
  const client = new BedrockAgentRuntimeClient({ region })

  const cmd = new RetrieveCommand({
    knowledgeBaseId: opts.knowledgeBaseId,
    retrievalQuery: { text: opts.query },
    retrievalConfiguration: {
      vectorSearchConfiguration: { numberOfResults: opts.maxResults ?? 5 },
    },
  })

  const response = await client.send(cmd)
  const chunks: KBChunk[] = (response.retrievalResults ?? []).map((r) => ({
    content: r.content?.text ?? '',
    source: r.location?.s3Location?.uri ?? r.location?.webLocation?.url ?? 'unknown',
    score: r.score,
  }))

  return { chunks }
}
