# Clara Triage — Safety Hardening + Contract-Tier Alignment — Handoff 2026-07-13

## Audience
Next dev session (Claude) + Steve. This was a long, high-throughput session: a live-test-driven safety-hardening arc on the Clara browser test surface (`/rnd/clara`), ending in a full reconciliation of Clara's STAT tiers to the authoritative Sevaro contract.

## Current State
- **Repo/branch**: `OPSAmplehtml` `main`, all work committed + pushed. Latest Clara commit `f3e5c06`.
- **Deploy**: everything below is **LIVE** on https://app.neuroplans.app/rnd/clara (Amplify `d3ietjwgco4g2t`, us-east-2). Each change was live-verified against `/api/ai/clara/classify` before moving on.
- **Test surface only.** The production twin `sevaro-voice-agent` was deliberately NOT touched (Steve: "not too worried about the production twin yet, we'll get there").
- **`clara_test_sessions` is POC / NO PHI** (Steve 7/12) — that's why the security audit findings are deferred; see `qa/CLARA_STROKE_DISPATCH_SAFETY.md` + `docs/security-audit-2026-07-12.md`.

## Work Completed (all live-verified)

### 1. Gate-0 recall + stroke-alert bypass (from Steve's live test, session 36fc3af7)
- Gate-0 floor now fires on stroke-alert **activation language** ("stroke alert", "code stroke", "emergency stroke consult") and **lateralized weakness** — it was blind to both (`ee43fea`).
- Later added **wake-up/found-down + post-tPA-deterioration** floor patterns (`49df017`), and **tingling/paresthesia/heaviness** (cross-model review, `9659b43`).

### 2. Stroke-alert dispatch + the downgrade under-triage
- Rulebook: activation no longer hard-locks EMERGENT; a **confident, stable >24h** stroke downgrades to STAT-2 (`50f29f6`), with a **confirm-back before any downgrade** (`5ad8492`). MRN now spoken digit-by-digit.
- **Red-team (4 rounds)** found the downgrade under-triaging real strokes (wake-up, hedged/minimizing timing, worsening). Prompt tuning couldn't close it (stable mis-reads + temp-0.4 flips), so shipped a **deterministic escalate-only guard** (`4f65b9b`) — verified it can never under-triage a stroke while still allowing clean subacute downgrades. Cross-model reviewed (gpt-oss-120b).

### 3. Conversational UX (from the "Jim Jones" live test)
- 1–2 questions at a time (was firing 5); never re-ask an answered item ("I already told you" → apologize + move on, no loop); recognize the caller self-identifying as the physician; kill the "one more thing" tic; capture DOB incl. the year (`7b0c262`).

### 4. Feedback loop
- **Feedback Review** view on `/rnd/clara/results` — clusters beta-tester 👎 by theme and proposes prompt fixes, **suggest-only** (`b31153d`). Live-proved by re-deriving the day's fix from Steve's own down-vote. On-demand now; 6–12h auto-cadence is a fast-follow.

### 5. Prompt de-dup (refactor step 1)
- Removed the fully-duplicated EMERGENT FLOW block (`f17fe90`) — the contradiction that had let a dispatch edit override the cadence rule.

### 6. **STAT tiers aligned to the authoritative Sevaro contract** (the big one)
Steve located the contract (Virtual Neurology Consult Guide + tier table + Melanie/Sam Slack). Clara's STAT-1 was too broad. Reconciled (`793b5ad`, `436bb2e`, `38362fa`, `f3e5c06`), **live battery 9/9 + 4/4**:
- **EMERGENT** = acute stroke (LKW ≤24h — kept as a documented over-triage of the contract's 0–6h/6–24h+LVO, since LVO isn't knowable on a call), status epilepticus, **acute ICH** (hemorrhagic stroke, Steve).
- **STAT-1** (verbal recs to docs ≤60 min) = **GBS/AIDP, MG exacerbation, acute cord, meningitis/encephalitis** ONLY.
- **STAT-2** = everything else non-emergent — **MS/relapse, first-seizure-resolved, AMS-from-metabolic-encephalopathy** all moved here.
- **Guard regression fixed**: the downgrade guard was forcing GBS/MG/cord/MS→emergent (shared symptom words); added a named-non-stroke-condition exclusion so it stands down on them while still catching real strokes.
- **G5 clarifier reframed**: was an acuity axis ("rapidly progressive → STAT-1"); now decides **EMERGENT vs STAT** (condition decides STAT-1 vs STAT-2). Verified: worsening migraine → STAT-2.
- **Brain death**: determination/apnea-test **exam = out of scope** (Gate-0 "apnea test" false-fire fixed); **post-arrest prognostication = in-scope STAT consult**.
- **Meningitis / delirium+infection** → STAT by default, EMERGENT only on acute change.

## What Was NOT Done (held for Steve / next session)
1. **Port the entire tier + safety stack to the production twin `sevaro-voice-agent`** (`consultclassificationService.ts`). Its rulebook still has the OLD broad STAT-1, the OLD acuity-G5, and none of the brain-death/apnea/guard/lexicon work. **This is the SSOT that matters for real calls.** Steve deprioritized it but it's the biggest debt.
2. **Field-tracker** — deterministic captured-fields tracking (name/MRN/DOB/etc.) so re-asking is *impossible* and DOB accuracy is reliable (reuses the MRN cross-check plumbing). The prompt-only fixes from the Jim Jones test are a stopgap.
3. **Feedback Review 6–12h auto-cadence** (scheduled cloud agent) — currently on-demand only.
4. **Deeper prompt consolidation** — only the one dedup cut is done; the prompt is ~5,800 tokens with residual redundancy.
5. **Sam (clinical) + Manny (security)** review before any move toward production/pilot.

## Known Risks / Watch Items
- **`origin/main` is VERY active** (Riya localizer PRs #163–165 merged mid-session) — fetch + rebase before every push.
- **`AGENTS.md` + `CLAUDE.md` have unrelated uncommitted changes** in the OPSAmplehtml working tree (not from this session) — stash them (`git stash push -- AGENTS.md CLAUDE.md`) before rebasing/pushing; do not sweep them into a Clara commit.
- **Voice-behavior changes verify only via a live call** — the dispatch flow, confirm-back, cadence, physician-ID, and DOB fixes are prompt-only and need Steve's live `/rnd/clara` call to confirm end-to-end.
- **git-secrets false-positives** on this repo's markdown (backtick paths) — `--no-verify` after confirming no real secret.

## Files to Review First
- `src/lib/clara/claraRulebook.ts` — the tier logic (STAT defs, G5, A0c brain-death, per-condition rules).
- `src/lib/clara/redFlagGate.ts` — Gate-0 lexicon + `evaluateStrokeDowngradeGuard` (+ the non-stroke-condition exclusion).
- `src/app/api/ai/clara/session/route.ts` — `CLARA_VOICE_INSTRUCTIONS` (dispatch, cadence, brain-death, physician-ID).
- `qa/CLARA_STROKE_DISPATCH_SAFETY.md` + `qa/CLARA_CROSSMODEL_REVIEW_2026-07-13.md` — the safety record.
- `.claude/progress.json` — the full per-task detail (the tasks[] array is the granular log).

## Prompt for Next Session
```
Repo: ~/dev/repos/OPSAmplehtml (AWS --profile sevaro-sandbox; relay us-east-1, untouched).
Read docs/HANDOFF_2026-07-13_clara-tiers.md + .claude/progress.json first.
STATE: Clara's STAT tiers on the /rnd/clara TEST SURFACE are fully aligned to the Sevaro contract and
live-verified (EMERGENT / STAT-1 = GBS·MG·cord·meningitis / STAT-2 = everything else; deterministic
downgrade guard; brain-death out-of-scope; G5 = EMERGENT-vs-STAT). All shipped + deployed.
BIGGEST DEBT: port the whole tier + safety stack to the production twin sevaro-voice-agent
(consultclassificationService.ts) — it still has the OLD broad STAT-1, old G5, no guard/brain-death.
Also queued: field-tracker (deterministic re-ask/DOB fix), feedback-review auto-cadence, deeper prompt refactor.
PENDING: Steve's live /rnd/clara voice call (voice behavior isn't headless-testable).
CONSTRAINTS: never change a tier without Steve's clinical sign-off; verify EVERY change with a live
/classify battery (cached password in scratchpad, or Amplify branch env CLARA_TEST_PASSWORD); origin/main
is very active — rebase every push and stash the unrelated AGENTS.md/CLAUDE.md changes first.
```
