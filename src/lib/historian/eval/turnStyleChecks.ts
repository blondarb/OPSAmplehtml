/**
 * Non-authoritative turn-style report; authoritative gates stay in deterministicChecks.ts.
 * Gratitude measures filler outside the closing; compound questions measure answer load;
 * restatements measure echoing; repeated three-word openers measure formulaic delivery.
 * These lexical heuristics report style only, not clinical quality or safety.
 */
export interface TurnStyleReport {
  henry_turns: number
  gratitude_turns: number
  gratitude_rate: number
  compound_question_turns: number
  restatement_turns: number
  repeated_openers: Array<{ opener: string; count: number }>
  max_repeated_opener: number
  passes: boolean
  findings: string[]
}

const GRATITUDE = /\b(thanks?|thank you|i appreciate (you|that)|that'?s (really |very )?helpful)\b/i
const TOPIC = /\b(medication|medicine|meds|pill|allerg|surger|operation|family|smok|tobacco|alcohol|drink|drug|sleep|work|job|headache|seizure|numb|tingl|weak|vision|memory|mood|dosage|dose)[a-z]*\b/gi

function isCompound(text: string): boolean {
  if ((text.match(/\?/g) ?? []).length >= 2) return true
  // Only inspect question sentences: a topic bridge in a prior sentence is not an answer request.
  const questions = text.match(/[^.!?]*\?/g) ?? []
  return questions.some((question) => {
    const topics = [...question.matchAll(TOPIC)]
    return topics.some((left, i) => topics.slice(i + 1).some((right) =>
      left[1].toLowerCase() !== right[1].toLowerCase() &&
      / and | or |, /i.test(question.slice(left.index! + left[0].length, right.index)),
    ))
  })
}

function opener(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).slice(0, 3).join(' ')
}

export function auditHenryTurns(transcript: Array<{ role: string; text: string }>): TurnStyleReport {
  const turns = transcript.filter(({ role }) => /^(assistant|historian|henry)$/i.test(role)).map(({ text }) => text)
  const gratitude = turns.slice(0, -1).filter((text) => GRATITUDE.test(text))
  const compound = turns.filter(isCompound)
  const counts = new Map<string, number>()
  for (const text of turns.slice(1)) {
    const key = opener(text)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const repeated_openers = [...counts].map(([opener, count]) => ({ opener, count }))
    .sort((a, b) => b.count - a.count || a.opener.localeCompare(b.opener)).slice(0, 3)
  const gratitude_rate = gratitude.length / Math.max(1, turns.length - 1)
  const max_repeated_opener = repeated_openers[0]?.count ?? 0
  const findings: string[] = []
  const quote = (text: string) => JSON.stringify(text.slice(0, 60))
  if (gratitude_rate > 0.05) findings.push(`Gratitude rate ${(gratitude_rate * 100).toFixed(1)}% exceeds 5%: ${quote(gratitude[0])}`)
  if (compound.length) findings.push(`Compound questions in ${compound.length} Henry turn(s); expected 0: ${quote(compound[0])}`)
  if (max_repeated_opener > 3) {
    const example = turns.slice(1).find((text) => opener(text) === repeated_openers[0].opener)!
    findings.push(`Repeated opener occurs ${max_repeated_opener} times; maximum 3: ${quote(example)}`)
  }
  return {
    henry_turns: turns.length,
    gratitude_turns: gratitude.length,
    gratitude_rate,
    compound_question_turns: compound.length,
    restatement_turns: turns.filter((text) => /^(so|okay,? so|it sounds like)\b/i.test(text) || /you (mentioned|said) that/i.test(text)).length,
    repeated_openers,
    max_repeated_opener,
    passes: gratitude_rate <= 0.05 && compound.length === 0 && max_repeated_opener <= 3,
    findings,
  }
}
