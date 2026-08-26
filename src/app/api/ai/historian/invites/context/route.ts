import { NextResponse } from 'next/server'
import {
  publicHistorianInvitationContext,
  resolveHistorianPatientGrant,
} from '@/lib/historian/invitationStore'

export async function GET(request: Request) {
  const binding = await resolveHistorianPatientGrant(request)
  if (!binding) {
    return NextResponse.json(
      { error: 'This interview session is invalid or has expired.' },
      { status: 401 },
    )
  }
  return NextResponse.json(
    { context: publicHistorianInvitationContext(binding) },
    { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } },
  )
}
