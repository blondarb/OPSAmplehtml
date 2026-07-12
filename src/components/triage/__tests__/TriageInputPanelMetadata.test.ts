import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { validatedReferralMetadata } from '@/components/triage/TriageInputPanel'

describe('triage input metadata validation', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/triage/TriageInputPanel.tsx'),
    'utf8',
  )
  it('returns no assertions when optional age and sex are blank', () => {
    expect(validatedReferralMetadata('', '')).toStrictEqual({
      ok: true,
      metadata: {},
    })
  })

  it.each([
    ['0', 'Male', 0, 'Male'],
    ['72', 'Female', 72, 'Female'],
    ['130', 'Other', 130, 'Other'],
  ] as const)('accepts governed age %s and sex %s', (age, sex, expectedAge, expectedSex) => {
    expect(validatedReferralMetadata(age, sex)).toStrictEqual({
      ok: true,
      metadata: {
        patient_age: expectedAge,
        patient_sex: expectedSex,
      },
    })
  })

  it.each(['-1', '42.5', '1e2', '131', 'not-an-age'])(
    'rejects invalid age %s',
    (age) => {
      expect(validatedReferralMetadata(age, '')).toMatchObject({
        ok: false,
        reason: 'invalid_patient_age',
        metadata: { patient_age: age },
      })
    },
  )

  it('rejects a sex value outside the governed options', () => {
    expect(validatedReferralMetadata('65', 'forged')).toMatchObject({
      ok: false,
      reason: 'invalid_patient_sex',
      metadata: { patient_age: 65, patient_sex: 'forged' },
    })
  })

  it('shows invalid metadata locally but still submits source for server safety screening', () => {
    const submitScope = source.slice(
      source.indexOf('function handleSubmit()'),
      source.indexOf('function handleBeginDemoLoad'),
    )
    const validationScope = submitScope.slice(
      submitScope.indexOf('if (!validation.ok)'),
      submitScope.indexOf("if (activeMode === 'upload'"),
    )

    expect(submitScope).toContain('setMetadataError(validation.message)')
    expect(validationScope).not.toContain('return')
    expect(submitScope).toContain(
      'onSubmitFiles(uploadedFiles, validation.metadata)',
    )
    expect(submitScope).toContain(
      'onSubmit(textInput.submissionText, validation.metadata)',
    )
  })
})
