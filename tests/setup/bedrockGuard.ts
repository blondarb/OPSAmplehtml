/**
 * Vitest setup — no test may reach a live Bedrock endpoint.
 *
 * Why: production code falls back to a real model call whenever a test forgets
 * to stub a hook. Example: `runLongPacketModelPipeline` without
 * `reduceNarrative` → `runLongPacketNarrativeReducer` →
 * `invokeBedrockClinicalTool` → `BedrockRuntimeClient.send`. The pipeline's
 * `catch` swallows the AWS error as `narrative_reducer_failed`, so the test
 * still PASSES — it just spends 2–4 s in the SDK credential chain, or, when
 * credentials are present, makes a real metered call from a unit test.
 *
 * This file turns that into a hard failure:
 *   1. `send()` on either Bedrock runtime client rejects immediately, so
 *      nothing leaves the process; and
 *   2. an `afterEach` hook fails the test that triggered it — even when the
 *      rejection was swallowed — with the stack of the offending call.
 *
 * Tests that `vi.mock('@/lib/bedrock')` or mock the SDK module themselves are
 * unaffected: a test-file `vi.mock` for the same specifier takes precedence.
 *
 * Deliberate live runs are opt-in and follow the repo's existing live-gate
 * convention (tests/historian-eval/*.gate.test.ts use
 * `it.skipIf(!process.env.HISTORIAN_EVAL_LIVE)`):
 *   HISTORIAN_EVAL_LIVE=1 AWS_PROFILE=sevaro-sandbox npx vitest run tests/historian-eval/<x>.gate.test.ts
 *   VITEST_ALLOW_LIVE_BEDROCK=1 npx vitest run …      (generic, any other deliberate live run)
 */
import { afterEach, vi } from 'vitest'

const { guardClient, drainViolations } = vi.hoisted(() => {
  const allowLive =
    Boolean(process.env.HISTORIAN_EVAL_LIVE) ||
    process.env.VITEST_ALLOW_LIVE_BEDROCK === '1'
  const violations: Error[] = []

  // Mixin constraint: TS requires `any[]` rest args on a class-expression base,
  // and `send` must be declared as a METHOD so the subclass may override it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type ClientCtor = new (...args: any[]) => { send(...args: any[]): any }

  function guardClient<T extends ClientCtor>(Base: T, clientName: string): T {
    if (allowLive) return Base
    const Guarded = class extends Base {
      // Promise form only — this repo never uses the SDK callback form.
      send(...args: unknown[]): Promise<never> {
        const command = args[0] as { constructor?: { name?: string } } | undefined
        const commandName = command?.constructor?.name ?? 'UnknownCommand'
        const error = new Error(
          `${clientName}.send(${commandName}) reached the live AWS SDK inside a vitest run. ` +
            'Stub the model hook the code under test falls back to (e.g. pass ' +
            '`reduceNarrative` to runLongPacketModelPipeline) or vi.mock("@/lib/bedrock"). ' +
            'Deliberate live gates opt in with HISTORIAN_EVAL_LIVE=1 (historian *.gate tests) ' +
            'or VITEST_ALLOW_LIVE_BEDROCK=1.',
        )
        error.name = 'LiveBedrockInTestError'
        violations.push(error)
        return Promise.reject(error)
      }
    }
    Object.defineProperty(Guarded, 'name', { value: Base.name })
    return Guarded
  }

  function drainViolations(): Error[] {
    return violations.splice(0, violations.length)
  }

  return { guardClient, drainViolations }
})

vi.mock('@aws-sdk/client-bedrock-runtime', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@aws-sdk/client-bedrock-runtime')>()
  return {
    ...actual,
    BedrockRuntimeClient: guardClient(
      actual.BedrockRuntimeClient,
      'BedrockRuntimeClient',
    ),
  }
})

vi.mock('@aws-sdk/client-bedrock-agent-runtime', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@aws-sdk/client-bedrock-agent-runtime')>()
  return {
    ...actual,
    BedrockAgentRuntimeClient: guardClient(
      actual.BedrockAgentRuntimeClient,
      'BedrockAgentRuntimeClient',
    ),
  }
})

afterEach(() => {
  const violations = drainViolations()
  if (violations.length === 0) return
  const [first] = violations
  throw new Error(
    `${violations.length} live Bedrock call(s) were attempted (and blocked) during this test.\n` +
      `First: ${first.stack ?? first.message}`,
  )
})
