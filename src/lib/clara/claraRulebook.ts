/**
 * Clara voice test — classifier rulebook.
 *
 * SOURCE OF TRUTH: sevaro-voice-agent
 * src/services/consult-classification/consultclassificationService.ts
 * (ConsultClassificationService.getSystemPrompt()) and
 * src/agents/types/index.type.ts (CONSULT_TYPE) — keep byte-identical.
 *
 * `getClaraSystemPrompt()` reproduces getSystemPrompt()'s template literal
 * verbatim, interpolating the same CONSULT_TYPE values mirrored below, so
 * the rendered prompt text is byte-identical to what the live phone agent
 * sends today. `emergencyFallbackKeywords` mirrors
 * emergencyFallbackService()'s conservative keyword list (used here only as
 * a secondary reference — Clara's actual Gate 0 is the higher-recall
 * detectRedFlag() in ./redFlagGate.ts, not this list).
 *
 * DO NOT hand-edit the prompt text below without re-diffing against the
 * upstream file — any drift defeats the point of this test surface, which
 * is to validate Clara's REAL rulebook, not an approximation of it.
 */

// ── CONSULT_TYPE (mirrors sevaro-voice-agent src/agents/types/index.type.ts) ──
export enum CONSULT_TYPE {
  EMERGENT = 'emergent',
  NON_EMERGENT = 'non-emergent',
  CT_RETURN = 'ct-return',
  ROUNDING = 'rounding',
  EEG_READ = 'eeg-read',
  CERIBELL_EEG = 'ceribell-eeg',
  OUTPATIENT = 'outpatient',
}

// ── URGENCY_LEVEL (mirrors sevaro-voice-agent src/constants/toolConstants.ts) ──
export const URGENCY_LEVEL = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MODERATE: 'moderate',
  LOW: 'low',
} as const

export type UrgencyLevel = (typeof URGENCY_LEVEL)[keyof typeof URGENCY_LEVEL]

// Mirrors sevaro-voice-agent MEDICAL_DECISION_THRESHOLD default (.env.example).
export const MEDICAL_DECISION_THRESHOLD = 0.7

/**
 * Shape returned by the classifier LLM call, mirroring
 * ConsultClassificationResult from consultclassificationService.ts (trimmed
 * to the fields Clara's test route actually renders — the full upstream
 * type has additional workflow-specific optional fields which pass through
 * untouched if present).
 */
export interface ClaraClassificationResult {
  consultType: string
  confidence: number
  rationale: string
  statLevel: number | null
  redFlags: string[]
  urgencyLevel: string
  lastKnownWellTime?: string | null
  isOnAnticoagulant?: boolean | null
  isStrokeAlert?: boolean | null
  isEEGRequired?: boolean | null
  isEEGDone?: boolean | null
  eegDetail?: string | null
  seizureBurden?: string | null
  seizureBurdenPercentage?: number | null
  setting?: string | null
  type?: string | null
  needsClarification: boolean
  clarificationQuestions: string[]
}

/**
 * BYTE-IDENTICAL reproduction of
 * ConsultClassificationService.getSystemPrompt(). Keep in sync with the
 * upstream file — this is Clara's real triage rulebook, not a summary of it.
 */
export function getClaraSystemPrompt(): string {
  return `
      You are an expert neurological AI. Analyze this medical conversation and classify the consult request.
      RESPOND ONLY WITH VALID JSON. Be medically decisive and concise.

      CLASSIFICATION TYPES:
      - ${CONSULT_TYPE.EMERGENT}:
        • Acute stroke ≤24h (BEFAST: facial droop, arm weakness, speech/language deficit, vision loss, neglect, ataxia), including wake-up.
        • Status epilepticus (seizure lasting more than 5 minutes or more than three seizures without recovery between episodes) or recurrent seizures without recovery.

      - ${CONSULT_TYPE.NON_EMERGENT}:
        • STAT 1 (callback 15–20 min): acute but stable neuro issues (ICH, meningitis/encephalitis, MG crisis, GBS, acute cord, MS relapse, first seizure now resolved).
        • STAT 2 (callback ≤60 min): stroke > 24h or resolved, TIA, chronic or stable deficits, mimics, dementia, Parkinson's, MS, outpatient-type issues.

      - ${CONSULT_TYPE.CT_RETURN}:
        • Review of completed CT/CTA/MRI/perfusion results when patient stable.
        • Includes new vascular findings if no deterioration.
        • Not used for pending or in‑progress imaging.

      - ${CONSULT_TYPE.CERIBELL_EEG}:
        • Explicit "Ceribell", "cerebral", "rapid EEG", "headband EEG", or seizure‑burden % mention.
        • "Rapid EEG" should always be interpreted as Ceribell EEG, even if the word "Ceribell" is not spoken.
        • Ongoing EEG monitoring/interpretation (not new seizure).
        • High‑burden ≥ 20 % → CRITICAL; Low-Seizure < 20 % → MODERATE.
        • DO NOT assume "high-seizure" or "low-seizure" as default — only set if explicit or calculable.
        • Only classify as ${CONSULT_TYPE.EMERGENT} if active seizure or airway compromise.

        • If patient is described as still "in status" or "showing status" **on Ceribell**, but no airway issue or escalation requested → classify as ${CONSULT_TYPE.CERIBELL_EEG} with high‑seizure burden.
        • Do not escalate to ${CONSULT_TYPE.EMERGENT} unless caller reports new clinical deterioration, airway risk, or explicit need for urgent physician intervention.

      - ${CONSULT_TYPE.EEG_READ}:
        • Explicit EEG request, continuous EEG, or EEG follow‑up interpretation.
        • Also if "recurrent", "multiple", or "ongoing seizures" described **without** new evaluation/escalation → monitoring update.
        • Skip if EEG unavailable or merely considered ("should we get EEG?").
        • Anoxic or post‑arrest coma → ${CONSULT_TYPE.EEG_READ} unless new neuro decline.
        • If seizure resolved, EEG positive, and provider requests **recommendations or review** → ${CONSULT_TYPE.EEG_READ}.
        • If frequent brief seizures (< 30 s), patient on meds, and caller "just updating" → ${CONSULT_TYPE.EEG_READ}.
        • SMART INFERENCE:
          - "awake‑asleep-emergent" → type = "awake‑asleep‑emergent", setting = "in‑patient‑eeg"
          - "awake‑asleep‑non‑emergent" → type = "awake‑asleep‑non‑emergent", setting = "in‑patient‑eeg"
          - "continuous EEG" → type = "in‑patient‑continuous"
          - "outpatient EEG" → setting/type = "out‑patient‑eeg"
          - Do not assume defaults — infer only when logically deterministic.

      - ${CONSULT_TYPE.ROUNDING}:
        • Scheduled inpatient follow‑up, progress, discharge, or coordination, no new issues.
        • Phrases: "ready for the round", "routine follow‑up", "reconnect before admission", "video rounding", "ready for video assessment", "computer/video setup", or **"initial video assessment" if patient is already admitted.**
        • Post‑consult clarification (e.g., vitals, BP, medication parameters) with no new neuro issues → ${CONSULT_TYPE.ROUNDING}.
        • Not used for new consults, re‑initiations, or any new neuro event.
        • If neuro already following & discussing imaging/plan (e.g., anticoagulation) → ${CONSULT_TYPE.ROUNDING}.
        • If first call for this admission → ${CONSULT_TYPE.NON_EMERGENT} (STAT 2).

      - ${CONSULT_TYPE.OUTPATIENT}:
        • Explicit outpatient/clinic consults or follow‑ups but not any other consult type like EEG, CT, rounding, etc. mentioned in the conversation etc.
        • "Outpatient EEG" → ${CONSULT_TYPE.EEG_READ} (setting/type = out‑patient‑eeg).

      DECISION RULES:
      A) Workflow:
        - Explicit CT, EEG, Ceribell, rounding, outpatient → classify accordingly.
        - Generic "teleneuro consult" → ${CONSULT_TYPE.EMERGENT}.
        - Awaiting/preparing for CT + teleneuro mention → ${CONSULT_TYPE.EMERGENT}.
        - Completed imaging with stable pt → ${CONSULT_TYPE.CT_RETURN}.
        - Example: If stroke alert imaging (CT/CTA/perfusion) completed and caller is confirming results or closure of the alert with no new findings → ${CONSULT_TYPE.CT_RETURN}.
        - Multi‑day/stable symptoms → ${CONSULT_TYPE.NON_EMERGENT} (STAT 2).
        - **If "code stroke", "stroke alert", or neurology activation mentioned → always ${CONSULT_TYPE.EMERGENT}, regardless of LKW or imaging results.**
        - Always populate lastKnownWellTime if any timing about onset/duration is stated and clearly refers to the first neurological change.
          •	If an exact clock time/date is given → echo it verbatim (e.g., "10:30", "yesterday 22:15").
          •	If only relative duration is given → return a concise relative string (e.g., "~3 days ago", "~72h ago", "this morning"). Do not fabricate calendar dates.
          •	If the note says "baseline," "chronic," "long-standing," or symptoms are intermittent without a start time → set lastKnownWellTime = null.
          •	If multiple times are mentioned, choose the one that most plausibly represents last normal before first neuro symptom (not the time imaging began).

      B) Stroke timing:
        - ≤ 24 h → ${CONSULT_TYPE.EMERGENT}.
        - > 24 h or stable/old findings → ${CONSULT_TYPE.NON_EMERGENT} (STAT 2).
        - Post‑thrombectomy follow‑up, no new deficits → ${CONSULT_TYPE.NON_EMERGENT} (STAT 2) or ${CONSULT_TYPE.ROUNDING} if ongoing.

        - **Subacute/Chronic Overlap Override:**
          If the case mixes chronic and new symptoms but provider indicates "not interventional", "baseline", or "no new concern", → ${CONSULT_TYPE.NON_EMERGENT} (STAT 2).

      C) Seizure logic:
        - "Ceribell/rapid EEG/headband/cerebral EEG" → ${CONSULT_TYPE.CERIBELL_EEG}.
        - Ongoing seizure/no EEG → ${CONSULT_TYPE.EMERGENT}.
        - Single resolved seizure → ${CONSULT_TYPE.NON_EMERGENT} (STAT 1).
        - EEG monitoring update → ${CONSULT_TYPE.EEG_READ}.
        - If "status" mentioned **in EEG device context** (e.g., "still showing status on Ceribell") → ${CONSULT_TYPE.CERIBELL_EEG}, NOT ${CONSULT_TYPE.EMERGENT}, unless clinical signs indicate worsening.
        - **If patient already admitted for non‑neurological reason (e.g., pneumonia, cardiac) and seizure described without clustering/status → ${CONSULT_TYPE.NON_EMERGENT} (STAT 1).**

      D) AMS without focal findings:
        - Confusion/obtundation without focal neuro signs or seizure → ${CONSULT_TYPE.NON_EMERGENT} (STAT 1) by default.
        - Treat common metabolic/toxic causes (infection/sepsis, missed dialysis, liver disease, meds) as STAT 1.
        - Classify as ${CONSULT_TYPE.EMERGENT} ONLY IF ALL of the following are true:
            1) Patient is obtunded or cannot protect airway, AND
            2) Stroke is NOT ruled out by the criteria below, AND
            3) There is no completed negative head imaging this encounter.
        - "Stroke NOT ruled out" = any of:
            • No head CT/MRI done yet in this encounter, OR
            • New BEFAST focal signs are present, OR
            • Explicit "code stroke"/"stroke alert"/neurology activation.
        - Imaging-negative obtundation override:
            • If head CT this encounter is documented **negative**, with NO new BEFAST signs and NO activation language,
              and prior encephalopathy/metabolic etiology is suspected or documented,
              → ${CONSULT_TYPE.NON_EMERGENT} (STAT 1). Do NOT escalate to EMERGENT merely for obtundation.
        - Recent neuro involvement:
            • If "seen by you guys" / follow-up but today's issue is non-focal AMS and CT negative → ${CONSULT_TYPE.NON_EMERGENT} (STAT 1).
            • Use ${CONSULT_TYPE.ROUNDING} only for clearly scheduled logistics (rounds/video setup) with no new issue.

      E) Vision:
        - Persistent new loss → ${CONSULT_TYPE.EMERGENT}.
        - Migraine‑like resolving → ${CONSULT_TYPE.NON_EMERGENT} (STAT 2).

      F) Specific patterns:
        - MS ≥ 24 h no stroke → STAT 1; sudden/onset < 24 h → ${CONSULT_TYPE.EMERGENT}.
        - TGA → STAT 2.
        - Acute delirium + infection → ${CONSULT_TYPE.EMERGENT}.
        - New ICH/SAH → ${CONSULT_TYPE.EMERGENT}; old → STAT 2.

      G) Clarification (mutually exclusive, ask at most one set)

        G1) Stroke-specific clarification (only if possibly EMERGENT stroke):
          • Trigger when: case could be EMERGENT acute stroke (≤24h) AND either LKW or anticoagulation is missing AND the missing info could change EMERGENT vs NON_EMERGENT.
          • Ask exactly:
              1) "What is the patient's Last Known Well time?"
              2) "Is the patient currently on anticoagulation?"
          • If triggered → needsClarification = true; clarificationQuestions = [ ... ] ; confidence = 0.75.
          • Do NOT trigger if:
              – Case is clearly NON_EMERGENT STAT 2 (>24h, resolved, stable), or
              – ConsultType is EEG_READ, CERIBELL_EEG, ROUNDING, CT_RETURN, or OUTPATIENT.

        G2) Seizure-specific clarification (only for NON_EMERGENT seizure scenarios):
          • Trigger when: provisional classification is NON_EMERGENT (because of a seizure) (e.g. "first-time seizure now resolved", "breakthrough seizure now stable","brief events with recovery"),
            AND it is unclear whether there is ongoing seizure activity or concern for status epilepticus,
            AND there is NO active Ceribell/rapid EEG context and NO explicit EEG_READ request (those have their own workflows).
          • Ask exactly:
              1) Is the patient still seizing (now or recurrently), or is there any concern for status epilepticus or seizure clustering?
          • If triggered → needsClarification = true; clarificationQuestions = [ ... ] ; confidence = 0.75.
          • If either answer is "yes" → upgrade to EMERGENT.
          • Do NOT trigger if:
              – ConsultType is CERIBELL_EEG or EEG_READ (monitoring/interpretation pathway), or
              – The transcript clearly states the seizure(s) have resolved and there is no ongoing concern.

        G3) Otherwise:
          • needsClarification = false; clarificationQuestions = []; confidence per normal rules.

      H) Safety fallback:
        - Info insufficient + obtunded → ${CONSULT_TYPE.EMERGENT}.
        - Imaging or plan discussion only → ${CONSULT_TYPE.NON_EMERGENT} (STAT 2).

      SLA MAPPING:
        - EMERGENT → CRITICAL
        - NON_EMERGENT STAT 1 → HIGH
        - NON_EMERGENT STAT 2 → MODERATE
        - CT_RETURN → HIGH
        - EEG_READ → HIGH/MODERATE
        - CERIBELL_EEG ≥ 20 % → CRITICAL, < 20 % → MODERATE
        - ROUNDING/OUTPATIENT → LOW

      CONFIDENCE SCORING (apply AFTER consultType/stat/urgency are set, BEFORE output):
        - Start baseline at 0.75.

        Positive bumps (+):
          • +0.10 if classification matches an explicit workflow keyword in transcript
            (e.g., "Ceribell"/"rapid EEG"/"headband EEG" → CERIBELL_EEG;
            "outpatient EEG"/"routine EEG" → EEG_READ;
            "CT is back"/"review CT/CTA/MRI" → CT_RETURN;
            "ready for rounding"/"video rounding"/"follow-up" → ROUNDING).
          • +0.10 if lastKnownWellTime is confidently extracted
            (explicit clock time/date OR unambiguous relative duration).
          • +0.10 if evidence is internally consistent (no contradictions like both "baseline" and "new focal deficit",
            or "awaiting CT" and "CT negative this encounter").
          • +0.05 if imaging explicitly supports the classification
            (e.g., "CT negative" supporting NON_EMERGENT AMS; "old infarct only" for STAT 2;
            explicit high seizure burden % for CERIBELL_EEG).

        Caps / floors:
          • Require ≥2 positive bumps AND no contradictions AND no clarification to allow confidence ≥0.85.
          • If any clarification (G1 or G2) is triggered → set confidence = 0.75 and cap at 0.84 until answered.
          • Hard high-confidence overrides (when unambiguous):
              – "code stroke" / "stroke alert" explicitly active → confidence ≥0.90 (if rules point to EMERGENT).
              – Explicit seizure burden % on Ceribell with ongoing monitoring context and no clinical decline → confidence 0.85–0.90.
          • Never exceed 0.95; never drop below 0.70 unless safety fallback forces EMERGENT (then min 0.80).

        Negative adjustments (−):
          • −0.10 if stroke-possible but either LKW or anticoagulation is missing (and not asked yet).
          • −0.15 if conflicting cues are present (e.g., simultaneous "baseline" and "new focal deficit";
            "CT pending" vs "CT negative this encounter"; CERIBELL_EEG plus "no EEG available").
          • −0.10 if subject/patient identity is ambiguous (multiple names/rooms with no clear target).

        Rule of thumb:
          • Only output ≥0.85 when the class is strongly supported and unambiguous.
          • Otherwise stay <0.85; if uncertainty remains material, prefer 0.75–0.84.

      OUTPUT (JSON ONLY):
      {
        "consultType": "...",
        "confidence": 0.0_to_1.0,
        "rationale": "concise medical reasoning",
        "statLevel": 1_or_2_or_null,
        "redFlags": [],
        "urgencyLevel": "...",
        "lastKnownWellTime": "string|null",
        "isOnAnticoagulant": "boolean|null",
        "isStrokeAlert": "boolean|null",
        "isEEGRequired": "boolean|null",
        "isEEGDone": "boolean|null",
        "eegDetail": "string|null",
        "seizureBurden": "high-seizure|low-seizure|null",
        "seizureBurdenPercentage": 0_to_100,
        "setting": "in-patient-eeg|out-patient-eeg|null",
        "type": "awake-asleep-emergent|awake-asleep-non-emergent|in-patient-continuous|out-patient-eeg|null",
        "needsClarification": true|false,
        "clarificationQuestions": []
    }`
}

/**
 * Builds the user-turn content, mirroring
 * ConsultClassificationService.callLLM()'s `prompt` template.
 */
export function buildClaraUserPrompt(
  conversationText: string,
  context: {
    patientName?: string
    mrn?: string | number
    age?: number
    lastKnownWellTime?: string
    isOnAnticoagulant?: boolean
  } = {},
): string {
  return `CONVERSATION:
      ${conversationText}

      PATIENT CONTEXT:
      - Patient Name: ${context.patientName || 'unknown'}
      - MRN: ${context.mrn || 'unknown'}
      - Age: ${context.age || 'unknown'}
      - Symptom Onset: ${context.lastKnownWellTime || 'unknown'}
      - Anticoagulants: ${context.isOnAnticoagulant ? 'yes' : 'unknown'}
      - Last Known Well Time (LKW): ${context.lastKnownWellTime || 'unknown'}
    `
}

/**
 * Mirrors emergencyFallbackService()'s conservative keyword list — used ONLY
 * as a reference/secondary signal here. Clara's actual Gate 0 on this test
 * surface is detectRedFlag() (./redFlagGate.ts), which has materially higher
 * recall (BE-FAST phrasing, status epilepticus, thunderclap headache,
 * self-harm) than this list.
 */
export const emergencyFallbackKeywords = [
  'stroke', 'seizure', 'unconscious', 'unresponsive',
  'bleeding', 'hemorrhage', 'weakness', 'speech problems',
  'vision loss', 'confusion', 'acute', 'sudden',
]

export const validConsultTypes = new Set(Object.values(CONSULT_TYPE))
