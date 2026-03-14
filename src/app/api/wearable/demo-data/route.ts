import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { wearableFrom } from '@/lib/db-query'
import { getWearablePool } from '@/lib/db'


// Normalize metrics from iOS app format to web dashboard format.
// iOS app stores daily summary metrics in camelCase (avgHr, dailySteps, etc.);
// hourly snapshots and older records use snake_case. Support both.
function normalizeMetrics(raw: Record<string, unknown>): Record<string, unknown> {
  const rawAvgHr = Number(raw.avg_hr ?? raw.avgHr)
  const avgHr = (rawAvgHr > 0) ? rawAvgHr : null  // 0 means HealthKit had no data
  const rawRestingHr = Number(raw.resting_hr ?? raw.restingHr)
  const restingHr = (rawRestingHr > 0) ? rawRestingHr : null

  const sleepHours = Number(raw.sleep_hours ?? raw.sleepHours) || 0
  const sleepEfficiency = Number(raw.sleep_efficiency ?? raw.sleepEfficiency) || 0
  const noSleepData = sleepHours === 0 && sleepEfficiency === 0

  const sleepDeep = Number(raw.sleep_deep ?? raw.sleepDeep) || 0
  const sleepRem = Number(raw.sleep_rem ?? raw.sleepRem) || 0
  const sleepLight = Number(raw.sleep_light ?? raw.sleepLight) || 0
  const sleepAwake = Number(raw.sleep_awake ?? raw.sleepAwake) || 0
  const hasStages = (sleepDeep + sleepRem + sleepLight + sleepAwake) > 0

  const totalSteps = Number(raw.total_steps ?? raw.daily_steps ?? raw.dailySteps) || 0
  const hrvRmssd = raw.hrv_rmssd ?? raw.hrvRmssd
  const spo2Avg = raw.spo2_avg ?? raw.spo2Avg
  const spo2Min = raw.spo2_min ?? raw.spo2Min
  const activeCalories = raw.active_calories ?? raw.activeCalories

  return {
    avg_hr: avgHr,  // null when HealthKit has no data (avoids 0-bpm line on chart)
    resting_hr: restingHr,
    hrv_rmssd: Number(hrvRmssd) || 0,
    hrv_7day_avg: 0,       // placeholder — computed in rolling avg pass
    total_steps: totalSteps,
    steps_7day_avg: 0,     // placeholder — computed in rolling avg pass
    // Sleep fields
    sleep_hours: noSleepData ? null : sleepHours,
    sleep_deep: noSleepData ? null : (hasStages ? sleepDeep : null),
    sleep_rem: noSleepData ? null : (hasStages ? sleepRem : null),
    sleep_light: noSleepData ? null : (hasStages ? sleepLight : null),
    sleep_awake: noSleepData ? null : (hasStages ? sleepAwake : null),
    sleep_total: noSleepData ? null : (!hasStages && sleepHours > 0 ? sleepHours : null),
    sleep_efficiency: noSleepData ? null : sleepEfficiency,
    awakenings: noSleepData ? null : (Number(raw.awakenings) || 0),
    // Disease-specific (preserve as-is)
    tremor_pct: raw.tremor_pct != null ? Number(raw.tremor_pct) : undefined,
    dyskinetic_mins: raw.dyskinetic_mins != null ? Number(raw.dyskinetic_mins) : undefined,
    // iOS-specific
    spo2_avg: spo2Avg != null ? Number(spo2Avg) : undefined,
    spo2_min: spo2Min != null ? Number(spo2Min) : undefined,
    active_calories: activeCalories != null ? Number(activeCalories) : undefined,
  }
}

// Compute rolling 7-day averages for steps and HRV
function computeRollingAverages(summaries: Array<Record<string, unknown>>): void {
  for (let i = 0; i < summaries.length; i++) {
    const metrics = summaries[i].metrics as Record<string, unknown>
    const windowStart = Math.max(0, i - 6)
    const window = summaries.slice(windowStart, i + 1)

    // Steps rolling avg
    const stepValues = window
      .map(s => Number((s.metrics as Record<string, unknown>).total_steps) || 0)
      .filter(v => v > 0)
    metrics.steps_7day_avg = stepValues.length > 0
      ? Math.round(stepValues.reduce((a, b) => a + b, 0) / stepValues.length)
      : 0

    // HRV rolling avg
    const hrvValues = window
      .map(s => Number((s.metrics as Record<string, unknown>).hrv_rmssd) || 0)
      .filter(v => v > 0)
    metrics.hrv_7day_avg = hrvValues.length > 0
      ? Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length * 10) / 10
      : 0
  }
}

// Auto-compute baselines from actual data when patient baselines are all zeros
function computeBaselineFromData(
  patient: Record<string, unknown>,
  summaries: Array<Record<string, unknown>>
): Record<string, unknown> {
  const baseline = (patient.baseline_metrics as Record<string, unknown>) || {}

  // Check if baselines are all zeros
  const hasBaseline = (Number(baseline?.resting_hr) || 0) > 0 ||
                      (Number(baseline?.hrv_rmssd) || 0) > 0 ||
                      (Number(baseline?.avg_steps || baseline?.daily_steps) || 0) > 0 ||
                      (Number(baseline?.sleep_hours) || 0) > 0

  if (hasBaseline || summaries.length < 3) {
    return baseline
  }

  // Compute from actual data, excluding zeros/nulls
  const avg = (vals: number[]) => {
    const valid = vals.filter(v => v > 0)
    return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length * 10) / 10 : 0
  }

  const metrics = summaries.map(s => s.metrics as Record<string, unknown>)

  return {
    ...baseline,
    resting_hr: avg(metrics.map(m => Number(m.resting_hr) || 0)),
    hrv_rmssd: avg(metrics.map(m => Number(m.hrv_rmssd) || 0)),
    avg_steps: avg(metrics.map(m => Number(m.total_steps) || 0)),
    sleep_hours: avg(metrics.map(m => Number(m.sleep_hours) || 0)),
    sleep_efficiency: avg(metrics.map(m => Number(m.sleep_efficiency) || 0)),
    tremor_pct: baseline?.tremor_pct,
  }
}

// Normalize tapping hand results from iOS snake_case to web camelCase
// iOS app stores: taps_per_second, tap_count, inter_tap_cv, fatigue_decrement, duration_seconds
// Web expects: tapsPerSecond, totalTaps, coefficientOfVariation, fatigueDecrement
function normalizeTappingHand(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    hand: raw.hand,
    totalTaps: raw.totalTaps ?? raw.tap_count,
    tapsPerSecond: raw.tapsPerSecond ?? raw.taps_per_second,
    coefficientOfVariation: raw.coefficientOfVariation ?? raw.inter_tap_cv,
    fatigueDecrement: raw.fatigueDecrement ?? raw.fatigue_decrement,
    accuracy: raw.accuracy,
    score: raw.score,
    durationSeconds: raw.durationSeconds ?? raw.duration_seconds,
    interTapMean: raw.interTapMean ?? raw.inter_tap_mean,
  }
}

function normalizeTappingAssessment(raw: Record<string, unknown>): Record<string, unknown> {
  const hands = (raw.hands as Array<Record<string, unknown>>) || []
  return {
    ...raw,
    hands: hands.map(normalizeTappingHand),
  }
}

// Aggregate hourly snapshots into synthetic daily summaries when no wearable_daily_summaries exist.
// This handles live patients whose iPhone app sends hourly data but hasn't had daily rollup yet.
async function aggregateHourlyToDaily(patientId: string): Promise<Array<Record<string, unknown>>> {
  const pool = await getWearablePool()
  const { rows } = await pool.query(
    `SELECT
       DATE(hour_timestamp) AS date,
       AVG(avg_hr) FILTER (WHERE avg_hr > 0)         AS avg_hr,
       AVG(hrv_sdnn) FILTER (WHERE hrv_sdnn > 0)     AS hrv_rmssd,
       AVG(spo2_avg) FILTER (WHERE spo2_avg > 0)     AS spo2_avg,
       SUM(COALESCE(steps, 0))                        AS total_steps,
       SUM(COALESCE(active_calories, 0))              AS active_calories,
       COUNT(*)                                       AS snapshot_count
     FROM wearable_hourly_snapshots
     WHERE patient_id = $1
     GROUP BY DATE(hour_timestamp)
     ORDER BY date ASC`,
    [patientId]
  )

  return rows.map((row: Record<string, unknown>) => {
    const dateStr = row.date instanceof Date
      ? row.date.toISOString().split('T')[0]
      : String(row.date)
    return {
      id: `hourly-${patientId}-${dateStr}`,
      patient_id: patientId,
      date: dateStr,
      metrics: {
        avg_hr: row.avg_hr != null ? Math.round(Number(row.avg_hr)) : 0,
        resting_hr: null,
        hrv_rmssd: row.hrv_rmssd != null ? Math.round(Number(row.hrv_rmssd) * 10) / 10 : 0,
        total_steps: Number(row.total_steps) || 0,
        spo2_avg: row.spo2_avg != null ? Math.round(Number(row.spo2_avg) * 10) / 10 : undefined,
        active_calories: row.active_calories != null ? Math.round(Number(row.active_calories)) : undefined,
      },
      anomalies_detected: [],
      overall_status: 'normal',
      ai_analysis: null,
    }
  })
}

export async function GET(request: NextRequest) {
  try {
    const patientId = request.nextUrl.searchParams.get('patient_id')

    let patient
    if (patientId) {
      const { data, error } = await wearableFrom('wearable_patients')
        .select('*')
        .eq('id', patientId)
        .single()
      if (error) throw new Error(error.message)
      patient = data
    } else {
      const { data, error } = await wearableFrom('wearable_patients')
        .select('*')
        .eq('name', 'Linda Martinez')
        .limit(1)
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) {
        return NextResponse.json(
          { error: 'Demo patient not found. Run npm run seed:wearable first.' },
          { status: 404 }
        )
      }
      patient = data[0]
    }

    const [summariesRes, anomaliesRes, alertsRes, assessmentsRes, fluencyRes, tappingRes, narrativesRes] = await Promise.all([
      wearableFrom('wearable_daily_summaries').select('*').eq('patient_id', patient.id).order('date', { ascending: true }),
      wearableFrom('wearable_anomalies').select('*').eq('patient_id', patient.id).order('detected_at', { ascending: true }),
      wearableFrom('wearable_alerts').select('*').eq('patient_id', patient.id).order('created_at', { ascending: true }),
      wearableFrom('wearable_tremor_assessments').select('*').eq('patient_id', patient.id).order('assessed_at', { ascending: true }),
      wearableFrom('wearable_fluency_assessments').select('*').eq('patient_id', patient.id).order('assessed_at', { ascending: true }),
      wearableFrom('wearable_tapping_assessments').select('*').eq('patient_id', patient.id).order('assessed_at', { ascending: true }),
      wearableFrom('wearable_clinical_narratives').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
    ])

    // Check for query errors and collect warnings
    const warnings: string[] = []
    if (summariesRes.error) { console.error('wearable_daily_summaries query error:', summariesRes.error.message); warnings.push('daily_summaries: ' + summariesRes.error.message) }
    if (anomaliesRes.error) { console.error('wearable_anomalies query error:', anomaliesRes.error.message); warnings.push('anomalies: ' + anomaliesRes.error.message) }
    if (alertsRes.error) { console.error('wearable_alerts query error:', alertsRes.error.message); warnings.push('alerts: ' + alertsRes.error.message) }
    if (assessmentsRes.error) { console.error('wearable_tremor_assessments query error:', assessmentsRes.error.message); warnings.push('tremor_assessments: ' + assessmentsRes.error.message) }
    if (fluencyRes.error) { console.error('wearable_fluency_assessments query error:', fluencyRes.error.message); warnings.push('fluency_assessments: ' + fluencyRes.error.message) }
    if (tappingRes.error) { console.error('wearable_tapping_assessments query error:', tappingRes.error.message); warnings.push('tapping_assessments: ' + tappingRes.error.message) }
    if (narrativesRes.error) { console.error('wearable_clinical_narratives query error:', narrativesRes.error.message); warnings.push('clinical_narratives: ' + narrativesRes.error.message) }

    // Merge daily summaries with hourly snapshot aggregates:
    // 1. Always load hourly aggregates — they fill gaps and extend history.
    // 2. For dates that have a daily summary: overlay hourly metrics if avg_hr is missing/zero.
    // 3. For dates that only exist in hourly data (no daily summary): add as synthetic rows.
    // This ensures the full historical range is visible, not just dates with daily summaries.
    let rawSummaries: Array<Record<string, unknown>> = summariesRes.data || []
    try {
      const hourlyAgg = await aggregateHourlyToDaily(patient.id)
      const hourlyByDate = new Map<string, Record<string, unknown>>()
      for (const h of hourlyAgg) {
        hourlyByDate.set(String(h.date), h)
      }

      if (rawSummaries.length === 0 && hourlyByDate.size > 0) {
        // No daily summaries at all — use hourly aggregates directly
        rawSummaries = Array.from(hourlyByDate.values())
        console.log(`[demo-data] No daily summaries for patient ${patient.id} — aggregated ${rawSummaries.length} days from hourly snapshots`)
      } else if (hourlyByDate.size > 0) {
        // Build a set of dates already covered by daily summaries
        const dailyDates = new Set(rawSummaries.map(s => String(s.date).split('T')[0]))

        // Overlay hourly metrics for daily summaries missing avg_hr
        rawSummaries = rawSummaries.map(s => {
          const dateKey = String(s.date).split('T')[0]
          const m = s.metrics as Record<string, unknown>
          const existingHr = m?.avg_hr ?? m?.avgHr
          if ((existingHr == null || Number(existingHr) === 0) && hourlyByDate.has(dateKey)) {
            const hourly = hourlyByDate.get(dateKey)!
            return { ...s, metrics: { ...m, ...(hourly.metrics as Record<string, unknown>) } }
          }
          return s
        })

        // Append synthetic rows for hourly-only dates (older history with no daily summary)
        for (const [date, hourly] of hourlyByDate) {
          if (!dailyDates.has(date)) {
            rawSummaries.push(hourly)
          }
        }

        // Normalize all date fields to YYYY-MM-DD and re-sort chronologically
        rawSummaries = rawSummaries.map(s => ({ ...s, date: String(s.date).split('T')[0] }))
        rawSummaries.sort((a, b) => String(a.date).localeCompare(String(b.date)))
        console.log(`[demo-data] Final timeline: ${rawSummaries.length} days (${rawSummaries[0]?.date} → ${rawSummaries[rawSummaries.length - 1]?.date})`)
      }
    } catch (aggErr) {
      console.error('Hourly snapshot aggregation error:', aggErr)
      // Non-fatal — fall through with whatever daily summaries we have
    }

    // Normalize metrics and date fields in each daily summary
    const dailySummaries = rawSummaries.map((s: Record<string, unknown>) => ({
      ...s,
      date: String(s.date).split('T')[0],  // ensure clean YYYY-MM-DD for chart X-axis
      metrics: normalizeMetrics(s.metrics as Record<string, unknown>),
    }))

    // Compute rolling 7-day averages for steps and HRV
    computeRollingAverages(dailySummaries)

    // Auto-compute baselines if patient's are all zeros
    const effectiveBaseline = computeBaselineFromData(patient, dailySummaries)
    const patientWithBaseline = { ...patient, baseline_metrics: effectiveBaseline }

    return NextResponse.json({
      patient: patientWithBaseline,
      dailySummaries,
      anomalies: anomaliesRes.data || [],
      alerts: alertsRes.data || [],
      assessments: assessmentsRes.data || [],
      fluencyAssessments: fluencyRes.data || [],
      tappingAssessments: (tappingRes.data || []).map((a: any) => normalizeTappingAssessment(a as Record<string, unknown>)),
      narratives: narrativesRes.data || [],
      ...(warnings.length > 0 ? { warnings } : {}),
    })
  } catch (error: unknown) {
    console.error('Wearable demo-data API Error:', error)
    const rawMessage = error instanceof Error ? error.message : String(error)
    // Don't expose internal DB errors to the client
    const isDbError = rawMessage.includes('authentication failed') || rawMessage.includes('ECONNREFUSED') || rawMessage.includes('timeout') || rawMessage.includes('getaddrinfo')
    const message = isDbError ? 'Unable to connect to the data service. Please try again later.' : rawMessage
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
