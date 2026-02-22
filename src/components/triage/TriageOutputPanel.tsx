'use client'

import { useState } from 'react'
import { TriageResult, LOW_CONFIDENCE_DISCLAIMER, RED_FLAG_DISCLAIMER } from '@/lib/triage/types'
import TriageTierBadge from './TriageTierBadge'
import ClinicalReasons from './ClinicalReasons'
import RedFlagAlert from './RedFlagAlert'
import PreVisitWorkup from './PreVisitWorkup'
import FailedTherapiesList from './FailedTherapiesList'
import SubspecialtyRouter from './SubspecialtyRouter'
import InsufficientDataPanel from './InsufficientDataPanel'
import EmergentAlert from './EmergentAlert'
import DisclaimerBanner from './DisclaimerBanner'
import CopyReportButton from './CopyReportButton'
import AlgorithmModal from './AlgorithmModal'
import PhysicianOverridePanel from './PhysicianOverridePanel'
import PatientSelector from './PatientSelector'

interface Props {
  result: TriageResult
  onTryAnother: () => void
}

export default function TriageOutputPanel({ result, onTryAnother }: Props) {
  const [emergentAcknowledged, setEmergentAcknowledged] = useState(false)
  const [algorithmOpen, setAlgorithmOpen] = useState(false)

  const isEmergent = result.triage_tier === 'emergent'
  const isInsufficientData = result.triage_tier === 'insufficient_data'

  return (
    <>
      {/* Full-screen emergent alert */}
      {isEmergent && !emergentAcknowledged && (
        <EmergentAlert
          reason={result.emergent_reason}
          onAcknowledge={() => setEmergentAcknowledged(true)}
        />
      )}

      <div style={{
        background: '#0f172a',
        borderRadius: '12px',
        border: '1px solid #334155',
        padding: '24px',
      }}>
        {/* Header row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <h2 style={{ color: '#e2e8f0', fontSize: '1rem', fontWeight: 600, margin: 0 }}>
            Triage Recommendation
          </h2>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <CopyReportButton result={result} />
            <button
              onClick={() => setAlgorithmOpen(true)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                background: '#334155',
                color: '#e2e8f0',
                border: '1px solid #475569',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              View Algorithm
            </button>
            <button
              onClick={onTryAnother}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                background: '#334155',
                color: '#e2e8f0',
                border: '1px solid #475569',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Try Another
            </button>
          </div>
        </div>

        {/* Insufficient data — special layout */}
        {isInsufficientData ? (
          <InsufficientDataPanel missingInformation={result.missing_information} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Tier badge — centered */}
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <TriageTierBadge
                tier={result.triage_tier}
                weightedScore={result.weighted_score}
                isRedFlagOverride={result.red_flag_override}
              />
            </div>

            {/* Confidence */}
            <div style={{
              textAlign: 'center',
              padding: '4px 0',
            }}>
              <span style={{
                color: result.confidence === 'high' ? '#16A34A' : result.confidence === 'moderate' ? '#CA8A04' : '#DC2626',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}>
                Confidence: {result.confidence.charAt(0).toUpperCase() + result.confidence.slice(1)}
              </span>
            </div>

            {/* Low confidence disclaimer */}
            {result.confidence === 'low' && (
              <div style={{
                padding: '10px 14px',
                background: 'rgba(220, 38, 38, 0.08)',
                border: '1px solid #DC2626',
                borderRadius: '8px',
              }}>
                <p style={{ color: '#fca5a5', fontSize: '0.8rem', margin: 0, lineHeight: 1.5 }}>
                  {LOW_CONFIDENCE_DISCLAIMER}
                </p>
              </div>
            )}

            {/* Red flag disclaimer */}
            {result.red_flags.length > 0 && (
              <div style={{
                padding: '10px 14px',
                background: 'rgba(220, 38, 38, 0.05)',
                border: '1px solid #991B1B',
                borderRadius: '8px',
              }}>
                <p style={{ color: '#fca5a5', fontSize: '0.8rem', margin: 0, lineHeight: 1.5 }}>
                  {RED_FLAG_DISCLAIMER}
                </p>
              </div>
            )}

            {/* Clinical reasons */}
            <ClinicalReasons reasons={result.clinical_reasons} />

            {/* Red flags */}
            <RedFlagAlert redFlags={result.red_flags} />

            {/* Suggested workup */}
            <PreVisitWorkup workup={result.suggested_workup} />

            {/* Failed therapies */}
            <FailedTherapiesList therapies={result.failed_therapies} />

            {/* Subspecialty routing */}
            <SubspecialtyRouter
              subspecialty={result.subspecialty_recommendation}
              rationale={result.subspecialty_rationale}
            />

            {/* Dimension scores breakdown */}
            <div style={{
              padding: '16px',
              background: '#1e293b',
              borderRadius: '8px',
              border: '1px solid #334155',
            }}>
              <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 12px' }}>
                Dimension Scores
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(result.dimension_scores).map(([key, dim]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{
                      color: '#e2e8f0',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      minWidth: '24px',
                      textAlign: 'right',
                    }}>
                      {dim.score}/5
                    </span>
                    <div>
                      <span style={{ color: '#cbd5e1', fontSize: '0.8rem', fontWeight: 600 }}>
                        {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                      <p style={{ color: '#94a3b8', fontSize: '0.78rem', margin: '2px 0 0', lineHeight: 1.5 }}>
                        {dim.rationale}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Patient selector */}
            <PatientSelector sessionId={result.session_id} />

            {/* Physician override */}
            <PhysicianOverridePanel sessionId={result.session_id} />
          </div>
        )}

        {/* Disclaimer banner */}
        <DisclaimerBanner />
      </div>

      {/* Algorithm modal */}
      <AlgorithmModal open={algorithmOpen} onClose={() => setAlgorithmOpen(false)} />
    </>
  )
}
