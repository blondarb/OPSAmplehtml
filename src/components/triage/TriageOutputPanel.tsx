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
import {
  DIMENSION_PRESENTATION,
  TIER_COUNT,
  TIER_PRESENTATION,
} from '@/lib/triage/tierPresentation'
import { buildFloorDisclosure } from '@/lib/triage/floorDisclosure'
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
import { hasModelSafetyFailure } from '@/lib/triage/safetyReviewView'

const EMERGENCY_TIMEFRAME = 'Emergency evaluation now'
const SAME_DAY_TIMEFRAME = 'Same-day clinician review'
interface Props {
  result: TriageResult
  onTryAnother: () => void
  /** Optional — omitting it keeps every existing call site and test unchanged. */
  onStartPatientInterview?: () => void
}

export default function TriageOutputPanel({ result, onTryAnother, onStartPatientInterview }: Props) {
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
  // Cause-honest copy: distinguishes a genuinely thin referral from our own
  // independent safety-model check failing to complete, so InsufficientDataPanel
  // never blames the referral for an internal failure (production incident
  // 2026-08-05).
  const internalSafetyFailure = hasModelSafetyFailure(presentationResult.safety_review)
  const hasGenuineMissingItems = Boolean(presentationResult.missing_information?.length)
  const isInsufficientData =
    !isEmergent &&
    !isSameDay &&
    (presentationResult.triage_tier === 'insufficient_data' ||
      presentationResult.care_pathway === 'undetermined')

  const tierPresentation = TIER_PRESENTATION[presentationResult.triage_tier]
  const hasDimensionScores = DIMENSION_PRESENTATION.some(
    (dim) => presentationResult.dimension_scores?.[dim.key],
  )
  // Disclose when a single-dimension safety floor, not the weighted total,
  // decided the tier (audit 2026-08-04).
  const floorDisclosure = buildFloorDisclosure({
    dimensionScores: presentationResult.dimension_scores,
    redFlagOverride: Boolean(presentationResult.red_flag_override),
    finalTier: presentationResult.triage_tier,
  })

  return (
    <>
      {/* Full-screen emergent alert */}
      {isEmergent && !emergentAcknowledged && (
        <EmergentAlert
          reason={presentationResult.emergent_reason}
          onAcknowledge={() => setEmergentAcknowledged(true)}
        />
      )}

      <div>
        <SafetyReviewPanel result={presentationResult} />
        {outputPolicy.safetyConflict && (
          <div role="alert" className="nn-flag">
            <h4>Safety conflict — human review hold</h4>
            <p>
              Emergency markers conflict with the projected care pathway.
              Emergency evaluation now remains active; outpatient disposition
              and scheduling remain blocked pending clinician reconciliation.
            </p>
          </div>
        )}
        {!isEmergent && outputPolicy.insufficientDataHold && (
          <div role="alert" className="nn-note">
            <h3>Insufficient or undetermined data — human review hold</h3>
            <p style={{ margin: '0 0 6px' }}>
              {isSameDay
                ? 'Same-day clinician review remains the active action. '
                : ''}
              Outpatient workup, routing, and final disposition remain blocked
              until a clinician reviews the available source evidence and
              resolves the decision-critical gaps.
            </p>
            <p style={{ fontWeight: 700, margin: 0, color: 'var(--nn-t1)' }}>
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
              internalFailure={internalSafetyFailure}
              hasGenuineMissingItems={hasGenuineMissingItems}
            />
            <ClinicalReasons reasons={presentationResult.clinical_reasons} />
            <RedFlagAlert redFlags={presentationResult.red_flags} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Red flags first — an override supersedes the score, so it must
                read above the score breakdown (brief Part 3). */}
            <RedFlagAlert redFlags={presentationResult.red_flags} />
            {presentationResult.red_flags.length > 0 && (
              <p className="nn-hint" style={{ margin: 0 }}>
                {RED_FLAG_DISCLAIMER}
              </p>
            )}

            {/* Tier — number, name, timeframe; never color alone */}
            <TriageTierBadge
              tier={presentationResult.triage_tier}
              weightedScore={presentationResult.weighted_score}
              isRedFlagOverride={presentationResult.red_flag_override}
              timeframeOverride={outputPolicy.timeframe}
            />

            {outputPolicy.showMissingInformation && (
              <MissingInformationPanel
                missingInformation={displayedMissingInformation}
                timeframe={outputPolicy.timeframe}
                schedulingLocked={outputPolicy.schedulingLocked}
                humanReviewHold={outputPolicy.dataConflict}
              />
            )}

            {/* How this was scored — the rubric is the credibility of the
                product: five dimensions, published weights, weighted total,
                and the mapping to the tier. */}
            {hasDimensionScores && (
              <div className="nn-card" style={{ margin: 0 }}>
                <h3 className="nn-card-title">How this was scored</h3>
                <p className="nn-hint">
                  Five fixed dimensions. Weights are published and do not
                  change between runs.
                </p>
                {DIMENSION_PRESENTATION.map(({ key, label, weight }) => {
                  const dim = presentationResult.dimension_scores?.[key]
                  if (!dim) return null
                  return (
                    <div className="nn-dim" key={key}>
                      <span className="nn-dim-name">
                        {label} <sup>{weight}</sup>
                      </span>
                      <span className="nn-dim-val">{dim.score} / 5</span>
                      <span className="nn-bar" aria-hidden="true">
                        <i style={{ width: `${Math.max(0, Math.min(5, dim.score)) * 20}%` }} />
                      </span>
                      {dim.rationale && (
                        <p className="nn-dim-rationale">{dim.rationale}</p>
                      )}
                    </div>
                  )
                })}
                <div className="nn-total">
                  <span>Weighted total</span>
                  <b>
                    {typeof presentationResult.weighted_score === 'number' &&
                    Number.isFinite(presentationResult.weighted_score)
                      ? `${presentationResult.weighted_score.toFixed(2)} / 5 → Tier ${tierPresentation.num} of ${TIER_COUNT} — ${tierPresentation.name}`
                      : `Tier ${tierPresentation.num} of ${TIER_COUNT} — ${tierPresentation.name}`}
                  </b>
                </div>
                {floorDisclosure && (
                  <div
                    className="nn-note"
                    style={{ margin: '10px 0 0' }}
                    role="note"
                    aria-label="Safety floor applied"
                  >
                    <h3>Safety floor applied — the tier is not from the weighted total</h3>
                    <p style={{ margin: '0 0 6px' }}>
                      The weighted total maps to{' '}
                      <strong>{floorDisclosure.scoreTierName}</strong>, but a single-dimension
                      safety floor raised it to <strong>{tierPresentation.name}</strong>. The
                      floor is deliberate: it prevents a high score on one dimension from being
                      averaged away.
                    </p>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {floorDisclosure.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {presentationResult.red_flag_override && (
                  <p style={{ color: 'var(--nn-t1)', fontSize: 'var(--nn-fs-sm)', fontWeight: 600, margin: '8px 0 0' }}>
                    A red-flag override applied — the override supersedes the
                    weighted score.
                  </p>
                )}
                <p style={{ marginTop: 10, marginBottom: 0, fontSize: 'var(--nn-fs-sm)', color: 'var(--nn-ink-2)' }}>
                  Confidence:{' '}
                  <strong>
                    {presentationResult.confidence.charAt(0).toUpperCase() + presentationResult.confidence.slice(1)}
                  </strong>
                </p>
              </div>
            )}

            {/* Low confidence disclaimer */}
            {presentationResult.confidence === 'low' && (
              <div className="nn-note" style={{ margin: 0 }}>
                {LOW_CONFIDENCE_DISCLAIMER}
              </div>
            )}

            {/* Clinical reasons */}
            <ClinicalReasons reasons={presentationResult.clinical_reasons} />

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

            {/* Suggested workup */}
            {outputPolicy.showPreVisitWorkup && (
              <>
                {isSameDay && presentationResult.suggested_workup.length > 0 && (
                  <div
                    aria-label="Same-day non-blocking workup notice"
                    className="nn-note"
                    style={{ margin: 0 }}
                  >
                    <h3>Non-blocking workup</h3>
                    <p style={{ margin: 0 }}>
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

            {/* Stability caveat — the rubric is fixed; the model's reading is not */}
            <div className="nn-caveat" style={{ margin: 0 }}>
              <b>Stability. </b>
              The five dimensions, their published weights, the tier boundaries, and the
              red-flag overrides are fixed and do not change between runs. The AI&apos;s reading
              of a borderline note may vary between runs and can shift the tier on close calls.
              Final triage decisions rest with the reviewing clinician.
            </div>

          </div>
        )}

        {/* Actions on the result */}
        <div className="nn-actions" style={{ marginTop: 16 }}>
          <CopyReportButton result={presentationResult} />
          <button
            onClick={() => setAlgorithmOpen(true)}
            className="nn-btn nn-btn--sec"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            View Algorithm
          </button>
          <button onClick={onTryAnother} className="nn-btn nn-btn--sec">
            Try Another
          </button>
          {/* Suppressed on the emergency/emergent path — routing a possible
              emergency into a leisurely patient-history interview is exactly
              the wrong affordance. Reuses this file's own `isEmergent`, not a
              second copy of the emergency-marker logic. */}
          {!isEmergent && onStartPatientInterview && (
            <button onClick={onStartPatientInterview} className="nn-btn nn-btn--sec">
              Continue to patient interview
            </button>
          )}
        </div>

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
