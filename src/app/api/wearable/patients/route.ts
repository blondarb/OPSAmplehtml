import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { wearableFrom as from } from '@/lib/db-query'

export async function GET() {
  try {
    const { data, error } = await from('wearable_patients')
      .select('id, name, age, sex, primary_diagnosis, wearable_devices, monitoring_start_date')
      .order('name')

    if (error) throw new Error(error.message)

    // Tag each patient as 'demo' or 'live' based on whether they have
    // an Apple Watch with status 'connected' (from the iOS app)
    const patients = (data || []).map((p: Record<string, unknown>) => {
      const devices = p.wearable_devices as Array<{ name: string; status?: string }>
      const hasLiveAppleWatch = devices?.some(
        (d) => d.name === 'Apple Watch' && d.status === 'connected'
      )
      return { ...p, source: hasLiveAppleWatch ? 'live' : 'demo' }
    })

    return NextResponse.json({ patients })
  } catch (error: unknown) {
    console.error('Wearable patients API Error:', error)
    const rawMessage = error instanceof Error ? error.message : String(error)
    const isDbError = rawMessage.includes('authentication failed') || rawMessage.includes('ECONNREFUSED') || rawMessage.includes('timeout') || rawMessage.includes('getaddrinfo')
    const message = isDbError ? 'Unable to connect to the data service. Please try again later.' : rawMessage
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
