/**
 * Fail-closed admission for one complete Nova assistant turn.
 *
 * Nova audio is quarantined in the relay until END_TURN. Nothing in this
 * module logs or persists text/audio. A normal Comprehensive v2 turn is
 * releasable only when the application first approved one exact question.
 */

export type TurnAdmissionMode =
  | 'approved_question'
  | 'terminal_statement'
  | 'unresponsive_check_in'
  | 'unresponsive_sign_off'

/**
 * Nova emits the FINAL sentence-level transcription after audio generation.
 * That post-audio step is not bounded to two seconds by the provider contract;
 * the application keeps the entire turn quarantined while it waits. Thirty
 * seconds stays below the existing 60-second live-response ceiling while
 * allowing the documented finalization phase to complete on mobile sessions.
 */
export const PRODUCTION_TURN_CONFIRMATION_TIMEOUT_MS = 30_000

export interface ApprovedHistorianTurn {
  obligationId: string
  approvedText: string
  allowExample: boolean
}

/** Metadata-only snapshot used for relay diagnostics. It deliberately exposes
 * no text, audio, obligation id, tool arguments, or patient/session identity. */
export interface HistorianTurnQuarantineDiagnostics {
  authorization:
    | TurnAdmissionMode
    | 'none'
  speculativeTextSeen: boolean
  finalTextSeen: boolean
  speculativeTextPartCount: number
  finalTextPartCount: number
  speculativeMatchesApproval: boolean | null
  finalMatchesApproval: boolean | null
  stageTextMatches: boolean | null
  speculativeWordCount: number
  finalWordCount: number
  approvedWordCount: number
  audioChunkCount: number
  overflowed: boolean
}

export const APPROVED_HISTORIAN_CLOSING_TEXT =
  'Thank you. Your history has been recorded for your neurologist to review.'

export type TurnAdmissionResult =
  | {
      allowed: true
      text: string
      audio: string[]
      obligationId?: string
      mode: TurnAdmissionMode
    }
  | { allowed: false; reason: string }

const EXAMPLE_RE = /\b(?:for example|for instance|such as|e\.g\.)\b/i
const INTERROGATIVE_RE = /^\s*(?:what|when|where|who|why|how|which|do|does|did|is|are|was|were|have|has|can|could|would|will)\b/i
const SECOND_OBLIGATION_RE = /\b(?:and|or)\s+(?:what|when|where|who|why|how|which|do|does|did|is|are|was|were|have|has|can|could|would|will)\b/i

export function canonicalSpokenText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Conservative textual obligation count. Exact approved-text equality is the
 * primary guard; this catches compound questions in control/future turns. */
export function countResponseRequests(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const questionMarks = (trimmed.match(/\?/g) ?? []).length
  let count = questionMarks
  if (questionMarks === 0 && INTERROGATIVE_RE.test(trimmed)) count = 1
  if (SECOND_OBLIGATION_RE.test(trimmed)) count = Math.max(2, count + 1)
  return count
}

export function validateTurnText(params: {
  text: string
  mode: TurnAdmissionMode
  approval?: ApprovedHistorianTurn
}): { valid: true; obligationId?: string } | { valid: false; reason: string } {
  const text = params.text.trim()
  if (!text) return { valid: false, reason: 'missing_text' }
  const requests = countResponseRequests(text)

  if (params.mode === 'approved_question') {
    const approval = params.approval
    if (!approval) return { valid: false, reason: 'missing_approval' }
    if (!approval.obligationId.trim() || !approval.approvedText.trim()) {
      return { valid: false, reason: 'invalid_approval' }
    }
    if (canonicalSpokenText(text) !== canonicalSpokenText(approval.approvedText)) {
      return { valid: false, reason: 'approved_text_mismatch' }
    }
    if (requests !== 1) return { valid: false, reason: 'normal_turn_must_have_one_request' }
    if (!approval.allowExample && EXAMPLE_RE.test(text)) {
      return { valid: false, reason: 'unsolicited_example' }
    }
    return { valid: true, obligationId: approval.obligationId }
  }

  if (params.mode === 'terminal_statement') {
    if (requests !== 0) return { valid: false, reason: 'terminal_turn_must_not_ask' }
    if (canonicalSpokenText(text) !== canonicalSpokenText(APPROVED_HISTORIAN_CLOSING_TEXT)) {
      return { valid: false, reason: 'terminal_text_mismatch' }
    }
    return { valid: true }
  }

  if (params.mode === 'unresponsive_sign_off') {
    return requests === 0
      ? { valid: true }
      : { valid: false, reason: 'terminal_turn_must_not_ask' }
  }

  if (requests > 1) return { valid: false, reason: 'check_in_has_multiple_requests' }
  if (EXAMPLE_RE.test(text)) return { valid: false, reason: 'check_in_contains_example' }
  return { valid: true }
}

export class HistorianTurnQuarantine {
  private approval: ApprovedHistorianTurn | null = null
  private controlMode: Exclude<TurnAdmissionMode, 'approved_question'> | null = null
  private textParts: string[] = []
  private finalTextParts: string[] = []
  private audioParts: string[] = []
  private audioChars = 0
  private overflowed = false

  constructor(private readonly maxAudioBase64Chars: number) {}

  approveQuestion(approval: ApprovedHistorianTurn): boolean {
    if (this.approval || this.controlMode || this.hasContent()) return false
    this.approval = { ...approval }
    return true
  }

  allowControl(mode: Exclude<TurnAdmissionMode, 'approved_question'>): boolean {
    if (this.approval || this.controlMode || this.hasContent()) return false
    this.controlMode = mode
    return true
  }

  bufferText(text: string): void {
    if (text.trim()) this.textParts.push(text.trim())
  }

  bufferFinalText(text: string): void {
    if (text.trim()) this.finalTextParts.push(text.trim())
  }

  bufferAudio(base64: string): boolean {
    this.audioChars += base64.length
    if (this.audioChars > this.maxAudioBase64Chars) {
      this.overflowed = true
      return false
    }
    this.audioParts.push(base64)
    return true
  }

  hasContent(): boolean {
    return this.textParts.length > 0 || this.finalTextParts.length > 0 || this.audioParts.length > 0
  }

  hasAuthorization(): boolean {
    return !!this.approval || !!this.controlMode
  }

  hasConfirmedTextMatch(): boolean {
    const speculativeText = canonicalSpokenText(this.textParts.join(' '))
    const finalText = canonicalSpokenText(this.finalTextParts.join(' '))
    return (
      this.textParts.length > 0 &&
      this.textParts.length === this.finalTextParts.length &&
      !!speculativeText &&
      !!finalText &&
      speculativeText === finalText
    )
  }

  diagnostics(): HistorianTurnQuarantineDiagnostics {
    const speculativeText = this.textParts.join(' ').trim()
    const finalText = this.finalTextParts.join(' ').trim()
    const approvedText = this.approval?.approvedText.trim() ?? ''
    const canonicalSpeculative = canonicalSpokenText(speculativeText)
    const canonicalFinal = canonicalSpokenText(finalText)
    const canonicalApproved = canonicalSpokenText(approvedText)
    const wordCount = (value: string) => value ? value.split(' ').length : 0
    return {
      authorization: this.approval
        ? 'approved_question'
        : this.controlMode ?? 'none',
      speculativeTextSeen: this.textParts.length > 0,
      finalTextSeen: this.finalTextParts.length > 0,
      speculativeTextPartCount: this.textParts.length,
      finalTextPartCount: this.finalTextParts.length,
      speculativeMatchesApproval: this.approval && canonicalSpeculative
        ? canonicalSpeculative === canonicalApproved
        : null,
      finalMatchesApproval: this.approval && canonicalFinal
        ? canonicalFinal === canonicalApproved
        : null,
      stageTextMatches: canonicalSpeculative && canonicalFinal
        ? canonicalSpeculative === canonicalFinal
        : null,
      speculativeWordCount: wordCount(canonicalSpeculative),
      finalWordCount: wordCount(canonicalFinal),
      approvedWordCount: wordCount(canonicalApproved),
      audioChunkCount: this.audioParts.length,
      overflowed: this.overflowed,
    }
  }

  discard(): void {
    this.approval = null
    this.controlMode = null
    this.textParts = []
    this.finalTextParts = []
    this.audioParts = []
    this.audioChars = 0
    this.overflowed = false
  }

  finalize(): TurnAdmissionResult {
    if (this.overflowed) {
      this.discard()
      return { allowed: false, reason: 'turn_audio_buffer_overflow' }
    }
    const speculativeText = this.textParts.join(' ').trim()
    const finalText = this.finalTextParts.join(' ').trim()
    if (!speculativeText || !finalText) {
      this.discard()
      return { allowed: false, reason: 'turn_missing_confirmed_text' }
    }
    if (canonicalSpokenText(speculativeText) !== canonicalSpokenText(finalText)) {
      this.discard()
      return { allowed: false, reason: 'turn_text_stage_mismatch' }
    }
    if (this.audioParts.length === 0) {
      this.discard()
      return { allowed: false, reason: 'turn_has_no_audio' }
    }
    const mode: TurnAdmissionMode | null = this.approval
      ? 'approved_question'
      : this.controlMode
    if (!mode) {
      this.discard()
      return { allowed: false, reason: 'turn_not_authorized' }
    }
    const approval = this.approval ? { ...this.approval } : undefined
    const audio = [...this.audioParts]
    const checked = validateTurnText({ text: finalText, mode, approval })
    this.discard()
    if (!checked.valid) return { allowed: false, reason: checked.reason }
    return {
      allowed: true,
      // Persist and emit the application's exact canonical wording. Nova's
      // text stage may vary only punctuation/case while the admitted audio is
      // semantically identical; downstream evidence binding remains exact.
      text: mode === 'approved_question' ? approval!.approvedText : finalText,
      audio,
      mode,
      ...(checked.obligationId ? { obligationId: checked.obligationId } : {}),
    }
  }
}

export function parseApprovedHistorianTurn(value: unknown): ApprovedHistorianTurn | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (
    candidate.success !== true ||
    candidate.status !== 'approved' ||
    typeof candidate.obligation_id !== 'string' ||
    typeof candidate.approved_text !== 'string' ||
    candidate.allow_example !== false
  ) return null
  const approval = {
    obligationId: candidate.obligation_id.trim(),
    approvedText: candidate.approved_text.trim(),
    allowExample: candidate.allow_example,
  }
  return approval.obligationId && approval.approvedText ? approval : null
}
