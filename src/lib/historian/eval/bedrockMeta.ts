/**
 * Thin metadata wrapper around the shared Bedrock helpers.
 *
 * The evaluator pipeline (finalDifferential.ts) needs to embed provenance —
 * which model actually answered, and how long it took — on every result.
 * Rather than change invokeBedrockClinicalTool / invokeBedrockJSON's
 * signatures (both are used by live, in-production call sites — the
 * historian localizer, triage, etc.), this wraps them and returns the extra
 * metadata alongside the parsed result. Purely additive: the wrapped
 * functions' own behavior, signature, and return shape are untouched.
 */

import {
  invokeBedrockClinicalTool,
  invokeBedrockJSON,
  copyBedrockTokenUsage,
  BEDROCK_MODEL,
  type BedrockClinicalToolOptions,
  type BedrockInvokeOptions,
  type BedrockTokenUsage,
} from '@/lib/bedrock'

export interface BedrockCallMeta<T> {
  /** The parsed clinical result (tool input, or parsed JSON body). */
  result: T
  /** Token usage for this call — only the fields the model actually returned. */
  usage: BedrockTokenUsage
  /** Wall-clock time for the call, in milliseconds. */
  latencyMs: number
  /** The model id actually invoked (opts.model override, or the shared default). */
  modelId: string
}

async function withMeta<T>(
  modelId: string,
  invoke: () => Promise<{ parsed: T } & BedrockTokenUsage>,
): Promise<BedrockCallMeta<T>> {
  const start = Date.now()
  const { parsed, ...usage } = await invoke()
  return {
    result: parsed,
    usage: copyBedrockTokenUsage(usage),
    latencyMs: Date.now() - start,
    modelId,
  }
}

/**
 * invokeBedrockClinicalTool + {usage, latencyMs, modelId}. Same fail-closed
 * schema-forced tool-call semantics as the wrapped function — throws
 * ClinicalModelOutputError under the same conditions.
 */
export function invokeBedrockClinicalToolWithMeta<T>(
  opts: BedrockClinicalToolOptions,
): Promise<BedrockCallMeta<T>> {
  return withMeta<T>(opts.model || BEDROCK_MODEL, () =>
    invokeBedrockClinicalTool<T>(opts),
  )
}

/**
 * invokeBedrockJSON + {usage, latencyMs, modelId}. Same parse/repair
 * semantics as the wrapped function.
 */
export function invokeBedrockJSONWithMeta<T>(
  opts: Omit<BedrockInvokeOptions, 'jsonMode'>,
): Promise<BedrockCallMeta<T>> {
  return withMeta<T>(opts.model || BEDROCK_MODEL, () => invokeBedrockJSON<T>(opts))
}
