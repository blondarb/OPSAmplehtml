# AI Triage Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Outpatient AI Triage Tool per `playbooks/03_ai_triage.md` — a clinical decision support tool that scores referral notes across 5 dimensions, calculates triage tier deterministically in application code, and outputs structured recommendations with subspecialty routing.

**Architecture:** Next.js page at `/triage` (no auth, demo mode) with API at `/api/triage` calling OpenAI gpt-5.2 for clinical scoring. AI returns raw 1-5 dimension scores; JavaScript calculates weighted score and maps to tier. Full session stored in Supabase `triage_sessions`. 16 React components per playbook spec. 11 sample referral notes.

**Tech Stack:** Next.js 15, TypeScript, OpenAI gpt-5.2, Supabase, Tailwind + inline styles.

**Full spec:** `/Users/stevearbogast/Desktop/playbooks/03_ai_triage.md`

---

### Task 1: Create Feature Branch

**Step 1: Create and checkout branch**

```bash
git checkout -b feature/card-3-ai-triage
```

**Step 2: Verify clean state**

```bash
git status
```

Expected: On branch `feature/card-3-ai-triage`, working tree clean.

---

### Task 2: Supabase Migration — `triage_sessions` Table

**Files:**
- Create: `supabase/migrations/020_triage_sessions.sql`

**Step 1: Write migration**

```sql
-- 020_triage_sessions.sql
-- AI Triage Tool: stores triage sessions with dimension scores,
-- tier results, clinical reasoning, and physician overrides.
-- ================================================================

CREATE TABLE IF NOT EXISTS triage_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Input
  referral_text TEXT NOT NULL,
  patient_age INTEGER,
  patient_sex TEXT,
  referring_provider_type TEXT,

  -- AI Output
  triage_tier TEXT NOT NULL,  -- emergent, urgent, semi_urgent, routine_priority, routine, non_urgent, insufficient_data
  confidence TEXT NOT NULL,   -- high, moderate, low
  dimension_scores JSONB NOT NULL,
  weighted_score NUMERIC(4,2),
  clinical_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  red_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_workup JSONB NOT NULL DEFAULT '[]'::jsonb,
  failed_therapies JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_information JSONB,
  subspecialty_recommendation TEXT,
  subspecialty_rationale TEXT,

  -- Audit
  ai_model_used TEXT NOT NULL,
  ai_raw_response JSONB,

  -- Physician Override
  physician_override_tier TEXT,
  physician_override_reason TEXT,
  flagged_for_review BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending_review',  -- pending_review, approved, overridden

  -- Patient link (optional)
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_triage_sessions_created_at ON triage_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_triage_sessions_tier ON triage_sessions (triage_tier);
CREATE INDEX IF NOT EXISTS idx_triage_sessions_status ON triage_sessions (status);
CREATE INDEX IF NOT EXISTS idx_triage_sessions_patient_id ON triage_sessions (patient_id);
CREATE INDEX IF NOT EXISTS idx_triage_sessions_flagged ON triage_sessions (flagged_for_review) WHERE flagged_for_review = true;
```

**Step 2: Commit**

```bash
git add supabase/migrations/020_triage_sessions.sql
git commit -m "feat(triage): add triage_sessions table migration"
```

> **Note:** Do NOT run `supabase db push` yet — ask user before applying migration to remote.

---

### Task 3: TypeScript Types

**Files:**
- Create: `src/lib/triage/types.ts`

All types for the triage system. Matches the playbook's API response schema exactly.

Key types:
- `TriageTier` — union of 7 tier strings
- `TriageConfidence` — 'high' | 'moderate' | 'low'
- `DimensionScore` — `{ score: number; rationale: string }`
- `DimensionScores` — all 5 dimensions
- `FailedTherapy` — `{ therapy: string; reason_stopped: string }`
- `AITriageResponse` — what the AI returns (raw scores, no tier calc)
- `TriageResult` — full result after app-side scoring (includes tier, display, weighted score)
- `TriageSession` — database row type
- `TriageRequest` — API request body
- `SampleNote` — `{ id: string; title: string; tierHint: string; text: string }`
- `OverrideCategory` — physician override dropdown options
- `SubspecialtyType` — 7 subspecialties union

Tier display config: map each tier to `{ label, timeframe, color, borderColor, textColor, bgColor }` matching the playbook's exact hex colors (Emergent = #1E1E1E/#DC2626 pulsing, Urgent = #DC2626, Semi-urgent = #EA580C, Routine-priority = #CA8A04, Routine = #16A34A, Non-urgent = #2563EB, Insufficient Data = #6B7280).

**Step 1: Write types file**

Complete code per playbook Section 4.3 (output panel), Section 5.2 (schema), and Section 5.3 (API response).

**Step 2: Commit**

```bash
git add src/lib/triage/types.ts
git commit -m "feat(triage): add TypeScript types"
```

---

### Task 4: Deterministic Scoring Logic (with TDD)

**Files:**
- Create: `src/lib/triage/scoring.ts`
- Create: `tests/triage/scoring.test.ts`

This is the most critical file — the application-side scoring that the playbook calls out as "CRITICAL ARCHITECTURE DECISION." The AI outputs raw 1-5 scores; this code does the math.

**Step 1: Write failing tests**

Test cases covering:
1. Standard weighted score calculation: `(acuity × 0.30) + (concern × 0.25) + (progression × 0.20) + (impairment × 0.15) + (red_flags × 0.10)`
2. Emergent override takes precedence over everything
3. Insufficient data override takes precedence over score
4. Red flag override escalates to Urgent regardless of score
5. Tier mapping boundaries: 4.0→Urgent, 3.0→Semi-urgent, 2.5→Routine-priority, 1.5→Routine, <1.5→Non-urgent
6. Edge cases: all 5s → Urgent (score=5.0), all 1s → Non-urgent (score=1.0), boundary values (exactly 4.0, exactly 3.0, etc.)
7. Display strings include tier name AND timeframe

Use sample scenarios from playbook Section 4.5 to verify:
- New-onset seizure (scores ~4.3) → Urgent
- Chronic migraine with failed therapies (scores ~2.3) → Routine
- Stable neuropathy (scores ~1.4) → Non-urgent
- Vague referral → Insufficient Data
- Active stroke → Emergent

**Step 2: Run tests — verify they fail**

```bash
npx vitest run tests/triage/scoring.test.ts
```

Expected: FAIL (module not found)

**Step 3: Implement `calculateTriageTier` function**

Per playbook Section 6.3, application-side scoring logic. Function signature:

```typescript
export function calculateTriageTier(aiResponse: AITriageResponse): TriageResult
```

Logic order:
1. Check `emergent_override` → return Emergent
2. Check `insufficient_data` → return Insufficient Data
3. Calculate weighted score
4. Check `red_flag_override` → return Urgent with "(Red Flag Override)" display
5. Map score to tier via thresholds

Also export: `formatTriageDisplay(tier, weightedScore)` for display string generation.

**Step 4: Run tests — verify they pass**

```bash
npx vitest run tests/triage/scoring.test.ts
```

Expected: All PASS

**Step 5: Commit**

```bash
git add src/lib/triage/scoring.ts tests/triage/scoring.test.ts
git commit -m "feat(triage): add deterministic scoring logic with tests"
```

---

### Task 5: System Prompt

**Files:**
- Create: `src/lib/triage/systemPrompt.ts`

**Step 1: Write system prompt**

Copy the full system prompt from playbook Section 6.4 verbatim. Export as `TRIAGE_SYSTEM_PROMPT` constant.

Also export `buildTriageUserPrompt(referralText, metadata)` that constructs the user message per playbook Section 6.5:

```
Please triage the following referral note.

Patient age: {age or "not provided"}
Patient sex: {sex or "not provided"}
Referring provider: {type or "not provided"}

--- REFERRAL NOTE ---
{referral_text}
--- END REFERRAL NOTE ---
```

**Step 2: Commit**

```bash
git add src/lib/triage/systemPrompt.ts
git commit -m "feat(triage): add AI system prompt per playbook spec"
```

---

### Task 6: Sample Referral Notes

**Files:**
- Create: `src/lib/triage/sampleNotes.ts`

**Step 1: Write all 11 sample notes**

From playbook Section 4.5, each with: `id`, `title`, `tierHint` (for demo label), and `text`.

1. Emergent — Active stroke symptoms
2. Emergent — Thunderclap headache (not yet evaluated)
3. Urgent — New-onset seizure
4. Urgent — Thunderclap headache (ED-evaluated)
5. Semi-urgent — MS relapse
6. Routine-priority — Memory loss workup
7. Routine — Chronic migraine (failed therapies)
8. Non-urgent — Stable neuropathy
9. Urgent — Suspected GBS
10. Semi-urgent — New tremor
11. Insufficient Data — Vague referral

**Step 2: Commit**

```bash
git add src/lib/triage/sampleNotes.ts
git commit -m "feat(triage): add 11 sample referral notes"
```

---

### Task 7: Main Triage API Endpoint

**Files:**
- Create: `src/app/api/triage/route.ts`

**Step 1: Write POST handler**

Pattern: matches existing API routes but **no auth required** (demo mode per playbook Phase 1).

1. Parse request body: `referral_text` (required), `patient_age`, `patient_sex`, `referring_provider_type`, `patient_id`
2. Validate: `referral_text` must be >= 50 characters
3. Get OpenAI API key (env var first, then Supabase `app_settings` — use server client without auth check)
4. Construct messages: system prompt + user prompt with metadata
5. Call OpenAI gpt-5.2 with `response_format: { type: 'json_object' }`, `max_completion_tokens: 2000`, `temperature: 0.2`
6. Parse JSON response, validate structure
7. Call `calculateTriageTier()` for deterministic scoring
8. Build full `TriageResult` combining AI output + app-side tier
9. Store in Supabase `triage_sessions` (use server client, insert without auth)
10. Return structured response per playbook Section 5.3

Error handling:
- 400 if referral_text missing or < 50 chars
- 500 if OpenAI key not configured
- 500 if AI response is not valid JSON (with fallback error message per playbook Section 4.2)
- 15-second timeout (use AbortController on the OpenAI call)

**Step 2: Commit**

```bash
git add src/app/api/triage/route.ts
git commit -m "feat(triage): add main triage API endpoint"
```

---

### Task 8: Override and Samples API Endpoints

**Files:**
- Create: `src/app/api/triage/[id]/override/route.ts`
- Create: `src/app/api/triage/samples/route.ts`

**Step 1: Write override endpoint**

POST handler:
1. Parse `id` from URL params
2. Parse body: `new_tier`, `override_reason` (from dropdown categories)
3. Update `triage_sessions` row: set `physician_override_tier`, `physician_override_reason`, `status = 'overridden'`
4. Return updated record

Override categories (from playbook Section 10, resolved question #5):
- "Acuity higher than assessed"
- "Acuity lower than assessed"
- "Needs different subspecialty"
- "Disagree with tier"
- "Additional clinical context"

**Step 2: Write samples endpoint**

GET handler: return the 11 sample notes from `sampleNotes.ts`. Simple, no DB needed.

**Step 3: Commit**

```bash
git add src/app/api/triage/\[id\]/override/route.ts src/app/api/triage/samples/route.ts
git commit -m "feat(triage): add override and samples API endpoints"
```

---

### Task 9: Leaf Components (Batch 1 — Display Components)

**Files:**
- Create: `src/components/triage/DisclaimerBanner.tsx`
- Create: `src/components/triage/TriageTierBadge.tsx`
- Create: `src/components/triage/ClinicalReasons.tsx`
- Create: `src/components/triage/RedFlagAlert.tsx`
- Create: `src/components/triage/PreVisitWorkup.tsx`
- Create: `src/components/triage/FailedTherapiesList.tsx`
- Create: `src/components/triage/SubspecialtyRouter.tsx`

**Step 1: Build all 7 display components**

All are `'use client'` components with inline styles matching the project's existing pattern.

- **DisclaimerBanner**: Persistent amber-bordered box at bottom. Text: "This is a clinical decision support tool. Final triage decisions must be made by a licensed clinician. This tool does not diagnose conditions, prescribe treatments, or replace clinical judgment." Per playbook Section 7.4.
- **TriageTierBadge**: Large color-coded pill. Props: `tier`, `weightedScore`, `isRedFlagOverride`. Colors per playbook Section 4.3 tier badge spec. Emergent gets pulsing CSS animation (`@keyframes pulse`). Displays tier name + timeframe (e.g., "URGENT — Within 1 Week").
- **ClinicalReasons**: Numbered list of 1-3 clinical reasons. Each 1-2 sentences.
- **RedFlagAlert**: Red-bordered alert box with red flags. If no red flags: green "No red flags identified" message. Per playbook Section 4.3.
- **PreVisitWorkup**: Bulleted list with header: "Recommended workup to communicate to referring provider for ordering prior to neurology visit."
- **FailedTherapiesList**: List of extracted failed therapies with medication name and reason stopped. Only renders if array is non-empty.
- **SubspecialtyRouter**: Panel showing recommended subspecialty with rationale. Format: "Route to: [Subspecialty] — [Rationale]"

**Step 2: Commit**

```bash
git add src/components/triage/DisclaimerBanner.tsx src/components/triage/TriageTierBadge.tsx src/components/triage/ClinicalReasons.tsx src/components/triage/RedFlagAlert.tsx src/components/triage/PreVisitWorkup.tsx src/components/triage/FailedTherapiesList.tsx src/components/triage/SubspecialtyRouter.tsx
git commit -m "feat(triage): add display components (badge, reasons, flags, workup, routing)"
```

---

### Task 10: Leaf Components (Batch 2 — Special State + Controls)

**Files:**
- Create: `src/components/triage/EmergentAlert.tsx`
- Create: `src/components/triage/InsufficientDataPanel.tsx`
- Create: `src/components/triage/SampleNoteLoader.tsx`
- Create: `src/components/triage/CopyReportButton.tsx`
- Create: `src/components/triage/AlgorithmModal.tsx`
- Create: `src/components/triage/PhysicianOverridePanel.tsx`
- Create: `src/components/triage/PatientSelector.tsx`

**Step 1: Build all 7 components**

- **EmergentAlert**: Full-screen overlay with dark background and pulsing red border. Per playbook Section 4.3 and 7.2: "EMERGENT — This patient requires immediate emergency evaluation. Do NOT schedule outpatient. Contact the referring provider and/or patient to redirect to the nearest ED." Includes the emergent reason. Has "Acknowledge" button to dismiss overlay (shows normal output underneath). Pulsing animation with `#DC2626`.
- **InsufficientDataPanel**: Gray-bordered panel. Shows: "This referral does not contain enough clinical information to triage safely. Return to referring provider requesting:" followed by the list of missing information items. Per playbook Section 4.3 and 7.2.
- **SampleNoteLoader**: Dropdown button labeled "Load Sample". Shows 11 sample notes with their title and tier hint badge. On select, calls `onSelect(noteText)` to populate the input.
- **CopyReportButton**: Button that formats the triage output as plain text and copies to clipboard using `navigator.clipboard.writeText()`. Includes tier, reasons, red flags, workup, subspecialty routing. Shows "Copied!" confirmation for 2 seconds.
- **AlgorithmModal**: Modal overlay showing all 5 dimensions with scoring criteria in plain English. Per playbook Section 6.3. Shows the dimension name, weight, and criteria table (score 1-5 descriptions). Also shows tier mapping thresholds. "Close" button.
- **PhysicianOverridePanel**: Collapsible section below output. Dropdown with 5 override categories (per playbook resolved question #5). Tier dropdown (all 7 tiers). "Submit Override" button. Calls `POST /api/triage/:id/override`.
- **PatientSelector**: Dropdown that fetches patients from Supabase `patients` table. Shows patient name + DOB. On select, associates the triage session with the patient via `patient_id`. "Save to Patient Record" button.

**Step 2: Commit**

```bash
git add src/components/triage/EmergentAlert.tsx src/components/triage/InsufficientDataPanel.tsx src/components/triage/SampleNoteLoader.tsx src/components/triage/CopyReportButton.tsx src/components/triage/AlgorithmModal.tsx src/components/triage/PhysicianOverridePanel.tsx src/components/triage/PatientSelector.tsx
git commit -m "feat(triage): add emergent alert, controls, override, patient selector"
```

---

### Task 11: Container Components

**Files:**
- Create: `src/components/triage/TriageInputPanel.tsx`
- Create: `src/components/triage/TriageOutputPanel.tsx`

**Step 1: Build TriageInputPanel**

Contains:
- Large textarea (min 6 rows) with placeholder per playbook Section 4.1
- Character counter (max 5,000)
- SampleNoteLoader dropdown
- Collapsible "Patient Metadata" section: age (number input), sex (dropdown: Male/Female/Other/Not specified), referring provider type (dropdown: PCP/ED/Specialist/Hospitalist/Other)
- "Triage This Patient" primary CTA button — orange (#EA580C), disabled until input >= 50 chars
- "Try Another" secondary button (resets all state)
- "View Algorithm" button (opens AlgorithmModal)
- Loading state: animated progress bar with rotating messages per playbook Section 4.2: "Analyzing clinical presentation...", "Evaluating red flags...", "Scoring clinical dimensions...", "Generating triage recommendation..."

**Step 2: Build TriageOutputPanel**

Container that conditionally renders based on triage result:
- If `emergent_override` → EmergentAlert overlay + full output underneath
- If `insufficient_data` → InsufficientDataPanel
- Otherwise → standard output:
  1. TriageTierBadge
  2. Confidence indicator (High/Moderate/Low label with low-confidence disclaimer per playbook Section 7.4)
  3. Dimension scores (5 mini-cards showing score, dimension name, rationale)
  4. ClinicalReasons
  5. RedFlagAlert
  6. FailedTherapiesList (if any)
  7. PreVisitWorkup
  8. SubspecialtyRouter
  9. CopyReportButton + "Flag for Review" button
  10. PhysicianOverridePanel (collapsible)
  11. PatientSelector
  12. DisclaimerBanner (always at bottom)

**Step 3: Commit**

```bash
git add src/components/triage/TriageInputPanel.tsx src/components/triage/TriageOutputPanel.tsx
git commit -m "feat(triage): add input and output container components"
```

---

### Task 12: Main Triage Page

**Files:**
- Create: `src/app/triage/page.tsx`

**Step 1: Build the page**

`'use client'` component. No auth required (demo mode).

Layout:
- Full-height dark background matching LandingPage (`#0f172a` → `#1e293b` gradient)
- Header bar with back arrow + "Home" link (same pattern as SDNE page), title "AI Outpatient Triage", subtitle "Clinical Decision Support Tool"
- Two-panel layout: TriageInputPanel on left, TriageOutputPanel on right (stacked on mobile)
- State management:
  - `referralText`, `patientAge`, `patientSex`, `referringProviderType` — input state
  - `isProcessing` — loading state
  - `triageResult` — output from API
  - `sessionId` — UUID from API response for override/flag
  - `error` — error state
  - `showAlgorithm` — modal toggle
- `handleTriage()`: POST to `/api/triage`, set result on success
- `handleReset()`: clear all state
- `handleFlagForReview()`: PATCH triage_sessions to set `flagged_for_review = true`

**Step 2: Commit**

```bash
git add src/app/triage/page.tsx
git commit -m "feat(triage): add main triage page"
```

---

### Task 13: Homepage Card

**Files:**
- Modify: `src/components/LandingPage.tsx`

**Step 1: Add AI Triage card**

Add a 4th card to the flex container, after the SDNE card. Follow exact same card structure.

- Link: `/triage`
- Accent color: `#EA580C` (orange)
- Hover: `boxShadow: '0 8px 32px rgba(234,88,12,0.2)'`
- Icon: Shield with cross/triage icon (SVG)
- Title: "AI Triage"
- Description: "AI-powered referral triage with structured clinical scoring, red flag detection, subspecialty routing, and pre-visit workup recommendations."
- CTA: "Launch Triage Tool"

**Step 2: Commit**

```bash
git add src/components/LandingPage.tsx
git commit -m "feat(triage): add AI Triage card to homepage"
```

---

### Task 14: Build Verification & End-to-End Test

**Step 1: Run build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

**Step 2: Run scoring tests**

```bash
npx vitest run tests/triage/scoring.test.ts
```

Expected: All pass.

**Step 3: Manual verification with dev server**

```bash
npm run dev
```

Verify:
1. Homepage shows 4 cards including "AI Triage" with orange accent
2. Click "Launch Triage Tool" → navigates to `/triage`
3. Load "Emergent — Active stroke symptoms" sample → full-screen emergent alert appears
4. Load "Urgent — New-onset seizure" → Urgent tier with red badge, epilepsy routing
5. Load "Chronic migraine (failed therapies)" → Routine tier, failed therapies extracted, headache routing
6. Load "Insufficient Data — Vague referral" → Insufficient Data panel with missing info list
7. "Copy Report" copies formatted text
8. "View Algorithm" shows scoring modal
9. "Try Another" resets form
10. "Flag for Review" marks in database

**Step 4: Final commit if any fixes needed**

---

### Task 15: Push Branch

**Step 1: Push to remote**

```bash
git push -u origin feature/card-3-ai-triage
```

> **Ask user before pushing.** Per CLAUDE.md rules.
