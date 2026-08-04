# SENSE (SDNE) → Signed Clinical Note — Integration Plan

**Date:** 2026-08-04 · **Status:** PLANNED — not started · **Repo:** OPSAmplehtml
**Goal:** when SENSE is available for a patient, the physician can import the exam results into the signed `/ehr` clinical note (the note of record), the same way historian data is imported today. Closes flow #6 on `docs/patient-flow.html`.

## Current state (verified 2026-08-04)

- SENSE results already reach the **consult** pipeline: the `/sdne` iframe posts `sdne:session-complete` / `sdne:results` → `POST /api/neuro-consults/[id]/sdne` → `linkSDNEToConsult()` (`src/lib/consult/pipeline.ts:300-327`, status → `sdne_complete`).
- Storage is **5 columns on `neurology_consults`** (`migrations/037_sdne_integration.sql`): `sdne_session_id`, `sdne_session_flag` (GREEN/YELLOW/RED), `sdne_domain_flags` (JSONB), `sdne_detected_patterns` (JSONB, `{description, confidence}[]`), `sdne_completed_at`. There is no separate SDNE table and no raw per-task scores in this shape.
- The signed note (`clinical_notes`) has two exam fields: `physical_exam` (JSONB, but the UI treats it as a plain string — `ClinicalNote.tsx:261-262` etc.) and `exam_free_text` (TEXT). `/ehr` renders a Physical Examination section.
- **Pattern to clone:** `POST /api/visits/[id]/import-historian` (`src/app/api/visits/[id]/import-historian/route.ts`) — explicit source id in the body, prepend-never-overwrite merge with a `[Historian]` provenance prefix (`mergeField()`, route.ts:101-108), idempotency via `imported_to_note` with 409 on re-import.

Gaps found while scoping:

1. **No visit ⇄ consult join exists.** `neurology_consults` has no `visit_id` (checked migrations 032–058) and no code joins the two; the only shared key is `patients.id` (nullable on consults).
2. **Three separate SDNE→text implementations**, one dead: `report-builder.ts:205-230` (inline, live), `contextBuilder.ts:136-156` (historian prompt context, live), `buildSDNESummaryForReport` (`contextBuilder.ts:171-196`) — exported, **zero importers**.
3. **Type mismatch:** `detected_patterns` is declared `string[]` (`src/app/sdne/page.tsx:25`) but every consumer treats entries as `{description, confidence}` objects.
4. **The historian import's own UI wiring is dead:** `handleImportHistorian()` (`ClinicalNote.tsx:986-1029`) is never attached to any JSX (`LeftSidebar` is imported but never rendered), and the `/physician` "Import to Note" button is an explicit stub redirect (`HistorianSessionsList.tsx:64-82`). The backend works; the affordance doesn't.

## Design

1. **Shared formatter first.** New `src/lib/consult/sdneFormatter.ts` exporting one `formatSDNEForNote(consult)` reused by report-builder, historian context, and the new import. Rules: exclude the "Setup" domain (existing convention), render overall flag + per-domain flags + detected patterns with confidence, and label the block as screening output — *"SENSE digital neuro exam — screening flags, not a diagnosis"* — consistent with SENSE's normal/abnormal (non-diagnostic) framing. Fix the `detected_patterns` type while consolidating; delete the dead `buildSDNESummaryForReport`.
2. **Import route.** `POST /api/visits/[id]/import-sdne`, cloned from import-historian:
   - Body: `{ consult_id }` — explicit selection, historian precedent; no magic matching.
   - **Hardening beyond the precedent:** verify `consult.patient_id === visit.patient_id` before importing. (import-historian skips this check today — fix it there too while in the area.)
   - Merge target: **`exam_free_text`**, `[SENSE]` provenance prefix, prepend-never-overwrite via the same `mergeField` approach. Do not touch `physical_exam` (JSONB/string ambiguity). Never write `assessment` / `plan`.
   - Idempotency: migration adds `sdne_imported_to_visit_id` + `sdne_imported_at` to `neurology_consults`; 409 if already imported.
3. **Discovery + UI.** `GET /api/visits/[id]/sdne-candidates` — recent `sdne_complete` consults for the visit's patient (shared `patient_id`, newest first). In `/ehr`, an "Import SENSE exam" button beside the exam section. While wiring it, **repair the dead historian-import affordance the same way** — one shared import panel for both sources.
   - If `sdne_session_flag` is RED, show a prominent banner on the note until the physician has reviewed the imported exam block.
   - Import is **always manual** in v1 — no auto-import on `sdne:session-complete` (misclick/data-safety; revisit once the manual path is trusted).
4. **Out of scope:** the wider consult-report → signed-note bridge (the "no bridge" gap on the diagram). Separate, larger effort; this plan only carries the exam data across.

## Build order (execute when SENSE availability makes it live)

1. Formatter consolidation + type fix (safe now, no behavior change) — **S**
2. Migration + import route + patient-match hardening (here and in import-historian) — **S/M**
3. Discovery endpoint + `/ehr` UI, incl. repairing the historian import wiring — **M**
4. On-device QA: real SENSE session → consult → import → sign; verify prepend, 409 on repeat, RED banner — **S**

## Acceptance criteria

- With a linked SENSE exam on the patient, `/ehr` shows the import affordance; import prepends the formatted block to `exam_free_text`; repeat import returns 409; RED sessions banner until reviewed; the signed note renders the block; `assessment`/`plan` untouched; a consult whose patient doesn't match the visit is rejected.

## Decisions (recommendations adopted per auto-approval policy; veto async)

- **D1:** target field is `exam_free_text`, not `physical_exam` JSONB — adopted.
- **D2:** manual import button in v1, no auto-import — adopted.
- **D3:** repair the historian import wiring in the same effort (same surface, dead today) — adopted.
