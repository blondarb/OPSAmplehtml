import { describe, expect, it } from 'vitest'
import {
  formatDateOfBirthInput,
  parseDateOfBirthInput,
} from '../../src/lib/historian/dateOfBirthInput'

describe('Historian date-of-birth input', () => {
  it('formats eight typed or pasted digits as MM/DD/YYYY', () => {
    expect(formatDateOfBirthInput('0')).toBe('0')
    expect(formatDateOfBirthInput('011')).toBe('01/1')
    expect(formatDateOfBirthInput('01151985')).toBe('01/15/1985')
    expect(formatDateOfBirthInput('01-15-1985')).toBe('01/15/1985')
  })

  it('normalizes a valid display date for the unchanged ISO API contract', () => {
    expect(parseDateOfBirthInput('01/15/1985')).toBe('1985-01-15')
    expect(parseDateOfBirthInput('02/29/2024')).toBe('2024-02-29')
  })

  it('accepts and reformats an ISO value supplied by browser autofill', () => {
    expect(parseDateOfBirthInput('1985-01-15')).toBe('1985-01-15')
    expect(formatDateOfBirthInput('1985-01-15')).toBe('01/15/1985')
  })

  it('rejects incomplete and impossible calendar dates', () => {
    expect(parseDateOfBirthInput('01/15/85')).toBeNull()
    expect(parseDateOfBirthInput('02/29/2023')).toBeNull()
    expect(parseDateOfBirthInput('13/01/1985')).toBeNull()
    expect(parseDateOfBirthInput('04/31/1985')).toBeNull()
  })
})
