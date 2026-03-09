import { NextResponse } from 'next/server'

export async function GET() {
  const envKeys = Object.keys(process.env)
    .filter(k => k.startsWith('BEDROCK') || k.startsWith('AWS') || k.startsWith('RDS') || k === 'NODE_ENV')
    .sort()

  const envSnapshot: Record<string, string> = {}
  for (const k of envKeys) {
    const v = process.env[k] || ''
    // Mask secrets — show first 4 chars only
    envSnapshot[k] = v.length > 4 ? v.substring(0, 4) + '***' : '(empty)'
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    envKeys: envSnapshot,
    totalEnvCount: Object.keys(process.env).length,
  })
}
