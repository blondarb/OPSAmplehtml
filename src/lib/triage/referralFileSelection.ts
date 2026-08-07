import { FILE_CONSTRAINTS } from './types'

/**
 * Shown when more than one file is selected. Exported so tests pin the
 * REJECTION BEHAVIOUR without hardcoding the sentence — three tests broke on a
 * pure copy edit (2026-08-06), which is brittleness, not coverage.
 */
export const MULTIPLE_REFERRAL_FILES_MESSAGE =
  'Triage scores one document at a time, so every finding stays traceable to its source. Upload the primary referral document on its own.'

export type SingleReferralFileSelection =
  | { ok: true; file: File }
  | {
      ok: false
      reason: 'no_referral_file' | 'multiple_referral_files'
      message: string
    }

export function selectSingleReferralFile(
  files: readonly File[],
): SingleReferralFileSelection {
  if (files.length === 1) {
    return { ok: true, file: files[0] }
  }

  if (files.length === 0) {
    return {
      ok: false,
      reason: 'no_referral_file',
      message: 'Select one referral file.',
    }
  }

  return {
    ok: false,
    reason: 'multiple_referral_files',
    // Says what the user can actually DO. The previous wording pointed at "the
    // reviewed packet workflow", which has no UI entry point and no API that
    // accepts multiple files — the long-packet modules handle one LONG
    // document, not several. Pointing someone at an unreachable workflow is a
    // dead end dressed as instructions (found on a live demo, 2026-08-06).
    message: MULTIPLE_REFERRAL_FILES_MESSAGE,
  }
}

export interface ReferralFileSelectionTransition {
  selectedFiles: File[]
  error: string | null
}

export function commitReferralIdentityChange<T>(
  current: T,
  next: T,
  callbacks: {
    beginReplacement: () => void
    commit: (value: T) => void
  },
  equals: (current: T, next: T) => boolean = Object.is,
): boolean {
  if (equals(current, next)) return false
  callbacks.beginReplacement()
  callbacks.commit(next)
  return true
}

export function sameReferralFileSelection(
  current: readonly File[],
  next: readonly File[],
): boolean {
  return (
    current.length === next.length &&
    current.every((file, index) => file === next[index])
  )
}

export function shouldRotateReferralInputMode(input: {
  currentMode: 'paste' | 'upload'
  nextMode: 'paste' | 'upload'
  pastePopulated: boolean
  uploadPopulated: boolean
}): boolean {
  if (input.currentMode === input.nextMode) return false
  return input.pastePopulated || input.uploadPopulated
}

export function applyReferralFileSelection(
  candidates: readonly File[],
  onFilesChange: (files: File[]) => void,
): ReferralFileSelectionTransition {
  const selection = selectSingleReferralFile(candidates)
  if (!selection.ok) {
    const transition = { selectedFiles: [], error: selection.message }
    onFilesChange(transition.selectedFiles)
    return transition
  }

  const file = selection.file
  const dot = file.name.lastIndexOf('.')
  const extension = dot === -1 ? '' : file.name.substring(dot).toLowerCase()
  let validationError: string | null = null
  if (
    !(FILE_CONSTRAINTS.ALLOWED_EXTENSIONS as readonly string[]).includes(
      extension,
    )
  ) {
    validationError = `${file.name}: Unsupported type. Accepted: ${FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(', ')}`
  } else if (file.size > FILE_CONSTRAINTS.MAX_FILE_SIZE_BYTES) {
    validationError = `${file.name}: Exceeds ${FILE_CONSTRAINTS.MAX_FILE_SIZE_DISPLAY} limit`
  }

  const transition: ReferralFileSelectionTransition = validationError
    ? { selectedFiles: [], error: validationError }
    : { selectedFiles: [file], error: null }
  onFilesChange(transition.selectedFiles)
  return transition
}
