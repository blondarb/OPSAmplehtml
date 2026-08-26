function validIsoDate(year: number, month: number, day: number): string | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null
  }

  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseDateOfBirthInput(value: string): string | null {
  const trimmed = value.trim()
  const displayMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (displayMatch) {
    return validIsoDate(
      Number(displayMatch[3]),
      Number(displayMatch[1]),
      Number(displayMatch[2]),
    )
  }

  // Some password managers and browser autofill providers supply ISO dates
  // even for a text field. Accept that shape without weakening validation.
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return validIsoDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    )
  }
  return null
}

export function formatDateOfBirthInput(value: string): string {
  const iso = parseDateOfBirthInput(value)
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [year, month, day] = iso.split('-')
    return `${month}/${day}/${year}`
  }

  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}
