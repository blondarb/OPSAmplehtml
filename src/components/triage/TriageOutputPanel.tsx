'use client'

import { useState } from 'react'
import {
  LOW_CONFIDENCE_DISCLAIMER,
  RED_FLAG_DISCLAIMER,
  type TriageResult,
} from '@/lib/triage/types'
import {
  DATA_CONFLICT_INFORMATION,
  INSUFFICIENT_DATA_INFORMATION,
  triageOutputPolicy,
} from '@/lib/triage/triageOutputPolicy'
import TriageTierBadge from './TriageTierBadge'
import ClinicalReasons from './ClinicalReasons'
import RedFlagAlert from './RedFlagAlert'
import PreVisitWorkup from './PreVisitWorkup'
import FailedTherapiesList from './FailedTherapiesList'
import SubspecialtyRouter from './SubspecialtyRouter'
import InsufficientDataPanel from './InsufficientDataPanel'
import MissingInformationPanel from './MissingInformationPanel'
import EmergentAlert from './EmergentAlert'
import DisclaimerBanner from './DisclaimerBanner'
import CopyReportButton from './CopyReportButton'
import AlgorithmModal from './AlgorithmModal'
import PhysicianOverridePanel from './PhysicianOverridePanel'
import SafetyReviewPanel from './SafetyReviewPanel'
import EmergencyActionPanel from './EmergencyActionPanel'

const EMERGENCY_TIMEFRAME = 'Emergency evaluation now'
const SAME_DAY_TIMEFRAME = 'Same-day clinician review'
interface Props {
  result: TriageResult
  onTryAnother: () => void
}

export default function TriageOutputPanel({ result, onTryAnother }: Props) {
  const [emergentAcknowledged, setEmergentAcknowledged] = useState(false)
  const [algorithmOpen, setAlgorithmOpen] = useState(false)
  const displayedResult = result
  const outputPolicy = triageOutputPolicy(displayedResult)
  const presentationResult =
    displayedResult.scheduling_locked === outputPolicy.schedulingLocked
      ? displayedResult
      : { ...displayedResult, scheduling_locked: outputPolicy.schedulingLocked }
  const displayedMissingInformation =
    presentationResult.missing_information?.length
      ? presentationResult.missing_information
      : Array.from(
          new Set([
            ...(outputPolicy.dataConflict
              ? [DATA_CONFLICT_INFORMATION]
              : []),
            ...(outputPolicy.insufficientDataHold
              ? [INSUFFICIENT_DATA_INFORMATION]
              : []),
          ]),
        )
  const isEmergent = outputPolicy.timeframe === EMERGENCY_TIMEFRAME
  const isSameDay = outputPolicy.timeframe === SAME_DAY_TIMEFRAME
  const isInsufficientData =
    !isEmergent &&
    !isSameDay &&
    (presentationResult.triage_tier === 'insufficient_data' ||
      presentationResult.care_pathway === 'undetermined')

  return (
    <>
      {/* Full-screen emergent alert */}
      {isEmergent && !emergentAcknowledged && (
        <EmergentAlert
          reason={presentationResult.emergent_reason}
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
            <CopyReportButton result={presentationResult} />
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

        <SafetyReviewPanel result={presentationResult} />
        {outputPolicy.safetyConflict && (
          <div
            role="alert"
            style={{
              marginBottom: '16px',
              padding: '16px',
              borderRadius: '8px',
              border: '2px solid #DC2626',
              background: 'rgba(127, 29, 29, 0.24)',
            }}
          >
            <h3
              style={{
                color: '#FEE2E2',
                fontSize: '0.95rem',
                margin: '0 0 6px',
              }}
            >
              Safety conflict — human review hold
            </h3>
            <p
              style={{
                color: '#FECACA',
                fontSize: '0.8rem',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              Emergency markers conflict with the projected care pathway.
              Emergency evaluation now remains active; outpatient disposition
              and scheduling remain blocked pending clinician reconciliation.
            </p>
          </div>
        )}
        {!isEmergent && outputPolicy.insufficientDataHold && (
          <div
            role="alert"
            style={{
              marginBottom: '16px',
              padding: '16px',
              borderRadius: '8px',
              border: '2px solid #D97706',
              background: 'rgba(120, 53, 15, 0.22)',
            }}
          >
            <h3
              style={{
                color: '#FDE68A',
                fontSize: '0.95rem',
                margin: '0 0 6px',
              }}
            >
              Insufficient or undetermined data — human review hold
            </h3>
            <p
              style={{
                color: '#FCD34D',
                fontSize: '0.8rem',
                lineHeight: 1.5,
                margin: '0 0 6px',
              }}
            >
              {isSameDay
                ? 'Same-day clinician review remains the active action. '
                : ''}
              Outpatient workup, routing, and final disposition remain blocked
              until a clinician reviews the available source evidence and
              resolves the decision-critical gaps.
            </p>
            <p
              style={{
                color: '#FCA5A5',
                fontSize: '0.78rem',
                fontWeight: 700,
                margin: 0,
              }}
            >
              Scheduling remains locked.
            </p>
          </div>
        )}
        {isEmergent && (
          <EmergencyActionPanel sessionId={presentationResult.session_id} />
        )}
        {/* Insufficient data — special layout */}
        {isInsufficientData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <InsufficientDataPanel
              missingInformation={displayedMissingInformation}
            />
            <ClinicalReasons reasons={presentationResult.clinical_reasons} />
            <RedFlagAlert redFlags={presentationResult.red_flags} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Tier badge — centered */}
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <TriageTierBadge
                tier={presentationResult.triage_tier}
                weightedScore={presentationResult.weighted_score}
                isRedFlagOverride={presentationResult.red_flag_override}
                timeframeOverride={outputPolicy.timeframe}
              />
            </div>

            {outputPolicy.showMissingInformation && (
              <MissingInformationPanel
                missingInformation={displayedMissingInformation}
                timeframe={outputPolicy.timeframe}
                schedulingLocked={outputPolicy.schedulingLocked}
                humanReviewHold={outputPolicy.dataConflict}
              />
            )}

            {/* Confidence */}
            <div style={{
              textAlign: 'center',
              padding: '4px 0',
            }}>
              <span style={{
                color: presentationResult.confidence === 'high' ? '#16A34A' : presentationResult.confidence === 'moderate' ? '#CA8A04' : '#DC2626',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}>
                Confidence: {presentationResult.confidence.charAt(0).toUpperCase() + presentationResult.confidence.slice(1)}
              </span>
            </div>

            {/* Low confidence disclaimer */}
            {presentationResult.confidence === 'low' && (
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
            {presentationResult.red_flags.length > 0 && (
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
            <ClinicalReasons reasons={presentationResult.clinical_reasons} />

            {/* Red flags */}
            <RedFlagAlert redFlags={presentationResult.red_flags} />

            {/* Suggested workup */}
            {outputPolicy.showPreVisitWorkup && (
              <>
                {isSameDay && presentationResult.suggested_workup.length > 0 && (
                  <div
                    aria-label="Same-day non-blocking workup notice"
                    style={{
                      padding: '12px 14px',
                      background: 'rgba(217, 119, 6, 0.12)',
                      border: '1px solid #D97706',
                      borderRadius: '8px',
                    }}
                  >
                    <h3
                      style={{
                        color: '#FDE68A',
                        fontSize: '0.85rem',
                        margin: '0 0 4px',
                      }}
                    >
                      Non-blocking workup
                    </h3>
                    <p
                      style={{
                        color: '#FCD34D',
                        fontSize: '0.78rem',
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      Any suggested workup is optional before review and must
                      not delay same-day clinician review.
                    </p>
                  </div>
                )}
                <PreVisitWorkup workup={presentationResult.suggested_workup} />
              </>
            )}

            {/* Failed therapies */}
            <FailedTherapiesList therapies={presentationResult.failed_therapies} />

            {/* Subspecialty routing */}
            {outputPolicy.showOutpatientRouting && (
              <SubspecialtyRouter
                subspecialty={presentationResult.subspecialty_recommendation}
                rationale={presentationResult.subspecialty_rationale}
                redirectToNonNeuro={presentationResult.redirect_to_non_neuro}
                redirectSpecialty={presentationResult.redirect_specialty}
                redirectRationale={presentationResult.redirect_rationale}
              />
            )}

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
                {Object.entries(presentationResult.dimension_scores).map(([key, dim]) => (
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

          </div>
        )}

        {/* Human review actions remain available even when data is insufficient. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
          <PhysicianOverridePanel
            sessionId={presentationResult.session_id}
            currentTier={presentationResult.triage_tier}
          />
        </div>

        {/* Disclaimer banner */}
        <DisclaimerBanner />
      </div>

      {/* Algorithm modal */}
      <AlgorithmModal open={algorithmOpen} onClose={() => setAlgorithmOpen(false)} />
    </>
  )
}
