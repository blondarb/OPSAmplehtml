/** Offline, non-authoritative style audit of a saved synthetic transcript. */
import { readFileSync } from 'node:fs'
import { auditHenryTurns } from '../src/lib/historian/eval/turnStyleChecks'

try {
  const file = process.argv[2]
  if (!file || process.argv.length !== 3) throw new Error('Usage: historian:audit <path.json>')
  const input: unknown = JSON.parse(readFileSync(file, 'utf8'))
  const transcript = Array.isArray(input) ? input :
    input && typeof input === 'object' && 'transcript' in input ? input.transcript : undefined
  if (!Array.isArray(transcript) || !transcript.every((turn) =>
    turn && typeof turn === 'object' && typeof turn.role === 'string' && typeof turn.text === 'string',
  )) throw new Error('Expected an array of {role,text} or an object with a transcript array')
  const report = auditHenryTurns(transcript)
  for (const [key, value] of Object.entries(report)) {
    console.log(`${key.padEnd(26)} ${typeof value === 'object' ? JSON.stringify(value) : value}`)
  }
  console.log(report.passes ? 'PASS' : 'FAIL')
  process.exitCode = report.passes ? 0 : 1
} catch {
  // Do not echo malformed input or filesystem errors that could contain transcript text.
  console.error('Audit input error: supply one readable JSON file containing {role,text} turns or {transcript: [...]}')
  process.exitCode = 2
}
