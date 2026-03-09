import { NextRequest, NextResponse } from 'next/server'
import { from } from '@/lib/db-query'

export async function GET(request: NextRequest) {
  try {
    const patientId = request.nextUrl.searchParams.get('patient_id')
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50')

    let query = from('wearable_critical_events')
      .select('*')
      .order('detected_at', { ascending: false })
      .limit(limit)

    if (patientId) {
      query = query.eq('patient_id', patientId)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ alerts: data || [] })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch alerts'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
