# RESUME NOTICE + SCOPE AMENDMENT (2026-09-05 11:45 MDT)

You already completed the contract below: commit `3f2edf4` on `fix/rnd-historian-final-ddx-display`,
PR #199 is open against main. Do NOT re-verify the world from scratch. Start with
`git status && git log --oneline origin/main..HEAD` and trust that work.

A product decision has now been made that changes ONE rule in the contract:
**When BOTH `localizer_differential` and `final_differential` exist, DISPLAY BOTH. Localizer-wins is
withdrawn.** Apply exactly this amendment and nothing else:

1. `HistorianRunsView.tsx`: make the helper return every available source in order — localizer
   first, then final — e.g. `resolveDifferentials(run): Array<{ source: 'localizer' | 'final';
   label: string; entries: DifferentialEntry[]; summary?: string }>`. Rename or replace the
   singular helper; leave no dead code. `RunDetailDrawer` renders one Section per returned source,
   each with its source tag ("Live localizer" / "Post-interview eval"). The localizer-only extras
   (localization hypothesis, follow-ups, KB sources) stay under the localizer section; the summary
   paragraph and `INVESTIGATIONAL_BANNER` stay under the final section. When only one source exists
   the drawer looks exactly as it does now.
2. Runs-table DDx count: use the final-differential count when present (it sees the full
   transcript), otherwise the localizer count. `with_differential` in the runs API is already
   OR-based — leave it.
3. `tests/historian/runsViewDifferential.test.tsx`: the "both set" case now asserts the drawer
   markup contains BOTH "Live localizer" AND "Post-interview eval" and a diagnosis from each source.
   Keep the other cases.
4. `docs/external-agent-prompts/2026-09-05-final-ddx-display.md`: append this RESUME NOTICE
   verbatim at the top (the verbatim-copy rule still applies).
5. PR #199 body (`gh pr edit 199 --body-file …`): replace the localizer-wins / open-decision
   paragraph with "Both differentials are displayed when both exist (product decision 2026-09-05)."
6. Gates once each (`npx tsc --noEmit`, `npx vitest run --exclude "tests/simulated-patients/**"`,
   `npx next build`), quote tails in your report, commit with a conventional message, push to the
   same branch (PR #199 updates itself). Do NOT open a new PR, do NOT merge.
When this list is complete, STOP. Everything below is the original contract, kept for context; its
scope fence and budget still apply.

---

# Contract: show the post-interview final differential on /rnd/historian runs view + non-PHI session label

Repo: blondarb/OPSAmplehtml (Next.js, TypeScript, vitest). You are in an isolated worktree off origin/main on branch `fix/rnd-historian-final-ddx-display`.

## Background (verified, do not re-derive)
- `/rnd/historian` renders `src/components/historian/HistorianRunsView.tsx`. Its `RunDetailDrawer` shows a "Differential Diagnosis & Reasoning" section ONLY from `run.localizer_differential` (an array joined from `neurology_consults`, populated every ~3 turns mid-interview when a consult row exists). Standalone runs from `/patient/historian` have no consult row, so the section is hidden even when a differential exists.
- `historian_sessions.final_differential` (migration 057) holds the post-interview evaluator output. `GET /api/ai/historian/runs` already returns it via `hs.*` in `src/app/api/ai/historian/runs/route.ts` (pg returns jsonb as an object; `normaliseRow` does not strip it). `RunRow extends HistorianSession`, and `HistorianSession.final_differential?: FinalDifferential | null` is already typed in `src/lib/historianTypes.ts`.
- `FinalDifferential` shape (`src/lib/historian/eval/finalDifferential.ts`): `{ differential: DifferentialItem[], summary: string, provenance: {...} }`; `DifferentialItem` = `{ diagnosis, icd10: string|null, likelihood: 'High'|'Moderate'|'Low', likelihood_pct, rationale, supporting_quotes, contradicting_quotes }`. Note the capitalised likelihood vs the localizer's lowercase `likelihood`/`confidence`.
- `patientLabel(run)` in HistorianRunsView falls back to `run.patient_name || 'Unknown'`. Standalone runs persist `patient_name = 'Demo Patient'` (written by `src/components/NeurologicHistorian.tsx:150`). Steve's real run therefore reads "Demo Patient". Do NOT change the writer and do NOT persist the consent-gate identity (name/DOB) anywhere — that omission is deliberate (no BAA on the voice engines; approved 2026-07-06).
- Existing test convention for React: `tests/historian-eval/DifferentialCard.test.tsx` (vitest + `renderToStaticMarkup`, `@/` alias works). Do NOT reuse `DifferentialCard` inside HistorianRunsView — it is inline-styled for the light report view; the runs view is dark Tailwind.

## 1. DELIVERABLE & DONE
A. `src/components/historian/HistorianRunsView.tsx`:
   1. Add an exported pure helper `resolveDifferential(run: RunRow): { entries: DifferentialEntry[]; source: 'localizer' | 'final' | null; summary?: string }`:
      - if `run.localizer_differential` is a non-empty array → `{ entries, source: 'localizer' }`
      - else if `run.final_differential?.differential` is a non-empty array → map each item to `DifferentialEntry` (`diagnosis`, `icd10`, `rationale`, `likelihood` lower-cased so the existing `likelihoodColor` map works; 'Moderate' → 'medium'), `source: 'final'`, `summary: run.final_differential.summary`
      - else `{ entries: [], source: null }`
   2. `RunDetailDrawer` uses `resolveDifferential`. Same Section and card markup as today. Add a small source tag next to the section title: "Live localizer" for `localizer`, "Post-interview eval" for `final`. For `final`, render `summary` (if non-empty) as a muted paragraph under the cards and the `INVESTIGATIONAL_BANNER` string from `@/lib/historian/eval/constants` as a one-line `text-xs text-slate-500` note (this evaluator output is investigational; keep the label consistent with the report view). The localizer-only extras (localization hypothesis, follow-ups, KB sources) keep rendering only when `source === 'localizer'`.
   3. The runs-table DDx count (the `ddx` const inside `RunsTable`, currently localizer-only) uses `resolveDifferential(run).entries.length`.
   4. `patientLabel(run)`: export it. When there is no linked `run.patient` and `run.patient_name` is empty, 'Unknown', or 'Demo Patient' → return `Session ${run.id.slice(0, 8)}` (a non-PHI session code; the date already appears in the adjacent table column and the drawer subtitle). Otherwise unchanged.
B. `src/app/api/ai/historian/runs/route.ts`: the `with_differential` metric counts rows where the localizer array is non-empty OR `final_differential?.differential` is a non-empty array. Nothing else in the route changes (in particular no auth changes — see scope fence).
C. New test `tests/historian/runsViewDifferential.test.tsx` covering, at minimum:
   - run with `final_differential` set (≥2 items) and `localizer_differential = []` → `resolveDifferential` returns source 'final' with lower-cased likelihoods, and `renderToStaticMarkup(<RunDetailDrawer run={...} onClose={() => {}} />)` contains the diagnosis text and "Post-interview eval" (export `RunDetailDrawer` for this);
   - run with both set → source 'localizer' and the drawer shows "Live localizer" (localizer wins for now; a product decision is pending);
   - run with neither → source null and the markup contains no "Differential Diagnosis" heading;
   - `patientLabel`: 'Demo Patient' with no patient → `Session <id8>`; a linked patient → full name unchanged.
D. Copy this contract verbatim to `docs/external-agent-prompts/2026-09-05-final-ddx-display.md` in the same PR.

DONE when A–D are committed, all three gates pass locally with output quoted in your final report, and a PR is open (section 7). When this list is complete, STOP.

## 2. SCOPE FENCE
Allowed paths: the three source/test files named above plus the docs copy. Do NOT touch `NeurologicHistorian.tsx`, middleware, auth, the `/api/` auth exemption, migrations, `HANDOFF.md`, `AGENTS.md`, `package.json`, or any other route/component. The runs API being unauthenticated is KNOWN and owned elsewhere — one line in Deferred Findings at most. Which differential should win when both exist is an open product decision — implement localizer-wins as specified and note it in the PR body; do not design an alternative. Anything else you notice → "Deferred Findings" list in your final report, one line each, not investigated.

## 3. BUDGET
One session, ≤90 minutes wall clock. Gates, each run at most twice: `npx tsc --noEmit`; `npx vitest run --exclude "tests/simulated-patients/**"`; `npx next build`. One self-review pass at most; residual nits become a written list, not more edits. Pre-existing failures unrelated to your files: record them verbatim in the report and do not fix them.

## 4. TERMINATION & CONTINUATION
After the deliverable: stop, write the final report (files changed, gate outputs quoted, PR URL, Deferred Findings, proposed follow-ups as a list). Start no follow-ups. A later "continue" / "keep going" means resume THIS deliverable only; new work needs a new contract.

## 5. INTERRUPTION / RESUME
On usage limit, disconnect, or a stuck gate: commit what exists with a `wip:` prefix and write `~/.claude/codex-runs/opsample-final-ddx.handoff.md` (done / in-flight / next). On resume, trust that handoff and `git status`/`git diff` for unchanged files; do not re-verify the world from scratch.

## 6. PARALLELISM CAP
No subagents needed. If you use any: ≤2, only for this deliverable, no reviewer swarms.

## 7. LANDING
Commit on branch `fix/rnd-historian-final-ddx-display` (conventional message, e.g. `fix(historian): show post-interview final differential on /rnd/historian runs view`). Push and open a PR against `main` with `gh pr create --base main` (draft is fine). PR body: what changed, why (standalone runs had a differential the R&D view never showed), the localizer-wins rule + the open decision, the three gate outputs, Deferred Findings. Do NOT merge, do NOT deploy. Work that doesn't land as a PR doesn't count as done.

## 8. REVIEW-ONLY CLAUSE
Not applicable — this is an implementation contract, bounded by sections 1–2. Do not expand into a review of the historian pipeline.
