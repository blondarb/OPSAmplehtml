import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const PATIENT = {
  name: 'Linda Martinez',
  age: 58,
  sex: 'F',
  primary_diagnosis: "Parkinson's Disease",
  medications: [
    { name: 'Carbidopa/Levodopa', dose: '25/100mg', frequency: 'TID' }
  ],
  wearable_devices: [
    { name: 'Samsung Galaxy Watch 7', status: 'connected', data_types: ['hr', 'hrv', 'steps', 'sleep', 'accelerometer', 'gyroscope', 'spo2'] }
  ],
  baseline_metrics: {
    resting_hr: 68, hrv_rmssd: 32, daily_steps: 5500,
    sleep_hours: 6.75, tremor_pct: 12, dyskinetic_mins: 8,
    sleep_efficiency: 0.85, awakenings: 1.5
  },
  monitoring_start_date: '2026-01-24'
}

function jitter(base: number, pct: number): number {
  return Math.round((base + base * (Math.random() - 0.5) * 2 * pct) * 10) / 10
}

function generateDailySummaries(patientId: string) {
  const startDate = new Date('2026-01-24')
  const summaries = []

  for (let day = 0; day < 30; day++) {
    const date = new Date(startDate)
    date.setDate(date.getDate() + day)
    const dateStr = date.toISOString().split('T')[0]
    const dayNum = day + 1

    let metrics: Record<string, number>
    let anomalies: string[] = []
    let status = 'normal'

    if (dayNum <= 10) {
      metrics = {
        avg_hr: jitter(72, 0.03), resting_hr: jitter(68, 0.02),
        hrv_rmssd: jitter(32, 0.08), hrv_7day_avg: 32,
        total_steps: jitter(5500, 0.1), steps_7day_avg: 5500,
        sleep_hours: jitter(6.75, 0.05), sleep_deep: jitter(1.5, 0.1),
        sleep_rem: jitter(1.8, 0.1), sleep_light: jitter(3.0, 0.1),
        sleep_awake: jitter(0.45, 0.15), sleep_efficiency: jitter(85, 0.03),
        awakenings: Math.round(jitter(1.5, 0.2)),
        tremor_pct: jitter(12, 0.1), dyskinetic_mins: jitter(8, 0.15),
      }
    } else if (dayNum === 11) {
      metrics = {
        avg_hr: 78, resting_hr: 72, hrv_rmssd: 24, hrv_7day_avg: 31,
        total_steps: 3200, steps_7day_avg: 5300,
        sleep_hours: 5.5, sleep_deep: 0.8, sleep_rem: 1.2, sleep_light: 2.8,
        sleep_awake: 0.7, sleep_efficiency: 72, awakenings: 3,
        tremor_pct: 38, dyskinetic_mins: 45,
      }
      anomalies = ['Missed medication dose: tremor spike to 38%, dyskinetic minutes 45']
      status = 'alert'
    } else if (dayNum === 12) {
      metrics = {
        avg_hr: 74, resting_hr: 69, hrv_rmssd: 28, hrv_7day_avg: 30,
        total_steps: 4800, steps_7day_avg: 5200,
        sleep_hours: 6.2, sleep_deep: 1.2, sleep_rem: 1.5, sleep_light: 3.0,
        sleep_awake: 0.5, sleep_efficiency: 80, awakenings: 2,
        tremor_pct: 14, dyskinetic_mins: 12,
      }
      status = 'watch'
    } else if (dayNum >= 13 && dayNum <= 18) {
      const progress = (dayNum - 13) / 5
      metrics = {
        avg_hr: 72 + progress * 4, resting_hr: 68 + progress * 3,
        hrv_rmssd: 30 - progress * 8, hrv_7day_avg: 30 - progress * 5,
        total_steps: Math.round(5200 - progress * 1600),
        steps_7day_avg: Math.round(5100 - progress * 1000),
        sleep_hours: 6.5 - progress * 0.8, sleep_deep: 1.3 - progress * 0.4,
        sleep_rem: 1.6 - progress * 0.3, sleep_light: 3.0, sleep_awake: 0.6 + progress * 0.3,
        sleep_efficiency: 82 - progress * 10, awakenings: Math.round(2 + progress * 1.5),
        tremor_pct: 14 + progress * 14, dyskinetic_mins: Math.round(10 + progress * 25),
      }
      status = dayNum >= 15 ? 'concern' : 'watch'
      if (dayNum === 15) {
        anomalies = ['3-day sustained activity decline with rising tremor percentages']
      }
    } else if (dayNum === 19) {
      metrics = {
        avg_hr: 82, resting_hr: 72, hrv_rmssd: 20, hrv_7day_avg: 24,
        total_steps: 2800, steps_7day_avg: 3800,
        sleep_hours: 5.8, sleep_deep: 0.9, sleep_rem: 1.1, sleep_light: 3.0,
        sleep_awake: 0.8, sleep_efficiency: 70, awakenings: 3,
        tremor_pct: 30, dyskinetic_mins: 38,
      }
      anomalies = ['Fall detected: accelerometer impact + brief inactivity + HR spike to 112']
      status = 'alert'
    } else if (dayNum === 20) {
      metrics = {
        avg_hr: 76, resting_hr: 70, hrv_rmssd: 22, hrv_7day_avg: 23,
        total_steps: 2400, steps_7day_avg: 3500,
        sleep_hours: 5.2, sleep_deep: 0.7, sleep_rem: 1.0, sleep_light: 2.8,
        sleep_awake: 0.7, sleep_efficiency: 68, awakenings: 3,
        tremor_pct: 28, dyskinetic_mins: 32,
      }
      anomalies = ['Sustained activity and sleep decline following fall event']
      status = 'concern'
    } else if (dayNum >= 21 && dayNum <= 25) {
      const progress = (dayNum - 21) / 4
      metrics = {
        avg_hr: 76 - progress * 4, resting_hr: 70 - progress * 2,
        hrv_rmssd: 22 + progress * 6, hrv_7day_avg: 23 + progress * 4,
        total_steps: Math.round(2800 + progress * 1800),
        steps_7day_avg: Math.round(3200 + progress * 1200),
        sleep_hours: 5.5 + progress * 0.8, sleep_deep: 0.9 + progress * 0.3,
        sleep_rem: 1.2 + progress * 0.3, sleep_light: 2.8 + progress * 0.2,
        sleep_awake: 0.6 - progress * 0.15, sleep_efficiency: 72 + progress * 8,
        awakenings: Math.round(2.5 - progress),
        tremor_pct: 26 - progress * 6, dyskinetic_mins: Math.round(28 - progress * 10),
      }
      status = 'watch'
    } else if (dayNum === 26) {
      metrics = {
        avg_hr: 73, resting_hr: 69, hrv_rmssd: 28, hrv_7day_avg: 27,
        total_steps: 4500, steps_7day_avg: 4200,
        sleep_hours: 6.3, sleep_deep: 1.2, sleep_rem: 1.5, sleep_light: 3.0,
        sleep_awake: 0.6, sleep_efficiency: 79, awakenings: 2,
        tremor_pct: 20, dyskinetic_mins: 18,
      }
      status = 'watch'
    } else if (dayNum === 27) {
      metrics = {
        avg_hr: 80, resting_hr: 71, hrv_rmssd: 21, hrv_7day_avg: 26,
        total_steps: 2200, steps_7day_avg: 3900,
        sleep_hours: 5.0, sleep_deep: 0.6, sleep_rem: 0.9, sleep_light: 2.8,
        sleep_awake: 0.7, sleep_efficiency: 66, awakenings: 4,
        tremor_pct: 30, dyskinetic_mins: 35,
      }
      anomalies = ['Second fall detected: 2 falls in 9 days']
      status = 'alert'
    } else {
      const progress = (dayNum - 28) / 2
      metrics = {
        avg_hr: 74 - progress * 2, resting_hr: 69,
        hrv_rmssd: 26 + progress * 3, hrv_7day_avg: 26 + progress * 2,
        total_steps: Math.round(3800 + progress * 800),
        steps_7day_avg: Math.round(3700 + progress * 400),
        sleep_hours: 6.0 + progress * 0.3, sleep_deep: 1.0 + progress * 0.2,
        sleep_rem: 1.3 + progress * 0.1, sleep_light: 3.0, sleep_awake: 0.55,
        sleep_efficiency: 75 + progress * 3, awakenings: 2,
        tremor_pct: 22 - progress * 2, dyskinetic_mins: Math.round(20 - progress * 4),
      }
      status = 'watch'
    }

    summaries.push({
      patient_id: patientId,
      date: dateStr,
      metrics,
      anomalies_detected: anomalies,
      ai_analysis: anomalies.length > 0 ? `Anomaly detected: ${anomalies[0]}` : 'No clinically concerning patterns detected.',
      overall_status: status,
    })
  }
  return summaries
}

function generateAnomalies(patientId: string, startDate: string) {
  const start = new Date(startDate)
  function dayDate(dayNum: number) {
    const d = new Date(start)
    d.setDate(d.getDate() + dayNum - 1)
    return d.toISOString()
  }

  return [
    {
      patient_id: patientId, detected_at: dayDate(11),
      anomaly_type: 'medication_pattern', severity: 'attention',
      trigger_data: { tremor_pct: 38, dyskinetic_mins: 45, steps: 3200, hrv: 24 },
      ai_assessment: 'Significant medication-related event. Resting tremor spiked to 38% with dyskinetic minutes at 45, consistent with a missed or delayed Carbidopa/Levodopa dose.',
      ai_reasoning: 'Multiple simultaneous metric deviations: tremor +217% above baseline, dyskinetic minutes +463% above baseline, steps -42% below baseline, HRV -25% below baseline. The rapid onset and concurrent nature of all deviations is consistent with medication interruption rather than disease progression.',
      clinical_significance: 'Medication adherence event. The simultaneous tremor spike and motor fluctuation increase suggest a missed dose rather than disease progression.',
      recommended_action: 'Monitor for recovery. If pattern repeats, consider medication adherence counseling or dose timing review.',
      patient_message: null,
    },
    {
      patient_id: patientId, detected_at: dayDate(15),
      anomaly_type: 'sustained_decline', severity: 'attention',
      trigger_data: { steps_trend: [5200, 4800, 4500], tremor_trend: [14, 16, 19], days: 3 },
      ai_assessment: '3-day sustained activity decline with rising resting tremor percentages. Pattern consistent with medication wearing-off or disease progression.',
      ai_reasoning: "Step count has declined 13% over 3 consecutive days while resting tremor percentage has risen from 14% to 19%. These concurrent trends in opposite directions (activity down, tremor up) are a reliable signal of motor function deterioration in Parkinson's patients.",
      clinical_significance: 'Progressive motor decline beyond normal variation. The trend direction and duration (3+ days) meet the threshold for clinical attention.',
      recommended_action: 'Consider medication timing review. Evaluate for wearing-off phenomena.',
      patient_message: null,
    },
    {
      patient_id: patientId, detected_at: dayDate(19),
      anomaly_type: 'fall_event', severity: 'urgent',
      trigger_data: { accelerometer_impact: true, inactivity_seconds: 90, hr_spike: 112, hr_baseline: 68 },
      ai_assessment: 'Fall event detected. Accelerometer registered high-impact event followed by 90 seconds of inactivity. Heart rate spiked to 112 bpm (65% above resting baseline).',
      ai_reasoning: 'Three concurrent signals confirm fall: (1) accelerometer impact exceeding fall threshold, (2) subsequent inactivity period >60 seconds, (3) heart rate spike >30 bpm above baseline. High confidence fall event.',
      clinical_significance: "Fall in a Parkinson's patient with progressive motor decline over the preceding week. Assess for injury and evaluate fall risk factors.",
      recommended_action: 'Urgent: Assess for injury. Review fall risk. Consider PT referral. Review medication timing.',
      patient_message: "Hi Linda, it looks like you may have had a fall today. We hope you're okay. If you're hurt or need help, please call 911 or your emergency contact right away. Your care team has been notified and may reach out to check on you.",
    },
    {
      patient_id: patientId, detected_at: dayDate(20),
      anomaly_type: 'sustained_decline', severity: 'attention',
      trigger_data: { steps: 2400, sleep_efficiency: 68, awakenings: 3, post_fall: true },
      ai_assessment: 'Continued decline following fall event. Activity significantly reduced, sleep fragmented with 3 awakenings.',
      ai_reasoning: "Post-fall pattern: activity dropped further (2,400 steps vs. 5,500 baseline), sleep efficiency dropped to 68% with 3 awakenings (vs. baseline 85% and 1.5). This pattern is common after falls in Parkinson's patients \u2014 fear of falling reduces activity, pain/anxiety disrupts sleep.",
      clinical_significance: 'Post-fall deconditioning risk. The combination of reduced activity and disrupted sleep can accelerate motor decline.',
      recommended_action: 'Patient nudge: encourage communication with care team. Monitor for further decline.',
      patient_message: "Hi Linda, if you've been feeling any changes in how you move or your energy level this week, it might be a good time to give your care team a call. You can reach our office at [number] anytime. We're here to help.",
    },
    {
      patient_id: patientId, detected_at: dayDate(27),
      anomaly_type: 'fall_event', severity: 'urgent',
      trigger_data: { accelerometer_impact: true, inactivity_seconds: 75, hr_spike: 108, falls_in_9_days: 2 },
      ai_assessment: '2 falls in 9 days. Second fall event confirmed by accelerometer impact, inactivity, and heart rate spike. This recurrent fall pattern in the context of progressive motor decline requires urgent clinical intervention.',
      ai_reasoning: "Fall detection criteria met (impact + inactivity + HR spike). Critical context: this is the second fall in 9 days (Day 19 and Day 27). Two falls in <14 days in a Parkinson's patient with concurrent tremor worsening and activity decline represents a significant fall risk escalation requiring multidisciplinary intervention.",
      clinical_significance: "Recurrent falls in Parkinson's disease. High fall risk requiring PT evaluation, medication review, and home safety assessment.",
      recommended_action: 'Urgent: PT evaluation referral, medication review, home safety assessment. Auto-draft PT referral order.',
      patient_message: 'Hi Linda, we noticed another fall event. Your care team has been alerted and will reach out soon. If you need immediate help, please call 911.',
    },
  ]
}

function generateAlerts(patientId: string, anomalyIds: string[], anomalies: { severity: string, anomaly_type: string, detected_at: string, recommended_action: string, patient_message: string | null }[]) {
  const alerts = []
  for (let i = 0; i < anomalies.length; i++) {
    const a = anomalies[i]
    alerts.push({
      anomaly_id: anomalyIds[i],
      patient_id: patientId,
      created_at: a.detected_at,
      alert_type: a.severity === 'urgent' ? 'urgent_escalation' : 'clinician_notification',
      severity: a.severity,
      title: a.anomaly_type === 'fall_event' ? 'Fall Event Detected' :
             a.anomaly_type === 'sustained_decline' ? 'Sustained Activity Decline' :
             a.anomaly_type === 'medication_pattern' ? 'Medication Pattern Detected' : 'Anomaly Detected',
      body: a.recommended_action,
      acknowledged: i < 3,
      escalated_to_md: a.severity === 'urgent',
      action_taken: i < 3 ? 'Reviewed by triage team' : null,
    })
    if (a.patient_message) {
      alerts.push({
        anomaly_id: anomalyIds[i],
        patient_id: patientId,
        created_at: a.detected_at,
        alert_type: 'patient_nudge',
        severity: 'informational',
        title: 'Patient Message Sent',
        body: a.patient_message,
        acknowledged: true,
        escalated_to_md: false,
        action_taken: 'Delivered via SMS',
      })
    }
  }
  return alerts
}

async function seed() {
  console.log('Seeding wearable demo data...')

  // 1. Delete existing demo data (idempotent)
  const { data: existingPatients } = await supabase
    .from('wearable_patients')
    .select('id')
    .eq('name', 'Linda Martinez')
  if (existingPatients && existingPatients.length > 0) {
    for (const p of existingPatients) {
      await supabase.from('wearable_alerts').delete().eq('patient_id', p.id)
      await supabase.from('wearable_anomalies').delete().eq('patient_id', p.id)
      await supabase.from('wearable_daily_summaries').delete().eq('patient_id', p.id)
    }
    await supabase.from('wearable_patients').delete().eq('name', 'Linda Martinez')
    console.log('Cleared existing demo data.')
  }

  // 2. Insert patient
  const { data: patient, error: patientErr } = await supabase
    .from('wearable_patients')
    .insert(PATIENT)
    .select('id')
    .single()
  if (patientErr) throw new Error(`Patient insert failed: ${patientErr.message}`)
  console.log(`Created patient: ${patient.id}`)

  // 3. Insert daily summaries
  const summaries = generateDailySummaries(patient.id)
  const { error: summErr } = await supabase.from('wearable_daily_summaries').insert(summaries)
  if (summErr) throw new Error(`Summaries insert failed: ${summErr.message}`)
  console.log(`Inserted ${summaries.length} daily summaries.`)

  // 4. Insert anomalies
  const anomalyData = generateAnomalies(patient.id, PATIENT.monitoring_start_date)
  const { data: insertedAnomalies, error: anomErr } = await supabase
    .from('wearable_anomalies')
    .insert(anomalyData)
    .select('id')
  if (anomErr) throw new Error(`Anomalies insert failed: ${anomErr.message}`)
  console.log(`Inserted ${insertedAnomalies.length} anomalies.`)

  // 5. Insert alerts
  const anomalyIds = insertedAnomalies.map(a => a.id)
  const alertData = generateAlerts(patient.id, anomalyIds, anomalyData as any)
  const { error: alertErr } = await supabase.from('wearable_alerts').insert(alertData)
  if (alertErr) throw new Error(`Alerts insert failed: ${alertErr.message}`)
  console.log(`Inserted ${alertData.length} alerts.`)

  console.log('Wearable demo data seeded successfully!')
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
