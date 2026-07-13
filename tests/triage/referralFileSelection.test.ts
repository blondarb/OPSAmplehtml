import { describe, expect, it, vi } from 'vitest'

import * as fileSelectionModule from '@/lib/triage/referralFileSelection'
import {
  beginReferralAttempt,
  invalidateReferralAttempts,
  isCurrentReferralAttempt,
} from '@/lib/triage/referralAttempt'
import { FILE_CONSTRAINTS } from '@/lib/triage/types'

const { applyReferralFileSelection, selectSingleReferralFile } =
  fileSelectionModule
const commitReferralIdentityChange = (
  fileSelectionModule as unknown as {
    commitReferralIdentityChange?: <T>(
      current: T,
      next: T,
      callbacks: {
        beginReplacement: () => void
        commit: (value: T) => void
      },
      equals?: (current: T, next: T) => boolean,
    ) => boolean
  }
).commitReferralIdentityChange
const sameReferralFileSelection = (
  fileSelectionModule as unknown as {
    sameReferralFileSelection?: (
      current: readonly File[],
      next: readonly File[],
    ) => boolean
  }
).sameReferralFileSelection
const shouldRotateReferralInputMode = (
  fileSelectionModule as unknown as {
    shouldRotateReferralInputMode?: (input: {
      currentMode: 'paste' | 'upload'
      nextMode: 'paste' | 'upload'
      pastePopulated: boolean
      uploadPopulated: boolean
    }) => boolean
  }
).shouldRotateReferralInputMode

describe('selectSingleReferralFile', () => {
  it('accepts exactly one referral file', () => {
    const file = new File(['synthetic referral'], 'synthetic-referral.txt', {
      type: 'text/plain',
    })

    expect(selectSingleReferralFile([file])).toStrictEqual({ ok: true, file })
  })

  it('rejects an empty selection', () => {
    expect(selectSingleReferralFile([])).toStrictEqual({
      ok: false,
      reason: 'no_referral_file',
      message: 'Select one referral file.',
    })
  })

  it('rejects multiple files without choosing one', () => {
    const files = [
      new File(['synthetic referral one'], 'synthetic-referral-one.txt'),
      new File(['synthetic referral two'], 'synthetic-referral-two.txt'),
    ]

    expect(selectSingleReferralFile(files)).toStrictEqual({
      ok: false,
      reason: 'multiple_referral_files',
      message:
        'Upload one referral packet at a time. Multiple same-patient documents require the reviewed packet workflow.',
    })
  })
})

describe('applyReferralFileSelection', () => {
  it('replaces an existing selection with exactly one candidate', () => {
    const existing = new File(['existing'], 'existing-referral.txt')
    const replacement = new File(['replacement'], 'replacement-referral.txt')
    let selectedFiles = [existing]
    const onFilesChange = vi.fn((files: File[]) => {
      selectedFiles = files
    })

    const transition = applyReferralFileSelection(
      [replacement],
      onFilesChange,
    )

    expect(transition).toStrictEqual({
      selectedFiles: [replacement],
      error: null,
    })
    expect(selectedFiles).toStrictEqual([replacement])
    expect(onFilesChange).toHaveBeenCalledOnce()
    expect(onFilesChange).toHaveBeenCalledWith([replacement])
  })

  it('clears an existing selection when the candidates are empty', () => {
    let selectedFiles = [new File(['existing'], 'existing-referral.txt')]
    const onFilesChange = vi.fn((files: File[]) => {
      selectedFiles = files
    })

    const transition = applyReferralFileSelection([], onFilesChange)

    expect(transition).toStrictEqual({
      selectedFiles: [],
      error: 'Select one referral file.',
    })
    expect(selectedFiles).toStrictEqual([])
    expect(onFilesChange).toHaveBeenCalledOnce()
    expect(onFilesChange).toHaveBeenCalledWith([])
  })

  it('clears an existing selection instead of choosing among multiple candidates', () => {
    let selectedFiles = [new File(['existing'], 'existing-referral.txt')]
    const onFilesChange = vi.fn((nextFiles: File[]) => {
      selectedFiles = nextFiles
    })
    const files = [
      new File(['one'], 'synthetic-one.txt'),
      new File(['two'], 'synthetic-two.txt'),
    ]

    const transition = applyReferralFileSelection(files, onFilesChange)

    expect(transition).toStrictEqual({
      selectedFiles: [],
      error:
        'Upload one referral packet at a time. Multiple same-patient documents require the reviewed packet workflow.',
    })
    expect(selectedFiles).toStrictEqual([])
    expect(onFilesChange).toHaveBeenCalledOnce()
    expect(onFilesChange).toHaveBeenCalledWith([])
  })

  it('rejects mixed valid and invalid candidates atomically before validation', () => {
    let selectedFiles = [new File(['existing'], 'existing-referral.txt')]
    const onFilesChange = vi.fn((files: File[]) => {
      selectedFiles = files
    })
    const valid = new File(['valid'], 'valid-referral.txt')
    const invalid = new File(['invalid'], 'invalid-referral.exe')

    const transition = applyReferralFileSelection(
      [valid, invalid],
      onFilesChange,
    )

    expect(transition).toStrictEqual({
      selectedFiles: [],
      error:
        'Upload one referral packet at a time. Multiple same-patient documents require the reviewed packet workflow.',
    })
    expect(selectedFiles).toStrictEqual([])
    expect(onFilesChange).toHaveBeenCalledOnce()
    expect(onFilesChange).toHaveBeenCalledWith([])
  })

  it('clears one invalid candidate while preserving its specific validation error', () => {
    let selectedFiles = [new File(['existing'], 'existing-referral.txt')]
    const onFilesChange = vi.fn((files: File[]) => {
      selectedFiles = files
    })
    const unsupported = new File(['unsupported'], 'synthetic-referral.exe')

    const transition = applyReferralFileSelection([unsupported], onFilesChange)

    expect(transition.selectedFiles).toStrictEqual([])
    expect(selectedFiles).toStrictEqual([])
    expect(transition.error).toContain(
      'synthetic-referral.exe: Unsupported type.',
    )
    expect(transition.error).not.toContain('Select one referral file.')
    expect(onFilesChange).toHaveBeenCalledOnce()
    expect(onFilesChange).toHaveBeenCalledWith([])
  })

  it('clears one oversized candidate with the specific size error', () => {
    const onFilesChange = vi.fn()
    const oversized = new File(
      [new Uint8Array(FILE_CONSTRAINTS.MAX_FILE_SIZE_BYTES + 1)],
      'oversized-referral.txt',
    )

    const transition = applyReferralFileSelection([oversized], onFilesChange)

    expect(transition).toStrictEqual({
      selectedFiles: [],
      error: `oversized-referral.txt: Exceeds ${FILE_CONSTRAINTS.MAX_FILE_SIZE_DISPLAY} limit`,
    })
    expect(onFilesChange).toHaveBeenCalledWith([])
  })

  it('keeps a later browser candidate authoritative after a demo candidate is consumed', () => {
    let parentFiles: File[] = []
    const onFilesChange = vi.fn((files: File[]) => {
      parentFiles = files
    })
    const demo = new File(['demo'], 'demo-referral.txt')
    const browser = new File(['browser'], 'browser-referral.txt')

    applyReferralFileSelection([demo], onFilesChange)
    applyReferralFileSelection([browser], onFilesChange)
    const controlledFilesAfterRemount = parentFiles

    expect(controlledFilesAfterRemount).toStrictEqual([browser])
    expect(onFilesChange).toHaveBeenNthCalledWith(1, [demo])
    expect(onFilesChange).toHaveBeenNthCalledWith(2, [browser])
  })

})

describe('visible referral identity transitions', () => {
  it.each([
    ['age', '64', '65'],
    ['sex', 'female', 'male'],
    ['provider', 'primary_care', 'emergency_department'],
    ['text', 'old referral', 'new referral'],
  ])('invalidates stale work before committing a changed %s', (_label, current, next) => {
    expect(typeof commitReferralIdentityChange).toBe('function')
    if (!commitReferralIdentityChange) return

    const active = beginReferralAttempt(
      { sourceIdentity: null, generation: 0, caseNonce: 'visible-before' },
      'paste:visible-referral',
    )
    let state = active.state
    let committed = current
    const order: string[] = []

    const changed = commitReferralIdentityChange(current, next, {
      beginReplacement: () => {
        order.push('lifecycle')
        state = invalidateReferralAttempts(state, 'visible-after')
      },
      commit: (value) => {
        order.push('commit')
        expect(isCurrentReferralAttempt(state, active.token)).toBe(false)
        committed = value
      },
    })

    expect(changed).toBe(true)
    expect(order).toEqual(['lifecycle', 'commit'])
    expect(committed).toBe(next)
  })

  it('does not rotate or commit an identical visible identity value', () => {
    expect(typeof commitReferralIdentityChange).toBe('function')
    if (!commitReferralIdentityChange) return
    const beginReplacement = vi.fn()
    const commit = vi.fn()

    expect(
      commitReferralIdentityChange('same', 'same', {
        beginReplacement,
        commit,
      }),
    ).toBe(false)
    expect(beginReplacement).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  })

  it('distinguishes unchanged file objects from a real file replacement or removal', () => {
    expect(typeof sameReferralFileSelection).toBe('function')
    if (!sameReferralFileSelection) return
    const current = new File(['same'], 'referral.txt')
    const replacement = new File(['same'], 'referral.txt')

    expect(sameReferralFileSelection([current], [current])).toBe(true)
    expect(sameReferralFileSelection([current], [replacement])).toBe(false)
    expect(sameReferralFileSelection([current], [])).toBe(false)
  })

  it.each([
    ['same mode', 'paste', 'paste', true, true, false],
    ['both empty', 'paste', 'upload', false, false, false],
    ['leave populated paste', 'paste', 'upload', true, false, true],
    ['activate queued upload', 'paste', 'upload', false, true, true],
    ['activate queued paste', 'upload', 'paste', true, false, true],
  ] as const)(
    '%s mode rotation policy',
    (_label, currentMode, nextMode, pastePopulated, uploadPopulated, expected) => {
      expect(typeof shouldRotateReferralInputMode).toBe('function')
      if (!shouldRotateReferralInputMode) return

      expect(
        shouldRotateReferralInputMode({
          currentMode,
          nextMode,
          pastePopulated,
          uploadPopulated,
        }),
      ).toBe(expected)
    },
  )
})
