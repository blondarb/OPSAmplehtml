# Canonical Single-Referral Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pasted text and one native-text clinical file enter the same
source-bound extraction, full triage result, safety, and clinician-review flow
without silent truncation, client-forged summaries, or reduced batch output.

**Architecture:** Add small pure policies for single-referral file selection,
source-bound triage requests, and result visibility. The server treats the
tenant-bound extraction row—not caller-supplied summary or metadata—as
authoritative. The triage page processes one file as one referral and converges
on `ExtractionReviewPanel` and `TriageOutputPanel`; unpersisted summary editing
is disabled until the next evidence-revision milestone.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, Vitest,
node-postgres/RDS, existing async polling helpers.

**Scope:** This plan covers the first bounded delivery slice from the approved
core design. Durable pre-parse intake/S3 recovery, OCR, explicit same-patient
multi-document packets, structured recommendation guidance, and clarification
delivery receive separate plans after this slice is green.

**Milestone relationship:** This is pre-milestone slice 1A, not completion of
the design's first production milestone. The app remains unsuitable for
clinical release after this plan alone. Durable case identity, resumable intake,
persisted parse/OCR failures, recommendation-snapshot finalization, and
scheduling locks remain mandatory before that milestone can be called complete.

**Worktree constraint:** The shared worktree already contains approved
uncommitted safety work. Do not commit, reset, deploy, migrate, or touch AWS in
this plan. Use scoped diffs and verification checkpoints; preserve unrelated
changes.

---

## Existing prerequisites to preserve

These local fixes already exist and must remain green:

- `src/lib/triage/triageInputPolicy.ts` preserves the complete pasted input,
  permits verified long-packet routing, and blocks oversize input visibly.
- `src/app/api/triage/extract/route.ts` explicitly serializes
  `source_pages` as JSON for the JSONB column.
- `tests/triage/triageInputPolicy.test.ts` and
  `src/app/api/triage/extract/__tests__/routeSafety.test.ts` cover those fixes.

### Task 1: Lock the prerequisite regressions

**Files:**

- Verify: `src/lib/triage/triageInputPolicy.ts`
- Verify: `src/components/triage/TriageInputPanel.tsx`
- Verify: `src/app/api/triage/extract/route.ts`
- Test: `tests/triage/triageInputPolicy.test.ts`
- Test: `src/app/api/triage/extract/__tests__/routeSafety.test.ts`

- [ ] **Step 1: Run the two focused regression files**

Run:

```bash
npx vitest run \
  tests/triage/triageInputPolicy.test.ts \
  src/app/api/triage/extract/__tests__/routeSafety.test.ts
```

Expected: 2 files and 8 tests pass. The long-paste test retains the final
time-critical phrase, and the extraction insert contains a JSON string in
`source_pages` that parses back to the page array.

- [ ] **Step 2: Inspect the exact database-binding call**

Run:

```bash
rg -n "source_pages: JSON.stringify|slice\(0, FILE_CONSTRAINTS.MAX_TEXT_LENGTH" \
  src/app/api/triage/extract/route.ts \
  src/components/triage/TriageInputPanel.tsx
```

Expected: one `source_pages: JSON.stringify(...)` match and zero silent textarea
slice matches.

- [ ] **Step 3: Record a scoped checkpoint**

Run:

```bash
git diff --check -- \
  src/lib/triage/triageInputPolicy.ts \
  src/components/triage/TriageInputPanel.tsx \
  src/app/api/triage/extract/route.ts \
  tests/triage/triageInputPolicy.test.ts \
  src/app/api/triage/extract/__tests__/routeSafety.test.ts
```

Expected: no output.

### Task 2: Enforce one file equals one referral

**Files:**

- Create: `src/lib/triage/referralFileSelection.ts`
- Create: `tests/triage/referralFileSelection.test.ts`
- Modify: `src/components/triage/FileUploadZone.tsx`
- Modify: `src/components/triage/TriageInputPanel.tsx`
- Modify: `src/app/api/triage/extract/route.ts`
- Modify: `src/app/api/triage/extract/__tests__/routeSafety.test.ts`
- Test: `src/components/triage/__tests__/FileUploadZoneContract.test.ts`

- [ ] **Step 1: Write the failing selection-policy test**

Create `tests/triage/referralFileSelection.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { selectSingleReferralFile } from '@/lib/triage/referralFileSelection'

function clinicalFile(name: string): File {
  return new File(['synthetic'], name, { type: 'application/pdf' })
}

describe('single referral file selection', () => {
  it('accepts exactly one clinical file', () => {
    const file = clinicalFile('synthetic-referral.pdf')
    expect(selectSingleReferralFile([file])).toEqual({ ok: true, file })
  })

  it('rejects multiple files without choosing or dropping one', () => {
    expect(
      selectSingleReferralFile([
        clinicalFile('first.pdf'),
        clinicalFile('second.pdf'),
      ]),
    ).toEqual({
      ok: false,
      reason: 'multiple_referral_files',
      message:
        'Upload one referral packet at a time. Multiple same-patient documents require the reviewed packet workflow.',
    })
  })

  it('rejects an empty selection', () => {
    expect(selectSingleReferralFile([])).toEqual({
      ok: false,
      reason: 'no_referral_file',
      message: 'Select one referral file.',
    })
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run tests/triage/referralFileSelection.test.ts
```

Expected: FAIL because `referralFileSelection.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure policy**

Create `src/lib/triage/referralFileSelection.ts`:

```ts
export type SingleReferralFileSelection =
  | { ok: true; file: File }
  | {
      ok: false
      reason: 'no_referral_file' | 'multiple_referral_files'
      message: string
    }

export function selectSingleReferralFile(
  files: readonly File[],
): SingleReferralFileSelection {
  if (files.length === 0) {
    return {
      ok: false,
      reason: 'no_referral_file',
      message: 'Select one referral file.',
    }
  }
  if (files.length !== 1) {
    return {
      ok: false,
      reason: 'multiple_referral_files',
      message:
        'Upload one referral packet at a time. Multiple same-patient documents require the reviewed packet workflow.',
    }
  }
  return { ok: true, file: files[0] }
}
```

- [ ] **Step 4: Run the policy test and verify GREEN**

Run the command from Step 2.

Expected: 3 tests pass.

- [ ] **Step 5: Write a failing upload-surface contract test**

Create `src/components/triage/__tests__/FileUploadZoneContract.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('single-referral upload surface', () => {
  it('does not advertise or enable ambiguous batch upload', () => {
    const upload = readFileSync(
      resolve(process.cwd(), 'src/components/triage/FileUploadZone.tsx'),
      'utf8',
    )
    const input = readFileSync(
      resolve(process.cwd(), 'src/components/triage/TriageInputPanel.tsx'),
      'utf8',
    )

    expect(upload).not.toMatch(/<input[\s\S]*?\bmultiple\b/)
    expect(upload).not.toContain('files max')
    expect(input).not.toContain('Upload File(s)')
    expect(input).toContain('Upload Referral File')
  })
})
```

- [ ] **Step 6: Run the surface test and verify RED**

Run:

```bash
npx vitest run src/components/triage/__tests__/FileUploadZoneContract.test.ts
```

Expected: FAIL because the current input is `multiple` and the UI advertises
several files.

- [ ] **Step 7: Update `FileUploadZone` without silent trimming**

Use `selectSingleReferralFile` after existing type/size validation. Replace the
multi-file append/trim block with exact-one replacement:

```ts
const selection = selectSingleReferralFile(validFiles)
if (!selection.ok) {
  setFiles([])
  onFilesChange([])
  setErrors((current) => [...current, selection.message])
  return
}
setFiles([selection.file])
onFilesChange([selection.file])
```

Remove the `multiple` input attribute. Change the drop-zone copy to:

```tsx
PDF, DOCX, or TXT — one referral packet up to {FILE_CONSTRAINTS.MAX_FILE_SIZE_DISPLAY}
```

When `externalFiles` contains anything other than one file, clear selection and
show the same `multiple_referral_files` message; do not select the first file.

Change `TriageInputPanel` labels from `Upload File(s)` to
`Upload Referral File`, and remove plural queued-file language.

- [ ] **Step 8: Run policy and surface tests**

Run:

```bash
npx vitest run \
  tests/triage/referralFileSelection.test.ts \
  src/components/triage/__tests__/FileUploadZoneContract.test.ts
```

Expected: 2 files and 4 tests pass.

- [ ] **Step 9: Enforce exact-one-file at the server trust boundary**

Add multipart tests to `routeSafety.test.ts` for zero, one, and two `file`
parts. The two-file request must return `400` with
`reason: 'exactly_one_referral_file_required'` before parsing, persistence, or
model work. Do not rely on the browser control for patient-separation safety.

In `extract/route.ts`, replace `formData.get('file')` with a validated
`formData.getAll('file')` path. Require exactly one value and require that value
to be a `File`; never choose the first of several parts.

Validate optional operator-entered metadata before persistence: age must be a
finite integer in the governed range and sex must be one of the UI/schema
values. Reject malformed values with `400`; never turn `NaN`, an arbitrary
string, or an out-of-range age into authoritative extraction-row metadata. Add
route regressions for these cases.

- [ ] **Step 10: Run client and server selection tests**

Run:

```bash
npx vitest run \
  tests/triage/referralFileSelection.test.ts \
  src/components/triage/__tests__/FileUploadZoneContract.test.ts \
  src/app/api/triage/extract/__tests__/routeSafety.test.ts
```

Expected: client and API both reject ambiguous file sets without dropping or
combining a source.

### Task 3: Build a source-bound triage request

**Files:**

- Create: `src/lib/triage/boundExtractionRequest.ts`
- Create: `tests/triage/boundExtractionRequest.test.ts`
- Modify: `src/lib/triage/types.ts`

- [ ] **Step 1: Write the failing request-builder test**

Create `tests/triage/boundExtractionRequest.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { buildBoundExtractionTriageRequest } from '@/lib/triage/boundExtractionRequest'

describe('bound extraction triage request', () => {
  it('sends only the extraction identity and inferred source type', () => {
    expect(
      buildBoundExtractionTriageRequest({
        extraction_id: 'extraction-1',
        source_filename: 'synthetic-referral.PDF',
      }),
    ).toEqual({
      source_extraction_id: 'extraction-1',
      source_type: 'pdf',
    })
  })

  it('never includes a caller-supplied summary or referral text', () => {
    const request = buildBoundExtractionTriageRequest({
      extraction_id: 'extraction-1',
      source_filename: 'synthetic.txt',
    })
    expect(request).not.toHaveProperty('extracted_summary')
    expect(request).not.toHaveProperty('referral_text')
    expect(request).not.toHaveProperty('patient_age')
    expect(request).not.toHaveProperty('patient_sex')
  })

  it('rejects an extraction without an identifier', () => {
    expect(() =>
      buildBoundExtractionTriageRequest({
        extraction_id: '',
        source_filename: 'synthetic.pdf',
      }),
    ).toThrow('Source extraction identifier is missing.')
  })

  it('rejects an unknown persisted source extension instead of treating it as pasted text', () => {
    expect(() =>
      buildBoundExtractionTriageRequest({
        extraction_id: 'extraction-1',
        source_filename: 'synthetic-referral.bin',
      }),
    ).toThrow('Unsupported persisted referral source type.')
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run tests/triage/boundExtractionRequest.test.ts
```

Expected: FAIL because the builder does not exist.

- [ ] **Step 3: Implement the exact builder**

Create `src/lib/triage/boundExtractionRequest.ts`:

```ts
import type { SourceType } from './types'

export interface BoundExtractionReference {
  extraction_id: string
  source_filename?: string
}

export interface BoundExtractionTriageRequest {
  source_extraction_id: string
  source_type: SourceType
}

function sourceType(filename?: string): SourceType {
  if (!filename) return 'paste'
  const normalized = filename.toLowerCase()
  if (normalized.endsWith('.pdf')) return 'pdf'
  if (normalized.endsWith('.docx')) return 'docx'
  if (normalized.endsWith('.txt')) return 'txt'
  throw new Error('Unsupported persisted referral source type.')
}

export function buildBoundExtractionTriageRequest(
  extraction: BoundExtractionReference,
): BoundExtractionTriageRequest {
  if (!extraction.extraction_id.trim()) {
    throw new Error('Source extraction identifier is missing.')
  }
  return {
    source_extraction_id: extraction.extraction_id,
    source_type: sourceType(extraction.source_filename),
  }
}
```

Keep `EnhancedTriageRequest` backward-compatible for now; mark its caller-
supplied extraction metadata fields as legacy and do not use them when an
extraction ID is present.

- [ ] **Step 4: Run the builder test and verify GREEN**

Run the command from Step 2.

Expected: 4 tests pass.

### Task 4: Make the tenant-bound extraction authoritative on the server

**Files:**

- Modify: `src/app/api/triage/route.ts`
- Modify: `src/app/api/triage/__tests__/routeSafety.test.ts`
- Create: `src/lib/triage/sourceExtractionAuthority.ts`
- Create: `tests/triage/sourceExtractionAuthority.test.ts`
- Modify: `src/lib/triage/pollClient.ts`
- Modify: `src/lib/triage/__tests__/pollClient.test.ts`
- Modify: `src/components/triage/ExtractionIngressSafetyAlert.ts`
- Modify: `src/components/triage/__tests__/ExtractionIngressSafetyAlert.test.ts`

- [ ] **Step 1: Replace the permissive test with a forged-input regression**

In `routeSafety.test.ts`, replace the test that expects the uploaded client
summary to win with:

```ts
it('ignores forged extraction content and metadata in favor of the tenant-bound row', async () => {
  const response = await POST(
    request({
      referral_text: 'Forged caller source that must not be scored.',
      extracted_summary: 'Forged stable summary that omits sudden aphasia.',
      source_type: 'txt',
      source_filename: 'forged.txt',
      extraction_confidence: 'low',
      note_type_detected: 'unknown',
      patient_age: 99,
      patient_sex: 'forged',
      source_extraction_id: 'extraction-1',
    }),
  )

  expect(response.status).toBe(202)
  expect(startSessionMock).toHaveBeenCalledWith(
    expect.objectContaining({
      referralText:
        'Raw uploaded source documents sudden aphasia today and is long enough for triage.',
      extractedSummary: 'Stable symptoms in edited extraction.',
      sourceFilename: 'referral.pdf',
      extractionConfidence: 'high',
      noteTypeDetected: 'referral',
      patientAge: 42,
      patientSex: 'F',
      sourceType: 'pdf',
    }),
  )
  expect(processTriageMock).toHaveBeenCalledWith(
    'triage-1',
    expect.objectContaining({
      gatewayText:
        'Raw uploaded source documents sudden aphasia today and is long enough for triage.',
      textForScoring: 'Stable symptoms in edited extraction.',
      patient_age: 42,
      patient_sex: 'F',
    }),
  )
})
```

Add `patient_age: 42` and `patient_sex: 'F'` to the mocked extraction row.
Refactor route-test setup around a `validAuthoritativeExtractionRow()` fixture
that also supplies a complete ordered page manifest, matching source digest,
packet plan, deterministic packet-safety result, `coverage_status='complete'`,
and recognized source filename. Individual tests override one field at a time;
do not let unrelated malformed fixtures obscure the behavior under test.

Add a second test:

```ts
it('rejects a completed extraction that has no authoritative summary', async () => {
  extractionSingleMock.mockResolvedValueOnce({
    data: {
      id: 'extraction-1',
      status: 'complete',
      text_input: 'Synthetic raw referral text long enough for triage.',
      extracted_summary: null,
      source_filename: 'referral.pdf',
      patient_age: 42,
      patient_sex: 'F',
    },
    error: null,
  })

  const response = await POST(
    request({ source_type: 'pdf', source_extraction_id: 'extraction-1' }),
  )
  expect(response.status).toBe(409)
  await expect(response.json()).resolves.toMatchObject({
    reason: 'source_extraction_summary_missing',
  })
  expect(startSessionMock).not.toHaveBeenCalled()
})
```

Use routine synthetic source text in this test. Add a separate regression in
which `extracted_summary` is absent but the persisted
`packet_emergency_result` says `emergency_now`. That response may block
outpatient scoring, but it must preserve and return all of:

```ts
expect(response.status).toBe(409)
await expect(response.json()).resolves.toMatchObject({
  reason: 'source_extraction_summary_missing',
  safety_pathway: 'emergency_now',
  immediate_action_required: true,
  outpatient_scoring_blocked: true,
})
expect(processTriageMock).not.toHaveBeenCalled()
```

Add the equivalent `same_day_clinician_review` case. A missing summary blocks
only the outpatient/model-scoring branch; it never erases, demotes, or delays a
complete-source deterministic action already persisted by extraction.

- [ ] **Step 2: Run the route test and verify RED**

Run:

```bash
npx vitest run src/app/api/triage/__tests__/routeSafety.test.ts
```

Expected: the forged-input test fails because the current route keeps a truthy
caller summary and metadata.

- [ ] **Step 3: Make extraction fields authoritative**

In `src/app/api/triage/route.ts`:

1. Change `patient_age`, `patient_sex`, and `sourceType` to mutable local values.
2. Select `patient_age` and `patient_sex` from `triage_extractions`.
3. Before using a completed extraction, call a pure
   `validateSourceExtractionAuthority` helper. For all newly created
   single-pass and long-packet rows it must require:
   - tenant-bound lookup success and `status='complete'`;
   - `coverage_status='complete'`;
   - a nonempty, ordered page manifest that reconstructs `text_input` exactly;
   - a valid persisted source digest bound to its packet/document plan;
   - a recognized persisted source kind;
   - internally valid deterministic packet-safety data.
   Legacy/unknown coverage, a missing page manifest, digest mismatch, or an
   invalid source kind returns a structured human-review hold and cannot start
   outpatient scoring. Preserve any independently verified immediate safety
   action in that response.
4. When `sourceExtractionId` is present, overwrite—not coalesce—the following:

```ts
referral_text = sourceExtraction.text_input as string
extracted_summary = sourceExtraction.extracted_summary as string | undefined
source_filename = sourceExtraction.source_filename as string | undefined
extraction_confidence =
  sourceExtraction.extraction_confidence as string | undefined
note_type_detected = sourceExtraction.note_type_detected as string | undefined
patient_age = sourceExtraction.patient_age as number | undefined
patient_sex = sourceExtraction.patient_sex as string | undefined
sourceType = sourceTypeFromFilename(source_filename)
```

Use the validated source type returned by the authority helper. It permits only
`pdf`, `docx`, `txt`, and an explicit filename-absent pasted source. An unknown
extension is an error, not a fallback to `paste`. Never use caller
`source_type` once the bound row resolves.

Add pure helper tests for reconstructed text, page order/count, digest mismatch,
unknown source extension, incomplete/legacy coverage, and preserved
emergency/same-day safety state on rejection.

Before long-packet validation, parse the persisted deterministic gateway. Then
reject a missing or blank persisted summary with the active safety pathway
attached:

```ts
if (!extracted_summary?.trim()) {
  return NextResponse.json(
    {
      error: 'Source extraction does not contain a verified summary',
      reason: 'source_extraction_summary_missing',
      safety_pathway: persistedGateway.carePathway,
      immediate_action_required:
        persistedGateway.carePathway === 'emergency_now' ||
        persistedGateway.carePathway === 'same_day_clinician_review',
      outpatient_scoring_blocked: true,
    },
    { status: 409 },
  )
}
```

Use a typed `TriageStartError` in `pollClient.ts` that retains these structured
fields on non-2xx responses. The triage page must keep the extraction-start
safety banner visible and render the retained immediate action plus human-review
hold when outpatient scoring cannot start. Do not reduce this response to a
generic error string.

Extend `ExtractionIngressSafetyAlert` with the governed care pathway and blocked
scoring/hold state. It must distinguish “Emergency evaluation now” from
“Same-day clinician review,” state that missing extraction data does not weaken
that action, and keep routine scheduling blocked. Add rendered regressions for
both pathways and for a structured missing-summary error with no workflow ID.

- [ ] **Step 4: Run route tests and verify GREEN**

Run:

```bash
npx vitest run \
  src/app/api/triage/__tests__/routeSafety.test.ts \
  src/app/api/triage/__tests__/backgroundSafety.test.ts \
  src/lib/triage/__tests__/pollClient.test.ts \
  src/components/triage/__tests__/ExtractionIngressSafetyAlert.test.ts
```

Expected: all files pass; no test expects a caller-provided summary to control
uploaded-document scoring, and blocked scoring cannot hide a deterministic
emergency or same-day action.

### Task 5: Make extraction review read-only until revisions are persisted

**Files:**

- Modify: `src/components/triage/ExtractionReviewPanel.tsx`
- Create: `src/components/triage/__tests__/ExtractionReviewPanelSafety.test.ts`

- [ ] **Step 1: Write the failing rendered contract test**

Create `ExtractionReviewPanelSafety.test.ts` using
`renderToStaticMarkup`. Build a synthetic `ClinicalExtraction` and assert:

```ts
expect(html).toContain('Extracted Summary')
expect(html).toContain('Approve Source-Bound Extraction')
expect(html).toContain('Do not approve')
expect(html).not.toContain('editable')
```

Pass `onApprove: vi.fn()` with no argument. Inspect the rendered textarea props
or DOM property rather than depending on the serializer's exact
`readOnly=""` spelling. Add a second case with
`approvalBlockedReason="Source coverage is incomplete."`; assert the alert is
rendered and the approve button is disabled.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run src/components/triage/__tests__/ExtractionReviewPanelSafety.test.ts
```

Expected: FAIL because the summary is editable and the button passes free text.

- [ ] **Step 3: Remove unpersisted editing**

In `ExtractionReviewPanel.tsx`:

- change `onApprove` to `() => void`;
- add `approvalBlockedReason?: string`;
- remove `editedSummary` state;
- render `value={extraction.extracted_summary}` with `readOnly`;
- label the field `Extracted Summary`;
- replace helper copy with:

```text
Review this source-bound extraction against the original. Do not approve if it
is inaccurate; return it for manual review. Versioned clinician corrections are
added in the next evidence-revision milestone.
```

- call `onApprove()` and label the button `Approve Source-Bound Extraction`.
- render the blocking reason as an alert and disable approval whenever it is
  present;
- relabel the existing back action `Do Not Approve — Return to Intake` so an
  inaccurate extraction never looks implicitly accepted. Do not describe this
  as a durable manual-review queue; that arrives with case persistence.

- [ ] **Step 4: Run the rendered test and verify GREEN**

Run the command from Step 2.

Expected: PASS.

### Task 6: Converge pasted text and one uploaded file on the full triage result

**Files:**

- Modify: `src/app/triage/page.tsx`
- Modify: `src/components/triage/TriageInputPanel.tsx`
- Modify: `src/lib/triage/types.ts`
- Create: `src/lib/triage/canonicalReferralCoordinator.ts`
- Create: `src/lib/triage/referralFlowPolicy.ts`
- Create: `tests/triage/canonicalReferralCoordinator.test.ts`
- Create: `tests/triage/referralFlowPolicy.test.ts`
- Create: `src/app/triage/__tests__/pageSourceContract.test.ts`

- [ ] **Step 1: Write failing pure flow tests**

Create `tests/triage/referralFlowPolicy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { nextStepAfterExtraction } from '@/lib/triage/referralFlowPolicy'

describe('canonical referral flow', () => {
  it('requires review for an ordinary complete extraction', () => {
    expect(
      nextStepAfterExtraction({
        packet_safety: undefined,
        coverage_status: 'complete',
      }),
    ).toMatchObject({
      nextStep: 'review',
      immediateCarePathway: null,
      humanReviewHold: false,
    })
  })

  it('continues directly to the full triage workflow for an immediate safety hold', () => {
    expect(
      nextStepAfterExtraction({
        packet_safety: {
          care_pathway: 'emergency_now',
          review_requirement: 'emergency_action',
          clinician_hold: true,
          signals: [],
        },
        coverage_status: 'complete',
      }),
    ).toMatchObject({
      nextStep: 'triage',
      immediateCarePathway: 'emergency_now',
      humanReviewHold: true,
    })
  })

  it('holds incomplete coverage for human review', () => {
    expect(
      nextStepAfterExtraction({ coverage_status: 'partial' }),
    ).toMatchObject({ nextStep: 'human_review', humanReviewHold: true })
  })

  it('keeps emergency action active while also holding incomplete coverage', () => {
    expect(
      nextStepAfterExtraction({
        packet_safety: {
          care_pathway: 'emergency_now',
          review_requirement: 'emergency_action',
          clinician_hold: true,
          signals: [],
        },
        coverage_status: 'partial',
      }),
    ).toMatchObject({
      nextStep: 'triage',
      immediateCarePathway: 'emergency_now',
      humanReviewHold: true,
    })
  })

  it('keeps same-day action active while also holding incomplete coverage', () => {
    expect(
      nextStepAfterExtraction({
        packet_safety: {
          care_pathway: 'same_day_clinician_review',
          review_requirement: 'immediate_clinician_review',
          clinician_hold: true,
          signals: [],
        },
        coverage_status: 'partial',
      }),
    ).toMatchObject({
      nextStep: 'triage',
      immediateCarePathway: 'same_day_clinician_review',
      humanReviewHold: true,
    })
  })

  it('fails closed when coverage status is absent', () => {
    expect(nextStepAfterExtraction({})).toMatchObject({
      nextStep: 'human_review',
      humanReviewHold: true,
    })
  })
})
```

- [ ] **Step 2: Run the policy test and verify RED**

Run:

```bash
npx vitest run tests/triage/referralFlowPolicy.test.ts
```

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement the pure next-step policy**

Create `src/lib/triage/referralFlowPolicy.ts`:

```ts
import type { ClinicalExtraction } from './types'

export type PostExtractionStep = 'review' | 'triage' | 'human_review'

export interface PostExtractionDecision {
  nextStep: PostExtractionStep
  immediateCarePathway:
    | 'emergency_now'
    | 'same_day_clinician_review'
    | null
  humanReviewHold: boolean
  approvalBlockedReason: string | null
}

export function nextStepAfterExtraction(
  extraction: Pick<ClinicalExtraction, 'coverage_status' | 'packet_safety'>,
): PostExtractionDecision {
  const immediateCarePathway =
    extraction.packet_safety?.care_pathway === 'emergency_now' ||
    extraction.packet_safety?.care_pathway === 'same_day_clinician_review'
      ? extraction.packet_safety.care_pathway
      : null
  const coverageReady =
    extraction.coverage_status === 'complete' ||
    extraction.coverage_status === 'not_applicable'
  const immediateSafetyHold =
    extraction.packet_safety?.clinician_hold === true ||
    immediateCarePathway !== null
  return {
    nextStep: immediateCarePathway
      ? 'triage'
      : coverageReady
        ? 'review'
        : 'human_review',
    immediateCarePathway,
    humanReviewHold: !coverageReady || immediateSafetyHold,
    approvalBlockedReason: !coverageReady
      ? 'Complete source coverage has not been verified. Immediate safety action still applies when shown, but outpatient approval and scheduling remain blocked.'
      : immediateSafetyHold
        ? 'Immediate safety action is active. Outpatient approval and scheduling remain blocked until the governed safety workflow is resolved.'
        : null,
  }
}
```

Urgency action and source completeness are orthogonal. Never evaluate coverage
first in a way that hides an already detected emergency or same-day signal.

Create `canonicalReferralCoordinator.ts` with one production surface used by
both input modes:

```ts
export function coordinateCompletedExtraction(
  extraction: ClinicalExtraction,
): {
  decision: PostExtractionDecision
  triageRequest: BoundExtractionTriageRequest
}

export async function triageBoundExtraction<T>(
  extraction: ClinicalExtraction,
  transport: (request: BoundExtractionTriageRequest) => Promise<T>,
): Promise<T>

export function retainedSafetyHoldFromError(
  error: unknown,
): {
  carePathway: 'emergency_now' | 'same_day_clinician_review'
  outpatientScoringBlocked: true
  humanReviewHold: true
} | null
```

`coordinateCompletedExtraction` composes only the two already-tested pure
policies. `triageBoundExtraction` must never accept raw text, a summary, or
caller demographics. `retainedSafetyHoldFromError` recognizes only the typed,
structured server error and otherwise returns `null`.

- [ ] **Step 4: Write a failing page source contract**

Create `src/app/triage/__tests__/pageSourceContract.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('triage page single-referral contract', () => {
  it('does not route uploaded referrals into the reduced batch result', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/triage/page.tsx'),
      'utf8',
    )
    expect(source).not.toContain("setPageState('batch')")
    expect(source).not.toContain('<BatchResultsPanel')
    expect(source).toContain('coordinateCompletedExtraction')
    expect(source).toContain('triageBoundExtraction')
  })

  it('does not let short pasted referrals bypass source-bound extraction', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/triage/page.tsx'),
      'utf8',
    )
    expect(source).not.toContain('Phase 1 flow: short paste text')
    expect(source).not.toMatch(/postTriage[\s\S]{0,300}referral_text:\s*referralText/)
    expect(source).toContain('postExtractJSON')
  })
})
```

- [ ] **Step 5: Run the page contract and verify RED**

Run:

```bash
npx vitest run src/app/triage/__tests__/pageSourceContract.test.ts
```

Expected: FAIL because current uploads explicitly enter `batch`.

- [ ] **Step 6: Replace the batch upload handler**

In `page.tsx`:

- remove `BatchItem`, `BatchResultsPanel`, `batchItems`, and `pageState='batch'`
  from this page only; do not delete reusable batch files;
- replace the direct short-paste branch in `handleSubmit` so **every** pasted
  referral calls `postExtractJSON`, persists an extraction ID, applies
  `nextStepAfterExtraction`, and later calls triage only through
  `buildBoundExtractionTriageRequest`; no paste-length threshold may bypass the
  source-bound flow;
- pass the completed extraction from both `postExtractJSON` and
  `postExtractFormData` into one shared coordinator. The coordinator owns
  `nextStepAfterExtraction`, builds the bound triage request, preserves
  immediate-action plus coverage-hold state, and returns the state transition;
  the page must not duplicate post-extraction clinical branching by input mode;
- use `selectSingleReferralFile(files)` at the start of `handleSubmitFiles`;
- build `FormData` for the one file and append validated age/sex metadata passed
  by `TriageInputPanel`;
- call `postExtractFormData` with the existing safety/progress callbacks;
- persist the returned extraction in component state;
- call `coordinateCompletedExtraction(extraction)` and retain the full
  decision plus bound request;
- surface `immediateCarePathway` before waiting for any further model call;
- for `human_review`, show the blocking reason on the review screen and pass it
  to `ExtractionReviewPanel.approvalBlockedReason`;
- for `triage`, keep any `humanReviewHold` visibly active, call
  `triageBoundExtraction` and render
  `TriageOutputPanel`;
- for `review`, set `pageState='review'`.

If triage cannot start because the summary is absent or coverage is invalid,
keep the deterministic immediate action visible and keep outpatient approval
blocked. A coverage failure must never replace the emergency/same-day action
with a generic error screen.

Change `handleApproveExtraction()` to accept no summary and call only
`triageBoundExtraction(extraction, transport)`. The coordinator builds the
bound request; the server resolves raw text, summary, demographics, source
filename/type, and extraction metadata.

Write coordinator unit tests with an injected triage transport. Assert
that paste and file outcomes use the same post-extraction transition function,
that the transport receives only a bound request, and that structured
`TriageStartError` safety state survives into the returned UI state.

Change the `TriageInputPanel.onSubmitFiles` signature to:

```ts
onSubmitFiles?: (
  files: File[],
  metadata: {
    patient_age?: number
    patient_sex?: string
  },
) => void
```

Use validated age/sex metadata for extraction and append it to `FormData`.
Persisted operator-entered demographics are assertions with user provenance,
not proof that the source document agrees; conflict modeling is part of the
evidence milestone. Because every referral now enters extraction, remove the
referring-provider-type input from this canonical surface and show concise copy
that it is unavailable until a reviewed schema persists its value and
provenance. Do not accept it for one input mode while silently discarding it for
another.

Remove `'batch'` from `TriagePageState` only if no other production caller uses
it. Keep batch types/components isolated for future separate-patient workflow.

- [ ] **Step 7: Run flow, page, and route tests**

Run:

```bash
npx vitest run \
  tests/triage/referralFileSelection.test.ts \
  tests/triage/boundExtractionRequest.test.ts \
  tests/triage/sourceExtractionAuthority.test.ts \
  tests/triage/referralFlowPolicy.test.ts \
  src/app/triage/__tests__/pageSourceContract.test.ts \
  src/app/api/triage/__tests__/routeSafety.test.ts \
  src/components/triage/__tests__/ExtractionReviewPanelSafety.test.ts
```

Expected: all files pass, and no uploaded-referral path renders
`BatchResultsPanel`.

### Task 7: Suppress outpatient workup during emergency action and expose missing data

**Files:**

- Create: `src/lib/triage/triageOutputPolicy.ts`
- Create: `tests/triage/triageOutputPolicy.test.ts`
- Create: `src/lib/triage/triageReport.ts`
- Create: `tests/triage/triageReport.test.ts`
- Modify: `src/components/triage/TriageOutputPanel.tsx`
- Modify: `src/components/triage/TriageTierBadge.tsx`
- Modify: `src/components/triage/CopyReportButton.tsx`
- Create: `src/components/triage/MissingInformationPanel.tsx`
- Create: `src/components/triage/__tests__/MissingInformationPanel.test.ts`
- Modify: `src/components/triage/__tests__/OutpatientFinalDispositionPanel.test.ts`

- [ ] **Step 1: Write failing output-policy tests**

Create `tests/triage/triageOutputPolicy.test.ts` with a complete synthetic
`TriageResult` builder and these assertions:

```ts
it('suppresses outpatient recommendations for emergency-now', () => {
  const policy = triageOutputPolicy(
    result({ care_pathway: 'emergency_now', triage_tier: 'emergent' }),
  )
  expect(policy).toMatchObject({
    showPreVisitWorkup: false,
    showOutpatientRouting: false,
    timeframe: 'Emergency evaluation now',
  })
})

it('labels same-day review as same-day rather than within one week', () => {
  const policy = triageOutputPolicy(
    result({ care_pathway: 'same_day_clinician_review', triage_tier: 'urgent' }),
  )
  expect(policy.timeframe).toBe('Same-day clinician review')
})

it('shows missing information even when an urgency floor prevents the insufficient-data tier', () => {
  const policy = triageOutputPolicy(
    result({
      triage_tier: 'urgent',
      missing_information: ['Synthetic critical onset time is missing.'],
    }),
  )
  expect(policy.showMissingInformation).toBe(true)
})

it('fails safe when an emergent marker conflicts with the care pathway', () => {
  const policy = triageOutputPolicy(
    result({
      care_pathway: 'routine_outpatient',
      triage_tier: 'emergent',
      emergent_override: true,
    }),
  )
  expect(policy).toMatchObject({
    showPreVisitWorkup: false,
    showOutpatientRouting: false,
    safetyConflict: true,
    requiresHumanReviewHold: true,
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run tests/triage/triageOutputPolicy.test.ts
```

Expected: FAIL because the policy does not exist.

- [ ] **Step 3: Implement deterministic visibility/timeframe policy**

Create `src/lib/triage/triageOutputPolicy.ts`:

```ts
import { TIER_DISPLAY, type TriageResult } from './types'

export interface TriageOutputPolicy {
  showPreVisitWorkup: boolean
  showOutpatientRouting: boolean
  showMissingInformation: boolean
  timeframe: string
  safetyConflict: boolean
  requiresHumanReviewHold: boolean
}

export function triageOutputPolicy(
  result: Pick<
    TriageResult,
    | 'care_pathway'
    | 'triage_tier'
    | 'emergent_override'
    | 'review_requirement'
    | 'missing_information'
  >,
): TriageOutputPolicy {
  const pathwayEmergency = result.care_pathway === 'emergency_now'
  const tierEmergency = result.triage_tier === 'emergent'
  const overrideEmergency = result.emergent_override
  const reviewEmergency = result.review_requirement === 'emergency_action'
  const anyEmergencyMarker =
    pathwayEmergency ||
    tierEmergency ||
    overrideEmergency ||
    reviewEmergency
  const safetyConflict =
    (pathwayEmergency && !tierEmergency) ||
    (!pathwayEmergency && (tierEmergency || overrideEmergency || reviewEmergency))
  const timeframe = anyEmergencyMarker
    ? 'Emergency evaluation now'
    : result.care_pathway === 'same_day_clinician_review'
      ? 'Same-day clinician review'
      : TIER_DISPLAY[result.triage_tier].timeframe
  return {
    showPreVisitWorkup: !anyEmergencyMarker,
    showOutpatientRouting: !anyEmergencyMarker,
    showMissingInformation: Boolean(result.missing_information?.length),
    timeframe,
    safetyConflict,
    requiresHumanReviewHold: anyEmergencyMarker || safetyConflict,
  }
}
```

This is display defense in depth, not a replacement for deterministic fusion.
Any emergent marker suppresses outpatient recommendations. A marker/pathway
conflict is visibly held for review and can never be normalized into an
outpatient presentation.

- [ ] **Step 4: Wire the policy into rendered and copied output**

In `TriageOutputPanel`:

- derive the policy once;
- pass `timeframeOverride={policy.timeframe}` to `TriageTierBadge`;
- render `InsufficientDataPanel` only for a genuinely undetermined/
  `insufficient_data` decision;
- render the new `MissingInformationPanel` for missing or conflicting items on
  urgent, emergent, same-day, or otherwise determined cases. Its copy must say
  that the active urgency action still applies, that information gathering must
  not delay that action, and whether scheduling remains locked;
- render `PreVisitWorkup` only when `showPreVisitWorkup`;
- render `SubspecialtyRouter` only when `showOutpatientRouting`;
- render an explicit safety-conflict alert and hold when
  `policy.safetyConflict`;
- for same-day cases, label any displayed workup as non-blocking and state that
  it must not delay same-day clinician review;
- keep clinical reasons, red flags, safety review, and the existing durable
  `EmergencyActionPanel` visible. Preserve its claim, acknowledgement,
  disposition, handoff, owner, escalation, and closure behavior.

Add `timeframeOverride?: string` to `TriageTierBadge` and render it instead of
`config.timeframe` when present.

Move report formatting from the private `CopyReportButton.formatReport` into a
small exported `buildTriageReport(result)` helper in
`src/lib/triage/triageReport.ts`. Apply the same output policy so an emergency
report cannot contain “Suggested Pre-Visit Workup” or outpatient routing.

- [ ] **Step 5: Extend the rendered emergency regression**

In `OutpatientFinalDispositionPanel.test.ts`, give the emergency result a
synthetic workup item, a subspecialty, and missing information. Assert:

```ts
expect(html).toContain('Closed-loop emergency action')
expect(html).toContain('Synthetic critical onset time is missing')
expect(html).toContain('Emergency evaluation now')
expect(html).not.toContain('Suggested Pre-Visit Workup')
expect(html).not.toContain('Subspecialty Routing')
```

Assert the missing-information panel says the emergency action remains active,
not that the case “cannot be triaged.” Add a static test for
`buildTriageReport` with the same suppression assertions. Add a rendered
`MissingInformationPanel` test for urgent, emergency, and scheduling-locked
copy.

- [ ] **Step 6: Run output tests and verify GREEN**

Run:

```bash
npx vitest run \
  tests/triage/triageOutputPolicy.test.ts \
  tests/triage/triageReport.test.ts \
  src/components/triage/__tests__/MissingInformationPanel.test.ts \
  src/components/triage/__tests__/OutpatientFinalDispositionPanel.test.ts
```

Expected: all pass; emergency UI and copied output contain no outpatient workup.
Run the existing emergency-action read/lifecycle route tests as a preservation
gate so “closed loop” is backed by durable behavior, not only display text.

### Task 8: Focused integration verification and documentation

**Files:**

- Modify: `docs/API_CONTRACTS.md`
- Modify: `docs/IMPLEMENTATION_STATUS.md`
- Modify: `docs/CONSOLIDATED_ROADMAP.md`
- Modify: `docs/CHANGELOG.md`
- Modify: `CLAUDE.md`
- Modify: `qa/TEST_CASES.yaml`
- Create: `tests/triage/nativePdfParity.integration.test.ts`
- Create: `tests/triage/canonicalFullResultParity.integration.test.tsx`
- Verify: all files in Tasks 1–7

- [ ] **Step 1: Add an executable real-PDF parity test**

Use the existing synthetic/PHI-free native-text fixture
`public/samples/triage/outpatient/09_Washington_Eugene.pdf`; do not mock
`unpdf`. In `nativePdfParity.integration.test.ts`:

1. construct a `File` from the fixture bytes and call `parseUploadedFile`;
2. assert both reported pages are present and the second-page text includes the
   acute focal-neurologic episode;
3. construct long-packet ingestion artifacts once from the actual PDF pages and
   once from the exact combined text treated as pasted input;
4. assert complete coverage, identical reconstructed complete-source text, a
   valid manifest digest for each representation, and the same deterministic
   care pathway (the existing manifest digest may differ because PDF page
   identity is intentionally included; a separate canonical-text hash belongs
   in durable intake);
5. apply `nextStepAfterExtraction` to equivalent complete extractions and assert
   both enter the same review/full-triage path;
6. assert the canonical page contract has no batch branch.

Also add one multipart case to the extraction route safety test using the real
fixture bytes. Assert the API persists the exact page manifest and complete
source text before model work. This layered executable test must fail if native
PDF parsing drops a page or if either input stops using the canonical flow.

Add `canonicalFullResultParity.integration.test.tsx` as a controlled no-AWS
runtime test:

1. parse the same real PDF bytes and use its exact reconstructed text as the
   pasted-input comparator;
2. construct equivalent complete source-bound extraction responses from those
   two route-layer inputs, with different extraction IDs/source types;
3. send both through the production `canonicalReferralCoordinator` and an
   injected deterministic triage transport returning the same synthetic
   `TriageResult`;
4. render both results through the production `TriageOutputPanel` with
   `renderToStaticMarkup`;
5. assert identical normalized safety-relevant result markup, the same care
   pathway/timeframe, visible emergency or same-day action and review hold,
   visible missing-information copy, and no batch/reduced-result UI;
6. add a structured missing-summary/emergency error case and assert the
   immediate action plus human-review hold render through
   `ExtractionIngressSafetyAlert` instead of a generic error.

This proves local runtime convergence with controlled model output. The QA case
still covers live/stochastic model behavior later; do not claim production-model
parity or clinical validation from this local test.

- [ ] **Step 2: Add QA cases for canonical text/PDF parity**

Add a `triage_core_flow` YAML document containing:

- `TCF1`: paste a long synthetic referral with a final-tail emergency phrase;
- `TCF2`: upload one native PDF containing the same referral and verify the same
  care pathway and full result screen;
- `TCF3`: attempt multiple-file upload and verify no file is silently selected;
- `TCF4`: send a forged summary with a valid extraction ID and verify persisted
  extraction content wins;
- `TCF5`: verify emergency UI/copy suppress outpatient workup;
- `TCF6`: verify urgent-floor missing information remains visible.

Use synthetic content only. State that production remains unchanged.

- [ ] **Step 3: Update current-state documents precisely**

Document only what this slice proves:

- one pasted referral or one native-text file enters the same full result flow;
- client-supplied extraction content is non-authoritative;
- emergency output suppresses outpatient workup;
- multi-document, OCR, durable pre-parse intake, recommendation schema, and
  clarification delivery remain pending;
- no AWS or deployment occurred.

- [ ] **Step 4: Run the focused core suite**

Run:

```bash
npx vitest run \
  tests/triage/triageInputPolicy.test.ts \
  tests/triage/nativePdfParity.integration.test.ts \
  tests/triage/canonicalFullResultParity.integration.test.tsx \
  tests/triage/referralFileSelection.test.ts \
  tests/triage/boundExtractionRequest.test.ts \
  tests/triage/canonicalReferralCoordinator.test.ts \
  tests/triage/referralFlowPolicy.test.ts \
  tests/triage/triageOutputPolicy.test.ts \
  tests/triage/triageReport.test.ts \
  src/app/api/triage/extract/__tests__/routeSafety.test.ts \
  src/app/api/triage/__tests__/routeSafety.test.ts \
  src/app/api/triage/__tests__/backgroundSafety.test.ts \
  'src/app/api/triage/[id]/emergency-actions/__tests__/routeSafety.test.ts' \
  'src/app/api/triage/[id]/emergency-actions/[actionId]/__tests__/routeSafety.test.ts' \
  src/app/triage/__tests__/pageSourceContract.test.ts \
  src/lib/triage/__tests__/pollClient.test.ts \
  src/components/triage/__tests__/FileUploadZoneContract.test.ts \
  src/components/triage/__tests__/ExtractionIngressSafetyAlert.test.ts \
  src/components/triage/__tests__/ExtractionReviewPanelSafety.test.ts \
  src/components/triage/__tests__/MissingInformationPanel.test.ts \
  src/components/triage/__tests__/OutpatientFinalDispositionPanel.test.ts
```

Expected: every listed file passes.

- [ ] **Step 5: Run static verification**

Run:

```bash
npx tsc --noEmit
npx eslint \
  src/lib/triage/triageInputPolicy.ts \
  src/lib/triage/referralFileSelection.ts \
  src/lib/triage/boundExtractionRequest.ts \
  src/lib/triage/canonicalReferralCoordinator.ts \
  src/lib/triage/sourceExtractionAuthority.ts \
  src/lib/triage/referralFlowPolicy.ts \
  src/lib/triage/triageOutputPolicy.ts \
  src/lib/triage/triageReport.ts \
  src/lib/triage/pollClient.ts \
  src/app/api/triage/extract/route.ts \
  src/app/api/triage/route.ts \
  src/app/triage/page.tsx \
  src/components/triage/FileUploadZone.tsx \
  src/components/triage/TriageInputPanel.tsx \
  src/components/triage/ExtractionReviewPanel.tsx \
  src/components/triage/ExtractionIngressSafetyAlert.ts \
  src/components/triage/TriageOutputPanel.tsx \
  src/components/triage/TriageTierBadge.tsx \
  src/components/triage/CopyReportButton.tsx \
  src/components/triage/MissingInformationPanel.tsx \
  tests/triage/nativePdfParity.integration.test.ts \
  tests/triage/canonicalFullResultParity.integration.test.tsx \
  tests/triage/referralFileSelection.test.ts \
  tests/triage/boundExtractionRequest.test.ts \
  tests/triage/canonicalReferralCoordinator.test.ts \
  tests/triage/sourceExtractionAuthority.test.ts \
  tests/triage/referralFlowPolicy.test.ts \
  tests/triage/triageOutputPolicy.test.ts \
  tests/triage/triageReport.test.ts
ruby -e 'require "yaml"; YAML.load_stream(File.read("qa/TEST_CASES.yaml")); puts "qa yaml ok"'
git diff --check
```

Expected: all commands exit 0. If a large legacy component has a known baseline
lint failure, prove it against `HEAD` and lint the changed rules/lines without
hiding new errors.

- [ ] **Step 6: Run independent reviews**

Dispatch two read-only reviewers:

1. spec compliance against
   `docs/superpowers/specs/2026-07-11-core-referral-triage-design.md` and this
   bounded plan;
2. code quality/clinical-safety review emphasizing patient mixing, source
   authority, emergency suppression, missing-data visibility, and regression
   test strength.

Resolve every Critical or Important finding and repeat both reviews. Record
remaining Minor findings explicitly.

- [ ] **Step 7: Stop before live mutation**

Do not deploy. Summarize the exact local files, verification evidence, remaining
core gaps, and the next separate plan: durable referral intake and recovery.
