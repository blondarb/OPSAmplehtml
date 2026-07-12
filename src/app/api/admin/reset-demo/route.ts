import { NextResponse } from 'next/server'

// POST /api/admin/reset-demo - Permanently retired destructive demo reset.
export async function POST() {
  return NextResponse.json(
    {
      error: 'Demo reset is no longer available',
      reason: 'destructive_demo_reset_retired',
    },
    {
      status: 410,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
