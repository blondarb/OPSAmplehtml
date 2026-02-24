'use client'

import { ClinicalUseCase } from '@/lib/wearable/types'

// Per-diagnosis detail expansions for the 3-column layout
const DETAIL_DATA: Record<string, {
  monitor: string[]
  detection: string[]
  action: string[]
  examplePattern: string
}> = {
  "Parkinson's Disease": {
    monitor: [
      'Continuous tremor percentage tracked via accelerometer throughout the day',
      'Dyskinetic minutes counted to assess levodopa peak-dose effects',
      'Step count and gait variability index for mobility trending',
    ],
    detection: [
      'Baseline comparison: tremor % trended against 30-day rolling average',
      'Fall detection via impact signature + post-fall inactivity window',
      'Medication wear-off pattern: tremor spikes correlated with dosing schedule',
    ],
    action: [
      'Triage team reviews multi-day tremor trend before escalating to neurologist',
      'Fall events trigger immediate caregiver notification and next-day MD review',
      'Dose timing adjustment recommendations generated with supporting data',
    ],
    examplePattern: 'Tremor % rises from 8% baseline to 14% over 4 days; step count drops 35%; gait variability increases 20% -- suggests medication adjustment needed.',
  },
  'Epilepsy': {
    monitor: [
      'Heart rate surge patterns paired with rhythmic accelerometer movement',
      'Post-ictal inactivity duration and recovery heart rate trajectory',
      'Nocturnal heart rate and movement patterns for sleep-related events',
    ],
    detection: [
      'Seizure proxy: HR spike > 40% above resting + repetitive movement lasting > 15 seconds',
      'Cluster detection: 2 or more seizure-like events within a rolling 24-hour window',
      'Post-ictal signature: sustained inactivity + gradual HR normalization',
    ],
    action: [
      'Any detected event triggers immediate patient/caregiver verification prompt',
      'Cluster events escalate directly to neurologist with full event timeline',
      'Seizure diary auto-populated for next clinic visit review',
    ],
    examplePattern: 'HR jumps from 68 to 112 bpm with rhythmic arm movement for 45 seconds, followed by 20 minutes of inactivity -- seizure-like event flagged for verification.',
  },
  'Multiple Sclerosis': {
    monitor: [
      'Composite fatigue index derived from daily steps and sleep efficiency',
      'Heart rate response to activity as a proxy for heat sensitivity',
      'Sleep quality metrics including deep sleep percentage and awakenings',
    ],
    detection: [
      'Sustained fatigue: fatigue index elevated > 30% above baseline for 5+ consecutive days',
      'Activity cliff: abrupt drop > 40% in daily steps without external explanation',
      'Disproportionate HR rise: elevated HR response to low-intensity activity suggesting heat or deconditioning',
    ],
    action: [
      'Screen for relapse versus pseudorelapse using wearable data timeline',
      'Check for concurrent infection or UTI that may mimic relapse symptoms',
      'Review disease-modifying therapy adherence and consider MRI if relapse suspected',
    ],
    examplePattern: 'Steps drop from 6,200/day average to 3,400 over 5 days; sleep efficiency falls from 88% to 72%; HR during walks rises 25% -- possible relapse or pseudorelapse.',
  },
  'Migraine': {
    monitor: [
      'Heart rate variability (HRV) daily trends as a prodrome biomarker',
      'Sleep disruption patterns including onset latency and fragmentation',
      'Activity level shifts in the 24-48 hours preceding attacks',
    ],
    detection: [
      'Prodrome signature: HRV dip + sleep disruption detected 24-48 hours before attack',
      'Frequency tracking: migraine-associated patterns counted per month',
      'Trigger correlation: sleep deficit or HRV drop linked to subsequent attack',
    ],
    action: [
      'Patient nudge sent when prodrome pattern recognized to take abortive medication early',
      'Monthly frequency report generated for preventive therapy adequacy review',
      'Sleep hygiene recommendations personalized to detected disruption patterns',
    ],
    examplePattern: 'HRV drops 18% below 7-day average; sleep onset delayed 45 min with 4 awakenings; next day activity down 30% -- prodrome pattern detected, abortive nudge sent.',
  },
  'Essential Tremor': {
    monitor: [
      'Tremor percentage tracked across different times of day',
      'Activity patterns to identify functional impact of tremor',
      'Medication timing correlated with tremor intensity curves',
    ],
    detection: [
      'Worsening trend: tremor % increasing > 15% over a 2-week window',
      'Medication wear-off: clear tremor peaks correlating with end-of-dose intervals',
      'Functional impact: activity reduction coinciding with tremor increases',
    ],
    action: [
      'Review medication response curve and consider dose timing adjustment',
      'Assess functional impact through activity-tremor correlation data',
      'Generate tremor trend report for clinic visit decision-making',
    ],
    examplePattern: 'Tremor % averages 12% morning, 6% midday (post-medication), 15% evening -- wear-off pattern suggests dose timing or evening dose addition.',
  },
  'Restless Leg Syndrome': {
    monitor: [
      'Nighttime leg movement frequency and duration via accelerometer',
      'Sleep efficiency and total sleep time trending',
      'Awakening count and time-to-sleep-onset patterns',
    ],
    detection: [
      'Excessive nighttime movements: periodic limb movement index rising above baseline',
      'Sleep efficiency decline below 70% sustained for 5+ nights',
      'Augmentation signal: symptoms appearing earlier in the day over weeks',
    ],
    action: [
      'Assess iron levels (ferritin) as first-line investigation',
      'Review dopaminergic therapy for possible augmentation',
      'Provide sleep hygiene recommendations targeting detected disruption patterns',
    ],
    examplePattern: 'Sleep efficiency drops from 82% to 65% over 7 nights; awakenings increase from 3 to 8/night; nighttime movement bursts detected between 11pm-2am -- RLS worsening.',
  },
  'Narcolepsy': {
    monitor: [
      'Daytime inactivity episodes suggesting microsleep events',
      'Nighttime sleep architecture including fragmentation and efficiency',
      'Daily step pattern with gaps indicating involuntary sleep episodes',
    ],
    detection: [
      'Microsleep proxy: sudden daytime inactivity > 5 minutes during active hours',
      'Nighttime fragmentation: sleep efficiency < 65% with frequent awakenings',
      'Irregular sleep-wake pattern: high day-to-day variability in sleep/wake timing',
    ],
    action: [
      'Review stimulant medication timing and dosing based on daytime episode patterns',
      'Assess sodium oxybate response using nighttime sleep quality metrics',
      'Driving safety counseling triggered when daytime episodes exceed threshold',
    ],
    examplePattern: 'Five sudden inactivity episodes detected between 10am-4pm lasting 5-12 minutes each; nighttime sleep efficiency 58% with 11 awakenings -- medication review needed.',
  },
  'Peripheral Neuropathy': {
    monitor: [
      'Gait variability index as a proxy for proprioceptive and motor function',
      'Daily step count trending to detect progressive mobility decline',
      'Fall event detection with impact characterization',
    ],
    detection: [
      'Progressive instability: gait variability increasing over weeks',
      'Mobility decline: step count dropping > 25% over a 2-week period',
      'Fall clustering: multiple fall events within a short timeframe',
    ],
    action: [
      'Assess neuropathy progression with updated nerve conduction studies if indicated',
      'Review glycemic control in diabetic patients based on activity decline rate',
      'PT/OT referral and assistive device evaluation based on fall risk data',
    ],
    examplePattern: 'Step count declines from 5,000 to 3,500 over 2 weeks; gait variability up 30%; one fall event detected -- neuropathy progression assessment indicated.',
  },
}

export default function UseCaseDetailPanel({ useCase }: { useCase: ClinicalUseCase }) {
  const details = DETAIL_DATA[useCase.diagnosis]

  if (!details) {
    return null
  }

  const columnHeaderStyle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 600,
    color: '#94A3B8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '12px',
  }

  const bulletStyle: React.CSSProperties = {
    fontSize: '13px',
    color: '#CBD5E1',
    lineHeight: '1.6',
    marginBottom: '8px',
    paddingLeft: '12px',
    position: 'relative' as const,
  }

  const bulletDotStyle: React.CSSProperties = {
    position: 'absolute' as const,
    left: '0',
    top: '8px',
    width: '4px',
    height: '4px',
    borderRadius: '50%',
    backgroundColor: '#64748B',
  }

  return (
    <tr>
      <td colSpan={5} style={{ padding: 0, border: 'none' }}>
        <div
          style={{
            backgroundColor: '#1e293b',
            borderTop: '1px solid #334155',
            padding: '20px 24px',
            animation: 'fadeIn 0.2s ease-in-out',
          }}
        >
          {/* 3-column layout */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '24px',
            }}
          >
            {/* Column 1: What We Monitor */}
            <div>
              <div style={columnHeaderStyle}>What We Monitor</div>
              {details.monitor.map((item, i) => (
                <div key={i} style={bulletStyle}>
                  <div style={bulletDotStyle} />
                  {item}
                </div>
              ))}
            </div>

            {/* Column 2: AI Detection Logic */}
            <div>
              <div style={columnHeaderStyle}>AI Detection Logic</div>
              {details.detection.map((item, i) => (
                <div key={i} style={bulletStyle}>
                  <div style={bulletDotStyle} />
                  {item}
                </div>
              ))}
            </div>

            {/* Column 3: Clinical Action */}
            <div>
              <div style={columnHeaderStyle}>Clinical Action</div>
              {details.action.map((item, i) => (
                <div key={i} style={bulletStyle}>
                  <div style={bulletDotStyle} />
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Example Pattern */}
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              backgroundColor: '#0F172A',
              borderRadius: '8px',
              borderLeft: '3px solid #475569',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#64748B',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
                marginBottom: '6px',
              }}
            >
              Example Wearable Data Pattern
            </div>
            <div
              style={{
                fontSize: '13px',
                color: '#94A3B8',
                lineHeight: '1.6',
                fontStyle: 'italic',
              }}
            >
              {details.examplePattern}
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
}
