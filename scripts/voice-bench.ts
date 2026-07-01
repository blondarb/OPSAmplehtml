/**
 * Offline speech-biomarker bake-off runner.
 *
 * Scores a folder of trial recordings with EVERY registered engine, then prints
 * the engine-agreement / test-retest / separation tables. This is where the
 * "capture both, decide later" analysis happens — on archived lossless audio, so
 * new engines can be added and re-run without re-collecting from patients.
 *
 * Usage:
 *   npx tsx scripts/voice-bench.ts <manifest.json> <audioDir> [--csv out.csv]
 *
 * manifest.json: [{ "subjectId": "morrison", "profile": "PD",
 *                   "task": "sustained_vowel", "rep": 0, "file": "morrison_a_0.wav" }, ...]
 *
 * Recordings MUST be lossless WAV (see the capture spec). Set VOICE_PRAAT_URL to
 * include the Parselmouth sidecar in the fan-out; otherwise it reports
 * unavailable and the report runs on whatever engines are up.
 *
 * See docs/plans/2026-06-30-sdne-speech-trial-capture-spec.md.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeWav } from '../src/lib/voice/wav'
import { scoreAllEngines } from '../src/lib/voice/engines'
import { buildBenchReport, type TrialScore } from '../src/lib/voice/bench'
import type { VoiceTask } from '../src/lib/voice/types'

interface ManifestEntry {
  subjectId: string
  profile?: string
  task: VoiceTask
  rep: number
  file: string
}

async function main() {
  const [manifestPath, audioDir] = process.argv.slice(2)
  const csvFlagIdx = process.argv.indexOf('--csv')
  const csvOut = csvFlagIdx >= 0 ? process.argv[csvFlagIdx + 1] : null

  if (!manifestPath || !audioDir) {
    console.error('Usage: npx tsx scripts/voice-bench.ts <manifest.json> <audioDir> [--csv out.csv]')
    process.exit(1)
  }

  const manifest: ManifestEntry[] = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const trials: TrialScore[] = []

  for (const entry of manifest) {
    const buf = readFileSync(join(audioDir, entry.file))
    const wav = decodeWav(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    const engines = await scoreAllEngines(entry.task, { samples: wav.samples, sampleRate: wav.sampleRate })
    trials.push({ subjectId: entry.subjectId, profile: entry.profile, task: entry.task, rep: entry.rep, engines })
    const up = engines.filter(e => e.available).map(e => e.engine).join(', ') || 'none'
    console.error(`scored ${entry.file} (${entry.task}) — engines: ${up}`)
  }

  const report = buildBenchReport(trials)

  // Markdown to stdout.
  console.log('\n# Speech-biomarker bake-off\n')
  console.log(`Trials: ${trials.length} · engines: ${[...new Set(trials.flatMap(t => t.engines.map(e => e.engine)))].join(', ')}\n`)
  console.log('| Task | Feature | Engine agree ICC | Test-retest (per engine) | Separation |')
  console.log('|------|---------|------------------|--------------------------|------------|')
  for (const r of report) {
    const tr = r.perEngine
      .map(e => `${e.engine}: ICC ${fmt(e.testRetestIcc)} (${e.testRetestLabel}), CV ${fmt(e.withinSubjectCv)}`)
      .join('<br>')
    const sep = r.perEngine
      .map(e => `${e.engine}: ${Object.entries(e.separation).map(([p, s]) => `${p} ${s.mean}±${s.sd}`).join('; ')}`)
      .join('<br>')
    console.log(`| ${r.task} | ${r.feature} | ${fmt(r.engineAgreementIcc)} (${r.engineAgreementLabel}) | ${tr} | ${sep} |`)
  }

  if (csvOut) {
    const lines = ['task,feature,engine_agreement_icc,engine,test_retest_icc,within_subject_cv,profile,mean,sd,n']
    for (const r of report) {
      for (const e of r.perEngine) {
        const profiles = Object.entries(e.separation)
        if (!profiles.length) lines.push(`${r.task},${r.feature},${csv(r.engineAgreementIcc)},${e.engine},${csv(e.testRetestIcc)},${csv(e.withinSubjectCv)},,,,`)
        for (const [p, s] of profiles) {
          lines.push(`${r.task},${r.feature},${csv(r.engineAgreementIcc)},${e.engine},${csv(e.testRetestIcc)},${csv(e.withinSubjectCv)},${p},${s.mean},${s.sd},${s.n}`)
        }
      }
    }
    writeFileSync(csvOut, lines.join('\n'))
    console.error(`\nWrote ${csvOut}`)
  }
}

function fmt(v: number | null): string {
  return v === null || !Number.isFinite(v) ? '—' : v.toFixed(3)
}
function csv(v: number | null): string {
  return v === null || !Number.isFinite(v) ? '' : String(v)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
