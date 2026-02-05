'use client'

import { SDNESessionResult, SDNEDomain, SDNE_FLAG_THEME } from '@/lib/sdneTypes'

interface SDNEInterpretationProps {
  session: SDNESessionResult
}

interface Observation {
  text: string
  domain: SDNEDomain
  severity: 'info' | 'caution' | 'concern'
  supportingTasks: string[]
}

/**
 * Generate clinical interpretation observations from session results
 * Uses suggestive language per clinical standards
 */
function generateObservations(session: SDNESessionResult): Observation[] {
  const observations: Observation[] = []
  const df = session.domainFlags
  const tasks = new Map(session.taskResults.map((t) => [t.taskId, t]))

  // Gait observations
  if (df.Gait === 'RED' || df.Gait === 'YELLOW') {
    const t15 = tasks.get('T15')
    const t16 = tasks.get('T16')
    const speed = t15?.metrics?.gait_speed_m_s as number | undefined
    const tug = t16?.metrics?.total_time_s as number | undefined
    const parts: string[] = []
    if (speed != null) parts.push(`gait speed ${speed.toFixed(2)} m/s`)
    if (tug != null) parts.push(`TUG ${tug.toFixed(1)}s`)
    observations.push({
      text: `Gait findings (${parts.join(', ')}) may warrant further evaluation for fall risk and underlying mobility impairment.`,
      domain: 'Gait',
      severity: df.Gait === 'RED' ? 'concern' : 'caution',
      supportingTasks: ['T15', 'T16'].filter((id) => tasks.has(id)),
    })
  }

  // Motor observations (tremor / bradykinesia)
  if (df.Motor === 'RED' || df.Motor === 'YELLOW') {
    const t09 = tasks.get('T09')
    const t11 = tasks.get('T11')
    const parts: string[] = []
    if (t09?.flag === 'RED' || t09?.flag === 'YELLOW') parts.push('rest tremor')
    if (t11?.flag === 'RED' || t11?.flag === 'YELLOW') parts.push('reduced finger tapping rate')
    if (parts.length > 0) {
      observations.push({
        text: `The combination of ${parts.join(' and ')} could be consistent with a movement disorder. Consider extended motor assessment if clinically appropriate.`,
        domain: 'Motor',
        severity: df.Motor === 'RED' ? 'concern' : 'caution',
        supportingTasks: ['T09', 'T10', 'T11'].filter((id) => tasks.has(id)),
      })
    }
  }

  // Cognition observations
  if (df.Cognition === 'RED' || df.Cognition === 'YELLOW') {
    const t17 = tasks.get('T17')
    const t01 = tasks.get('T01')
    const t03 = tasks.get('T03')
    const parts: string[] = []
    if (t17?.flag === 'RED' || t17?.flag === 'YELLOW') parts.push('delayed recall')
    if (t01?.flag === 'RED' || t01?.flag === 'YELLOW') parts.push('orientation')
    if (t03?.flag === 'RED' || t03?.flag === 'YELLOW') parts.push('digit span')
    observations.push({
      text: `Cognitive screening findings${parts.length > 0 ? ` (${parts.join(', ')})` : ''} may suggest further cognitive evaluation. These findings should be interpreted alongside the patient's educational background and clinical history.`,
      domain: 'Cognition',
      severity: df.Cognition === 'RED' ? 'concern' : 'caution',
      supportingTasks: ['T01', 'T02', 'T03', 'T17'].filter((id) => tasks.has(id)),
    })
  } else if (df.Cognition === 'GREEN') {
    observations.push({
      text: 'Cognitive screening (orientation, digit span, delayed recall) was within normal limits.',
      domain: 'Cognition',
      severity: 'info',
      supportingTasks: ['T01', 'T02', 'T03', 'T17'],
    })
  }

  // Oculomotor observations
  if (df.Oculomotor === 'RED' || df.Oculomotor === 'YELLOW') {
    const t05 = tasks.get('T05')
    const gain = t05?.metrics?.horizontal_gain as number | undefined
    const gainStr = gain != null ? ` (gain: ${gain.toFixed(2)})` : ''
    observations.push({
      text: `Oculomotor findings showed borderline smooth pursuit${gainStr}. This may reflect subclinical cerebellar or brainstem involvement but could also be within normal age-related variation.`,
      domain: 'Oculomotor',
      severity: 'caution',
      supportingTasks: ['T04', 'T05', 'T06'].filter((id) => tasks.has(id)),
    })
  }

  // Facial observations
  if (df.Facial === 'RED') {
    const t07 = tasks.get('T07')
    const asym = t07?.metrics?.asymmetry_index as number | undefined
    observations.push({
      text: `Facial asymmetry findings${asym ? ` (index: ${asym.toFixed(2)})` : ''} may be consistent with a facial nerve or central nervous system process. Clinical correlation is recommended.`,
      domain: 'Facial',
      severity: 'concern',
      supportingTasks: ['T07', 'T08'].filter((id) => tasks.has(id)),
    })
  }

  // Language observations
  if (df.Language === 'RED' || df.Language === 'YELLOW') {
    const t13 = tasks.get('T13')
    const words = t13?.metrics?.valid_words as number | undefined
    observations.push({
      text: `Language assessment findings${words != null ? ` (${words} animals in 45s)` : ''} may warrant further speech-language evaluation to characterize the nature of any word-finding difficulty.`,
      domain: 'Language',
      severity: df.Language === 'RED' ? 'concern' : 'caution',
      supportingTasks: ['T13', 'T14'].filter((id) => tasks.has(id)),
    })
  }

  return observations
}

const SEVERITY_STYLES = {
  info: { bg: '#F0F9FF', border: '#BAE6FD', icon: '#0284C7' },
  caution: { bg: SDNE_FLAG_THEME.yellow.bg, border: SDNE_FLAG_THEME.yellow.border, icon: SDNE_FLAG_THEME.yellow.main },
  concern: { bg: SDNE_FLAG_THEME.red.bg, border: SDNE_FLAG_THEME.red.border, icon: SDNE_FLAG_THEME.red.main },
}

/**
 * Clinical interpretation panel with AI-like observations
 * Provides suggestive language that doesn't constitute diagnosis
 */
export function SDNEInterpretation({ session }: SDNEInterpretationProps) {
  const observations = generateObservations(session)

  if (observations.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A56DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
        </svg>
        <h4 className="text-sm font-semibold text-gray-900">Clinical Interpretation Suggestions</h4>
      </div>

      {/* Disclaimer */}
      <div className="mb-3 p-2 rounded bg-gray-50 border border-gray-200">
        <p className="text-xs text-gray-500 leading-relaxed">
          These observations are generated to assist clinical decision-making. They do not constitute a diagnosis.
          All findings should be interpreted in the context of the patient&apos;s full clinical presentation.
        </p>
      </div>

      {/* Observations */}
      <div className="flex flex-col gap-2">
        {observations.map((obs, idx) => {
          const styles = SEVERITY_STYLES[obs.severity]
          return (
            <div
              key={idx}
              style={{
                backgroundColor: styles.bg,
                border: `1px solid ${styles.border}`,
              }}
              className="p-3 rounded-lg"
            >
              <div className="flex items-start gap-2">
                <span
                  style={{ backgroundColor: styles.icon }}
                  className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                />
                <div className="flex-1">
                  <p className="text-sm text-gray-900 leading-relaxed">
                    {obs.text}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      {obs.domain}
                    </span>
                    <span className="text-xs text-gray-400">
                      {obs.supportingTasks.join(', ')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
