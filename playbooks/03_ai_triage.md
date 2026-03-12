# Card 3: Outpatient AI Triage Tool — Product Playbook

---

## 1. Executive Summary

The Outpatient AI Triage Tool is a clinical decision support system that reads referral notes, intake summaries, or free-text clinical descriptions and classifies adult neurology patients into one of six triage tiers — from Emergent (redirect to ED immediately) through Urgent (seen within 1 week) down to Non-urgent (seen within 6 months or redirected to PCP). The tool also handles a seventh output state — Insufficient Data — for vague referrals that need to be returned to the referring provider for clarification. The tool uses a structured, transparent triage algorithm: the AI extracts clinical features and scores five dimensions, while the application code performs all mathematical scoring and tier mapping deterministically. Every recommendation is explainable and auditable. It is designed for clinic coordinators, triaging physicians, and scheduling staff who currently rely on manual, inconsistent, and time-consuming triage processes. For investors and innovation partners, this card demonstrates how AI can reduce time-to-appointment for high-acuity patients, improve patient-provider matching via subspecialty routing, and optimize clinic throughput — all critical pain points in subspecialty neurology where wait times regularly exceed 3-6 months.

> **Scope note:** This tool is designed for **adult neurology** (patients ≥18 years). Pediatric neurology referrals require a separate triage algorithm with age-specific red flags (e.g., developmental regression, infantile spasms) and are out of scope for Phase 1.

---

## 2. How To Use This Section

- **Step 1:** Navigate to the AI Triage card from the homepage of the outpatient demo site.
- **Step 2:** You will see a large text input area labeled "Paste Referral Note or Intake Summary." Paste or type a clinical note into this field. Sample notes are available via a "Load Sample" dropdown button for demo purposes.
- **Step 3:** Click the "Triage This Patient" button.
- **Step 4:** The AI processes the note (a loading animation with a brief clinical-themed message plays for 2-4 seconds).
- **Step 5:** The output panel appears with four sections:
  - **Triage Tier** — displayed as a color-coded badge (black/red = Emergent, red = Urgent, orange = Semi-urgent, yellow = Routine-priority, green = Routine, blue = Non-urgent). An Emergent tier triggers a prominent alert to redirect the patient to the ED immediately.
  - **Top 3 Clinical Reasons** — bulleted rationale for the triage decision
  - **Red Flags Identified** — any concerning findings highlighted in red
  - **Suggested Pre-Visit Workup** — labs, imaging, or referrals to order before the neurology appointment
- **Step 6:** Below the output, a disclaimer banner reads: "This is a clinical decision support tool. Final triage decisions must be made by a licensed clinician."
- **Step 7:** Below the triage tier, a **Subspecialty Routing** panel shows which neurologist subspecialty this patient should be routed to and why (e.g., "Route to: Epilepsy Clinic — New-onset seizure requiring EEG and epilepsy-specific evaluation").
- **Step 8:** If the referral is too vague to triage, the system returns an **"Insufficient Data"** state with a note: "This referral does not contain enough clinical information to triage safely. Consider returning to the referring provider for: [specific missing information]."
- **Step 9:** Users can click "Try Another" to reset the form, or "View Algorithm" to see the scoring criteria the AI used.

---

## 3. Clinical Context & Problem Statement

### The Problem

Outpatient neurology faces a severe access crisis. The average wait time for a new neurology appointment in the United States is 4-8 weeks in urban areas and can exceed 6 months in rural regions. The American Academy of Neurology estimates a shortage of over 19,000 neurologists by 2025. In this environment, effective triage is not a convenience — it is a patient safety issue.

Currently, most neurology practices triage referrals using one of three inadequate methods:

1. **First-come, first-served** — no clinical prioritization. A patient with ALS waits the same 4 months as a patient with stable chronic migraine.
2. **Manual physician review** — a neurologist reads every referral fax/note to prioritize. This is effective but consumes 30-60 minutes daily of physician time that could be spent on patient care.
3. **Front-desk heuristics** — scheduling staff make triage decisions based on informal rules ("if they say seizure, make it urgent"). This is inconsistent, undocumented, and carries liability risk.

### The Clinical Workflow

Referral → Triage → Scheduling → Pre-visit workup → Visit

The AI Triage Tool sits between Referral and Scheduling. It reads the referral documentation, applies a structured clinical algorithm, and outputs a triage recommendation with rationale. A human clinician reviews and approves (or overrides) the recommendation before scheduling proceeds.

### Patient Population

All patients referred to an outpatient neurology clinic, including:

- New patient referrals from PCPs, emergency departments, hospitalists, and other specialists
- Patients requesting re-evaluation after lapsed follow-up
- Patients transferring care from another neurologist
- Urgent add-on requests from existing patients with new symptoms

### Why AI Adds Value

- **Consistency**: Every referral is triaged against the same algorithm every time
- **Speed**: Triage happens in seconds, not hours or days
- **Transparency**: The AI provides its reasoning, making it auditable and improvable
- **Scalability**: Works for 10 referrals/day or 500 referrals/day with no additional labor cost
- **Safety net**: Red flag detection catches dangerous presentations that might be missed by non-clinical staff

---

## 4. Functional Requirements

### 4.1 Input

#### Phase 1 (Current)

| Element | Details |
|---|---|
| Primary input field | Large textarea (minimum 6 rows visible), placeholder text: "Paste referral note, intake summary, or describe the clinical scenario..." |
| Character limit | 5,000 characters (approximately 750-1,000 words — enough for a detailed referral letter) |
| Sample note loader | Dropdown button with 6-8 pre-loaded sample referral notes covering different diagnoses and acuity levels |
| Patient metadata (optional) | Collapsible section with: Age, Sex, Insurance type, Referring provider type (PCP, ED, specialist), Distance from clinic |

#### Phase 2 Enhancements

| Element | Details |
|---|---|
| **Input mode tabs** | "Paste Text" / "Upload File(s)" toggle tabs at top of input area |
| **Raised character limit** | 50,000 characters for paste input (full ED H&Ps can be 15K-25K chars). Phase 1 limit of 5,000 preserved only as a "short note" threshold that skips pre-extraction. |
| **File upload zone** | Drag-and-drop area + file picker button. Accepts PDF, DOCX, TXT. Max 10MB per file, up to 20 files for batch mode. Shows file name, size, type badge, and remove button per file. |
| **Batch mode toggle** | When multiple files are uploaded or multiple notes are pasted (separator: `---`), batch mode activates automatically. Shows file count and "Process All" button. |
| **Multi-note fusion** | When multiple notes exist for the same patient, user can select which notes to fuse via checkboxes. "Fuse Selected" button combines them into a single comprehensive extraction before triage scoring. |
| **Two-stage flow indicator** | Visual step indicator: Input → Extract → Review → Triage. Short notes (<2K chars that look like referral summaries) skip the extraction step and go directly to triage (backward-compatible with Phase 1 flow). |

### 4.2 Processing

| Element | Details |
|---|---|
| AI model | AWS Bedrock Claude Sonnet 4.6 (`us.anthropic.claude-sonnet-4-6`) — selected for clinical reasoning quality, structured JSON output, and AWS Bedrock integration |
| Processing indicator | Animated progress bar with rotating clinical messages: "Analyzing clinical presentation...", "Evaluating red flags...", "Generating triage recommendation..." |
| Timeout | 15-second maximum; if exceeded, display: "Processing is taking longer than expected. Please try again." |
| Error handling | If API fails, display: "The triage system is temporarily unavailable. Please triage this patient manually and contact support." |

### 4.3 Output — Triage Recommendation Panel

| Section | Details |
|---|---|
| **Triage Tier Badge** | Large, color-coded pill/badge. Colors: Emergent = `#1E1E1E` with `#DC2626` border (black/red pulsing), Urgent = `#DC2626` (red), Semi-urgent = `#EA580C` (orange), Routine-priority = `#CA8A04` (yellow), Routine = `#16A34A` (green), Non-urgent = `#2563EB` (blue), Insufficient Data = `#6B7280` (gray). Each displays the tier name AND the timeframe (e.g., "URGENT — Within 1 Week"). **Emergent** displays: "EMERGENT — Redirect to ED / Call Referring Provider Immediately" with a pulsing animation. **Insufficient Data** displays: "INSUFFICIENT DATA — Return to Referring Provider for Clarification" |
| **Confidence Indicator** | A qualitative confidence label: High / Moderate / Low. Low confidence triggers a note: "This case may benefit from direct physician review before scheduling." |
| **Top 3 Clinical Reasons** | Numbered list, each 1-2 sentences. E.g., "1. New-onset seizure in an adult without prior epilepsy history requires urgent evaluation to rule out structural pathology." |
| **Red Flags Identified** | Bulleted list in a red-bordered alert box. If no red flags: display a green "No red flags identified" message. Red flag examples: "Thunderclap headache — evaluate for subarachnoid hemorrhage", "Progressive weakness — consider Guillain-Barré syndrome" |
| **Suggested Pre-Visit Workup** | Bulleted list of recommended orders: labs (e.g., CBC, CMP, TSH, B12, MMA), imaging (e.g., MRI brain with and without contrast), other tests (e.g., EEG, NCS/EMG), and referrals (e.g., ophthalmology for visual field testing). Header text clarifies: "Recommended workup to communicate to referring provider for ordering prior to neurology visit." |
| **Failed Therapies Extracted** | If the AI detects previously tried and failed treatments in the referral note, they are listed here (e.g., "Topiramate — discontinued for cognitive side effects"). This impacts triage priority and subspecialty routing. |
| **Subspecialty Routing** | Recommended subspecialty clinic with rationale. E.g., "Route to: Epilepsy Clinic — Patient presents with new-onset seizures requiring EEG and epilepsy-specific evaluation." |

### 4.4 UI Controls

| Element | Details |
|---|---|
| "Triage This Patient" button | Primary CTA, disabled until input has ≥50 characters |
| "Try Another" button | Resets all fields and output |
| "View Algorithm" button | Opens a modal or sidebar showing the triage scoring criteria in plain English |
| "Copy Report" button | Copies the triage output as formatted text (suitable for pasting into an EHR note) |
| "Flag for Review" button | Marks this triage for physician override review (stores in Supabase) |
| Disclaimer banner | Persistent at bottom of output: "This is a clinical decision support tool. Final triage decisions must be made by a licensed clinician." |

### 4.5 Sample Referral Notes (Pre-loaded for Demo)

1. **Emergent — Active stroke symptoms**: "68yo M, right-sided weakness and slurred speech started 2 hours ago. Wife calling to get neurology appointment. No ED visit yet."
2. **Emergent — Thunderclap headache (not yet evaluated)**: "55yo F presents with sudden onset severe headache, 'worst of her life,' started today. Has not been to the ER. Requesting neurology referral."
3. **Urgent — New-onset seizure**: "42yo M, no PMH, presented to ED with witnessed generalized tonic-clonic seizure. CT head negative. No prior seizure history. Started on levetiracetam 500mg BID. Needs outpatient neurology follow-up."
4. **Urgent — Thunderclap headache (ED-evaluated)**: "55yo F presents with sudden onset severe headache, 'worst of her life,' 3 days ago. CT/CTA negative in ED. LP not performed. Ongoing headache."
5. **Semi-urgent — MS relapse**: "34yo F with known RRMS on Tecfidera. New left arm numbness and tingling x5 days, worsening. Last MRI 6 months ago was stable."
6. **Routine-priority — Memory loss workup**: "72yo M, wife reports progressive memory decline over 12 months. Forgetting appointments, repeating questions. MMSE in PCP office 22/30."
7. **Routine — Chronic migraine (failed therapies)**: "28yo F with migraine since age 16. Currently on sumatriptan PRN. Having 10-12 headache days/month. Tried topiramate (stopped for cognitive side effects), amitriptyline (no benefit), propranolol (bradycardia). Interested in CGRP options."
8. **Non-urgent — Stable neuropathy**: "65yo M with DM2, known diabetic neuropathy. Stable symptoms. On gabapentin 300mg TID. PCP requesting neurology to co-manage. A1c 7.2, stable."
9. **Urgent — Suspected GBS**: "48yo F, progressive bilateral leg weakness over 5 days, now has difficulty walking. Had URI 2 weeks ago. Reflexes absent at ankles bilaterally."
10. **Semi-urgent — New tremor**: "61yo M with 6-month history of right hand resting tremor. Wife notes he walks more slowly. No falls."
11. **Insufficient Data — Vague referral**: "Eval for headache."

---

## 5. Technical Architecture

### 5.1 Frontend Components (React / Next.js)

```
src/
├── app/
│   └── triage/
│       └── page.tsx              # Main triage page (Phase 2: multi-step state machine)
├── components/
│   └── triage/
│       ├── TriageInputPanel.tsx       # Text input + metadata fields + sample loader
│       │                              # Phase 2: adds tabs (Paste/Upload), batch toggle, 50K limit
│       ├── TriageOutputPanel.tsx       # Results display container
│       ├── TriageTierBadge.tsx         # Color-coded tier badge component
│       ├── ClinicalReasons.tsx         # Top 3 reasons list
│       ├── RedFlagAlert.tsx            # Red flags alert box
│       ├── PreVisitWorkup.tsx          # Suggested workup list
│       ├── EmergentAlert.tsx           # Emergent tier: full-screen alert with ED redirect
│       ├── InsufficientDataPanel.tsx   # Insufficient Data: return-to-PCP workflow
│       ├── FailedTherapiesList.tsx     # Extracted failed/tried treatments
│       ├── SubspecialtyRouter.tsx      # Subspecialty routing recommendation
│       ├── AlgorithmModal.tsx          # Algorithm viewer modal
│       ├── SampleNoteLoader.tsx        # Dropdown with sample notes
│       ├── CopyReportButton.tsx        # Copy formatted output
│       ├── DisclaimerBanner.tsx        # Persistent safety disclaimer
│       │
│       │   # ── Phase 2 Components ──
│       ├── FileUploadZone.tsx         # Drag-and-drop + file picker, multi-file
│       │                              # Validates type/size, shows file list with remove
│       ├── ExtractionReviewPanel.tsx   # Shows AI extraction with note type badge,
│       │                              # confidence indicator, editable summary textarea,
│       │                              # collapsible original text view, approve/edit buttons
│       ├── BatchQueuePanel.tsx        # Queue display sorted by tier severity,
│       │                              # individual results expandable, progress indicator
│       └── FusionControls.tsx         # Checkbox selection for multi-note fusion,
│                                      # "Fuse Selected" button, fusion preview
```

### 5.2 Supabase Schema

**Table: `triage_sessions`**

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK, default gen_random_uuid()) | Unique triage session ID |
| `created_at` | `timestamptz` (default now()) | Timestamp of triage request |
| `referral_text` | `text` | The input referral note |
| `patient_age` | `integer` | Optional patient age |
| `patient_sex` | `text` | Optional patient sex |
| `referring_provider_type` | `text` | PCP, ED, specialist, etc. |
| `triage_tier` | `text` | emergent, urgent, semi_urgent, routine_priority, routine, non_urgent, insufficient_data |
| `confidence` | `text` | high, moderate, low |
| `clinical_reasons` | `jsonb` | Array of reason strings |
| `red_flags` | `jsonb` | Array of red flag strings |
| `suggested_workup` | `jsonb` | Array of workup items |
| `failed_therapies` | `jsonb` | Array of previously tried/failed treatments extracted from note |
| `missing_information` | `jsonb` | If insufficient_data: what info is needed from referring provider |
| `subspecialty_recommendation` | `text` | Recommended subspecialty |
| `subspecialty_rationale` | `text` | Routing rationale |
| `ai_model_used` | `text` | Model identifier |
| `ai_raw_response` | `jsonb` | Full raw AI response for auditing |
| `physician_override_tier` | `text` | If physician changed the tier |
| `physician_override_reason` | `text` | Reason for override |
| `flagged_for_review` | `boolean` (default false) | Whether flagged for human review |
| `status` | `text` (default 'pending_review') | pending_review, approved, overridden |

#### Phase 2 — New Columns on `triage_sessions`

| Column | Type | Description |
|---|---|---|
| `source_type` | `text` (default 'paste') | 'paste', 'pdf', 'docx', 'txt' — how the input was provided |
| `source_filename` | `text` | Original filename if uploaded (null for paste) |
| `extracted_summary` | `text` | AI-extracted neurology-relevant summary from Stage 1 |
| `extraction_confidence` | `text` | high, moderate, low — confidence in extraction quality |
| `note_type_detected` | `text` | 'ed_note', 'pcp_note', 'discharge_summary', 'specialist_consult', 'imaging_report', 'referral', 'unknown' |
| `batch_id` | `uuid` | FK to `triage_batches.id` if part of a batch (null for single) |
| `fusion_group_id` | `uuid` | Shared UUID for notes fused together before triage |

#### Phase 2 — New Table: `triage_batches`

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK, default gen_random_uuid()) | Unique batch ID |
| `created_at` | `timestamptz` (default now()) | Timestamp of batch creation |
| `total_items` | `integer` | Number of items in the batch |
| `completed_items` | `integer` (default 0) | Number of items processed so far |
| `status` | `text` (default 'processing') | 'processing', 'completed', 'partial_failure' |

**Table: `triage_algorithm_config`** (Phase 2 — stores configurable algorithm weights)

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Config ID |
| `config_name` | `text` | Name of configuration |
| `red_flag_definitions` | `jsonb` | List of red flags and their escalation rules |
| `tier_criteria` | `jsonb` | Scoring criteria for each tier |
| `subspecialty_routing_rules` | `jsonb` | Rules for subspecialty matching |
| `is_active` | `boolean` | Whether this config is currently active |
| `updated_at` | `timestamptz` | Last update timestamp |

### 5.3 API Endpoints

**`POST /api/triage`** — Main triage endpoint

Request body:
```json
{
  "referral_text": "string (required)",
  "patient_age": "number (optional)",
  "patient_sex": "string (optional)",
  "referring_provider_type": "string (optional)"
}
```

Response body:
```json
{
  "session_id": "uuid",
  "triage_tier": "emergent | urgent | semi_urgent | routine_priority | routine | non_urgent | insufficient_data",
  "triage_tier_display": "Urgent — Within 1 Week",
  "confidence": "high | moderate | low",
  "dimension_scores": {
    "symptom_acuity": { "score": 5, "rationale": "Acute onset seizure, potentially life-threatening" },
    "diagnostic_concern": { "score": 4, "rationale": "New-onset seizure requires structural/metabolic evaluation" },
    "rate_of_progression": { "score": 5, "rationale": "Acute event" },
    "functional_impairment": { "score": 3, "rationale": "Currently on medication but functional status post-seizure unclear" },
    "red_flag_presence": { "score": 4, "rationale": "First seizure in adulthood is a red flag" }
  },
  "weighted_score": 4.35,
  "red_flag_override": false,
  "emergent_override": false,
  "clinical_reasons": [
    "New-onset seizure in an adult requires urgent evaluation to rule out structural lesion.",
    "No prior seizure history increases concern for secondary etiology.",
    "Recent ED visit without completed workup necessitates timely follow-up."
  ],
  "red_flags": [
    "First seizure in adulthood — evaluate for brain mass, vascular malformation, or metabolic cause"
  ],
  "suggested_workup": [
    "MRI brain with and without contrast (recommend epilepsy protocol if available)",
    "EEG (routine, 30-minute minimum)",
    "CBC, CMP, magnesium, calcium, TSH",
    "Prolactin level (if within 24 hours of event)"
  ],
  "failed_therapies": [],
  "missing_information": null,
  "subspecialty_recommendation": "Epilepsy Clinic",
  "subspecialty_rationale": "New-onset seizure requires epilepsy-specific evaluation including EEG interpretation and seizure classification.",
  "disclaimer": "This is a clinical decision support tool. Final triage decisions must be made by a licensed clinician."
}
```

**`POST /api/triage/:id/override`** — Physician override endpoint

Request body:
```json
{
  "new_tier": "string",
  "override_reason": "string"
}
```

**`GET /api/triage/samples`** — Returns list of sample referral notes for demo

#### Phase 2 — New Endpoints

**`POST /api/triage/extract`** — Pre-extraction endpoint (Stage 1)

Accepts either FormData (file upload) or JSON (pasted text). Parses the file, sends the text through the AI extraction pipeline, and returns a structured clinical extraction.

Request (FormData):
```
file: <uploaded file> (PDF, DOCX, or TXT, max 10MB)
```

Request (JSON):
```json
{
  "text": "string (required, max 50,000 chars)",
  "patient_age": "number (optional)",
  "patient_sex": "string (optional)"
}
```

Response body:
```json
{
  "extraction_id": "uuid",
  "note_type_detected": "ed_note | pcp_note | discharge_summary | specialist_consult | imaging_report | referral | unknown",
  "extraction_confidence": "high | moderate | low",
  "extracted_summary": "AI-generated neurology-relevant summary suitable for triage scoring",
  "key_findings": {
    "chief_complaint": "string",
    "neurological_symptoms": ["string"],
    "timeline": "string",
    "relevant_history": "string",
    "medications_and_therapies": ["string"],
    "failed_therapies": [{ "therapy": "string", "reason_stopped": "string" }],
    "imaging_results": ["string"],
    "red_flags_noted": ["string"],
    "functional_status": "string"
  },
  "original_text_length": 15234,
  "source_filename": "patient_ed_note.pdf"
}
```

`maxDuration = 60` (extraction of long notes needs more time than triage scoring)

**`POST /api/triage/fuse`** — Multi-note fusion endpoint

Combines multiple clinical extractions for the same patient into a single comprehensive extraction.

Request body:
```json
{
  "extractions": [
    {
      "extracted_summary": "string",
      "note_type_detected": "string",
      "key_findings": { ... },
      "source_filename": "string (optional)"
    }
  ],
  "patient_age": "number (optional)",
  "patient_sex": "string (optional)"
}
```

Response body:
```json
{
  "fusion_group_id": "uuid",
  "fused_summary": "string — comprehensive merged extraction",
  "fusion_confidence": "high | moderate | low",
  "sources_used": ["ed_note: patient_ed_note.pdf", "pcp_note: pasted text"],
  "conflicts_resolved": [
    "Medication list: ED note lists gabapentin 300mg TID, PCP note lists 600mg BID — used most recent (ED note dated 2/15)"
  ],
  "timeline_reconstructed": "string — chronological narrative"
}
```

**Modified: `POST /api/triage`** — Backward-compatible enhancement

New optional fields in request body:
```json
{
  "referral_text": "string (required — may be original text or extracted_summary)",
  "extracted_summary": "string (optional — if provided, used instead of referral_text for scoring)",
  "source_type": "string (optional — 'paste', 'pdf', 'docx', 'txt')",
  "source_filename": "string (optional)",
  "extraction_confidence": "string (optional)",
  "note_type_detected": "string (optional)",
  "batch_id": "string (optional — uuid of parent batch)",
  "fusion_group_id": "string (optional — uuid of fusion group)",
  "patient_age": "number (optional)",
  "patient_sex": "string (optional)",
  "referring_provider_type": "string (optional)"
}
```

### 5.4 External Services

| Service | Purpose |
|---|---|
| AWS Bedrock Claude Sonnet 4.6 (`us.anthropic.claude-sonnet-4-6`) | Primary AI engine for triage scoring, extraction, and fusion. Uses Bedrock Converse API with `temperature: 0`, `maxTokens: 3000` (triage) / `4000` (extraction/fusion) |
| Supabase | Database storage, auth (future), real-time subscriptions (future) |
| Vercel | Frontend hosting and serverless API routes |

> **Implementation note:** The extraction and fusion endpoints (`/api/triage/extract`, `/api/triage/fuse`) currently use `max_completion_tokens: 3000`, not `4000` as stated above.

### 5.5 Data Flow

```
User pastes referral note
        ↓
Frontend validates input (≥50 chars)
        ↓
POST /api/triage with referral text + optional metadata
        ↓
API route constructs prompt using system prompt + user input
        ↓
AWS Bedrock Claude Sonnet 4.6 API call → returns raw dimension scores + clinical analysis (NO tier calculation)
        ↓
APPLICATION CODE calculates weighted score deterministically:
  score = (acuity × 0.30) + (concern × 0.25) + (progression × 0.20) + (impairment × 0.15) + (red_flags × 0.10)
        ↓
APPLICATION CODE maps score to tier (with emergent/red-flag/insufficient-data overrides)
        ↓
Store complete record in Supabase triage_sessions table
        ↓
Return structured response to frontend
        ↓
Frontend renders triage output panel:
  ├── If EMERGENT → full-screen alert with ED redirect instructions
  ├── If INSUFFICIENT DATA → return-to-PCP panel with missing info list
  └── If STANDARD TIER → normal output with tier, reasons, workup, routing
        ↓
User reviews → approves / flags for review / overrides
```

#### Phase 2 — Two-Stage Pipeline Data Flow

```
User provides input (paste text OR upload file(s))
        ↓
┌─────────────────────────────────────────────────────┐
│ INPUT ROUTING                                       │
│                                                     │
│ Short referral-style text (<2K chars)?              │
│   → YES: Skip extraction, go directly to triage    │
│          (Phase 1 flow preserved)                   │
│   → NO:  Proceed to Stage 1 extraction             │
│                                                     │
│ File upload?                                        │
│   → Parse file (pdf-parse / mammoth / readFile)     │
│                                                     │
│   > **Implementation note:** The actual codebase    │
│   > uses `unpdf` (not `pdf-parse`) for PDF parsing. │
│   → Extract raw text                                │
│                                                     │
│ Multiple items (batch)?                             │
│   → Queue all items for sequential processing       │
│   → Each item follows this pipeline independently   │
│                                                     │
│ Multi-note fusion selected?                         │
│   → All selected notes extracted individually first  │
│   → POST /api/triage/fuse combines them             │
│   → Fused extraction proceeds to Stage 2            │
│                                                     │
│   > **Implementation note:** FusionControls exists  │
│   > as a component but is not yet wired into the    │
│   > triage page UI.                                 │
└─────────────────────────────────────────────────────┘
        ↓
STAGE 1: PRE-EXTRACTION (POST /api/triage/extract)
        ↓
AI reads the full clinical note (ED note, PCP note, discharge summary, etc.)
        ↓
AI extracts neurology-relevant information into a structured summary:
  - Chief complaint, neurological symptoms, timeline
  - Relevant history, medications, failed therapies
  - Imaging results, red flags, functional status
  - Note type detected (ed_note, pcp_note, etc.)
        ↓
Frontend shows ExtractionReviewPanel:
  - Note type badge + extraction confidence indicator
  - Editable summary textarea (user can correct/add info)
  - Collapsible original text view for reference
  - "Approve & Triage" or "Edit" buttons
        ↓
User reviews/edits extraction → clicks "Approve & Triage"
        ↓
STAGE 2: TRIAGE SCORING (POST /api/triage — existing endpoint)
        ↓
Existing triage pipeline runs on the extracted summary
(same AI scoring → deterministic tier calculation → result)
        ↓
Frontend renders TriageOutputPanel (same as Phase 1)
        ↓
BATCH MODE: If batch, repeat for next item in queue
        ↓
BatchQueuePanel shows all results sorted by tier severity
  - Emergent/Urgent cases float to top
  - Each result expandable to full triage detail
```

> **Implementation note:** The component used in the triage page is `BatchResultsPanel`, not `BatchQueuePanel`. Both files exist, but `BatchResultsPanel` is the one imported and rendered.

---

## 6. AI & Algorithm Design

### 6.1 What the AI Does

The AI reads a free-text referral note and performs five tasks:

1. **Extracts** clinical entities: symptoms, diagnoses, timeline, medications, failed therapies, red flags, functional status
2. **Scores** each of five clinical dimensions (1-5 integer) with rationale — the AI does NOT calculate the weighted score or determine the tier (that is done deterministically in application code)
3. **Identifies** red flags and emergent conditions requiring ED redirect
4. **Explains** its reasoning in clinician-friendly language
5. **Recommends** pre-visit workup and subspecialty routing based on the clinical picture

> **CRITICAL ARCHITECTURE DECISION (per CMIO review):** The AI outputs raw 1-5 integer scores for each dimension. The **application code** (JavaScript/Next.js) performs the weighted score calculation and tier mapping. This ensures 100% mathematical determinism and auditability — LLMs should never be trusted for arithmetic.

### 6.2 Model Selection

**Primary: AWS Bedrock Claude Sonnet 4.6** (`us.anthropic.claude-sonnet-4-6`) — triage scoring, extraction, fusion (complex clinical reasoning)

Rationale:
- Strong performance on clinical reasoning and structured JSON output
- 96% tier consistency in validation study (N=50 runs, 10 cases) with temperature=0
- Consistent adherence to safety guardrails and anti-bias instructions
- Long context window handles detailed referral notes and full clinical documents
- AWS Bedrock integration aligns with platform-wide AWS migration (Converse API)

> **Implementation note (March 2026):** The original playbook specified Claude/Anthropic, then was updated to OpenAI gpt-5.2 during initial demo development. The current production implementation uses AWS Bedrock Claude Sonnet 4.6 via the Converse API, completing the migration to AWS infrastructure. The system prompt, scoring algorithm, and clinical logic are model-agnostic — they work identically with any capable LLM. Model swap requires only changing the model ID in the Bedrock invocation.

> **AI Model Flexibility (Platform Policy):** The triage tool uses AWS Bedrock Claude Sonnet 4.6, but the production platform is designed to be **model-agnostic**. Production deployments may use different providers optimized for specific capabilities: **AWS Transcribe Medical** for HIPAA-compliant speech recognition, **Anthropic Claude** (via Bedrock) for complex clinical reasoning and multi-step analysis, **specialized providers** for billing, coding, and diagnostic pattern matching. All AI integrations are abstracted behind API route handlers — model swaps require only changing the model ID, not the clinical logic, system prompts, or frontend. BAA requirements apply to whichever provider handles PHI in production (AWS BAA already in place).

### 6.3 Triage Algorithm — Explicit Scoring Criteria

The AI does not "just triage." It applies a structured algorithm embedded in the system prompt. The algorithm evaluates five dimensions:

#### Dimension 1: Symptom Acuity (Weight: 30%)

| Score | Criteria |
|---|---|
| 5 | Acute onset (<24 hours), severe, potentially life-threatening |
| 4 | Subacute onset (days to 2 weeks), moderate severity, progressive |
| 3 | Gradual onset (2-8 weeks), moderate, non-progressive |
| 2 | Chronic (months), stable, mild-to-moderate impact |
| 1 | Chronic (years), stable, minimal impact |

#### Dimension 2: Diagnostic Concern Level (Weight: 25%)

| Score | Criteria |
|---|---|
| 5 | Possible life-threatening or rapidly progressive condition (GBS, status epilepticus, stroke, brain mass) |
| 4 | Possible serious neurological condition requiring timely diagnosis (MS relapse, ALS, myasthenia gravis, new epilepsy) |
| 3 | Likely neurological condition requiring specialist evaluation (movement disorder workup, cognitive decline, complex headache) |
| 2 | Known neurological condition, stable, needing management optimization |
| 1 | Symptoms likely non-neurological or self-limiting, PCP manageable |

#### Dimension 3: Rate of Progression (Weight: 20%)

| Score | Criteria |
|---|---|
| 5 | Rapidly progressive (hours to days) |
| 4 | Progressive over days to weeks |
| 3 | Progressive over weeks to months |
| 2 | Stable or slowly progressive over months to years |
| 1 | Stable, no progression |

#### Dimension 4: Functional Impairment (Weight: 15%)

| Score | Criteria |
|---|---|
| 5 | Unable to perform basic ADLs, bedbound, or unsafe to be alone |
| 4 | Significant ADL impairment (cannot drive, work, or manage IADLs) |
| 3 | Moderate impairment affecting work or daily activities |
| 2 | Mild impairment, can perform most activities |
| 1 | No functional impairment |

#### Dimension 5: Red Flag Presence (Weight: 10% — but any single red flag can override to Urgent)

| Score | Criteria |
|---|---|
| 5 | Multiple red flags present |
| 4 | One major red flag present |
| 3 | Possible red flag, needs clarification |
| 2 | No red flags, but some concerning features |
| 1 | No red flags or concerning features |

#### Tier Mapping (Computed in Application Code)

| Weighted Score | Triage Tier | Default Timeframe (configurable per clinic) |
|---|---|---|
| Emergent override | Emergent — Redirect to ED | Immediate |
| 4.0 – 5.0 | Urgent | Within 1 week |
| 3.0 – 3.9 | Semi-urgent | Within 2 weeks |
| 2.5 – 2.9 | Routine-priority | Within 4-6 weeks |
| 1.5 – 2.4 | Routine | Within 8-12 weeks |
| 1.0 – 1.4 | Non-urgent | Within 6 months or redirect to PCP |
| Insufficient data flag | Insufficient Data | Return to referring provider |

> **Note:** Timeframes shown are defaults based on typical US neurology access patterns. Many health systems have internal SLAs requiring "Routine" to be seen within 14-30 days. All timeframes are **configurable per clinic** in the algorithm configuration.

#### Application-Side Scoring Logic (TypeScript)

```typescript
function calculateTriageTier(aiResponse) {
  // Check for emergent override FIRST
  if (aiResponse.emergent_override) {
    return { tier: 'emergent', display: 'EMERGENT — Redirect to ED Immediately' };
  }

  // Check for insufficient data
  if (aiResponse.insufficient_data) {
    return { tier: 'insufficient_data', display: 'Insufficient Data — Return to Referring Provider' };
  }

  // Calculate weighted score deterministically
  const scores = aiResponse.dimension_scores;
  const weightedScore =
    (scores.symptom_acuity.score * 0.30) +
    (scores.diagnostic_concern.score * 0.25) +
    (scores.rate_of_progression.score * 0.20) +
    (scores.functional_impairment.score * 0.15) +
    (scores.red_flag_presence.score * 0.10);

  // Map score to tier using cutoffs
  let scoreDerivedTier;
  if (weightedScore >= 4.0) scoreDerivedTier = 'urgent';
  else if (weightedScore >= 3.0) scoreDerivedTier = 'semi_urgent';
  else if (weightedScore >= 2.5) scoreDerivedTier = 'routine_priority';
  else if (weightedScore >= 1.5) scoreDerivedTier = 'routine';
  else scoreDerivedTier = 'non_urgent';

  // Deterministic red flag escalation — replaces the old subjective
  // red_flag_override boolean. The AI still scores red_flag_presence
  // as a dimension (1-5), and if it's >=4 we auto-escalate to urgent.
  // This is more consistent than asking the AI for a binary override.
  const redFlagScore = scores.red_flag_presence.score;
  if (redFlagScore >= 4 && scoreDerivedTier !== 'urgent' && scoreDerivedTier !== 'emergent') {
    return { tier: 'urgent', display: 'URGENT — Within 1 Week (Red Flag Escalation)', weightedScore };
  }

  return { tier: scoreDerivedTier, weightedScore };
}
```

#### Validation Study Results (March 2026)

- **96% tier consistency** achieved with Sonnet 4.6 in validation study (N=50 runs across 10 cases).
- Deterministic red flag escalation replaced the subjective `red_flag_override` boolean, fixing 2 cases that previously oscillated between tiers across runs.
- Production defaults: `temperature=0` (greedy decoding), `maxTokens=3000`.
- Clinical anchoring examples added to every dimension score level in the system prompt to reduce borderline score oscillation (see Section 6.4).
- Target: 99%+ consistency across all tier assignments.

#### Emergent Override Rules (Redirect to ED — NOT Outpatient Triage)

The following conditions, if identified by the AI, trigger an **Emergent** classification. These patients should NOT be scheduled for outpatient neurology — they need emergency evaluation NOW. The system should instruct the clinic to **call the referring provider and/or the patient immediately** to redirect to the nearest ED:

- Active stroke symptoms (face droop, arm weakness, speech changes) — regardless of time from onset
- Thunderclap headache that has NOT yet been evaluated in an ED (no CT/CTA/LP completed)
- Active status epilepticus or ongoing seizure clusters
- Acute cord compression symptoms (rapidly progressive bilateral weakness + bladder/bowel dysfunction)
- Signs of acute increased intracranial pressure with altered mental status
- Active suicidal ideation with plan or intent

> **Key distinction:** A thunderclap headache that has ALREADY been evaluated in the ED (CT/CTA negative) is triaged as **Urgent** outpatient. A thunderclap headache that has NOT been evaluated is **Emergent** — redirect to ED.

#### Red Flag Override Rules (Escalate to Urgent)

The following red flags, if identified, automatically escalate to **Urgent** (within 1 week) regardless of weighted score. These are serious but the patient has already received initial evaluation or is medically stable:

- Thunderclap headache (ED-evaluated, workup incomplete)
- New focal neurological deficit (subacute, not hyperacute)
- Rapidly progressive weakness (suspect GBS or cord compression, but patient ambulatory)
- Signs of increased intracranial pressure (papilledema, positional headache with vomiting)
- Cauda equina syndrome symptoms (saddle anesthesia, urinary retention) — if ambulatory and stable
- New-onset diplopia with ptosis (suspect myasthenia crisis or aneurysm)
- Suicidal ideation in context of neurological symptoms (passive, without plan)

### 6.4 System Prompt

The system prompt is maintained in `src/lib/triage/systemPrompt.ts` (exported as `TRIAGE_SYSTEM_PROMPT`). Below is a structured description of its contents as of March 2026. The actual prompt contains clinical anchoring examples (2-3 neurology-specific examples per score level) for each dimension, which are summarized here rather than reproduced in full.

#### Role and Task

The AI is a neurology clinical decision support system for adult (18+) outpatient referrals. It provides structured clinical scoring — it does not make final clinical decisions. It scores each dimension 1-5 as integers. It does NOT calculate the final weighted score or determine the triage tier (that is done by application code).

#### Anti-Bias Instruction

Evaluate symptoms strictly based on objective clinical descriptors. Do not down-weight severity based on patient demographics (age, sex, race, ethnicity, insurance status).

#### STEP 1: Check for Emergent Conditions

Before scoring dimensions, check for conditions requiring immediate ED evaluation:

- Active stroke symptoms not yet evaluated in ED
- Thunderclap headache NOT yet ED-evaluated (no CT/CTA/LP completed)
- Active status epilepticus or ongoing seizure clusters
- Acute cord compression (rapidly progressive bilateral weakness + bladder/bowel dysfunction)
- Acute increased intracranial pressure with altered mental status
- Active suicidal ideation with plan or intent

If any emergent condition is present, set `emergent_override: true` and still complete all other scoring.

#### STEP 2: Check for Insufficient Data

If the referral is too vague to triage safely, set `insufficient_data: true` and list what specific information is missing.

#### STEP 3: Score Five Dimensions (1-5 integers only)

Each dimension includes clinical anchoring examples at every score level and a rationale field. The prompt provides 2-3 neurology-specific examples per score level to reduce borderline score oscillation (e.g., for Symptom Acuity, score 5 examples include thunderclap headache, sudden hemiplegia, acute vision loss; score 2 examples include chronic stable migraines on preventive therapy, known essential tremor for 2 years).

1. **Symptom Acuity** — 5: Acute onset (<24h), severe, life-threatening ... 1: Chronic (years), stable, minimal impact
2. **Diagnostic Concern Level** — 5: Possible life-threatening or rapidly progressive condition ... 1: Likely non-neurological or self-limiting
3. **Rate of Progression** — 5: Rapidly progressive (hours to days) ... 1: Stable, no progression
4. **Functional Impairment** — 5: Unable to perform basic ADLs, bedbound, or unsafe ... 1: No functional impairment
5. **Red Flag Presence** — 5: Multiple red flags present ... 1: No red flags

#### Tie-Breaking Rules

When a presentation falls between two adjacent scores:

- **Prefer the higher score** if ANY red flag, progressive/worsening symptoms, failed prior treatments, or new neurological deficit is present.
- **Prefer the lower score** ONLY when ALL of: documented clinical stability, normal neurological exam, no red flags, no failed treatments.
- For **Functional Impairment**, anchor on the MOST limiting activity described (e.g., falls outweigh "can still work").
- When in doubt, err toward the higher score. A clinician can always downgrade, but undertriaging is more harmful.

#### STEP 4: Check Red Flag Overrides

Set `red_flag_override: true` if any of these are present (patient is medically stable but needs urgent outpatient evaluation):

- Thunderclap headache (ED-evaluated, workup incomplete)
- New focal neurological deficit (subacute)
- Rapidly progressive weakness (days), patient still ambulatory
- Signs of increased intracranial pressure
- Cauda equina symptoms (if ambulatory and stable)
- New diplopia with ptosis
- Suicidal ideation (passive, without plan) in neurological context

> **Note on deterministic escalation:** In application code, red flag escalation is now handled deterministically based on the `red_flag_presence` dimension score (>=4 auto-escalates to urgent). The `red_flag_override` boolean in the AI output serves as a secondary signal and is preserved for backward compatibility but is no longer the primary escalation mechanism.

#### STEP 5: Check for Non-Neurological Presentation

Evaluate whether the referral describes a condition better served by a different specialty. Set `redirect_to_non_neuro: true` if the presentation is clearly:

- **Musculoskeletal** (e.g., mechanical low back pain without radiculopathy) -> Orthopedics, Spine Surgery, or PM&R
- **Peripheral vascular** (e.g., claudication without neuropathy) -> Vascular Surgery
- **Psychiatric without neurological features** -> Psychiatry
- **Isolated foot/ankle without neuropathy** -> Podiatry
- **Autoimmune without CNS/PNS involvement** -> Rheumatology
- **Pain syndrome without neurological deficit** -> Pain Management
- **Vestibular/hearing without central features** -> ENT / Otolaryngology

Still complete all scoring even if redirect is recommended. Only redirect when the presentation is clearly non-neurological — any neurological component (radiculopathy, neuropathy, myelopathy) keeps the referral appropriate for neurology. If redirecting, specify `redirect_specialty` and `redirect_rationale`.

#### STEP 6: Extract Failed Therapies

Extract all previously tried treatments that were stopped or failed. This impacts routing and priority.

#### STEP 7: Suggest Pre-Visit Workup (Required)

The AI must always provide at least 2-3 suggested workup items in `suggested_workup`. These are recommendations sent back to the referring provider to order BEFORE the neurology visit. The prompt covers four categories:

- **Laboratory Studies**: CBC, CMP, TSH, B12, folate, HbA1c, ESR/CRP, ANA, CK, specialized panels as indicated
- **Neuroimaging**: MRI brain/spine (with specific protocols — epilepsy, MS, pituitary, IAC), CT head, CTA/MRA
- **Neurodiagnostic Studies**: EEG (routine/prolonged), EMG/NCS, VEP/SSEP/BAER, sleep study
- **Clinical Screening**: MoCA/MMSE (cognitive), PHQ-9/GAD-7 (mood), headache/seizure diaries, MIDAS/HIT-6/Epworth

Rules: note what has already been completed, be specific with imaging orders (include contrast and protocol names), frame as actionable orders the referring PCP can place, prioritize high-yield studies.

#### Confidence Assessment

- "high": Clear clinical details
- "moderate": Some details missing but enough for reasonable assessment
- "low": Vague, contradictory, or missing critical information

#### Output Format

Returns JSON with these fields:

- `emergent_override`, `emergent_reason`
- `insufficient_data`, `missing_information`
- `confidence`
- `dimension_scores` (5 dimensions, each with `score` and `rationale`)
- `red_flag_override`
- `clinical_reasons` (array)
- `red_flags` (array)
- `suggested_workup` (array — minimum 2-3 items required)
- `failed_therapies` (array of `{therapy, reason_stopped}`)
- `subspecialty_recommendation`, `subspecialty_rationale`
- `redirect_to_non_neuro`, `redirect_specialty`, `redirect_rationale`

#### Rules Summary

1. Score all five dimensions as integers 1-5. Do NOT calculate weighted scores.
2. Check emergent conditions FIRST.
3. Check all red flag override conditions.
4. Clinical reasons in PCP-readable language.
5. Suggested workup must be specific and actionable (minimum 2-3 items, never empty).
6. Insufficient data triggers return to referring provider with specific missing items listed.
7. Never diagnose — use "evaluate for," "rule out," "consider."
8. Extract ALL failed/tried therapies.
9. Safety-critical information (suicidal ideation, abuse) always goes in red_flags.
10. No scoring adjustment based on demographics.
11. If the referral is better suited for another specialty, set `redirect_to_non_neuro: true` and complete all scoring.

> **Source:** `src/lib/triage/systemPrompt.ts` — exported as `TRIAGE_SYSTEM_PROMPT`

### 6.4b Extraction System Prompt (Phase 2 — Stage 1)

> **Added February 2026.** This prompt powers the two-stage pipeline. When the input is a full clinical note (ED H&P, PCP progress note, discharge summary, etc.) rather than a short referral summary, this extraction step reads the complete note and pulls out only neurology-relevant information into a structured summary suitable for triage scoring.

```
You are a neurology clinical data extraction system. Your task is to read a clinical document — which may be an ED note, PCP progress note, discharge summary, specialist consult, imaging report, or referral letter — and extract ONLY the neurology-relevant information into a structured summary suitable for triage scoring.

## YOUR TASK

Read the full clinical document and produce two outputs:
1. A structured JSON with extracted clinical findings
2. A concise narrative summary (the "extracted_summary") written in referral-style language that a triage system can score

## NOTE TYPE DETECTION

First, classify the document type:
- "ed_note": Emergency department history and physical, ED discharge summary
- "pcp_note": Primary care progress note, annual wellness visit
- "discharge_summary": Hospital discharge summary
- "specialist_consult": Consultation note from another specialist
- "imaging_report": Radiology or neurodiagnostic report (MRI, CT, EEG, EMG)
- "referral": Formal referral letter specifically requesting neurology evaluation
- "unknown": Cannot determine note type

## EXTRACTION RULES

1. **Extract ONLY neurology-relevant information.** Ignore billing codes, administrative text, routing info, non-neurological systems review UNLESS it impacts neurological assessment (e.g., cardiac arrhythmia relevant to stroke risk).
2. **Preserve clinical precision.** Do not paraphrase clinical terminology. Keep exact medication names, doses, frequencies, lab values, imaging findings.
3. **Capture timeline.** Extract onset dates, duration, progression pattern, and sequence of events. Preserve dates.
4. **Extract ALL medications and failed therapies.** Include current, discontinued, and reasons for discontinuation.
5. **Identify red flags.** Extract findings that constitute neurological red flags.
6. **Assess functional status.** Extract ADL limitations, work disability, driving restrictions, mobility changes.
7. **Do not infer or add information not present in the note.**
8. **The extracted_summary must read like a referral note** (150-500 words) — demographics, chief complaint, HPI timeline, relevant exam, test results, meds, failed therapies, functional impact, reason for neurology evaluation.

## CONFIDENCE ASSESSMENT

- "high": Note contains clear neurological content with specific findings
- "moderate": Note contains some neurological content but is sparse or indirect
- "low": Note is mostly non-neurological or very brief

## OUTPUT FORMAT

Return ONLY valid JSON:

{
  "note_type_detected": "ed_note | pcp_note | discharge_summary | specialist_consult | imaging_report | referral | unknown",
  "extraction_confidence": "high | moderate | low",
  "extracted_summary": "Concise referral-style narrative summary (150-500 words)",
  "key_findings": {
    "chief_complaint": "Primary neurological complaint",
    "neurological_symptoms": ["symptom 1 with timeline", "symptom 2"],
    "timeline": "Chronological narrative of symptom onset, progression, key events",
    "relevant_history": "Relevant medical history",
    "medications_and_therapies": ["medication 1 with dose/frequency", "medication 2"],
    "failed_therapies": [
      { "therapy": "medication or treatment name", "reason_stopped": "reason if stated" }
    ],
    "imaging_results": ["MRI brain 1/15/2026: findings..."],
    "red_flags_noted": ["red flag — clinical significance"],
    "functional_status": "ADL impact, work status, mobility, driving"
  }
}

## RULES

1. Do NOT diagnose the patient. Use "evaluate for," "rule out," "concern for."
2. Do NOT add information not present in the source document.
3. Do NOT remove or downplay red flags even if the note minimizes them.
4. If the document is non-clinical, set extraction_confidence to "low" and note this.
5. If the document is in a language other than English, extract what you can and note the limitation.
6. Evaluate symptoms based on clinical descriptors only — do not adjust based on demographics.
```

> **Source:** `src/lib/triage/extractionPrompt.ts` — exported as `EXTRACTION_SYSTEM_PROMPT`

**Extraction user prompt format:**

```
Please extract neurology-relevant clinical information from the following document.

Patient age: {age or "not provided"}
Patient sex: {sex or "not provided"}
Source file: {filename or "pasted text"}

--- CLINICAL DOCUMENT ---
{noteText}
--- END CLINICAL DOCUMENT ---
```

> **Source:** `src/lib/triage/extractionPrompt.ts` — `buildExtractionUserPrompt()`

### 6.4c Fusion System Prompt (Phase 2 — Multi-Note)

> **Added February 2026.** When multiple clinical notes exist for the same patient (e.g., ED note + PCP referral + imaging report), this prompt combines the individual extractions into a single comprehensive summary before triage scoring.

```
You are a neurology clinical data fusion system. You receive multiple clinical extractions from different notes about the SAME patient and must combine them into a single comprehensive extraction. The fused result will be used for triage scoring.

## YOUR TASK

Read all provided clinical extractions and produce:
1. A single comprehensive narrative summary combining all neurology-relevant findings
2. A reconstructed timeline from all sources
3. A list of any conflicts between sources and how you resolved them

## FUSION RULES

1. **Use the most recent information when sources conflict.** For medications, use the most recently dated note. For findings, use the most detailed description.
2. **Preserve ALL red flags from ANY source.** Never drop a red flag during fusion.
3. **Combine medication lists comprehensively.** Current meds from most recent source, plus all failed/discontinued therapies from any source.
4. **Reconstruct a unified timeline.** Merge temporal information from all notes into a single chronological narrative.
5. **Flag unresolvable conflicts.** If two notes directly contradict and you cannot determine which is correct, list in conflicts_resolved with a note for clinician verification.
6. **Do NOT fabricate connections.** If notes don't clearly relate, note the uncertainty.
7. **The fused_summary should read as a single comprehensive referral narrative** — not as separate note summaries.

## CONFIDENCE ASSESSMENT

- "high": All notes clearly about same patient, information is complementary
- "moderate": Notes appear to be about same patient but have some gaps or minor conflicts
- "low": Uncertain whether notes are about same patient, or major conflicts exist

## OUTPUT FORMAT

Return ONLY valid JSON:

{
  "fused_summary": "Comprehensive referral-style narrative combining all sources (200-800 words)",
  "fusion_confidence": "high | moderate | low",
  "sources_used": ["note_type: filename or 'pasted text'"],
  "conflicts_resolved": [
    "Description of conflict and how resolved"
  ],
  "timeline_reconstructed": "Unified chronological narrative of clinical course"
}

## RULES

1. Do NOT diagnose. Use evaluative language only.
2. Do NOT drop information from any source unless clearly duplicated.
3. Preserve exact medication names, doses, lab values, and imaging findings.
4. The fused output must be MORE informative than any single input.
```

> **Source:** `src/lib/triage/extractionPrompt.ts` — exported as `FUSION_SYSTEM_PROMPT`

**Fusion user prompt format:**

```
Please fuse the following {N} clinical extractions for the same patient into a single comprehensive summary.

Patient age: {age or "not provided"}
Patient sex: {sex or "not provided"}

--- EXTRACTION 1 ({note_type}: {filename}) ---
Summary: {extracted_summary}
Key Findings: {JSON key_findings}
--- END EXTRACTION 1 ---

--- EXTRACTION 2 ({note_type}: {filename}) ---
...
```

> **Source:** `src/lib/triage/extractionPrompt.ts` — `buildFusionUserPrompt()`

### 6.5 Input/Output Format

**Input to AI:**

```
System: [System prompt above]

User: Please triage the following referral note.

Patient age: {age or "not provided"}
Patient sex: {sex or "not provided"}
Referring provider: {type or "not provided"}

--- REFERRAL NOTE ---
{referral_text}
--- END REFERRAL NOTE ---
```

**Output from AI:** Structured JSON as defined in the system prompt.

### 6.6 Guardrails Within the AI

| Guardrail | Implementation |
|---|---|
| No diagnosis | System prompt explicitly forbids; parse output to verify language uses "evaluate for" / "rule out" |
| Deterministic math | AI outputs raw 1-5 scores only; weighted calculation and tier mapping done in JavaScript — never by the LLM |
| Anti-bias | System prompt includes explicit instruction to evaluate based on clinical descriptors only, not demographics |
| No ED referral unless critical | Only emergent overrides may suggest ED evaluation |
| Structured output only | Request JSON only; validate response is parseable JSON before displaying |
| Confidence flagging | Low confidence triggers UI indicator recommending physician review |
| Insufficient data handling | If AI flags insufficient_data, system shows return-to-PCP workflow instead of assigning a low-confidence tier |
| Vague input handling | If input is <50 characters, prompt user for more details before submitting to AI |

---

## 7. Safety & Guardrails

### 7.1 Clinical Safety Boundaries

- **The AI recommends, never decides.** The triage tier is a recommendation that must be reviewed by a licensed clinician before scheduling proceeds.
- **Red flag override is one-directional.** The system can escalate urgency (override to Urgent) but NEVER de-escalate when red flags are present.
- **No diagnosis language.** Every output must use evaluative language: "evaluate for," "consider," "rule out." Never "the patient has" or "this is."
- **No treatment recommendations.** Pre-visit workup is limited to diagnostic testing. The AI never recommends medications, procedures, or therapeutic interventions.
- **Anti-bias by design.** The system prompt includes an explicit anti-bias instruction. AI models have documented biases regarding pain perception in female and minority patients — the prompt requires evaluation based solely on objective clinical descriptors.
- **Equity safeguard for poor-quality referrals.** Patients from underfunded safety-net clinics often have lower-quality referral notes (sparse, unstructured). The system flags these as Insufficient Data for physician review rather than defaulting them to Non-urgent, preventing inequitable deprioritization based on referral quality rather than clinical need.

### 7.2 Escalation Logic

| Trigger | Action |
|---|---|
| Emergent condition detected | Full-screen alert: "EMERGENT — This patient requires immediate emergency evaluation. Do NOT schedule outpatient. Contact the referring provider and/or patient to redirect to the nearest ED." Log and notify triaging physician. |
| Red flag detected (non-emergent) | Auto-escalate to Urgent tier; highlight in red; add note: "Red flag identified — expedited scheduling recommended within 1 week" |
| Insufficient data | Display return-to-PCP panel: "This referral does not contain enough clinical information to triage safely. Return to referring provider requesting: [specific missing items]." Do NOT assign a default tier. |
| Confidence = Low (but not insufficient) | Display: "This referral may require direct physician review before scheduling." Flag in database for review queue. |
| Safety concern (suicidal ideation, abuse) | Display: "SAFETY CONCERN DETECTED — This case requires immediate human review." Do NOT proceed with standard triage flow. |
| Multiple comorbidities making triage ambiguous | Set confidence to Low; recommend physician review |
| Poor-quality referral from safety-net clinic | Flag for physician review rather than defaulting to Non-urgent. Per equity safeguard: patients with low-quality referrals (often from underfunded clinics) should not be deprioritized due to referral quality alone. |

### 7.3 Regulatory Considerations

- **HIPAA**: All referral text is transmitted via HTTPS to the API. Stored in Supabase with encryption at rest. For POC/demo, use only synthetic data. For clinical pilot, ensure BAA with database provider and AI provider (AWS BAA already covers Bedrock — see AI Model Flexibility note in Section 6.2).
- **FDA**: As a clinical decision support tool where a human clinician makes the final decision, this likely falls under FDA enforcement discretion for Clinical Decision Support (CDS) software per 21st Century Cures Act Section 3060(a). However, if the tool begins making autonomous scheduling decisions without human review, it may require FDA clearance as a Software as a Medical Device (SaMD). Consult regulatory counsel before Phase 2.
- **State medical practice laws**: The AI does not practice medicine. It provides information to support a licensed clinician's decision. All outputs must include appropriate disclaimers.

### 7.4 UI Disclaimers

**Persistent disclaimer (bottom of every triage output):**
> "This is a clinical decision support tool. Final triage decisions must be made by a licensed clinician. This tool does not diagnose conditions, prescribe treatments, or replace clinical judgment."

**Low-confidence disclaimer:**
> "The AI has low confidence in this triage recommendation. Please have a licensed clinician review the original referral note directly before scheduling."

**Red flag disclaimer:**
> "One or more clinical red flags have been identified. This case should be reviewed by a clinician promptly."

---

## 8. Demo Design

### 8.1 The 3-Minute Demo

**Minute 0:00-0:30 — Context Setting**
"Every neurology practice faces the same problem: a 4-month waitlist, and no systematic way to prioritize who gets seen first. Today, most referrals are triaged by front desk staff using informal rules, or not triaged at all. Some patients wait months for something urgent. Others get rushed in for something that could wait."

**Minute 0:30-1:15 — Emergent Case Demo**
- Load the "Active stroke symptoms" sample note
- Click "Triage This Patient"
- The screen flashes the Emergent alert: "This is the safety net. This patient mentioned active stroke symptoms but hasn't been to the ER. The system immediately flags this as Emergent — not for scheduling, but for an immediate call to the patient and their PCP to redirect to the nearest emergency department. This catches a potentially life-threatening situation before it becomes a missed appointment on a 3-month waitlist."

**Minute 1:15-1:50 — Urgent Case with Subspecialty Routing**
- Load the "New-onset seizure" sample note
- Click "Triage This Patient"
- Walk through: "The AI scored this across five clinical dimensions — acuity, diagnostic concern, progression, functional impairment, and red flags. The application calculated the weighted score deterministically and placed this patient at Urgent — within 1 week. It also routed directly to the Epilepsy Clinic, and recommended an MRI and EEG before the visit so the neurologist has results on day one."

**Minute 1:50-2:20 — Routine Case with Failed Therapies**
- Load the "Chronic migraine (failed therapies)" sample note
- Click "Triage This Patient"
- Walk through: "Same tool, different case. Chronic migraine — not an emergency. But notice: the AI extracted that she's already failed three preventive medications. That makes her a more complex patient who likely needs CGRP discussion. She's routed to the Headache Clinic, not general neurology. The right patient to the right doctor."

**Minute 2:20-2:45 — The Architecture**
- Click "View Algorithm"
- "The AI does the clinical reasoning — extracting findings, scoring severity, identifying red flags. But the math is deterministic — calculated in code, not by the AI, so every score is auditable and reproducible. In production, this sits inside Epic's In Basket, reading referral faxes via OCR and surfacing triage recommendations directly in the coordinator's workflow — no copy-pasting required."

**Minute 2:45-3:00 — The Vision**
"Because every triage is logged with full reasoning, we can track accuracy over time, measure override rates, demonstrate quality metrics to payers, and continuously improve. This is how neurology access becomes systematic instead of chaotic."

### 8.2 Key Wow Moments for Investors

1. **The Emergent safety net**: A patient with active stroke symptoms gets caught and redirected to the ED before they sit on a 3-month waitlist — this is a life-saving demo moment
2. **Deterministic scoring**: The AI does clinical reasoning; the math is in code. Every score is reproducible and auditable. Investors and CMIOs love this.
3. **Subspecialty routing**: Not just "urgent" — the system routes to the right subspecialist. Epilepsy to epilepsy, headache to headache. Patient-provider matching in real-time.
4. **Failed therapy extraction**: The AI reads that a migraine patient has already failed 3 medications and adjusts routing accordingly — shows clinical depth
5. **Pre-visit workup**: Reduces wasted visits where the neurologist has to order tests and schedule a return
6. **Speed + Scale**: Triage in 3 seconds vs. 5-10 minutes of physician time. Works identically for 10 or 10,000 referrals per day
7. **Physician override**: The system respects clinical judgment — it supports, never replaces

---

## 9. Phased Roadmap

### Phase 1: POC / Demo Version ✅ COMPLETE (February 14, 2026)

**Scope:**
- Single-page triage tool with text input and AI output
- 11 pre-loaded sample referral notes (including Emergent, Insufficient Data, and Failed Therapies examples)
- AWS Bedrock Claude Sonnet 4.6 integration for clinical scoring (AI scores dimensions; app code calculates tiers)
- 6-tier output: Emergent, Urgent, Semi-urgent, Routine-priority, Routine, Non-urgent + Insufficient Data state
- Subspecialty routing recommendation for every triage (7 subspecialties)
- Failed therapies extraction from referral notes
- Triage output: tier, dimension scores, reasons, red flags, suggested workup, subspecialty routing, failed therapies
- Supabase storage of all triage sessions
- Copy Report and Flag for Review functionality
- Physician override via dropdown categories (e.g., "Acuity higher than assessed", "Needs different subspecialty", "Disagree with tier") — not mandatory free-text
- No authentication (demo mode)
- No real patient data

**Technical:**
- Next.js page at `/triage`
- Vercel serverless API route at `/api/triage` — includes deterministic tier calculation in JavaScript
- Supabase `triage_sessions` table
- AWS Bedrock Claude Sonnet 4.6 for clinical analysis (via Converse API, cross-region inference profile `us.anthropic.claude-sonnet-4-6`)

**Timeline:** 1-2 development sessions

### Phase 2: Enhanced Input & Extraction Pipeline ✅ COMPLETE (February 24, 2026)

> **Implementation status:** Phase 2A-2E fully implemented and merged to main. See `src/lib/triage/extractionPrompt.ts` for extraction and fusion prompts, `src/lib/triage/demoScenarios.ts` for 26 demo scenarios, and `docs/plans/2026-02-24-demo-referral-library-design.md` for the demo library design.

Phase 2 adds the ability to process any clinical note type (not just referral summaries), upload files, process batches, and fuse multiple notes for the same patient. These features address the core limitation of Phase 1: real-world incoming notes are often ED H&Ps, PCP notes, discharge summaries, or specialist consults that don't mention "referral" explicitly and contain large amounts of non-neurological content.

#### 2A. File Upload (PDF/DOCX/TXT)

**What it does:** Accepts clinical documents as file uploads instead of requiring copy-paste.

**Supported formats:**
- PDF (parsed server-side via `pdf-parse` — pure JavaScript, serverless-compatible)
- DOCX (parsed via `mammoth` — pure JavaScript, converts to plain text)
- TXT (read directly)
- Note: Scanned/image-based PDFs are NOT supported in Phase 2. OCR deferred to Phase 3.

**Constraints:**
- 10MB maximum per file
- Up to 20 files in batch mode
- Extracted text capped at 50,000 characters per file

**UI:** `FileUploadZone` component — drag-and-drop area with dashed border, file picker button, file list with name/size/type badges and remove buttons.

#### 2B. Two-Stage Pre-Extraction Pipeline

**What it does:** When the input is a long clinical note (not a short referral summary), an AI extraction step reads the full note and pulls out only the neurology-relevant information into a structured summary. The user reviews and can edit this extraction before it's sent to the existing triage scoring system.

**Why it's needed:**
- Incoming notes often don't mention "referral" — they're ED discharge summaries, PCP progress notes, specialist consults, or imaging reports
- These notes contain extensive non-neurological content (billing codes, administrative text, cardiology review, etc.) that would confuse the triage scorer
- A dedicated extraction AI prompt is tuned specifically for pulling neurology-relevant signal from any clinical note type

**How it works:**
1. **Stage 1 — Extraction:** `POST /api/triage/extract` sends the full note to the AI with an extraction-specific system prompt. The AI identifies the note type, extracts neurology-relevant findings, and produces a structured summary.
2. **User Review:** `ExtractionReviewPanel` shows the extraction with a note type badge, confidence indicator, editable summary textarea, and collapsible original text. The user can correct or supplement the extraction.
3. **Stage 2 — Triage:** The reviewed extraction is sent to the existing `POST /api/triage` endpoint for scoring. The existing triage algorithm runs unchanged.

**Short note bypass:** Text under 2,000 characters that reads like a referral summary skips extraction and goes directly to triage scoring (preserving the Phase 1 flow).

**Extraction system prompt scope:** The AI extracts:
- Chief complaint and neurological symptoms
- Timeline and rate of progression
- Relevant medical history (neurological conditions, comorbidities)
- Current medications and failed therapies
- Imaging and test results
- Red flags
- Functional status
- Note type classification

**Extraction confidence levels:**
- **High**: Note is clearly clinical, contains structured findings, neurology-relevant content is easily identifiable
- **Moderate**: Note is clinical but sparse, or neurological relevance is indirect
- **Low**: Note is mostly non-neurological, or very short/vague — extraction may miss context

> **Full prompt text:** See Section 6.4b for the complete `EXTRACTION_SYSTEM_PROMPT` and Section 6.4c for the `FUSION_SYSTEM_PROMPT`.

#### 2C. Raised Character Limit

**What it does:** Raises the paste input limit from 5,000 to 50,000 characters.

**Why:** Full ED history and physical notes can be 15,000-25,000 characters. The Phase 1 limit of 5,000 was sufficient for referral summaries but too small for full clinical documents.

**File uploads:** No explicit character limit on the file itself, but extracted text is capped at 50,000 characters. Files exceeding this after extraction receive a warning.

#### 2D. Batch Processing

**What it does:** Upload multiple files or paste multiple notes separated by `---`. Each item is processed sequentially through the extraction → review → triage pipeline.

**Why client-side orchestration:** Vercel serverless functions have a 120-second maximum execution time. Processing 20 notes through extraction + triage would exceed this. Instead, the client orchestrates sequential API calls (one per item), updating the UI after each completes.

**Batch flow:**
1. User uploads multiple files or pastes multiple notes
2. Client creates a batch ID and queues all items
3. Each item is processed: extract → user reviews extraction → triage
4. Results accumulate in `BatchQueuePanel`
5. Queue is automatically sorted by tier severity (Emergent/Urgent float to top)
6. Each result is expandable to full triage detail

**Batch review options:**
- **Review each extraction:** Default — user reviews/edits each extraction individually before triage. Most accurate.
- **Auto-approve extractions:** User can toggle "auto-approve" to skip extraction review for all items. Faster but less oversight. The extraction step still runs; user just doesn't edit.

**Database:** Batch ID stored on each `triage_sessions` record. `triage_batches` table tracks overall batch progress.

#### 2E. Multi-Note Fusion

**What it does:** When multiple clinical notes exist for the same patient (e.g., an ED note + a PCP referral letter + imaging report), the system can combine them into a single comprehensive extraction before triage scoring.

**Why:** A single note often tells only part of the story. The ED note may describe acute symptoms but not mention failed therapies. The PCP note may list medication history but not the ED workup results. Fusing multiple notes gives the triage system the complete clinical picture.

**How it works:**
1. User uploads/pastes multiple notes and selects which ones to fuse via checkboxes in `FusionControls`
2. Each selected note is extracted individually first (Stage 1)
3. `POST /api/triage/fuse` sends all extractions to the AI with a fusion-specific prompt
4. The AI merges overlapping information, resolves conflicts (e.g., different medication doses — uses most recent), and preserves the clinical timeline
5. The fused extraction is shown for user review, then proceeds to triage scoring as a single case

**Conflict resolution:** The fusion AI:
- Uses the most recent information when sources disagree (dates are used for recency)
- Flags conflicts it cannot resolve (e.g., contradictory diagnoses) for the user's attention
- Preserves all red flags from any source
- Reconstructs a chronological timeline from all notes

**Database:** Fused notes share a `fusion_group_id` in `triage_sessions`.

#### 2F. Demo Referral Library (26 Scenarios, 40 PDFs) ✅ COMPLETE

> **Added February 24, 2026.** Built-in demo library for demonstrating the triage pipeline without needing external files.

**What it does:** A "Try a Demo" button on the triage page opens a categorized library of 26 realistic patient scenarios, each with 1-4 PDF referral documents containing pre-extracted text.

**Three categories:**
- **Outpatient Referrals (10):** PCP/NP referral notes — Parkinsonism, chronic migraine, neuropathy, seizure, radiculopathy, dementia, MS, tremor, TIA, myelopathy
- **Cross-Specialty Referrals (12):** Referrals from orthopedics, psychiatry, cardiology, ENT, occupational medicine, pain management, OB/GYN, ophthalmology, oncology, rheumatology, gastroenterology, sleep medicine
- **Patient Packets (4):** Multi-document cases with 4-5 files each (PCP referral + imaging + specialist notes) — demonstrates multi-note fusion

**Implementation:**
- Real PDFs in `public/samples/triage/{outpatient,cross-specialty,packets}/`
- TypeScript manifest: `src/lib/triage/demoScenarios.ts` (26 scenarios with metadata and pre-extracted text)
- Components: `DemoScenarioLoader.tsx` (categorized picker) and `DemoPreviewModal.tsx` (full-text preview)
- Files load directly into the FileUploadZone → Extract → Triage pipeline
- Pre-extracted text: `docs/triage-pdf-extracted-text.txt` (reference)
- Design doc: `docs/plans/2026-02-24-demo-referral-library-design.md`

#### Phase 2 — Additional Features (Not Yet Implemented)

- Subspecialty routing enhanced with neurologist availability and waitlist matching
- Physician review queue: dashboard showing pending triages, approve/override workflow
- Authentication: role-based access (coordinator, physician, admin)
- Integration with EHR scheduling system (FHIR/HL7 interface) — primary target: Epic In Basket via FHIR R4
- Triage accuracy tracking: compare AI tier vs. physician-approved tier
- Algorithm configuration admin panel (configurable tier timeframes per clinic)

**Technical Additions:**
- `pdf-parse` and `mammoth` npm packages for file parsing (pure JS, serverless-compatible)
- `next.config.ts` body size limit raised to 12MB for file uploads
- New columns on `triage_sessions` table: `source_type`, `source_filename`, `extracted_summary`, `extraction_confidence`, `note_type_detected`, `batch_id`, `fusion_group_id`
- New `triage_batches` table
- New API endpoints: `POST /api/triage/extract`, `POST /api/triage/fuse`
- New components: `FileUploadZone`, `ExtractionReviewPanel`, `BatchQueuePanel`, `FusionControls`
- Supabase Row Level Security (RLS) for role-based access
- `triage_algorithm_config` table for configurable algorithm
- Analytics dashboard with triage distribution, override rates, accuracy metrics
- FHIR R4 interface for EHR integration

**Timeline:** Phase 2A-2E (extraction pipeline): 1-2 development sessions. Full Phase 2 (auth, EHR, analytics): 3-6 months post-POC.

### Phase 3: Production / Scaled Version

**New Features:**
- Multi-clinic support with clinic-specific algorithms
- Learning system: AI incorporates physician override patterns to improve
- Predictive analytics: forecast waitlist and suggest capacity adjustments
- Patient-facing triage: patient self-triage for appropriate referrals
- Integration with insurance pre-authorization workflows
- Audit trail and compliance reporting for value-based care contracts
- NLP extraction from scanned/faxed referral letters (OCR + AI)

**Technical Additions:**
- Multi-tenant architecture
- ML model fine-tuned on clinic's historical triage data
- HIPAA-compliant infrastructure (SOC2, BAA)
- HL7 FHIR Subscription for real-time EHR data

**What Changes Between Phases:**
- Phase 1 → 2: Adds file upload (PDF/DOCX/TXT), two-stage pre-extraction pipeline, raised character limits, batch processing, multi-note fusion, authentication, physician review dashboard, EHR integration, configurable timeframes
- Phase 2 → 3: Adds multi-tenancy, OCR for scanned PDFs, learning from physician overrides, patient-facing features, regulatory compliance infrastructure

---

## 10. Open Questions & Decisions Needed

### Resolved by CMIO Review

| # | Question | Resolution |
|---|---|---|
| 1 | **Model choice** | ✅ Originally spec'd as Claude Sonnet, temporarily used OpenAI gpt-5.2, now **production uses AWS Bedrock Claude Sonnet 4.6** (`us.anthropic.claude-sonnet-4-6`) via Converse API. System prompts and scoring logic are model-agnostic. |
| 2 | **Subspecialty routing granularity** | ✅ 7 subspecialties are sufficient for POC. Don't clutter the demo with Neuro-immunology yet. Expand in Phase 2 if needed. |
| 5 | **Physician override workflow** | ✅ Use dropdown categories for POC (e.g., "Acuity higher than assessed", "Needs different subspecialty", "Disagree with tier") — not mandatory free-text. Doctors don't want to type explanations. |
| 10 | **Supabase vs. HIPAA database** | ✅ Standard Supabase is fine for POC with synthetic data. Phase 2 requires: HIPAA-compliant database with BAA, and AI provider BAA for clinical data (AWS BAA already covers Bedrock). |

### Still Open

3. **Algorithm weight tuning**: The current weights (30/25/20/15/10) are clinically reasonable but arbitrary. Should we plan a formal Delphi-method consensus exercise with neurologists to validate?
4. **EHR integration target**: Which EHR system is the primary integration target for Phase 2? Epic is the likely first target (In Basket integration via FHIR R4). Confirm?
7. **Patient self-triage**: Is there interest in a patient-facing version for self-triage? If so, what phase?

### Resolved

| # | Question | Resolution |
|---|---|---|
| 6 | **Batch triage priority** | ✅ Batch processing included in Phase 2 (2D). Client-side sequential orchestration avoids Vercel timeout. Up to 20 files per batch. |
8. **De-identified data for testing**: Do we have access to de-identified real referral notes for algorithm validation, or do we rely entirely on synthetic notes?
9. **Regulatory counsel timing**: At what phase should we engage formal FDA/regulatory counsel? Before Phase 2, or can we wait until Phase 3 planning?

### New Questions Raised by Review

11. **Pediatric neurology**: This tool is scoped to adult neurology (≥18). Is there interest in a separate pediatric triage algorithm? If so, what phase, and would it require pediatric neurology clinical input?
12. **Insurance pre-authorization for workup**: The AI recommends pre-visit workups (MRI, EEG, etc.). In practice, these may face insurance denial. Should the tool include insurance-aware workup recommendations (e.g., "Order unenhanced MRI first per typical payer requirements"), or is that Phase 2/3?
13. **Emergent tier clinical workflow**: When the system flags Emergent, who exactly makes the call to the referring provider/patient? The triaging coordinator? The on-call neurologist? Need to define the human workflow for the most critical tier.
