'use client'

import type { DiagnosticSufficiencyV1 } from '@/lib/historian/diagnosticSufficiency'
import type {
  ClinicianHistoryReportV1,
  ClinicianHistorySectionId,
} from '@/lib/historian/eval/clinicianHistoryReport'
import type { HistorianSession } from '@/lib/historianTypes'

const SECTION_LABELS: Record<ClinicianHistorySectionId, string> = {
  chief_concern_and_timeline: 'Chief concern and timeline',
  symptom_characterization: 'Symptom characterization',
  associated_features: 'Associated features',
  red_flags_and_safety: 'Red flags and safety history',
  functional_impact: 'Functional impact',
  prior_evaluation_and_treatment: 'Prior evaluation and treatment response',
  past_medical_history: 'Past medical history',
  neurologic_history: 'Neurologic history',
  family_history: 'Family history',
  social_history: 'Social and exposure history',
}
interface Props {
  report: ClinicianHistoryReportV1 | null | undefined
  sufficiency: DiagnosticSufficiencyV1 | null | undefined
  evaluationStatus: HistorianSession['evaluation_status']
  terminationReason: HistorianSession['interview_termination_reason']
  onQuoteClick?: (patientSeq: number) => void
}

function StateMessage({ children, tone = 'neutral' }: {
  children: React.ReactNode
  tone?: 'neutral' | 'warning' | 'error'
}) {
  const colors = tone === 'warning'
    ? { background: '#fffbeb', border: '#f59e0b', color: '#92400e' }
    : tone === 'error'
      ? { background: '#fef2f2', border: '#ef4444', color: '#991b1b' }
      : { background: '#f8fafc', border: '#cbd5e1', color: '#475569' }
  return (
    <div role={tone === 'error' ? 'alert' : undefined} style={{
      background: colors.background,
      border: `1px solid ${colors.border}`,
      color: colors.color,
      borderRadius: 8,
      padding: '10px 12px',
      fontSize: '0.8rem',
      lineHeight: 1.45,
    }}>
      {children}
    </div>
  )
}

export default function ClinicianHistoryReportCard({
  report,
  sufficiency,
  evaluationStatus,
  terminationReason,
  onQuoteClick,
}: Props) {
  if (!report) {
    if (evaluationStatus === 'failed') {
      return <StateMessage tone="error">The clinician history report could not be generated. The confirmed transcript remains available.</StateMessage>
    }
    if (evaluationStatus === 'completed') {
      return <StateMessage tone="error">The evaluation completed without a valid clinician history report. Review the transcript; do not treat this interview as summarized.</StateMessage>
    }
    return <StateMessage>The citation-grounded clinician report is {evaluationStatus === 'retry_wait' ? 'waiting to retry' : 'processing'}.</StateMessage>
  }

  const partial = report.report_status === 'partial'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {partial && (
        <StateMessage tone="warning">
          Partial history report. The interview ended because of <strong>{terminationReason ?? 'an incomplete session'}</strong>. Missing information is not interpreted as negative.
        </StateMessage>
      )}
      {report.report_status === 'complete_with_uncertainty' && (
        <StateMessage tone="warning">
          History completed with unresolved information. Verify the cited transcript and medication reconciliation.
        </StateMessage>
      )}

      {report.sections.map((section) => (
        <section key={section.id} style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
          <h4 style={{ margin: '0 0 6px', fontSize: '0.78rem', color: '#0f172a' }}>
            {SECTION_LABELS[section.id]}
          </h4>
          {section.claims.length === 0 ? (
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.76rem', fontStyle: 'italic' }}>
              Not obtained or not documented in the confirmed transcript.
            </p>
          ) : section.claims.map((claim, claimIndex) => (
            <div key={`${section.id}-${claimIndex}`} style={{ marginBottom: 7 }}>
              <div style={{ fontSize: '0.79rem', color: '#1e293b', lineHeight: 1.45 }}>
                {claim.text}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 3 }}>
                {claim.citations.map((citation, citationIndex) => (
                  <button
                    key={`${citation.patient_seq}-${citationIndex}`}
                    type="button"
                    onClick={() => onQuoteClick?.(citation.patient_seq)}
                    title={citation.quote}
                    style={{
                      border: '1px solid #99f6e4',
                      background: '#f0fdfa',
                      color: '#0f766e',
                      borderRadius: 999,
                      padding: '2px 7px',
                      cursor: onQuoteClick ? 'pointer' : 'default',
                      fontSize: '0.68rem',
                    }}
                  >
                    Patient turn {citation.patient_seq}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}

      <section>
        <h4 style={{ margin: '0 0 6px', fontSize: '0.78rem', color: '#0f172a' }}>
          Medication reconciliation
        </h4>
        {report.medication_reconciliation.items.length === 0 ? (
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.76rem' }}>No medication name was confirmed.</p>
        ) : report.medication_reconciliation.items.map((item) => (
          <div key={item.id} style={{ fontSize: '0.77rem', color: '#1e293b', marginBottom: 5 }}>
            <strong>{item.heardName}</strong>
            {' — '}
            {item.nameStatus === 'confirmed' ? 'patient-confirmed name' : 'name uncertain'};
            {' amount: '}{item.dose.value ?? item.dose.status};
            {' schedule: '}{item.frequency.value ?? item.frequency.status}
          </div>
        ))}
        {sufficiency?.medication.status !== 'closed' && (
          <p style={{ margin: '6px 0 0', color: '#92400e', fontSize: '0.74rem' }}>
            Medication reconciliation has unresolved or unobtained information; review the transcript.
          </p>
        )}
      </section>

      {report.limitations.length > 0 && (
        <section>
          <h4 style={{ margin: '0 0 6px', fontSize: '0.78rem', color: '#0f172a' }}>Limitations</h4>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#92400e', fontSize: '0.75rem' }}>
            {report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}
