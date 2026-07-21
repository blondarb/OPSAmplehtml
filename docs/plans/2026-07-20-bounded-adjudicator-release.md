# Bounded Adjudicator-Release — Proposal & Safety Analysis

- **Date:** 2026-07-20
- **Status:** ⛔ **SHELVED / SUPERSEDED** — built as option A, evaluated, and set aside. The
  live eval revealed the true root cause of the holds was NOT the fusion's only-escalate rule
  but an unretried validation flake in the safety extractor (see below). Fixed there instead.
  The option-A code is preserved on the local branch `shelved/bounded-adjudicator-release`
  (unpushed); this document is retained as a record of the fusion mechanics and the eval that
  redirected the fix.
- **Why shelved (the eval finding):** option A fired **0 times** on the live sentinel and did
  not fire on Patterson, because A's eligibility required `safetyBranch.status === 'complete'` +
  `undetermined`. But characterizing the safety extractor showed the holds are actually safety
  branch **failures**: `runModelSafetyExtractor` occasionally throws `ModelSafetyExtractionError`
  (a quote that is a near-miss of the source), and with **no retry** one throw fails the branch,
  which fusion converts to `undetermined` → hold. The model is deterministic on clear cases
  (routine 6/6, emergency 6/6) and only flakes on borderline-signal notes (Patterson: 4/6
  `same_day` grounded, 2/6 throw). **The real fix = add a bounded retry to the safety extractor**
  (parallel to the scorer's), which eliminated the flake (Patterson 8/8 `same_day`, 0 holds).
- **Scope (as-designed, not shipped):** `src/lib/triage/ensemblePolicy.ts` (`fuseTriageBranches`, `applyAdjudicatorDecision`)
- **Was meant to address:** residual 7/19 false-holds · validation-study AI-tier column (task #9) · borderline-note reproducibility

---

## 1. Problem

A large share of referrals finish as `insufficient_data` **holds** even when the note is a straightforward outpatient case. On the first full-catalog live sentinel (7/19) the **manual-hold burden was 32%** (gate ceiling 15%), and every residual hold was a **zero-signal `undetermined`** — the safety model *hedged* "I can't determine" with no grounded evidence, and nothing could release it.

The same mechanism makes borderline notes **non-reproducible**: run the corrected demo notes through a faithful copy of the deployed pipeline and Patterson comes back `insufficient_data / urgent / insufficient_data` across three temp-0 runs — the hold path fires on some runs and not others.

Both symptoms are one root cause.

## 2. Current mechanism (why a benign note holds)

Grounded in `ensemblePolicy.ts`:

`PATHWAY_RANK` orders pathways by severity (lower = more urgent):

| pathway | rank |
|---|---|
| `emergency_now` | 0 |
| `same_day_clinician_review` | 1 |
| **`undetermined`** | **2** |
| `expedited_outpatient` | 3 |
| `routine_outpatient` | 4 |
| `redirect` | 5 |

`moreUrgentOrConservativePathway(a,b)` always keeps the lower rank.

Trace for a benign note where the **safety model hedges** (`carePathway = 'undetermined'`, i.e. `safetyClass === 'failed'`):

1. `fuseTriageBranches` starts from the scorer's pathway (e.g. `expedited_outpatient`, rank 3, `dataQuality = 'sufficient'`).
2. The safety hedge branch (line ~166) forces `carePathway = 'undetermined'` (rank 2) and sets `adjudicationRequired = true`.
3. `runTriageAdjudicator` runs and — for a benign note — returns `expedited_outpatient` (rank 3).
4. `applyAdjudicatorDecision` computes `moreUrgentOrConservativePathway('undetermined'(2), 'expedited_outpatient'(3))` → **keeps `undetermined`** (2 < 3) → `adjudicator_downgrade_rejected` → the note **holds** as `insufficient_data`.

The adjudicator is **only-escalate**: it can move a hold *up* (propose rank 0/1) but can never resolve it *down* to an outpatient tier — even when the gateway, the scorer, and the adjudicator itself all say outpatient. The hold is created purely by a **content-free safety-model hedge**.

Post-`65e7a46` floor fix, a safety result of `undetermined` provably carries **zero grounded time-critical signals**: the floor derives `emergency_now` from any emergency signal and `same_day` from any immediate-review signal, so anything grounded would have set a time-critical pathway instead of `undetermined`.

## 3. Proposed change — bounded release

Allow the adjudicator to resolve a hold **down** to the scorer's outpatient pathway, but only under a strict, fully-bounded set of conditions.

**Eligibility** (computed in `fuseTriageBranches`, exposed as `eligibleForBoundedRelease: boolean`). All must hold:

1. **Gateway quiet** — `gatewayTimeCriticalClass === 'quiet'` (the deterministic lexical backstop completed and found no emergency/same-day signal and did not fail). *This is the hard floor.*
2. **Safety hedge, not a grounded signal** — safety branch `complete` **and** `safetyClass === 'failed'` (`carePathway === 'undetermined'`). Post-floor this means **zero grounded emergency/same-day signals**.
3. **Confident scorer with adequate data** — scoring branch `complete`, `carePathway ∈ {expedited_outpatient, routine_outpatient}`, and `dataQuality ∈ {sufficient, partial}` (never `insufficient`/`conflicting`).
4. **The `undetermined` came *only* from the safety hedge** — implied by 1 & 3 (gateway and scorer both completed, so neither is the source of the hold).

**Release** (in `applyAdjudicatorDecision`): when `fused.carePathway === 'undetermined'` **and** `eligibleForBoundedRelease` **and** the adjudicator **independently returns an outpatient pathway** (`expedited_outpatient` / `routine_outpatient`), set the result to `moreUrgentOrConservativePathway(scorerPathway, adjudicatorPathway)` (the more-urgent of the two outpatient tiers) with reason `adjudicator_bounded_release`. Otherwise, the existing escalate-only rule is unchanged.

Net: a hold is released only when **four independent judgments agree the case is not time-critical** — the deterministic gateway (quiet), the safety model (no grounded signal), the scorer (confident outpatient, adequate data), and the adjudicator (independently concludes outpatient, which it only does with evidence — it is prompted to return `undetermined` when evidence is missing/conflicting).

## 4. Invariants — what stays locked (unchanged)

- **Any** deterministic gateway signal (emergency / same-day / failure) → never released.
- **Any** grounded safety-model emergency or same-day signal → never released (evidence-grounded floor).
- Scorer failed, or `dataQuality` insufficient/conflicting → stays `undetermined` (no release without a confident scorer on adequate data).
- Adjudicator escalates (or can't find evidence and returns `undetermined`) → **no release**; escalation still applies in full.
- The **up** direction is completely untouched — the adjudicator can still only-escalate everywhere else.

## 5. Safety analysis

**The trade-off, stated plainly.** Today a zero-signal hold routes to a **human** (manual review). Bounded release instead routes it to the **scorer's outpatient tier** with no human in the loop. So the change trades **fewer false holds** (better workflow, less alert fatigue — the 32% burden is almost entirely these) against a **small residual risk**: an emergency that the gateway, the safety model, the scorer, *and* the adjudicator all miss, which the human hold-review would have caught.

**Why the residual risk is small and bounded:**
- Release requires four independent non-emergent reads, one of them the *deterministic* gateway (not model-dependent).
- The adjudicator concurs outpatient only *with evidence* (prompted to `undetermined` otherwise), so it is a genuine fourth check, not a rubber stamp.
- The data-quality gate blocks release on information-poor notes (those keep holding).
- Nothing evidence-grounded is ever released; only content-free hedges are.

**Assumptions flagged (verify in build):**
- Relies on the `65e7a46` floor being correct that safety-`undetermined` ⟹ zero grounded time-critical signals. (True in current code; add a test that pins it.)
- Assumes the adjudicator's outpatient concurrence is meaningful. Mitigated by requiring an *affirmative* outpatient pathway, not merely "did not escalate."

**Monitoring (ship with the change):** log every `adjudicator_bounded_release` (session id, scorer tier, gateway/safety/adjudicator pathways). Alert if any released case is later escalated or bounced back by a clinician — that is the signal the boundary is too loose.

## 6. Verification — eval gates (not approval gates)

Before ship, on the offline + live sentinel:
- **`zero-emergency-under-triage` MUST remain 0.** Any regression here is an automatic NO. *(This is the gate that matters.)*
- **`manual-hold-burden` should drop from 32% under the 15% ceiling** (the intended effect).
- `hard-negative-false-alert-rate` ≤ 5% unchanged; `zero-invalid-time-critical-evidence` unchanged.
- New unit tests in `ensemblePolicy` : (a) benign zero-signal hedge + adjudicator-outpatient → released to scorer tier; (b) safety **grounded** same-day signal → still held/escalated; (c) gateway emergency → never released; (d) insufficient dataQuality → still held; (e) adjudicator escalates → escalation applied; (f) adjudicator `undetermined` → still held.
- Cross-family review (`gpt-oss-120b` on Bedrock, BAA-safe) of the release conditions before merge.

## 7. Recommendation

**Adopt it, with affirmative adjudicator concurrence (§3) + monitoring (§5) + the eval gates (§6).** The hold path today is manufacturing `insufficient_data` from content-free hedges — that is not a safety feature, it is noise that both buries real signal under a 32% hold rate and makes the engine non-reproducible. Bounded release keeps every evidence-grounded floor locked and only resolves the noise, and the whole thing is gated behind `zero-emergency-under-triage = 0`, which needs no human to confirm.

## 8. The decision for you (Steve)

This is a Q6-class call because it removes a human from a set of cases. Three ways to go:

- **A — Adopt as specified** (recommended): affirmative adjudicator concurrence, monitoring, gated on the sentinel.
- **B — Adopt, looser**: release when the adjudicator merely *does not escalate* (releases more holds, including adjudicator-`undetermined` cases; slightly less safe).
- **C — Adopt, stricter**: require `dataQuality = sufficient` (not `partial`) and/or a second confirmatory signal; fewer releases, tighter safety.

Say which (or adjust the conditions) and I will build it behind the sentinel gate, run the eval + cross-family review, and bring you the numbers before it ships.
