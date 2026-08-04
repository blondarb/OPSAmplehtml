# POL-002 — Clinical Pathway Authorship, Evaluation, and Release

| | |
|---|---|
| **Document ID** | POL-002 |
| **Version** | 0.1 — **DRAFT FOR CLINICAL REVIEW** |
| **Status** | ⚠️ **NOT APPROVED. NOT IN EFFECT. NO PATHWAY IS SIGNED.** |
| **Physician clinical owner** | Steve Arbogast, DO |
| **Drafted** | 2026-07-24 |
| **Effective date** | *(blank — set on signature)* |
| **Review cadence** | Annual, plus every trigger in SO-001 §11.1 |
| **Companion documents** | SO-001 (standing orders), POL-001 (program policy) |

> Draft. Not verified by the physician clinical owner. The MS pathway shown in the concept demo is
> labelled *DRAFT — ILLUSTRATIVE* and is **not** a signed pathway; it is a shape, not content.

---

## 1. Why pathways are governed assets

A clinical pathway determines what a nurse asks, what she concludes, and where the patient goes. It
is the operative content of the physician's standing orders — SO-001 authorizes the RN to *run*
pathways; the pathways are what she actually runs. A pathway is therefore a **versioned clinical
asset with a named author, a named signer, an evaluation record, and a retirement path** — not a
document someone edits.

This policy defines who writes one, who signs it, what must pass before it touches a patient, and
how it changes.

---

## 2. The pathway asset

### 2.1 Required contents

No pathway is eligible for review until every field is present.

| Field | Requirement |
|---|---|
| **ID and version** | Stable ID; semantic version. Version in force at any past contact must be recoverable. |
| **Clinical author** | Named physician (§3.1). |
| **Operational author** | Named triage RN (§3.2). |
| **Signer** | Physician clinical owner (§3.4). |
| **Scope** | The presentation covered, and the population it covers. |
| **Entry criteria** | When this pathway applies. |
| **Exclusion criteria** | When it does **not** apply. Exclusions route to **D7 (hold)**, never to a lower disposition. |
| **Red-flag stop list** | Findings that exit the pathway immediately to D1 or D2, before any further questions. |
| **Question set** | The branching questions, in the order asked, each pre-approved (§4.1). |
| **Terminal dispositions** | Every terminal must be one of SO-001's **D1–D7**. See §2.3. |
| **Advice text** | Verbatim, if the pathway terminates in D5. Paraphrase is not authorized (SO-001 §6.7). |
| **Citations** | Source for every clinical assertion, per §5.1. |
| **Evaluation case set** | Sentinel cases (§6.2). |
| **Signature block** | §8. |

### 2.2 The stop list runs first

The red-flag stop list is evaluated **before** the question set, and remains live throughout. A
patient who volunteers a red flag at question 6 exits at question 6. A pathway that can only exit at
its start is defective.

### 2.3 No pathway may invent a disposition

Every terminal maps to D1–D7 in SO-001 §4. A pathway may not create a new disposition, may not
subdivide one in a way that changes its authority, and may not attach an authority to a disposition
that SO-001 does not grant. If a pathway needs an authority the standing orders do not give, the
standing orders are amended first — the pathway does not quietly extend them.

### 2.4 Every branch handles "I don't know"

Every question must define what happens on an unknown, ambiguous, partial, or internally
inconsistent answer.

> **The default direction for uncertainty is escalation.** A branch whose unknown path is "assume
> no" is a defect and fails review.

This is the single most common structural failure in triage pathways: they are authored assuming
clean yes/no answers, and real patients do not give them. It also mirrors the engine's own posture —
insufficient or conflicting data produces a hold, never a low tier.

### 2.5 Pathways record what was asked and answered

Every run records the questions asked, the answers given, the branch taken, and the terminal
reached, into the triage note. A disposition that cannot be reconstructed from the note is not
defensible.

---

## 3. Authorship — who writes, who reviews, who signs

### 3.1 Clinical author — a physician

Owns the clinical content: which findings matter, which are red flags, what the exits are, what the
timeframes are. **Must be a physician.** Clinical content is not authored by nursing, by product, by
engineering, or by a model.

### 3.2 Operational author — the triage RN

Owns the shape: the wording a patient will actually understand, the order that works on a live call,
where the flow stalls, which questions a patient cannot answer. **Pathways not co-authored by
someone who will run them fail on contact with real calls.**

The RN's front-line red-flag lists (Mary Kate Banks' "panic words") are a **primary input** to the
stop list and to the evaluation case set — they encode real observed presentations. They are seeds
for the governed anchors, not a replacement for them.

### 3.3 AI assistance

A model may draft, restructure, or critique a pathway. **A model may not be the clinical author, and
model-generated clinical content is not accepted without line-by-line physician verification.**
Every clinical assertion carries a citation (§5.1) regardless of who typed it. Model-drafted content
is labelled as such in the review record so the reviewer knows what they are checking.

### 3.4 Signer — the physician clinical owner

Steve Arbogast, DO signs every pathway. The signature attaches clinical responsibility. The signer
may be the clinical author of the same pathway; the **independent reviewer (§5.3) may not be**.

### 3.5 Separation rule

| Role | May also be |
|---|---|
| Clinical author | Signer |
| Operational author | — |
| **Independent reviewer** | **Neither the clinical author nor the operational author of that pathway** |

---

## 4. Question governance

### 4.1 Pre-approved questions

Pathway questions are drawn from a governed, pre-approved set. Free-text questions invented at
runtime are not permitted. This is the same governance pattern already implemented for the AI
historian's clarification questions, which are locked to clinician-approved question IDs.

### 4.2 Question constraints

A pathway question must not:

- imply a diagnosis ("does this feel like your MS flare?" invites the patient to diagnose);
- lead toward a reassuring answer;
- require the patient to interpret a clinical finding;
- bundle two questions into one answer;
- depend on the patient having information they cannot reasonably have.

### 4.3 Red-flag library

The stop-list anchors live in the versioned red-flag library (currently v3 in the concept demo),
owned jointly by the triage RN lead and the physician owner, applied identically to every contact.

**These anchors feed the deterministic gateway, which is not naive string matching** — it is
negation-aware and temporality-aware, quotes exact source offsets, and is cross-checked by an
independent model extractor; disagreement escalates and never silently downgrades
(`src/lib/triage/emergencyGateway.ts`). Library changes are governed exactly as pathway changes are:
authored, reviewed, evaluated (§6), signed, versioned.

---

## 5. Clinical review

### 5.1 Citation standard

Every clinical assertion in a pathway carries a source:

- `[Source: <guideline>, <section>, <date/edition>]` with URL where available; **or**
- `[training knowledge — verify independently]`, which **may not survive into a signed pathway.**

> **No signed pathway may contain an uncited clinical assertion, and no citation may be invented.**
> If the source cannot be found, the assertion is removed or the pathway does not ship. An honest
> gap beats a confident fabrication.

### 5.2 Physician content review

The signer verifies each assertion against its cited source, checks the stop list for completeness
against the 12 gateway syndrome classes, and confirms every terminal maps to a D1–D7 authority that
SO-001 actually grants.

### 5.3 Independent clinical review

A second clinician, not an author of that pathway (§3.5), reviews for: missed red flags, unsafe
default branches, exclusion criteria that are too narrow, and timeframes that do not match the
population.

Where the pathway covers a high-consequence presentation — anything whose stop list touches an
emergency syndrome class — a **cross-family AI review** may be run in addition, never instead. Model
review is an input to the human reviewer, never a substitute for one, and is not a signature.

### 5.4 Review record

Reviews are recorded with reviewer, date, findings, and resolutions. A review that found nothing is
still recorded.

---

## 6. Evaluation — what must pass before live

Two gates. **Both required. Neither substitutes for the other.**

### 6.1 Gate A — software release gate (the sentinel)

Harness: `qa/triage-sentinel/` · run with `npm run triage:sentinel`.

Every gate in `qa/triage-sentinel/release-gates.json` must pass, in **both** offline-deterministic
and live-ensemble modes:

| Gate ID | Metric | Threshold |
|---|---|---|
| `zero-emergency-under-triage` | `emergency_under_triage_count` | **= 0** |
| `zero-invalid-time-critical-evidence` | `invalid_time_critical_evidence_count` | **= 0** |
| `complete-offline-execution` | `unevaluated_offline_case_count` | **= 0** |
| `hard-negative-false-alert-rate` | `hard_negative_false_alert_rate` | ≤ 0.05 |
| `manual-hold-burden` | `manual_hold_rate` | ≤ 0.15 |

**A failing gate is a NO that needs no human to confirm it.** A passing gate proceeds to Gate B on
its own.

### 6.2 Gate A case-set requirements

Each pathway contributes cases to `qa/triage-sentinel/cases.json` in the existing schema
(`id`, `synthetic`, `syndrome`, `hardNegative`, `tags`, `executionModes`, `input`, `expected` with
`pathway` / `acceptablePathways` / `requiredSyndromes`).

⚠️ **Drafter's recommended minimums — physician owner sets the final numbers:**

- **≥ 1 must-fire case per red-flag stop-list exit.** Every exit that claims to catch something is
  tested with a case that must trigger it.
- **≥ 1 hard negative per must-fire case.** Without hard negatives the false-alert rate is not
  measurable, and a stop list that fires on everything passes the under-triage gate trivially.
- **≥ 1 case per terminal disposition.**
- **≥ 1 case per unknown/ambiguous branch** (§2.4).
- Cases drawn from the RN's real observed phrasings, not only from textbook wording.
- **All cases synthetic.** No real patient text enters the catalog.

### 6.3 What Gate A does not establish

`release-gates.json` declares its own scope: `"scope": "synthetic_software_release_only"` and
`"clinicalValidationClaim": false`.

> **Passing the sentinel means the software behaved as specified on synthetic cases. It is not
> evidence that a pathway is clinically correct, and it is not clinical validation of anything.**
> This must not be described otherwise in any clinical, commercial, contractual, or regulatory
> context.

Gate B exists because of exactly this limit.

### 6.4 Gate B — clinical acceptance

1. **Content review complete** (§5.2) with every citation verified.
2. **Independent review complete** (§5.3) with findings resolved.
3. **Shadow run.** The pathway runs **silently** against de-identified real contacts from the lanes
   it will serve. It produces no disposition and reaches no patient. The physician owner and the
   triage RN review every disagreement between the shadow output and what actually happened.
   - Recommended minimum: **≥ 30 real contacts** spanning the pathway's presentation, **or** four
     weeks of traffic, whichever comes first. ⚠️ Drafter's recommendation — the physician owner sets
     the number. A pathway covering a rare presentation may never reach 30, which is a reason to
     extend the window, not to skip the gate.
   - **Any shadow-run case where the pathway would have under-triaged a contact that was in fact
     urgent is a hard stop.** The pathway does not ship; it is re-authored.
4. **Physician owner accepts** the shadow-run result in writing.

⚠️ The de-identified real-traffic sample **does not exist yet**. Obtaining it — with the site
agreements and de-identification that requires — is a precondition to the first pathway going live,
and is on the POL-001 §7 list by reference.

### 6.5 New input lanes are re-gated

The engine's evaluation history is on **referral documents**. Portal messages and call-center
encounters are different text: shorter, patient-voiced, less structured, and differently distributed.

> **Both gates are re-run per input lane. A pathway cleared on one lane is not cleared on another.**

### 6.6 Evaluation record

Every release retains: catalog version, gate results (both modes), report artifacts under
`qa/triage-sentinel/results/`, shadow-run summary, reviewer sign-offs. The record establishes what
was known at release.

---

## 7. Versioning, change control, retirement

### 7.1 Change classes

| Class | Examples | Requirement |
|---|---|---|
| **Editorial** | Typo, formatting, non-clinical wording | Signer approval; version bump; no re-gate |
| **Operational** | Question order, wording that does not change the branch taken | Both authors + signer; version bump; **Gate A re-run** |
| **Clinical** | Any change to a stop list, branch logic, terminal, timeframe, exclusion, or advice text | **Full §5 review + Gate A + Gate B.** Treated as a new release |

**Ambiguity between operational and clinical resolves to clinical.** If a change might alter which
branch a patient takes, it is clinical.

### 7.2 No hot edits

A live pathway is never edited in place. Changes produce a new version through the full path for its
class. Emergency correction of an unsafe live pathway follows §7.3.

### 7.3 Emergency withdrawal

If a live pathway is found unsafe, the physician owner **withdraws it immediately**. Withdrawal
needs no gate and no review — it removes an authority rather than granting one.

On withdrawal: cases in flight go to **D7 (hold)**; RNs are notified immediately, including the
printed set (SO-001 §8); the presentation is triaged as having no pathway (SO-001 §5.2 item 14)
until a replacement is signed; an incident is filed (POL-001 §6.2).

### 7.4 Retirement

Retired pathways are archived, never deleted. The version in force at the time of any past patient
contact must remain recoverable.

### 7.5 Scheduled review

Every signed pathway is reviewed **annually**, and additionally whenever its cited guidance is
updated, whenever the gateway syndrome set or scoring floors change, whenever an incident implicates
it, or whenever a new input lane or covered site is added.

A review that changes nothing is recorded, signed, and dated.

---

## 8. Pathway signature block

Every pathway carries this block. **A pathway without a completed block is not signed and may not
be run.**

```
PATHWAY:            ______________________________________________
ID / VERSION:       ____________________  /  ____________________
INPUT LANES CLEARED: ⬜ relayed call   ⬜ portal message   ⬜ site MA   ⬜ clinician

Clinical author (physician)
  Name / signature / date:   _______________________ / __________ / __________

Operational author (triage RN)
  Name / signature / date:   _______________________ / __________ / __________

Independent clinical reviewer (not an author of this pathway)
  Name / signature / date:   _______________________ / __________ / __________

GATE A — sentinel release gate
  Catalog version: ______________   Cases added: ______
  Offline run: ⬜ ALL PASS    Report: qa/triage-sentinel/results/________________
  Live run:    ⬜ ALL PASS    Report: qa/triage-sentinel/results/________________
  Acknowledged: this gate is synthetic software release only and is
  NOT clinical validation (§6.3).                                    ⬜

GATE B — clinical acceptance
  Content review complete, all citations verified                    ⬜
  Independent review complete, findings resolved                     ⬜
  Shadow run: ______ contacts over ______ weeks
  Under-triage events in shadow run: ______  (must be 0)             ⬜
  Physician owner accepts shadow result                              ⬜

RELEASE — physician clinical owner
  Name:        Steve Arbogast, DO
  Signature:   ______________________________________________
  Date:        __________________
  Effective:   __________________
  Review due:  __________________  (effective + 12 months)
```

---

## 9. Open questions

1. 🟡 **Independent reviewer identity.** §5.3 requires a clinician who is not an author. With a
   single physician owner, that person does not currently exist in the program. Options: a second
   neurologist on retainer; a local-organization physician per site; a formal peer arrangement. Not
   resolvable by drafting — a staffing decision.
2. 🟡 **Shadow-run minimums.** §6.4's ≥30 contacts / 4 weeks is the drafter's recommendation, not
   established practice. Physician owner sets it.
3. 🟡 **First pathway set.** Which presentations are authored first is a clinical prioritization
   decision. The obvious candidates are the highest-volume contacts and the ones with the shortest
   time-to-harm — but the drafter should not pick them.
4. 🟡 **Relationship to purchased protocol sets.** Whether the program authors everything or licenses
   an established triage protocol set and layers neurology-specific pathways on top is a purchasing
   and governance decision that materially changes this policy. Worth deciding before authoring
   volume accumulates.
5. 🟡 **Interaction with SO-001 §10.1.** If pathways must be approved per local organization rather
   than centrally, §3.4 and §8 gain per-site signature blocks. Blocked on the same answer.

---

## 10. Signature

> **Not in effect until signed.**

```
Physician clinical owner

Name:        Steve Arbogast, DO
Signature:   ______________________________________________
Date:        __________________
Effective:   __________________
Review due:  __________________  (effective + 12 months)
```

---

### Sources and verification status

| Claim area | Basis | Status |
|---|---|---|
| Sentinel gate set, thresholds, metric names | `qa/triage-sentinel/release-gates.json` | **Verified in repo** |
| Sentinel case schema | `qa/triage-sentinel/cases.json` (31 cases) | **Verified in repo** |
| Sentinel invocation | `package.json` → `triage:sentinel` → `scripts/triage-sentinel.ts` | **Verified in repo** |
| Sentinel is not clinical validation | `release-gates.json:4-5` | **Verified in repo** |
| Gateway is negation/temporality-aware, evidence-quoting, independently cross-checked | `src/lib/triage/emergencyGateway.ts` and safety-extractor path | **Verified in repo** |
| Pre-approved question governance precedent | AI historian clarification-question mechanism | **Verified in source material** |
| RN red-flag lists as primary input | Mary Kate Banks, "Triaging Technology Ideas" (2026-07-19), via concept overview | **Verified in source material** |
| Case-set minimums, shadow-run minimums | — | **Drafter's recommendation.** Not established practice. Physician owner sets. |
