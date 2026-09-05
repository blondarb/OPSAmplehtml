/** Full notes use extraction; shorter reasons can start directly. */
export const REFERRAL_EXTRACTION_MIN_CHARS = 50

export function referralNoteMode(note: string): 'empty' | 'short' | 'full' {
  const length = note.trim().length
  if (length === 0) return 'empty'
  return length < REFERRAL_EXTRACTION_MIN_CHARS ? 'short' : 'full'
}

export function canStartInterview(args: {
  hasScenario: boolean
  hasSessionConfig: boolean
  hasReferral: boolean
  openEnded: boolean
}): boolean {
  return args.hasScenario || args.hasSessionConfig || args.hasReferral || args.openEnded
}
