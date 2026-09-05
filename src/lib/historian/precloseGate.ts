export function decidePreclose(input: {
  enabled: boolean
  safetyEscalated: boolean
  alreadyRejected: boolean
  unmatched: { id: string; label: string }[]
}): { action: 'finalize' } | { action: 'reject'; askNext: string[] } {
  const { enabled, safetyEscalated, alreadyRejected, unmatched } = input
  if (enabled && !safetyEscalated && !alreadyRejected && unmatched.length > 0) {
    return { action: 'reject', askNext: unmatched.map(item => item.label) }
  }
  return { action: 'finalize' }
}

export function buildPrecloseNote(labels: string[]): string {
  return `[INTERNAL SYSTEM NOTE — do NOT speak this aloud, do NOT mention it to the patient]: The record is not complete yet. Before finishing, ask the patient about: ${labels.join('; ')}. Ask each listed item once, one question at a time, in your own words. If the patient declines or says they don't know, accept that and move on — do not re-ask. Then call save_interview_output again.`
}


export function orderPrecloseRejectActions(canUpdateInstructions: boolean): readonly ('injectNote' | 'sendToolResult')[] {
  return canUpdateInstructions
    ? ['injectNote', 'sendToolResult']
    : ['sendToolResult', 'injectNote']
}

export function shouldPushLocalizer(input: {
  speaking: boolean
  safetyEscalated: boolean
  payloadEmpty: boolean
}): boolean {
  return !input.speaking && !input.safetyEscalated && !input.payloadEmpty
}
