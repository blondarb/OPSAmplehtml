/**
 * Pure argument parsing + the localhost safety guard for
 * scripts/historian-synthetic-run.ts (Historian Validation Suite Task 6).
 * Mirrors src/lib/historian/eval/cli.ts's arg-parsing approach — kept as
 * its own small, pure, injection-free module so it stays cheap to unit
 * test. The WS/Bedrock/HTTP orchestration itself lives directly in the
 * script (integration-tested live against a local mock WS server for the
 * client, and a real dev server for the full loop — see the script's own
 * header comment), per the task brief's explicit scoping: "Runtime-
 * injection pattern for testability where practical (mirror Task 5's
 * cli.ts approach for arg parsing; the WS loop itself is integration-
 * tested live, not unit-mocked to death)."
 */

export interface SyntheticDriverOptions {
  persona: string | null
  allPersonas: boolean
  baseUrl: string
  maxTurns: number
  iKnowThisIsNotLocalhost: boolean
  verbose: boolean
  help: boolean
}

export const DEFAULT_BASE_URL = 'http://localhost:3111'
export const DEFAULT_MAX_TURNS = 25
/** Hard cap — matches the historian's own CRITICAL RULE 13 turn limit (historianPrompts.ts). */
export const HARD_MAX_TURNS = 25

export const HELP_TEXT = `AI Historian synthetic conversation driver (P6 — Historian Validation Suite)

Drives the REAL historian agent (OpenAI Realtime, text modality) against a
synthetic Bedrock-backed patient persona through the REAL app endpoints
(/session, /transcript-flush, /scales, /evidence-query, /save) so every
driver session exercises flush -> save -> evaluators exactly like production.

Usage:
  npx tsx scripts/historian-synthetic-run.ts --persona acute-stroke
  npx tsx scripts/historian-synthetic-run.ts --all-personas

Options:
  --persona NAME                One persona fixture id or filename (e.g. acute-stroke).
  --all-personas                Run all persona fixtures sequentially.
  --base-url URL                Default: ${DEFAULT_BASE_URL}
  --max-turns N                 Default: ${DEFAULT_MAX_TURNS}. Hard cap: ${HARD_MAX_TURNS}.
  --i-know-this-is-not-localhost
                                 Required to point --base-url at anything other than
                                 localhost/127.0.0.1 (OpenAI direct = no BAA; guards
                                 against accidentally driving a deployed environment).
  --verbose                     Print turn text to stdout (local debugging only).
  --help, -h                    Show this help.`

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`)
  }
  return value
}

export function parseSyntheticDriverArgs(args: string[]): SyntheticDriverOptions {
  let persona: string | null = null
  let allPersonas = false
  let baseUrl = DEFAULT_BASE_URL
  let maxTurns = DEFAULT_MAX_TURNS
  let iKnowThisIsNotLocalhost = false
  let verbose = false
  let help = false

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (flag === '--persona') {
      persona = requiredValue(args, index, flag)
      index += 1
    } else if (flag === '--all-personas') {
      allPersonas = true
    } else if (flag === '--base-url') {
      baseUrl = requiredValue(args, index, flag)
      index += 1
    } else if (flag === '--max-turns') {
      const raw = requiredValue(args, index, flag)
      index += 1
      const parsed = Number(raw)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`--max-turns must be a positive integer, got "${raw}".`)
      }
      maxTurns = parsed
    } else if (flag === '--i-know-this-is-not-localhost') {
      iKnowThisIsNotLocalhost = true
    } else if (flag === '--verbose') {
      verbose = true
    } else if (flag === '--help' || flag === '-h') {
      help = true
    } else {
      throw new Error(`Unknown historian-synthetic-run option: ${flag}`)
    }
  }

  if (help) {
    return { persona, allPersonas, baseUrl, maxTurns, iKnowThisIsNotLocalhost, verbose, help }
  }

  if (maxTurns > HARD_MAX_TURNS) {
    throw new Error(`--max-turns cannot exceed ${HARD_MAX_TURNS} (matches the historian's own turn-limit rule).`)
  }
  if (!persona && !allPersonas) {
    throw new Error('Specify exactly one of --persona <name> or --all-personas.')
  }
  if (persona && allPersonas) {
    throw new Error('Specify exactly one of --persona <name> or --all-personas, not both.')
  }

  return { persona, allPersonas, baseUrl, maxTurns, iKnowThisIsNotLocalhost, verbose, help }
}

/**
 * Global constraint (binding): OpenAI direct = no BAA, synthetic personas
 * only. Refuses to run against any --base-url whose hostname is not
 * localhost/127.0.0.1/::1, unless the caller explicitly passes
 * --i-know-this-is-not-localhost — a guard against accidentally driving a
 * deployed environment with synthetic traffic.
 */
export function assertBaseUrlAllowed(baseUrl: string, iKnowThisIsNotLocalhost: boolean): void {
  if (iKnowThisIsNotLocalhost) return

  let hostname: string
  try {
    hostname = new URL(baseUrl).hostname
  } catch {
    throw new Error(`--base-url is not a valid URL: "${baseUrl}".`)
  }

  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  if (!isLocal) {
    throw new Error(
      `Refusing to run against non-localhost --base-url "${baseUrl}". OpenAI direct has no BAA — this driver ` +
        'must only run against a local dev server. Pass --i-know-this-is-not-localhost to override.',
    )
  }
}
