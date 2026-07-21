import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_HISTORIAN_EVAL_CASE_RUNNER,
  runHistorianEvalCli,
  type HistorianEvalCliRuntime,
} from '../src/lib/historian/eval/cli'

const runtime: HistorianEvalCliRuntime = {
  readText: (path) => readFileSync(resolve(process.cwd(), path), 'utf8'),
  pathExists: (path) => existsSync(resolve(process.cwd(), path)),
  ensureDirectory: (path) => mkdirSync(resolve(process.cwd(), path), { recursive: true }),
  writeText: (path, value) => writeFileSync(resolve(process.cwd(), path), value, 'utf8'),
  stdout: (value) => process.stdout.write(value.endsWith('\n') ? value : `${value}\n`),
  stderr: (value) => process.stderr.write(value.endsWith('\n') ? value : `${value}\n`),
  setEnvironment: (key, value) => {
    process.env[key] = value
  },
  now: () => new Date().toISOString(),
  runCase: DEFAULT_HISTORIAN_EVAL_CASE_RUNNER,
}

runHistorianEvalCli(process.argv.slice(2), runtime)
  .then(({ exitCode }) => {
    process.exitCode = exitCode
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Historian eval execution failed: ${message}\n`)
    process.exitCode = 1
  })
