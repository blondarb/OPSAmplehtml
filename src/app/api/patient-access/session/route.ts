import { NextResponse } from 'next/server'

import {
  PATIENT_ACCESS_COOKIE_NAME,
  PATIENT_ACCESS_COOKIE_SECURITY,
} from '@/lib/patientAccess/cookie'
import { validateSameOriginJsonRequest } from '@/lib/patientAccess/sameOrigin'

function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

export async function DELETE(request: Request) {
  const provenance = validateSameOriginJsonRequest(request)
  if (!provenance.ok) {
    return noStoreJson({ error: 'Invalid request' }, provenance.status)
  }

  const response = noStoreJson({ success: true }, 200)
  response.cookies.set(PATIENT_ACCESS_COOKIE_NAME, '', {
    ...PATIENT_ACCESS_COOKIE_SECURITY,
    maxAge: 0,
    expires: new Date(0),
  })
  return response
}
