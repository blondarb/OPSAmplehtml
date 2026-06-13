/**
 * Independent-grader CLI (LLM-as-judge).
 *
 *   npx tsx qa/localizer-evals/grade.ts --demo
 *   npx tsx qa/localizer-evals/grade.ts --pairwise a.json b.json [vignetteId]
 *   npx tsx qa/localizer-evals/grade.ts --quality candidate.json [vignetteId]
 *
 * Uses a Bedrock model as an INDEPENDENT judge (set GRADER_MODEL to a model
 * different from the generator — e.g. Opus — for true independence; default
 * falls back to the Bedrock default). The judge prompt/parse logic is pure and
 * unit-tested in grader.test.ts; this CLI just wires the model call.
 *
 * Candidate files are JSON in the LocalizerLike shape (run.ts can produce them).
 * --demo compares a hardened vs. a regressed differential for the B12 case so
 * you can see the grader pick a winner without any live engine.
 *
 * With no AWS/Bedrock credentials present, the CLI skips (exit 0).
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { invokeBedrock } from '../../src/lib/bedrock'
import { gradePairwiseDebiased, gradeQuality, type JudgeFn } from './grader'
import type { LocalizerLike, Vignette } from './schema'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function hasCredentials(): boolean {
  return Boolean(
    process.env.BEDROCK_ACCESS_KEY_ID ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.AWS_PROFILE ||
      process.env.AWS_ROLE_ARN,
  )
}

function makeBedrockJudge(): JudgeFn {
  const model = process.env.GRADER_MODEL // undefined → invokeBedrock default
  return async (system, user) => {
    const r = await invokeBedrock({
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: 800,
      temperature: 0,
      model,
    })
    return r.text
  }
}

function loadVignette(id: string): Vignette {
  const p = path.join(__dirname, 'vignettes', `${id}.json`)
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as Vignette
}

function loadOutput(file: string): LocalizerLike {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf-8')) as LocalizerLike
}

// Inline demo fixtures for the B12/SCD case.
const DEMO_HARDENED: LocalizerLike = {
  differential: [
    { diagnosis: 'B12 deficiency (subacute combined degeneration)', rationale: 'Vegan diet + chronic PPI; dorsal-column + pyramidal signs. Check B12, MMA, homocysteine.', likelihood: 'high' },
    { diagnosis: 'Cervical spondylotic myelopathy', rationale: 'Myelopathic signs; MRI c-spine.', likelihood: 'medium' },
    { diagnosis: 'Copper deficiency myelopathy', rationale: 'Mimics B12; check copper/ceruloplasmin.', likelihood: 'low' },
  ],
  followUpQuestions: ['Have you had your vitamin B12 level checked recently?', 'Any history of bariatric surgery or nitrous oxide use?'],
  localizationHypothesis: 'Dorsal columns and corticospinal tracts (myelopathy).',
}

const DEMO_REGRESSED: LocalizerLike = {
  differential: [
    { diagnosis: 'Alzheimer disease', rationale: 'Progressive memory loss.', likelihood: 'high' },
    { diagnosis: 'Peripheral neuropathy', rationale: 'Numb feet.', likelihood: 'medium' },
    { diagnosis: 'B12 deficiency', rationale: '', likelihood: 'low' },
  ],
  followUpQuestions: ['How long has the memory loss been going on?'],
  localizationHypothesis: 'Diffuse cortical process.',
}

async function main() {
  const args = process.argv.slice(2)
  const mode = args[0]

  if (!mode || !['--demo', '--pairwise', '--quality'].includes(mode)) {
    console.log('Usage: grade.ts --demo | --pairwise a.json b.json [vignetteId] | --quality candidate.json [vignetteId]')
    process.exit(mode ? 1 : 0)
  }

  if (!hasCredentials()) {
    console.log('⏭  No AWS/Bedrock credentials detected — skipping live grading.')
    console.log('   Set BEDROCK_ACCESS_KEY_ID/SECRET (or an AWS profile/role) and optionally')
    console.log('   GRADER_MODEL=<an independent model id> then re-run. Prompt/parse logic is')
    console.log('   covered by grader.test.ts in the vitest suite.')
    process.exit(0)
  }

  const judge = makeBedrockJudge()

  if (mode === '--demo') {
    const v = loadVignette('scd-b12-001')
    console.log('Grading DEMO: hardened (A) vs regressed (B) on scd-b12-001 …')
    const verdict = await gradePairwiseDebiased(v, DEMO_HARDENED, DEMO_REGRESSED, judge)
    console.log(`\nWinner: ${verdict.winner}`)
    console.log(`Rationale: ${verdict.rationale}`)
    console.log(`Per-criterion: ${JSON.stringify(verdict.criteria_winners)}`)
    process.exit(0)
  }

  if (mode === '--pairwise') {
    const [aFile, bFile, vignetteId] = args.slice(1)
    if (!aFile || !bFile) { console.error('--pairwise needs two files'); process.exit(1) }
    const v = loadVignette(vignetteId ?? 'scd-b12-001')
    const verdict = await gradePairwiseDebiased(v, loadOutput(aFile), loadOutput(bFile), judge)
    console.log(`Winner: ${verdict.winner}\n${verdict.rationale}\n${JSON.stringify(verdict.criteria_winners)}`)
    process.exit(0)
  }

  // --quality
  const [file, vignetteId] = args.slice(1)
  if (!file) { console.error('--quality needs a candidate file'); process.exit(1) }
  const v = loadVignette(vignetteId ?? 'scd-b12-001')
  const verdict = await gradeQuality(v, loadOutput(file), judge)
  console.log(`Overall: ${verdict.overall}/5`)
  console.log(`Criteria: ${JSON.stringify(verdict.criteria)}`)
  console.log(`Missed: ${verdict.missed_diagnoses.join(', ') || '(none)'}`)
  console.log(`Rationale: ${verdict.rationale}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
