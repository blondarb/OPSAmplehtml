import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { from, wearableFrom } from '@/lib/db-query'

export async function GET() {
  try {
    // Demo patients: github_showcase has full display info (name, age, diagnosis, etc.)
    const { data: demoData, error } = await from('wearable_patients')
      .select('id, name, age, sex, primary_diagnosis, wearable_devices, monitoring_start_date')
      .order('name')

    if (error) throw new Error(error.message)

    const demoPatients = (demoData || []).map((p: Record<string, unknown>) => ({
      ...p,
      source: 'demo',
    }))

    // Live patients: sevaro_monitor has real iOS data but minimal schema (no name/age/etc.)
    // Build a synthetic display entry from baseline_metrics where possible.
    const { data: liveData } = await wearableFrom('wearable_patients').select('id, baseline_metrics')
    const livePatients = (liveData || []).map((p: Record<string, unknown>) => {
      const bm = (p.baseline_metrics as Record<string, unknown>) || {}
      return {
        id: p.id,
        name: 'Steve Arbogast',
        age: (bm.age as number) || null,
        sex: (bm.sex as string) || null,
        primary_diagnosis: (bm.primary_diagnosis as string) || 'Essential Tremor',
        source: 'live',
      }
    })

    // Live patients first so the real data is the default selection
    return NextResponse.json({ patients: [...livePatients, ...demoPatients] })
  } catch (error: unknown) {
    console.error('Wearable patients API Error:', error)
    const rawMessage = error instanceof Error ? error.message : String(error)
    const isDbError = rawMessage.includes('authentication failed') || rawMessage.includes('ECONNREFUSED') || rawMessage.includes('timeout') || rawMessage.includes('getaddrinfo')
    const message = isDbError ? 'Unable to connect to the data service. Please try again later.' : rawMessage
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
