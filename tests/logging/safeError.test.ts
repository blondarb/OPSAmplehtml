import { describe, expect, it } from 'vitest'

import { describeError } from '@/lib/logging/safeError'
import { ClinicalModelOutputError } from '@/lib/bedrock'

describe('describeError', () => {
  it('keeps the fields that make an incident diagnosable', () => {
    const err = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    })
    expect(describeError(err)).toEqual({
      name: 'Error',
      message: 'duplicate key value violates unique constraint',
      code: '23505',
    })
  })

  it('DROPS postgres fields that echo row values (PHI risk)', () => {
    // node-postgres puts the failing values in `detail`/`where`; on triage
    // tables those are referral-derived and must never reach CloudWatch.
    const pgErr = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      detail: 'Key (referral_text)=(SYNTHETIC 58yo with thunderclap headache) already exists.',
      where: 'SQL statement "INSERT INTO triage_sessions ..."',
      internalQuery: 'INSERT INTO triage_sessions (referral_text) VALUES ($1)',
    })
    const described = describeError(pgErr)
    const serialized = JSON.stringify(described)
    expect(serialized).not.toContain('thunderclap')
    expect(serialized).not.toContain('referral_text')
    expect(described).not.toHaveProperty('detail')
    expect(described).not.toHaveProperty('where')
    expect(described).not.toHaveProperty('internalQuery')
  })

  it('preserves ClinicalModelOutputError code and stopReason', () => {
    const described = describeError(
      new ClinicalModelOutputError('incomplete', 'max_tokens', 'Clinical model output was incomplete (stop reason: max_tokens).'),
    )
    expect(described.name).toBe('ClinicalModelOutputError')
    expect(described.code).toBe('incomplete')
    expect(described.stopReason).toBe('max_tokens')
  })

  it('handles non-Error throws without crashing the logger', () => {
    expect(describeError('boom')).toEqual({ name: 'NonError', message: 'boom' })
    expect(describeError(undefined)).toEqual({
      name: 'NonError',
      message: 'unknown error value',
    })
  })
})
