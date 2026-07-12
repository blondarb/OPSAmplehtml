import { NextResponse } from 'next/server'

const retiredResponse = () => NextResponse.json(
  {
    error: 'Legacy historian escalation API has been superseded',
    reason: 'legacy_historian_escalation_superseded',
  },
  {
    status: 410,
    headers: { 'Cache-Control': 'no-store' },
  },
)

// This legacy endpoint was replaced by the tenant-scoped triage safety workflow.
export async function GET() {
  return retiredResponse()
}

export async function POST() {
  return retiredResponse()
}
