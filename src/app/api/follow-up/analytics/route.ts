import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import type { AnalyticsData } from '@/lib/follow-up/billingTypes'
import { from } from '@/lib/db-query'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const fromDate = searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString()
    const toDate = searchParams.get('to') || new Date().toISOString()
    const sourceFilter = searchParams.get('source') // 'visit' | 'demo' | null (all)

    // Fetch all sessions in range (including visit-linked ones)
    const { data: sessions, error: sessionsError } = await from('followup_sessions')
      .select('*')
      .gte('created_at', fromDate)
      .lte('created_at', toDate)
      .order('created_at', { ascending: true })

    if (sessionsError) {
      console.error('Analytics sessions query error:', sessionsError)
      return NextResponse.json({ error: 'Failed to fetch analytics data' }, { status: 500 })
    }

    const rawSessions = sessions || []

    // Compute visit-linked metrics before filtering
    const sessionsFromVisits = rawSessions.filter(
      (s: Record<string, unknown>) => s.visit_id != null,
    )
    const sessionsFromDemo = rawSessions.filter(
      (s: Record<string, unknown>) => s.visit_id == null,
    )

    // Apply source filter if provided
    let allSessions: Record<string, unknown>[]
    if (sourceFilter === 'visit') {
      allSessions = sessionsFromVisits
    } else if (sourceFilter === 'demo') {
      allSessions = sessionsFromDemo
    } else {
      allSessions = rawSessions
    }

    const completedSessions = allSessions.filter(
      (s: Record<string, unknown>) => s.conversation_complete === true || s.status === 'completed'
    )

    // Summary stats
    const totalCalls = allSessions.length
    const completionRate = totalCalls > 0 ? Math.round((completedSessions.length / totalCalls) * 100) : 0

    const totalDuration = allSessions.reduce(
      (sum: number, s: Record<string, unknown>) => sum + (Number(s.duration_seconds) || 0),
      0
    )
    const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0

    // Estimated revenue from billing entries
    const { data: billingData } = await from('followup_billing_entries')
      .select('cpt_rate, billing_status')
      .in('billing_status', ['ready_to_bill', 'billed'])
      .gte('created_at', fromDate)
      .lte('created_at', toDate)

    const estimatedRevenue = (billingData || []).reduce(
      (sum: number, b: Record<string, unknown>) => sum + (Number(b.cpt_rate) || 0),
      0
    )

    // Volume by week
    const weekBuckets: Record<string, number> = {}
    for (const s of allSessions) {
      const date = new Date(s.created_at as string)
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay())
      const key = weekStart.toISOString().split('T')[0]
      weekBuckets[key] = (weekBuckets[key] || 0) + 1
    }
    const volumeByPeriod = Object.entries(weekBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, count]) => ({ period, count }))

    // Completion trend by week
    const completionByWeek: Record<string, { total: number; completed: number }> = {}
    for (const s of allSessions) {
      const date = new Date(s.created_at as string)
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay())
      const key = weekStart.toISOString().split('T')[0]
      if (!completionByWeek[key]) completionByWeek[key] = { total: 0, completed: 0 }
      completionByWeek[key].total++
      if (s.conversation_complete === true || s.status === 'completed') {
        completionByWeek[key].completed++
      }
    }
    const completionTrend = Object.entries(completionByWeek)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, { total, completed }]) => ({
        period,
        rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      }))

    // Escalation distribution
    const escalationDistribution = { urgent: 0, same_day: 0, next_visit: 0, informational: 0 }
    for (const s of allSessions) {
      const level = s.escalation_level as string | null
      if (level && level in escalationDistribution) {
        escalationDistribution[level as keyof typeof escalationDistribution]++
      }
    }

    // Medication adherence
    let filledCount = 0
    let takingCount = 0
    let sideEffectCount = 0
    let totalMeds = 0
    for (const s of allSessions) {
      const meds = s.medication_status as Array<Record<string, unknown>> | null
      if (meds && Array.isArray(meds)) {
        for (const m of meds) {
          totalMeds++
          if (m.filled === true) filledCount++
          if (m.taking === true) takingCount++
          if (Array.isArray(m.sideEffects) && m.sideEffects.length > 0) sideEffectCount++
        }
      }
    }
    const medicationAdherence = {
      filledRate: totalMeds > 0 ? Math.round((filledCount / totalMeds) * 100) : 0,
      takingRate: totalMeds > 0 ? Math.round((takingCount / totalMeds) * 100) : 0,
      sideEffectRate: totalMeds > 0 ? Math.round((sideEffectCount / totalMeds) * 100) : 0,
    }

    // Functional status
    const functionalStatus = { better: 0, same: 0, worse: 0 }
    for (const s of completedSessions) {
      const status = s.functional_status as string | null
      if (status && status in functionalStatus) {
        functionalStatus[status as keyof typeof functionalStatus]++
      }
    }

    // Mode distribution
    const modeDistribution = { sms: 0, voice: 0 }
    for (const s of allSessions) {
      const method = s.follow_up_method as string | null
      if (method === 'sms') modeDistribution.sms++
      else if (method === 'voice') modeDistribution.voice++
    }

    // Recent escalations
    const { data: escalations } = await from('followup_escalations')
      .select('id, session_id, tier, category, created_at, acknowledged')
      .gte('created_at', fromDate)
      .lte('created_at', toDate)
      .order('created_at', { ascending: false })
      .limit(10)

    // Map escalations to include patient name from sessions
    const sessionMap = new Map(allSessions.map((s: Record<string, unknown>) => [s.id, s]))
    const recentEscalations = (escalations || []).map((e: Record<string, unknown>) => {
      const session = sessionMap.get(e.session_id) as Record<string, unknown> | undefined
      return {
        id: e.id as string,
        patientName: (session?.patient_name as string) || 'Unknown',
        tier: e.tier as string,
        category: e.category as string,
        date: e.created_at as string,
        acknowledged: (e.acknowledged as boolean) || false,
        sessionId: e.session_id as string,
      }
    })

    // Source distribution: visit-linked vs demo-initiated
    const sourceDistribution = {
      fromVisits: sessionsFromVisits.length,
      fromDemo: sessionsFromDemo.length,
      total: rawSessions.length,
    }

    const analyticsData: AnalyticsData & { sourceDistribution: typeof sourceDistribution } = {
      summary: { totalCalls, completionRate, avgDuration, estimatedRevenue },
      volumeByPeriod,
      completionTrend,
      escalationDistribution,
      medicationAdherence,
      functionalStatus,
      modeDistribution,
      recentEscalations,
      sourceDistribution,
    }

    return NextResponse.json(analyticsData)
  } catch (error) {
    console.error('Analytics API error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch analytics'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
