# AI Triage Tool — Prompt Reference

**Last updated:** February 24, 2026
**Model:** OpenAI gpt-5.2 (all triage, extraction, and fusion tasks)
**API config:** `response_format: { type: 'json_object' }`, `temperature: 0.2`

---

## Overview

The triage system uses three AI prompts in a two-stage pipeline:

```
Input (referral text or clinical note)
       │
       ├─ Short text (<2K chars, looks like referral) ──→ TRIAGE PROMPT ──→ Result
       │
       └─ Long text or uploaded file ──→ EXTRACTION PROMPT ──→ User Review
                                                                    │
                                         ┌──────────────────────────┘
                                         ▼
                                    TRIAGE PROMPT ──→ Result

Multiple notes for same patient:
  Note A ──→ EXTRACTION ──→ ┐
  Note B ──→ EXTRACTION ──→ ├──→ FUSION PROMPT ──→ User Review ──→ TRIAGE PROMPT ──→ Result
  Note C ──→ EXTRACTION ──→ ┘
```

| # | Prompt | Source File | Exported As | Purpose |
|---|--------|-------------|-------------|---------|
| 1 | Triage System Prompt | `src/lib/triage/systemPrompt.ts` | `TRIAGE_SYSTEM_PROMPT` | Scores 5 clinical dimensions (1-5 integers) from referral text |
| 2 | Extraction System Prompt | `src/lib/triage/extractionPrompt.ts` | `EXTRACTION_SYSTEM_PROMPT` | Extracts neurology-relevant info from full clinical notes |
| 3 | Fusion System Prompt | `src/lib/triage/extractionPrompt.ts` | `FUSION_SYSTEM_PROMPT` | Combines multiple extractions into one unified summary |

---

## Prompt 1: Triage System Prompt

**Used by:** `POST /api/triage` (`src/app/api/triage/route.ts`)
**Max tokens:** 2,000
**User prompt builder:** `buildTriageUserPrompt()` in `systemPrompt.ts`

### What it does

The AI reads a referral note and:
1. Checks for emergent conditions requiring ED redirect
2. Checks for insufficient data
3. Scores 5 clinical dimensions (1-5 integers with rationale)
4. Checks red flag override conditions
5. Extracts failed therapies
6. Provides clinical reasons, red flags, suggested workup, subspecialty routing

The AI does NOT calculate the weighted score or determine the triage tier. That is done deterministically in application code (`src/lib/triage/scoring.ts`).

### Scoring Dimensions

| Dimension | Weight | What it measures |
|-----------|--------|-----------------|
| Symptom Acuity | 30% | How acute and severe the symptoms are |
| Diagnostic Concern | 25% | How serious the suspected condition is |
| Rate of Progression | 20% | How fast symptoms are worsening |
| Functional Impairment | 15% | Impact on daily activities |
| Red Flag Presence | 10% | Presence of clinical red flags |

### Tier Mapping (Application Code)

```
Weighted score = (acuity x 0.30) + (concern x 0.25) + (progression x 0.20) + (impairment x 0.15) + (red_flags x 0.10)

Score >= 4.0  →  Urgent (within 1 week)
Score >= 3.0  →  Semi-urgent (within 2 weeks)
Score >= 2.5  →  Routine-priority (within 4-6 weeks)
Score >= 1.5  →  Routine (within 8-12 weeks)
Score <  1.5  →  Non-urgent (within 6 months)

Overrides (checked before score):
  emergent_override = true  →  Emergent (redirect to ED)
  insufficient_data = true  →  Insufficient Data (return to referring provider)
  red_flag_override = true  →  Urgent (regardless of score)
```

### Emergent Conditions (Redirect to ED)

- Active stroke symptoms not yet evaluated in ED
- Thunderclap headache NOT yet evaluated in ED
- Active status epilepticus or ongoing seizure clusters
- Acute cord compression (rapidly progressive bilateral weakness + bladder/bowel dysfunction)
- Acute increased intracranial pressure with altered mental status
- Active suicidal ideation with plan or intent

### Red Flag Overrides (Escalate to Urgent)

- Thunderclap headache (ED-evaluated, workup incomplete)
- New focal neurological deficit (subacute)
- Rapidly progressive weakness (days), patient still ambulatory
- Signs of increased intracranial pressure
- Cauda equina symptoms (if ambulatory and stable)
- New diplopia with ptosis
- Suicidal ideation (passive, without plan) in neurological context

### Key Guardrails

- Anti-bias instruction: evaluate on clinical descriptors only, not demographics
- No diagnosis: uses "evaluate for," "rule out," "consider"
- No treatment recommendations: pre-visit workup is diagnostic only
- Safety-critical information always included in red_flags
- AI scores dimensions only; application code handles all math

### Output Format

```json
{
  "emergent_override": false,
  "emergent_reason": null,
  "insufficient_data": false,
  "missing_information": null,
  "confidence": "high | moderate | low",
  "dimension_scores": {
    "symptom_acuity": { "score": 1-5, "rationale": "..." },
    "diagnostic_concern": { "score": 1-5, "rationale": "..." },
    "rate_of_progression": { "score": 1-5, "rationale": "..." },
    "functional_impairment": { "score": 1-5, "rationale": "..." },
    "red_flag_presence": { "score": 1-5, "rationale": "..." }
  },
  "red_flag_override": false,
  "clinical_reasons": ["Reason 1", "Reason 2", "Reason 3"],
  "red_flags": ["Red flag — significance"],
  "suggested_workup": ["Test — rationale"],
  "failed_therapies": [{ "therapy": "name", "reason_stopped": "reason" }],
  "subspecialty_recommendation": "General Neurology | Epilepsy | Movement Disorders | Headache | Neuromuscular | Cognitive/Memory | Stroke",
  "subspecialty_rationale": "Why this subspecialty"
}
```

### User Prompt Format

```
Please triage the following referral note.

Patient age: {age or "not provided"}
Patient sex: {sex or "not provided"}
Referring provider: {type or "not provided"}

--- REFERRAL NOTE ---
{referral_text}
--- END REFERRAL NOTE ---
```

---

## Prompt 2: Extraction System Prompt (Phase 2)

**Used by:** `POST /api/triage/extract` (`src/app/api/triage/extract/route.ts`)
**Max tokens:** 4,000
**User prompt builder:** `buildExtractionUserPrompt()` in `extractionPrompt.ts`

### What it does

Reads a full clinical document (ED note, PCP note, discharge summary, specialist consult, imaging report, or referral letter) and extracts ONLY neurology-relevant information into a structured summary suitable for triage scoring.

### Note Type Detection

The prompt classifies documents as:
- `ed_note` — Emergency department H&P or discharge summary
- `pcp_note` — Primary care progress note, annual wellness visit
- `discharge_summary` — Hospital discharge summary
- `specialist_consult` — Consultation from another specialist
- `imaging_report` — Radiology or neurodiagnostic report
- `referral` — Formal referral letter
- `unknown` — Cannot determine type

### Extraction Rules

1. Extract ONLY neurology-relevant information; ignore billing, admin, non-neuro content
2. Preserve clinical precision (exact med names, doses, lab values, imaging findings)
3. Capture timeline (onset dates, duration, progression)
4. Extract ALL medications and failed therapies
5. Identify red flags
6. Assess functional status
7. Do not infer information not in the note
8. Extracted summary reads like a referral note (150-500 words)

### Output Format

```json
{
  "note_type_detected": "ed_note | pcp_note | ...",
  "extraction_confidence": "high | moderate | low",
  "extracted_summary": "Referral-style narrative (150-500 words)",
  "key_findings": {
    "chief_complaint": "...",
    "neurological_symptoms": ["symptom with timeline"],
    "timeline": "chronological narrative",
    "relevant_history": "...",
    "medications_and_therapies": ["med with dose/frequency"],
    "failed_therapies": [{ "therapy": "name", "reason_stopped": "reason" }],
    "imaging_results": ["study: findings"],
    "red_flags_noted": ["flag — significance"],
    "functional_status": "ADL/work/mobility impact"
  }
}
```

### User Prompt Format

```
Please extract neurology-relevant clinical information from the following document.

Patient age: {age or "not provided"}
Patient sex: {sex or "not provided"}
Source file: {filename or "pasted text"}

--- CLINICAL DOCUMENT ---
{noteText}
--- END CLINICAL DOCUMENT ---
```

---

## Prompt 3: Fusion System Prompt (Phase 2)

**Used by:** `POST /api/triage/fuse` (`src/app/api/triage/fuse/route.ts`)
**Max tokens:** 4,000
**User prompt builder:** `buildFusionUserPrompt()` in `extractionPrompt.ts`

### What it does

Combines multiple clinical extractions from different notes about the same patient into a single comprehensive extraction for triage scoring.

### Fusion Rules

1. Use most recent information when sources conflict
2. Preserve ALL red flags from ANY source (never drop)
3. Combine medication lists comprehensively
4. Reconstruct unified chronological timeline
5. Flag unresolvable conflicts for clinician review
6. Do not fabricate connections between notes
7. Fused summary reads as a single comprehensive referral narrative

### Output Format

```json
{
  "fused_summary": "Comprehensive narrative (200-800 words)",
  "fusion_confidence": "high | moderate | low",
  "sources_used": ["note_type: filename"],
  "conflicts_resolved": ["description of conflict and resolution"],
  "timeline_reconstructed": "unified chronological narrative"
}
```

### User Prompt Format

```
Please fuse the following {N} clinical extractions for the same patient into a single comprehensive summary.

Patient age: {age or "not provided"}
Patient sex: {sex or "not provided"}

--- EXTRACTION 1 ({note_type}: {filename}) ---
Summary: {extracted_summary}
Key Findings: {JSON key_findings}
--- END EXTRACTION 1 ---

[...repeated for each extraction...]
```

---

## Validation & Error Handling

### AI Response Validation

`validateAIResponse()` in `scoring.ts` checks the triage response before scoring:
- All 5 dimension scores present as integers 1-5
- Boolean fields (`emergent_override`, `insufficient_data`, `red_flag_override`) present
- Confidence is one of `high | moderate | low`
- Required arrays exist (`clinical_reasons`, `red_flags`, `suggested_workup`, `failed_therapies`)

### Error States

| Error | Handling |
|-------|----------|
| AI returns invalid JSON | 500 error with fallback message |
| AI response fails validation | 500 error with specific validation failure |
| Input < 50 characters | 400 error, prompt for more text |
| Input > 50,000 characters | 400 error, text too long |
| API timeout (15s) | AbortController cancels, user prompted to retry |
| File > 10MB | Client-side rejection before upload |

---

## Change Log

| Date | Change |
|------|--------|
| Feb 14, 2026 | Phase 1: Triage system prompt implemented (`TRIAGE_SYSTEM_PROMPT`) |
| Feb 22, 2026 | Phase 2: Extraction prompt (`EXTRACTION_SYSTEM_PROMPT`) and fusion prompt (`FUSION_SYSTEM_PROMPT`) added |
| Feb 24, 2026 | Phase 2: Demo referral library (26 scenarios, 40 PDFs) with pre-extracted text |
| Feb 24, 2026 | Documentation: Model references corrected from Claude/Anthropic to OpenAI gpt-5.2 |
