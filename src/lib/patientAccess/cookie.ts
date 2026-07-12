export const PATIENT_ACCESS_COOKIE_NAME = '__Host-sevaro_patient_access'

export const PATIENT_ACCESS_COOKIE_SECURITY = Object.freeze({
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/',
})

