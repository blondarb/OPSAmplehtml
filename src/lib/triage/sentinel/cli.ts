import {
  runLiveSentinelCase,
  type SentinelLiveBranch,
  type SentinelLiveOptions,
  type SentinelModelPricing,
} from './liveRunner'
import {
  parseSentinelCatalog,
  parseSentinelReleaseGates,
} from './catalog'
import {
  buildOfflineSentinelReport,
  buildSentinelReportFromOutcomes,
  formatSentinelMarkdown,
} from './report'
import type {
  SentinelCase,
  SentinelCaseOutcome,
  SentinelEvaluationReport,
} from './types'

export type SentinelReportFormat = 'json' | 'markdown' | 'both'

export interface SentinelCliOptions {
  live: boolean
  branches: SentinelLiveBranch[]
  catalogPath: string
  gatesPath: string
  pricingPath: string | null
  format: SentinelReportFormat
  outputDir: string | null
  failOnGate: boolean
  allLive: boolean
  caseIds: string[]
  profile: string | null
  region: string | null
  help: boolean
}

export interface SentinelCliRuntime {
  readText: (path: string) => string
  ensureDirectory: (path: string) => void
  writeText: (path: string, value: string) => void
  stdout: (value: string) => void
  stderr: (value: string) => void
  setEnvironment: (key: string, value: string) => void
  now: () => string
  runLiveCase: (
    item: SentinelCase,
    options: SentinelLiveOptions,
  ) => Promise<SentinelCaseOutcome>
}

export interface SentinelCliResult {
  exitCode: 0 | 2
  report: SentinelEvaluationReport | null
}

const BRANCHES: SentinelLiveBranch[] = [
  'safety',
  'scoring',
  'adjudicator',
]

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`)
  }
  return value
}

export function parseSentinelCliArgs(args: string[]): SentinelCliOptions {
  let explicitOffline = false
  let live = false
  let branchFlagUsed = false
  let branches: SentinelLiveBranch[] = []
  let catalogPath = 'qa/triage-sentinel/cases.json'
  let gatesPath = 'qa/triage-sentinel/release-gates.json'
  let pricingPath: string | null = null
  let format: SentinelReportFormat = 'both'
  let outputDir: string | null = null
  let failOnGate = true
  let allLive = false
  const caseIds: string[] = []
  let profile: string | null = null
  let region: string | null = null
  let help = false

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (flag === '--offline') {
      explicitOffline = true
    } else if (flag === '--live') {
      live = true
    } else if (flag === '--all-live') {
      allLive = true
    } else if (flag === '--case') {
      caseIds.push(requiredValue(args, index, flag))
      index += 1
    } else if (flag === '--branches') {
      branchFlagUsed = true
      const rawBranches = requiredValue(args, index, flag).split(',')
      index += 1
      if (
        rawBranches.length === 0 ||
        rawBranches.some(
          (branch) => !BRANCHES.includes(branch as SentinelLiveBranch),
        )
      ) {
        throw new Error(
          `--branches must be a comma-separated subset of ${BRANCHES.join(',')}.`,
        )
      }
      branches = rawBranches as SentinelLiveBranch[]
    } else if (flag === '--catalog') {
      catalogPath = requiredValue(args, index, flag)
      index += 1
    } else if (flag === '--gates') {
      gatesPath = requiredValue(args, index, flag)
      index += 1
    } else if (flag === '--pricing') {
      pricingPath = requiredValue(args, index, flag)
      index += 1
    } else if (flag === '--format') {
      const value = requiredValue(args, index, flag)
      index += 1
      if (!['json', 'markdown', 'both'].includes(value)) {
        throw new Error('--format must be json, markdown, or both.')
      }
      format = value as SentinelReportFormat
    } else if (flag === '--output-dir') {
      outputDir = requiredValue(args, index, flag)
      index += 1
    } else if (flag === '--profile') {
      profile = requiredValue(args, index, flag)
      index += 1
    } else if (flag === '--region') {
      region = requiredValue(args, index, flag)
      index += 1
    } else if (flag === '--no-fail-on-gate') {
      failOnGate = false
    } else if (flag === '--help' || flag === '-h') {
      help = true
    } else {
      throw new Error(`Unknown sentinel option: ${flag}`)
    }
  }

  if (explicitOffline && live) {
    throw new Error('Cannot select both --offline and --live.')
  }
  const liveOnlySettingUsed =
    branchFlagUsed ||
    allLive ||
    caseIds.length > 0 ||
    profile !== null ||
    region !== null ||
    pricingPath !== null
  if (!live && liveOnlySettingUsed) {
    throw new Error(
      'Live-only settings require the explicit --live opt-in.',
    )
  }
  if (live && !allLive && caseIds.length === 0 && !help) {
    throw new Error(
      'A live run requires at least one --case id or the explicit --all-live cost opt-in.',
    )
  }
  if (allLive && caseIds.length > 0) {
    throw new Error('Use either --case allowlisting or --all-live, not both.')
  }
  if (new Set(caseIds).size !== caseIds.length) {
    throw new Error('--case ids must not be duplicated.')
  }
  if (new Set(branches).size !== branches.length) {
    throw new Error('--branches must not contain duplicates.')
  }
  if (profile !== null && !/^[A-Za-z0-9_.-]{1,128}$/.test(profile)) {
    throw new Error('--profile has an invalid format.')
  }
  if (region !== null && !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region)) {
    throw new Error('--region has an invalid format.')
  }

  if (live && branches.length === 0) branches = [...BRANCHES]

  return {
    live,
    branches,
    catalogPath,
    gatesPath,
    pricingPath,
    format,
    outputDir,
    failOnGate,
    allLive,
    caseIds,
    profile,
    region,
    help,
  }
}

const HELP_TEXT = `Neurology triage sentinel (synthetic software evaluation only)

Offline (default; no AWS/model call):
  npm run triage:sentinel -- --offline [--format json|markdown|both]

Live (explicitly invokes configured Bedrock models):
  npm run triage:sentinel -- --live --case CASE_ID [--case CASE_ID ...]
  npm run triage:sentinel -- --live --all-live

Options:
  --branches safety,scoring,adjudicator
  --profile AWS_PROFILE             profile name only; never a credential
  --region AWS_REGION
  --pricing FILE.json               optional per-model token pricing
  --catalog FILE.json
  --gates FILE.json
  --output-dir DIRECTORY
  --format json|markdown|both
  --no-fail-on-gate                 return 0 while preserving FAIL in report
  --help

Live runs require --case allowlisting or the additional --all-live consent.
Opus adjudication is sparse: branch disagreement or critical unknown only.`

function parsePricing(value: unknown): Record<string, SentinelModelPricing> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Pricing JSON must be an object keyed by model id.')
  }
  return Object.fromEntries(
    Object.entries(value).map(([modelId, raw]) => {
      if (
        !modelId.trim() ||
        typeof raw !== 'object' ||
        raw === null ||
        Array.isArray(raw)
      ) {
        throw new Error(`Invalid pricing entry for ${modelId || '(empty model)'}.`)
      }
      const entry = raw as Record<string, unknown>
      const inputUsdPerMillion = entry.inputUsdPerMillion
      const outputUsdPerMillion = entry.outputUsdPerMillion
      if (
        typeof inputUsdPerMillion !== 'number' ||
        !Number.isFinite(inputUsdPerMillion) ||
        inputUsdPerMillion < 0 ||
        typeof outputUsdPerMillion !== 'number' ||
        !Number.isFinite(outputUsdPerMillion) ||
        outputUsdPerMillion < 0
      ) {
        throw new Error(
          `Pricing for ${modelId} requires non-negative inputUsdPerMillion and outputUsdPerMillion.`,
        )
      }
      return [modelId, { inputUsdPerMillion, outputUsdPerMillion }]
    }),
  )
}

function selectedLiveCases(
  catalog: ReturnType<typeof parseSentinelCatalog>,
  options: SentinelCliOptions,
): SentinelCase[] {
  const liveEligible = catalog.cases.filter((item) =>
    item.executionModes.includes('live_ensemble'),
  )
  if (options.allLive) return liveEligible
  const byId = new Map(catalog.cases.map((item) => [item.id, item]))
  return options.caseIds.map((id) => {
    const item = byId.get(id)
    if (!item) throw new Error(`Unknown sentinel case id: ${id}`)
    if (!item.executionModes.includes('live_ensemble')) {
      throw new Error(`Sentinel case ${id} is not eligible for live_ensemble.`)
    }
    return item
  })
}

function emitReport(
  report: SentinelEvaluationReport,
  options: SentinelCliOptions,
  runtime: SentinelCliRuntime,
): void {
  const json = `${JSON.stringify(report, null, 2)}\n`
  const markdown = formatSentinelMarkdown(report)
  if (options.outputDir) {
    runtime.ensureDirectory(options.outputDir)
    const base = options.outputDir.replace(/\/$/, '')
    if (options.format === 'json' || options.format === 'both') {
      runtime.writeText(`${base}/triage-sentinel-report.json`, json)
    }
    if (options.format === 'markdown' || options.format === 'both') {
      runtime.writeText(`${base}/triage-sentinel-report.md`, markdown)
    }
    return
  }
  if (options.format === 'json' || options.format === 'both') {
    runtime.stdout(json)
  }
  if (options.format === 'markdown' || options.format === 'both') {
    runtime.stdout(markdown)
  }
}

export async function runSentinelCli(
  args: string[],
  runtime: SentinelCliRuntime,
): Promise<SentinelCliResult> {
  const options = parseSentinelCliArgs(args)
  if (options.help) {
    runtime.stdout(HELP_TEXT)
    return { exitCode: 0, report: null }
  }

  runtime.stderr(
    'SYNTHETIC SOFTWARE EVALUATION ONLY — NOT CLINICALLY VALIDATED.',
  )
  const catalog = parseSentinelCatalog(
    JSON.parse(runtime.readText(options.catalogPath)),
  )
  const gateSet = parseSentinelReleaseGates(
    JSON.parse(runtime.readText(options.gatesPath)),
  )

  let report: SentinelEvaluationReport
  if (!options.live) {
    report = buildOfflineSentinelReport(catalog, gateSet, runtime.now())
  } else {
    const cases = selectedLiveCases(catalog, options)
    if (options.profile) {
      runtime.setEnvironment('AWS_PROFILE', options.profile)
    }
    if (options.region) {
      runtime.setEnvironment('AWS_REGION', options.region)
      runtime.setEnvironment('AWS_DEFAULT_REGION', options.region)
    }
    const pricing = options.pricingPath
      ? parsePricing(JSON.parse(runtime.readText(options.pricingPath)))
      : undefined
    runtime.stderr(
      `LIVE BEDROCK OPT-IN: ${cases.length} allowlisted synthetic case(s); branches=${options.branches.join(',')}; Opus remains sparse.`,
    )
    const outcomes: SentinelCaseOutcome[] = []
    for (const item of cases) {
      outcomes.push(
        await runtime.runLiveCase(item, {
          live: true,
          branches: options.branches,
          pricing,
        }),
      )
    }
    const fullCatalog =
      options.allLive && cases.length === catalog.cases.length
    report = buildSentinelReportFromOutcomes({
      catalog,
      gateSet,
      mode: 'live_ensemble',
      outcomes,
      evaluationScope: fullCatalog ? 'full_catalog' : 'subset',
      generatedAt: runtime.now(),
    })
  }

  emitReport(report, options, runtime)
  return {
    exitCode: options.failOnGate && !report.releaseGatePassed ? 2 : 0,
    report,
  }
}

export const DEFAULT_SENTINEL_LIVE_CASE_RUNNER = runLiveSentinelCase
