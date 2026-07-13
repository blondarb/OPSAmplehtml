import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_SENTINEL_LIVE_CASE_RUNNER,
  runSentinelCli,
  type SentinelCliRuntime,
} from '../src/lib/triage/sentinel/cli'

const runtime: SentinelCliRuntime = {
  readText: (path) => readFileSync(resolve(process.cwd(), path), 'utf8'),
  ensureDirectory: (path) => mkdirSync(resolve(process.cwd(), path), { recursive: true }),
  writeText: (path, value) =>
    writeFileSync(resolve(process.cwd(), path), value, 'utf8'),
  stdout: (value) => process.stdout.write(value.endsWith('\n') ? value : `${value}\n`),
  stderr: (value) => process.stderr.write(value.endsWith('\n') ? value : `${value}\n`),
  setEnvironment: (key, value) => {
    process.env[key] = value
  },
  now: () => new Date().toISOString(),
  runLiveCase: DEFAULT_SENTINEL_LIVE_CASE_RUNNER,
}

runSentinelCli(process.argv.slice(2), runtime)
  .then(({ exitCode }) => {
    process.exitCode = exitCode
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Sentinel execution failed: ${message}\n`)
    process.exitCode = 1
  })

