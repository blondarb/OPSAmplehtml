# Triage Call-Workflow Inventory — content input for standing-orders authorship

**Status:** DRAFT INVENTORY — not protocol. Nothing here is authored, sourced, or approved.
**Purpose:** the content scaffold that the standing-orders + policy work should fill in.
**Clinical owner:** Steve Arbogast, DO. **Date:** 2026-07-24.

> ⚠️ Every clinical assertion below is **training knowledge, not authored protocol**. Red flags,
> question sets, and dispositions must be physician-authored with cited sources (guideline +
> section + date) before any live use. Treat this file as a checklist of *what needs authoring*,
> not as a source of clinical truth.

---

## 1. Reuse first — what already exists

Do not invent parallel taxonomies. Four things already exist and should be the substrate:

| Existing asset | Location | Role in the call library |
|---|---|---|
| **Emergency gateway syndrome classes** — `acute_cerebrovascular`, `intracranial_hemorrhage_or_sah`, `status_or_recurrent_seizure`, `acute_spinal_cord_or_cauda_equina`, `acute_cns_infection`, `acute_vision_threat`, `altered_mental_status_or_coma`, `traumatic_neurologic_deterioration` | `src/lib/triage/emergencyGateway.ts` | The **red-flag screen that runs first in every workflow.** Already negation/temporality-aware and sentinel-tested. Do not re-implement red flags per workflow. |
| **Reason-for-consult taxonomy** — Headache · Seizure · Cerebrovascular · Movement · Neuromuscular · Cognitive · Sleep · Other | `src/lib/reasonForConsultData.ts` | The **spine** of the library. Already in the product and physician-vetted for the note. |
| **Kiran/Clara rulebook** | `src/lib/clara/claraRulebook.ts` | Acute phone-triage reasoning (stroke timing, seizure, cauda equina, post-thrombolytic). Inpatient-facing, but the clinical logic transfers and the wording is already reviewed. |
| **`triage_clarification_questions`** | DB table, see `src/lib/triage/historianAuthorization.ts` | The **governance pattern**: physician-approved question IDs, not free text. Call-workflow questions should be governed the same way. |
| **CarePathway values** — `emergency_now` / `same_day_clinician_review` / `expedited` / `routine` / `redirect` / `undetermined` | `src/lib/triage/` | Every workflow must terminate in one of these six. Do not introduce a seventh. |

---

## 2. Workflow anatomy — the reusable template

Every call workflow has the same five parts:

1. **Red-flag screen** — the gateway syndromes. Never skippable, runs before anything
   topic-specific. If it fires: stop triaging, go to the emergency script, do not continue
   the questionnaire.
2. **Three orienting questions** — these drive most dispositions regardless of topic:
   - When did this start, or when did it change?
   - Better, the same, or worse than yesterday?
   - What can't you do now that you could do last week?
3. **Topic branch** — the condition-specific questions (below).
4. **Disposition** — one of the six CarePathway values.
5. **Scope split** — what the nurse may say vs. what requires a physician (§4).

**Design note:** timing, trajectory, and function decide most calls. Diagnosis-specific questions
refine the answer; those three do the work. Authoring effort should weight accordingly.

---

## 3. The library — by existing category

Ordered by expected call volume × risk. Each line is a workflow that needs authoring.

### Headache — highest volume
- New or changed headache *(red-flag heavy: needs the fullest authored screen)*
- Abortive medication not working
- Suspected medication-overuse headache
- Status migrainosus (>72h)
- Post-LP / post-procedure headache

### Seizure — highest risk
- Breakthrough seizure
- Ran out of / missed doses of anticonvulsant
- **New rash on an anticonvulsant** — needs its own authored urgency rule
- Driving and work questions *(state-specific reporting duties — jurisdictional, needs legal input)*
- Pregnancy planning while on anticonvulsants

### Cerebrovascular — highest acuity
- New deficit → **no triage; emergency path**
- Resolved TIA-like symptoms → still urgent, do not let resolution downgrade it
- Anticoagulation: missed dose, or bleeding
- Post-stroke symptom change

### Movement
- **Medication ran out** — abrupt dopaminergic withdrawal is its own hazard, not just a refill
- Falls
- Wearing-off / dyskinesia
- Hallucinations or psychosis on dopaminergics
- DBS issues
- Botox scheduling and prior auth

### Neuromuscular / MS
- Relapse vs. pseudo-relapse — infection/heat screen *(worked example already drafted in the demo)*
- **Myasthenia with bulbar or respiratory symptoms** → crisis risk, emergency path
- New ascending weakness → GBS screen
- Missed infusion / DMT lapse

### Cognitive
- Acute behavioral change → delirium screen (infection, new medications)
- Caregiver distress and safety
- Driving safety

### Sleep
- CPAP problems
- Excessive daytime sleepiness + driving
- Controlled-substance refill rules

### Cross-cutting, non-diagnostic — likely ~half of real call volume
- Medication refill (separate rules for controlled substances)
- **"My MRI is back — what does it mean?"** — high volume, always physician-tier
- Forms and letters (FMLA, disability, placard)
- Prior authorization
- Referral / new-patient status

---

## 4. Scope tiers — how the nurse is directed to answer

Three tiers, and the UI should show her which one she is in:

| Tier | Meaning | Examples |
|---|---|---|
| 🟢 **She answers** | Approved self-care, expectations, when to call back, logistics | "Take it with food," "expect the pharmacy to call you," appointment changes |
| 🟡 **She relays** | A physician-approved standing answer, verbatim | "For a missed dose of X, the standing order says…" |
| 🔴 **Physician required** | Any dose change, new medication, result interpretation, or anything not covered by an authored pathway | "My MRI is back," "should I double my dose?" |

**The result-interpretation boundary matters most** — it is high-volume and always red. She may
confirm that a study resulted and that the physician will review it. She may not read it.

---

## 5. What authoring each workflow requires

For each workflow above, the standing orders need:

- [ ] Trigger phrasing (what routes a call here)
- [ ] The authored red-flag set, mapped to existing gateway syndrome classes where possible
- [ ] Ordered question set, with governed question IDs
- [ ] Branch logic → one of the six CarePathway values
- [ ] Scope tier per possible answer (🟢/🟡/🔴)
- [ ] The exact words she may say at 🟢 and 🟡
- [ ] Required documentation fields
- [ ] Source citation for every clinical assertion (guideline + section + date)
- [ ] Sentinel eval cases — must-fire and must-not-fire — before it goes live

---

## 6. Open questions for the clinical owner

1. **Priority order.** Recommend authoring Headache and Seizure first (volume and risk),
   plus the cross-cutting refill + result-inquiry workflows, since those are probably half of
   real call volume and are the least clinically fraught to author.
2. **Driving/reporting duties are jurisdictional** — seizure and sleep both touch this. Needs
   legal input per covered state, not just clinical authorship.
3. **How much may a nurse say about a resulted study** before it becomes interpretation?
   The line needs to be explicit, because the call will happen daily.
4. **Controlled substances** (sleep, some neuropathy regimens) — refill rules likely need their
   own policy section rather than living inside a clinical workflow.
