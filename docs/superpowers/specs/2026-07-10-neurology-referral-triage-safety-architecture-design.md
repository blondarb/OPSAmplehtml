# Neurology Referral Triage Safety Architecture

**Date:** 2026-07-10
**Owner:** Steve Arbogast, DO
**Status:** Approved for implementation in shadow mode
**Repo:** `OPSAmplehtml` / Sevaro Clinical
**Affected surface:** `/triage`, consult intake progression, referral clarification, and the purpose-limited AI Historian

## Executive decision

The current weighted-average triage must not be made production-autonomous by adding a few score floors. The safe design is a layered clinical-decision-support workflow in which:

1. a deterministic, assertion-aware emergency gateway examines the original evidence before any lossy summarization;
2. document coverage and data quality remain independent from clinical disposition;
3. model branches extract evidence and score risk, but deterministic fusion and licensed-clinician controls own workflow state;
4. emergency or unresolved time-critical cases are locked out of outpatient scheduling and the AI Historian;
5. every critical action has an owner, deadline, escalation, contact state, and closure evidence; and
6. the rebuilt system runs shadow-only until predefined clinical-safety gates pass.

This remains clinical decision support, not autonomous diagnosis or disposition. Existing licensed humans remain authoritative throughout shadow validation.

## Problems being corrected

The adversarial review in `docs/clinical-safety/` established the scoring defect: a compensatory average can dilute a single dangerous feature. Repository inspection found broader P0 risks:

- PDF, DOCX, TXT, and JSON extraction paths silently truncate at 50,000 characters.
- The recorded `original_text_length` is measured after truncation, hiding omitted evidence.
- PDF page identity, page count, and coverage are discarded; image-only pages are not OCR'd.
- Long notes are compressed to a 150–500-word summary and triage may score only that summary.
- A repaired `max_tokens` JSON response can be accepted as clinically complete.
- Multiple files in one referral packet are scored independently unless manually fused.
- `insufficient_data` is a mutually exclusive tier even though missingness and urgency can coexist.
- Emergent referrals can create same-day outpatient appointments despite an ED-now label.
- All completed consult triages can advance to the Historian without a safety-clearance gate.
- Alerts and overrides lack enforceable ownership, delivery acknowledgment, escalation, and closure.
- One Claude call currently supplies both the highest-stakes clinical interpretation and emergency override.

## Design principles

### 1. Orthogonal state, not one overloaded tier

The system records separate axes:

- `care_pathway`: emergency action, same-day clinician review, expedited outpatient, routine outpatient, redirect, or undetermined;
- `outpatient_priority`: the familiar urgent through non-urgent tiers, applicable only after emergency clearance;
- `data_quality`: sufficient, partial, insufficient, or conflicting;
- `coverage_status`: complete, partial, failed, or not applicable;
- `review_requirement`: none, routine clinician confirmation, immediate clinician review, or emergency action;
- `workflow_status`: an explicit state machine from intake through review, clarification, action, and closure.

An emergency can therefore be `emergency_now + insufficient`, and the missing data never lowers its pathway.

### 2. Asymmetric safety fusion

- Any credible current emergency signal may raise urgency or force review.
- No model, clarification answer, summary, or adjudicator may automatically lower a deterministic or clinician-established safety floor.
- Negation, hypothetical language, family history, copied educational text, historical/resolved symptoms, and quoted prior instructions must be interpreted using assertion, experiencer, and temporality—not raw substring matches alone.
- A timeout, refusal, malformed response, invalid evidence span, incomplete packet, patient mismatch, or unresolved safety disagreement cannot produce an auto-routine result.

### 3. Evidence before conclusions

Every safety-critical extracted fact carries:

- packet, document, page, and chunk identity;
- exact supporting text and source offsets or bounding box;
- native-text/OCR source and OCR confidence;
- assertion (`present`, `negated`, `uncertain`, `conditional`);
- experiencer (`patient`, `family`, `other`);
- temporality/currentness and event/document/addendum dates;
- extraction model, prompt, schema, and rule versions.

The clinician interface must link conclusions back to page evidence.

### 4. Fail closed without becoming unusable

Fail-closed means blocking unsafe automation, not labeling every failure emergent. Technical or evidentiary failure produces a visible clinician-review hold, retains the safest established pathway, and preserves partial work for efficient review.

### 5. Multiple models are not independent safety systems

Claude Haiku, Sonnet, Fable, and Opus share vendor lineage and can share common-mode errors. The genuinely diverse safety controls are deterministic raw-evidence rules, structured coverage checks, conservative state transitions, and licensed-clinician review.

## Target architecture

```text
Referral upload or pasted note
  -> immutable packet/document records + checksum + patient identity gate
  -> page-native parsing
       -> selective OCR for low-text or failed pages
       -> per-page coverage and confidence ledger
  -> page/section-aware chunks
  -> parallel branches over original evidence
       A. deterministic emergency gateway
       B. high-recall structured safety extractor
       C. holistic outpatient scorer
  -> evidence-span validation + chronology + conflict ledger
  -> conservative deterministic fusion
       -> sparse high-capability adjudication on disagreement/critical uncertainty
  -> workflow state
       -> emergency action / immediate review / clarification / outpatient decision
  -> licensed-clinician action and closed-loop outcome
  -> shadow comparison and validation metrics
```

Tiny text-native notes may take a direct evidence path, but must emit the same output schema and run the same emergency gateway.

## Core data contracts

### Packet and coverage

```ts
type CoverageStatus = 'complete' | 'partial' | 'failed' | 'not_applicable'
type DataQuality = 'sufficient' | 'partial' | 'insufficient' | 'conflicting'

interface ReferralPacket {
  id: string
  patientId: string | null
  patientIdentityStatus: 'matched' | 'unverified' | 'mismatch'
  status: 'ingesting' | 'ready' | 'partial' | 'failed'
  checksum: string
  expectedDocumentCount: number
  receivedDocumentCount: number
  coverageStatus: CoverageStatus
}

interface ReferralPage {
  packetId: string
  documentId: string
  pageNumber: number
  extractionMethod: 'native_text' | 'ocr' | 'none'
  text: string
  textHash: string
  nativeCharacterCount: number
  ocrConfidence: number | null
  coverageStatus: 'covered' | 'low_confidence' | 'failed'
}
```

No parser may silently cut text. Input size is governed by page/chunk processing and operational quotas. When a limit is reached, the packet is explicitly partial and blocked from automated outpatient clearance.

### Evidence and emergency signals

```ts
interface EvidenceReference {
  packetId: string
  documentId: string
  pageNumber: number
  startOffset: number
  endOffset: number
  quote: string
  extractionMethod: 'native_text' | 'ocr'
  extractionConfidence: number | null
}

interface EmergencySignal {
  code: string
  syndrome:
    | 'acute_cerebrovascular'
    | 'intracranial_hemorrhage_or_sah'
    | 'status_or_recurrent_seizure'
    | 'acute_spinal_cord_or_cauda_equina'
    | 'acute_cns_infection'
    | 'raised_intracranial_pressure'
    | 'neuromuscular_respiratory_or_bulbar_failure'
    | 'acute_vision_threat'
    | 'altered_mental_status_or_coma'
    | 'suicide_or_violence_risk'
    | 'other_time_critical'
  source: 'deterministic' | 'safety_model' | 'scoring_model' | 'adjudicator' | 'clinician'
  assertion: 'present' | 'negated' | 'uncertain' | 'conditional'
  temporality: 'current' | 'recent' | 'historical' | 'unknown'
  experiencer: 'patient' | 'family' | 'other' | 'unknown'
  evidence: EvidenceReference[]
  action: 'emergency_now' | 'immediate_clinician_review'
}
```

The deterministic gateway uses syndrome libraries rather than one flat keyword list. Context windows and negation/history/experiencer logic reduce over-fire, while unclear temporality or assertion routes to immediate review instead of being discarded.

### Final workflow output

```ts
type CarePathway =
  | 'emergency_now'
  | 'same_day_clinician_review'
  | 'expedited_outpatient'
  | 'routine_outpatient'
  | 'redirect'
  | 'undetermined'

type ReviewRequirement =
  | 'emergency_action'
  | 'immediate_clinician_review'
  | 'clinician_confirmation'
  | 'none'

interface TriageDecisionSupportResult {
  carePathway: CarePathway
  outpatientPriority: TriageTier | null
  dataQuality: DataQuality
  coverageStatus: CoverageStatus
  reviewRequirement: ReviewRequirement
  schedulingLocked: boolean
  emergencySignals: EmergencySignal[]
  criticalUnknowns: MissingInformationItem[]
  conflicts: EvidenceConflict[]
  evidence: EvidenceReference[]
  branchOutcomes: BranchOutcome[]
  algorithmVersion: string
  promptVersions: Record<string, string>
  modelProfiles: Record<string, string>
}
```

The current five dimension scores and weighted average remain available as explanatory outpatient-priority features. They do not own emergency clearance.

## Deterministic emergency gateway

### Required syndrome coverage

The first rule library must include, with common lay and clinician variants:

- sudden focal deficit: weakness, numbness, facial asymmetry, dysarthria, aphasia, gaze deviation, ataxia, neglect, acute monocular or binocular visual loss/diplopia;
- TIA clusters/crescendo events and symptoms present now or within a time-sensitive window;
- thunderclap/maximal-at-onset headache, suspected subarachnoid hemorrhage, acute headache with focal deficit, meningismus, syncope, pregnancy/postpartum, anticoagulation, severe hypertension, or altered consciousness;
- prolonged seizure, recurrent seizures without recovery, active seizure, first seizure with persistent deficit/injury/pregnancy, and postictal state not returning to baseline;
- acute cord/cauda equina: new bladder retention/incontinence, saddle sensory loss, bilateral/progressive leg weakness, severe back pain with cancer/infection/anticoagulation risk;
- fever plus new severe headache/neck stiffness/altered mental status, suspected meningitis/encephalitis;
- papilledema, rapidly worsening headache with vomiting or altered mental status, shunt malfunction;
- dyspnea, weak cough, inability to handle secretions, rapidly progressive bulbar weakness, myasthenic or Guillain-Barre respiratory warning signs;
- acute painful vision loss, new monocular vision loss, retinal/optic emergency language;
- unexplained acute confusion, coma, unresponsiveness, rapidly declining mental status;
- active suicidal/homicidal intent or inability to maintain safety;
- serious traumatic neurologic deterioration and anticoagulated head injury.

### Raw lexical terms that will over-fire without context

Examples include `stroke`, `seizure`, `worst headache`, `vision loss`, `weakness`, `saddle numbness`, `cauda equina`, and `status epilepticus` when they appear in problem lists, family history, ruled-out diagnoses, copied discharge precautions, patient education, remote history, or negated review of systems. Every hit must retain its context span and assertion metadata.

### Gateway outcome

- Credible current/recent time-critical signal -> `emergency_now`, emergency hold, immediate action, scheduling locked.
- Ambiguous potentially time-critical signal -> `same_day_clinician_review`, immediate hold and synchronous review, scheduling locked.
- No emergency signal -> continue outpatient branches.
- Gateway failure -> `undetermined`, immediate clinician review, scheduling locked.

## Outpatient scoring and safety floors

The redesigned score floors are retained only as one conservative outpatient layer:

- `emergent_override` from any model is additive but not the sole emergency control.
- `red_flag_override=true` or `red_flag_presence>=4` floors at urgent.
- any `symptom_acuity`, `diagnostic_concern`, `rate_of_progression`, or `red_flag_presence` score of 5 floors at urgent.
- `symptom_acuity>=4` or `diagnostic_concern>=4` floors at semi-urgent.
- `functional_impairment=5` does not automatically floor urgent because chronic stable disability is common; however new or rapidly worsening loss of ambulation, ADLs, speech/swallowing, respiration, consciousness, or sphincter function is represented by acuity/progression/safety signals and can force emergency or urgent review.
- `rate_of_progression=5` alone floors urgent, but its rubric must distinguish rapid clinically important decline from high-frequency benign symptoms or chronic administrative worsening.

These floors are not sufficient for emergency triage. Syndrome rules and clinician workflow remain primary.

## Long-document architecture

### Parsing and OCR

- Preserve document and page identity from the parser.
- Use native text first.
- Route image-only, low-text, corrupted-text, rotated, or low-quality pages to asynchronous OCR.
- Store per-page success/failure and confidence.
- Use Textract asynchronous multipage processing for production PDF/TIFF OCR after infrastructure approval; local adapters and test doubles permit development without creating cloud resources.
- Do not mark a packet complete until expected and received page/document counts reconcile.

### Chunking and reduction

- Build 1,500–2,500-token chunks with 10–15% overlap.
- Respect page, note-section, table, medication-list, and addendum boundaries.
- Run atomic fact extraction and high-recall emergency scanning independently per chunk.
- Deterministically union all safety signals. Deduplication merges duplicate facts while retaining all provenance references.
- Build a normalized chronology and explicit conflict ledger; never silently choose the “most recent” claim without structured dates.
- Retrieval into final scoring always includes safety candidates, conflicts, current medications, onset evidence, newest addenda, and the coverage report. Semantic similarity only fills the remaining evidence budget.
- If mandatory evidence exceeds the final context budget, split by clinical dimension or time period and merge deterministically. Never truncate.

### Patient identity gate

A packet with conflicting patient identity is not fused or scored as complete. It is quarantined for human review. Synthetic/demo fixtures use synthetic identifiers but exercise the same controls.

## Multi-model architecture

### Account-verified candidates on 2026-07-10

Read-only Bedrock discovery using the approved sandbox profile in region `us-east-2` showed these active and authorized candidates with US inference profiles:

- `us.anthropic.claude-sonnet-5`
- `us.anthropic.claude-opus-4-8`
- `us.anthropic.claude-fable-5` (synthetic-only; excluded from PHI/deidentified workflows because its current AWS model card requires provider data sharing)
- `us.anthropic.claude-opus-4-7`
- `us.anthropic.claude-sonnet-4-6`
- `us.anthropic.claude-opus-4-6-v1`
- `us.anthropic.claude-haiku-4-5-20251001-v1:0`

The production registry pins explicit model IDs and capability flags. It never automatically selects the newest release. Global profiles are excluded until privacy/residency approval; US Geo profiles are the default candidates.

### Branch roles

1. Deterministic gateway: no LLM, original evidence, must complete first.
2. Safety extractor: lower-cost high-recall candidate selected by benchmark; outputs only structured signals, critical unknowns, and cited evidence.
3. Holistic scorer: strongest cost-effective model on complete packet evidence; outputs outpatient dimensions, routing features, and citations.
4. Adjudicator: high-capability model used only for model disagreement, critical uncertainty, invalid evidence, or clinician-requested review. It cannot lower an existing safety floor.

Sonnet 5, Opus 4.8, Sonnet 4.6, Opus 4.6/4.7, and Haiku 4.5 enter the clinical bakeoff. Fable 5 may participate only on wholly synthetic fixtures and is ineligible for a PHI role under the current retention requirement. Roles are assigned using blinded neurology-specific evaluation, latency, schema reliability, and cost—not branding or recency.

### Invocation safety

- Safety branch deadlines are bounded; timeout or refusal yields review, never a lower tier.
- Retry only transient throttling/service errors within the overall deadline.
- A `max_tokens` response is incomplete and rejected for clinical branches. JSON repair may remain for non-clinical convenience calls but is prohibited for triage completion.
- Application-side schema and evidence-span validation are mandatory. Structured-output support is capability-gated per model.
- Log model profile, request/correlation ID, latency, input/output/cache tokens, stop reason, prompt/schema/rule versions, retry count, and outcome—without casually enabling full PHI prompt logging.
- Prompt caching is used only where measured beneficial and supported.

## Clarification and AI Historian

### Routing missing information

1. Emergency signal plus missing data: escalate immediately; do not wait for clarification.
2. Missing information that prevents exclusion of a time-critical emergency: immediate clinician hold and synchronous provider contact.
3. Stable outpatient with objective gaps (exam, vitals, medication/anticoagulation reconciliation, allergies, pregnancy, renal function, devices, recent procedures, tests and reports): referring-provider request.
4. Stable outpatient with subjective gaps (patient symptom wording, onset/course, frequency/duration, associated symptoms, function, medicines actually taken): purpose-limited AI Historian after identity, consent, accessibility/language, and clinician clearance.
5. Conflicts, unreliable history/ASR, failed contact, pediatric/out-of-scope case, or a new red flag: human adjudication.

### Clarification contract

Every question records a stable code, exact text, rationale, target, criticality, acceptable sources, answer schema, owner, due time, escalation policy, delivery state, raw and normalized answer, responder/source, timestamps, verifier, and closure. Conflicting or amended answers remain append-only and reopen review when clinically material.

### Historian boundaries

- A referral-clarification mode asks only clinician-approved question IDs.
- It gathers subjective history; it does not diagnose, score emergency clearance, or downgrade urgency.
- A new emergency response stops questioning, preserves the exact answer and partial session, displays an appropriate immediate action, and creates a server-side emergency hold.
- Patient-reported answers are labeled unverified until clinician reconciliation.
- Unreviewed Historian content cannot unlock scheduling or import as attested chart content.

## Workflow and closed-loop controls

### Required state machine

```text
pending_safety_screen
  -> emergency_hold -> action_pending -> closed
  -> clinician_review
       -> provider_clarification -> clinician_review
       -> patient_clarification  -> clinician_review
       -> decision_ready -> action_pending -> closed
```

Invalid transitions are rejected. Critical states require an owner and due time. Missed claim, failed delivery, expiration, or after-hours conditions escalate to configured primary/backup teams.

### Scheduling lock

The database and API both block appointment activation when any of the following is true:

- care pathway is emergency or undetermined;
- review is required but incomplete;
- packet coverage is partial/failed for safety-critical evidence;
- a critical clarification remains open, expired, failed, or conflicting;
- no licensed clinician has recorded the final outpatient disposition;
- the case has not reached the permitted workflow state.

Emergent cases never create same-day outpatient neurology appointments as a substitute for ED/EMS action.

### Human review and closure

An emergency acknowledgment is not a dismiss button. Closure requires structured evidence of action: owner, contact attempts, patient/referrer instruction, delivery/understanding check-back, EMS/ED/on-call disposition when known, timestamp, and clinician sign-off. Unreachable cases follow a documented escalation policy.

## Shadow-only deployment

The new pipeline initially:

- runs alongside the current workflow;
- cannot change patient scheduling, send patient/provider messages, advance the consult, or overwrite clinician decisions;
- stores branch outputs and disagreements for approved reviewers;
- uses synthetic/PHI-free fixtures for development and AWS bakeoffs;
- requires a clinical governance decision before any action-enabling flag is changed.

Feature flags must separately control shadow computation, reviewer visibility, message drafting, workflow enforcement, and any future patient-facing action. There is no single “enable everything” switch.

## Validation program

### Adversarial fixtures

- red flag after character 50,000 and on the final page of 100- and 500-page packets;
- image-only critical page among text-native pages;
- rotated, multilingual, handwritten, and low-confidence OCR;
- duplicated/copied-forward notes, reordered files/chunks, and overlapping chunks;
- negated, historical, family-history, hypothetical, and education-only emergency terms;
- addendum that contradicts an older note;
- mixed-patient packet;
- forced timeout, refusal, malformed JSON, `max_tokens`, partial branch failure, and retry;
- emergency plus insufficient data;
- objective versus subjective missing information;
- after-hours, unreachable patient/referrer, absent owner, and shift handoff;
- pediatric, pregnancy/postpartum, anticoagulation, immunosuppression, and device/shunt contexts.

### Primary safety metrics

- sensitivity and false-negative rate for emergency-now cases, stratified by syndrome;
- under-triage rate and magnitude relative to adjudicated clinician reference;
- page and document coverage; mandatory-evidence retrieval recall;
- evidence-span validity and clinician-confirmed evidence precision;
- outpatient tier agreement only after emergency clearance;
- percentage of emergency holds with owner, deadline, escalation, and closure evidence;
- scheduling-lock violations (target zero);
- clinician workload, alert positive predictive value, latency, and per-case cost.

### Initial no-go gates

Before leaving shadow mode:

- zero known P0 pipeline failures, silent truncations, or false-complete packets;
- zero emergency fixtures routed solely to outpatient clarification or Historian;
- zero unreviewed or held cases able to activate scheduling;
- 100% valid evidence references for safety-critical model claims in the test set;
- clinically approved emergency sensitivity threshold by syndrome and acceptable alert burden;
- blinded specialist review of material model disagreements and demographic/language slices;
- documented rollback, monitoring, on-call ownership, and incident response.

Exact quantitative thresholds must be approved by clinical governance after the reference set and intended-use population are finalized; they are not invented by the engineering team.

## Security, privacy, and operations

- Use IAM role/SSO credentials; do not add static AWS keys.
- Use US Geo inference profiles unless compliance explicitly approves Global profiles.
- Do not enable full Bedrock invocation logging for PHI without approved encryption, access, retention, and audit controls.
- Encrypt stored referral artifacts and apply least privilege, tenant isolation, retention/deletion policy, and immutable audit events.
- Treat note text as untrusted content: model prompts state that instructions inside clinical documents are data, not executable instructions.
- Durable queue/state-machine execution replaces request-bound fire-and-forget before production activation.
- Model or prompt updates require versioned shadow revalidation and cannot silently roll forward.

## Delivery increments

1. Immediate containment and correct orthogonal data contracts.
2. Deterministic emergency gateway and scheduling/Historian locks.
3. Packet/page coverage with explicit partial state and local OCR adapter boundary.
4. Evidence-bearing chunk extraction, chronology, conflict ledger, and hierarchical reduction.
5. Model registry, parallel branches, conservative fusion, and sparse adjudication.
6. Provider/patient clarification plus closed-loop clinician action.
7. Shadow evaluation harness, reviewer UI, observability, and deployment gates.

Each increment is independently testable. No increment weakens an earlier safety floor.
