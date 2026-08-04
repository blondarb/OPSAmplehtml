# SO-001 — Physician Standing Orders: Outpatient Neurology Triage Registered Nurse

| | |
|---|---|
| **Document ID** | SO-001 |
| **Version** | 0.1 — **DRAFT FOR CLINICAL REVIEW** |
| **Status** | ⚠️ **NOT APPROVED. NOT IN EFFECT. NO PATIENT MAY BE TRIAGED UNDER THIS DOCUMENT.** |
| **Physician clinical owner** | Steve Arbogast, DO |
| **Drafted** | 2026-07-24 |
| **Effective date** | *(blank — set on signature)* |
| **Next scheduled review** | *(effective date + 12 months)* |
| **Supersedes** | None. This is the first standing-orders document for this program. |
| **Companion documents** | POL-001 (program policy), POL-002 (pathway authorship & release) |

> **Draft status is load-bearing.** Clinical content below is drafted from published triage-nursing
> practice standards and general neurology red-flag knowledge, and from the deterministic emergency
> gateway already implemented in this repository. It has **not** been verified by the physician
> clinical owner. Every clinical assertion carries a source tag; items tagged
> `[training knowledge — verify]` are the drafter's recall and must be independently confirmed
> before signature. Items in §10 are open questions the drafter could not resolve and did not invent
> answers to.

---

## 1. Purpose and authority

### 1.1 What this document is

A registered nurse who tells a patient where and how quickly to seek care is issuing a **clinical
disposition**. In every US jurisdiction this is performed under physician-approved protocol, not
under independent nursing judgment alone — the RN assesses, applies an approved protocol, and
routes. The RN does not diagnose and does not prescribe.
`[AAACN, Scope and Standards of Practice for Professional Telehealth Nursing — verify current
edition and cite section]` `[ANA, Nursing: Scope and Standards of Practice — verify edition]`

This document is that physician approval. It defines:

- the dispositions a triage RN may issue **without** contacting a physician about that specific case (§4);
- the presentations that **mandate** physician involvement (§5);
- the acts that are **outside** RN scope in this program under any circumstance (§6);
- how the AI triage engine relates to the RN's authority (§7).

### 1.2 What this document is not

- **Not a clinical pathway.** Pathways are separate, individually versioned, individually signed
  assets governed by POL-002. This document authorizes the RN to *run* signed pathways; it does not
  contain pathway content.
- **Not a substitute for nursing judgment.** Nothing here obligates an RN to follow a protocol
  output she believes is unsafe. The escalation asymmetry in §3.2 exists precisely for that case.
- **Not a validation of the AI engine.** See §7.4.

### 1.3 Scope of application

Applies to any registered nurse performing outpatient neurology triage on behalf of Sevaro for a
covered site, on any inbound lane (relayed patient call, local-portal message read by the RN,
site-MA message, clinician message), for the duration of that triage contact.

Does **not** apply to: inpatient or acute teleneurology consultation intake; the Kiran phone-agent
program; referral-document triage performed by non-clinical staff.

---

## 2. Definitions

| Term | Definition |
|---|---|
| **Triage RN** | An RN licensed in the state where the **patient** is physically located at the time of contact, credentialed for this program, and current on the training in §9. |
| **Covering physician** | The neurologist on the published coverage schedule for that site at that time. |
| **Disposition** | The RN's recorded decision on *where* the patient should be seen and *how quickly*. It is a level-of-care and timeframe decision. It is never a diagnosis. |
| **Signed pathway** | A clinical pathway that has completed POL-002 authorship, evaluation, and signature. Only signed pathways may be run on a patient. |
| **The engine** | The deterministic emergency gateway, model safety extractor, scoring layer, and adjudicator in `src/lib/triage/`. |
| **Care pathway (engine output)** | The engine's routing class: `emergency_now`, `same_day_clinician_review`, `expedited_outpatient`, `routine_outpatient`, `redirect`, `undetermined` (`src/lib/triage/types.ts:13`). |
| **Gateway fire** | The deterministic emergency gateway matching one of its 12 syndrome classes with quoted source evidence (`src/lib/triage/emergencyGateway.ts:13`). |
| **Open loop** | Any disposition requiring a patient or clinician contact that has not yet been confirmed as completed. Governed by POL-001 §2. |

---

## 3. Governing principles

These four rules take precedence over every table in this document. If any specific provision below
appears to conflict with one of these, the principle governs and the conflict is a defect to be
reported under §11.

### 3.1 The nurse disposes; the AI proposes

The engine's output is **clinical decision support**. It is never itself a disposition. A disposition
exists only when a triage RN records it. This restates the disclaimer already carried on every
engine result (`src/lib/triage/types.ts:392`).

### 3.2 Escalation is always permitted; de-escalation never is

> **An RN may always move a case to a *more* urgent disposition than the protocol or the engine
> indicated, at any time, without permission, without justifying it in advance, and without delay.**
>
> **An RN may never move a case to a *less* urgent disposition than the protocol or the engine
> indicated without a physician's decision recorded for that case.**

This asymmetry is the core safety property of the program. It mirrors the engine's own design, which
escalates on internal disagreement and never silently downgrades. "I was worried and I could not say
exactly why" is a complete and sufficient reason to escalate; it requires no further justification
and must never be questioned as a reason to have escalated.

### 3.3 Emergency activation is never gated on reaching a physician

When emergency care is indicated, the RN activates it **first** and notifies the covering physician
**concurrently**. Physician contact is never a precondition to emergency activation. Requiring one
would insert delay into exactly the cases where delay causes harm.

### 3.4 No case closes by timeout

A disposition that requires a contact stays open until a human confirms it was completed or a
physician closes it. Nothing expires silently. The dominant malpractice pattern in telephone triage
is not a wrong disposition — it is a correct urgent disposition whose callback was never returned
and whose loop nobody closed. `[training knowledge — verify against ambulatory diagnostic-error /
closed-claims literature, e.g. CRICO CBS reports; do not cite a statistic without confirming it]`
Operational detail in POL-001 §2.

---

## 4. Authorized dispositions

The triage RN is authorized to issue the following dispositions **without contacting a physician
about that specific case**, subject to the conditions in each row.

| ID | Disposition | Engine pathway | Conditions on RN authority | Physician involvement |
|---|---|---|---|---|
| **D1** | **Emergency activation** — patient to ED now, by EMS | `emergency_now` | **Authorized and required.** Executed per POL-001 §3 (location-first procedure). Never delayed for any reason. | Covering physician + local site notified **concurrently**. Notification is not a precondition. |
| **D2** | **Same-day clinician contact** | `same_day_clinician_review` | Authorized to *route* and to hold the loop open. The RN does not make the clinical decision — she guarantees it reaches a clinician today. | Physician must review the same business day. RN owns the open loop until a clinician acknowledges. |
| **D3** | **Expedited appointment** (per pathway timeframe) | `expedited_outpatient` | Authorized. | None required. |
| **D4** | **Routine appointment** (per pathway timeframe) | `routine_outpatient` | Authorized. | None required. |
| **D5** | **Nurse advice + scheduled follow-up** | — | Authorized **only** where the advice given is contained, in substance, within a signed pathway. Advice not in a signed pathway is out of scope (§6.8). | None required if wholly within pathway. |
| **D6** | **Redirect to another service** | `redirect` | Authorized **only** to a service the signed pathway explicitly names. Any other redirect is a physician decision. | Physician decides redirects not named in a pathway. |
| **D7** | **Hold for clinician review** | `undetermined` | **Always authorized, for any case, at any point, with no justification required.** May not be discouraged, measured against the RN, or overridden by any other provision. | Physician reviews per the timeframe the RN assigns. |

### 4.1 Notes on the disposition set

- **D7 is unconditional.** It is the release valve that makes the rest of the table safe. Any
  workflow, metric, or dashboard that creates pressure to avoid D7 is a defect. Hold rate is a
  program-health signal, not an RN performance metric (POL-001 §6.3).
- **D1 has no "confirm with the physician first" variant.** See §3.3.
- **D2 is a routing act, not a clinical one.** The RN is not deciding what happens; she is
  guaranteeing that a clinician decides today.
- **The engine's `undetermined` output maps to D7 and to nothing else.** The engine already refuses
  to guess when its branches disagree or the input is insufficient; that refusal must not be resolved
  by the RN inventing a tier.

### 4.2 Timeframes

Timeframes attached to D3/D4 come from the signed pathway, not from this document. The engine's
7-tier display timeframes (`src/lib/triage/types.ts:332` — urgent ≤1 wk, semi-urgent ≤2 wk,
routine-priority 4–6 wk, routine 8–12 wk, non-urgent ≤6 mo) are the scheduling-depth reference the
pathway authors work from. **Verification needed:** these timeframes were authored for referral
triage. Whether they are the correct timeframes for a symptomatic patient contacting the practice —
a different population — is a clinical question for the physician owner, not a drafting decision.

---

## 5. Mandatory physician involvement

The RN must obtain physician involvement in the cases below. **"Involvement" means the timing
specified in the third column — it never means "wait before acting."** Where emergency care is
indicated, §3.3 governs: act, then notify.

### 5.1 Emergency gateway syndromes — activate, then notify

Any of the 12 deterministic emergency syndrome classes (`src/lib/triage/emergencyGateway.ts:13`).
These are already codified, negation-aware and temporality-aware, and carry quoted source evidence.

| Syndrome class (engine identifier) | Plain-language | RN action |
|---|---|---|
| `acute_cerebrovascular` | Acute stroke / TIA features | D1 now, notify concurrently |
| `intracranial_hemorrhage_or_sah` | Thunderclap / worst-ever headache, suspected bleed | D1 now, notify concurrently |
| `status_or_recurrent_seizure` | Status epilepticus, seizure clusters, no return to baseline | D1 now, notify concurrently |
| `acute_spinal_cord_or_cauda_equina` | Cord compression / cauda equina features | D1 now, notify concurrently |
| `autonomic_dysreflexia` | Autonomic dysreflexia | D1 now, notify concurrently |
| `acute_cns_infection` | Meningitis / encephalitis features | D1 now, notify concurrently |
| `raised_intracranial_pressure` | Raised ICP features | D1 now, notify concurrently |
| `neuromuscular_respiratory_or_bulbar_failure` | Respiratory or bulbar failure | D1 now, notify concurrently |
| `acute_vision_threat` | Acute monocular vision loss, "curtain" | D1 now, notify concurrently |
| `altered_mental_status_or_coma` | Altered mental status / unresponsive | D1 now, notify concurrently |
| `traumatic_neurologic_deterioration` | Head trauma with neurologic decline | D1 now, notify concurrently |
| `suicide_or_violence_risk` | Self-harm or violence risk | D1 now + POL-001 §3.6, notify concurrently |

**A gateway fire is a floor, not a ceiling.** It sets the minimum disposition. The RN may go higher.
The RN may not go lower — a fired gateway can be released only by a physician, recorded per §5.4.

**This table is not a closed list.** The engine carries a thirteenth value, `other_time_critical`,
which has no dedicated deterministic rule — it is emitted by the model safety extractor and by the
partial-packet safety hold for time-critical findings the twelve named rules do not describe
(`src/lib/triage/modelSafetyExtraction.ts`, `longPacketPartialSafetyHold.ts`). It carries the same
authority as the twelve: **D1 now, notify concurrently.** More importantly, the same rule applies to
the RN — a time-critical presentation the engine did not name is still a time-critical presentation.
The twelve classes are what the deterministic layer catches, not the boundary of what counts as an
emergency (§5.2, §3.2).

### 5.2 Presentations mandating physician involvement even when the gateway has not fired

The gateway is a lexical-plus-model safety net over submitted text. It is not a clinical
examination and it does not hear tone, hesitation, or the caller's alarm. The following mandate
physician involvement regardless of engine output.

`[training knowledge — verify each line clinically before signature]`

**Same-day physician contact required:**

1. Any new focal neurologic deficit, **including one that has fully resolved** (transient deficits
   are a stroke-risk presentation, not a reassuring one).
2. Any first-ever seizure; any seizure that was prolonged, clustered, or without return to baseline.
3. New or changed headache accompanied by fever, neck stiffness, immunosuppression, or new
   neurologic signs.
4. Progressive weakness with any bulbar feature (swallow, speech, secretions) or any breathing
   complaint.
5. New bladder or bowel dysfunction accompanied by back pain or leg weakness.
6. Head trauma, or any new headache, in a patient on anticoagulation.
7. New neurologic symptom in a patient who is pregnant or recently postpartum.
8. Fever or new neurologic symptom in a patient who is immunosuppressed — disease-modifying
   therapy, chemotherapy, transplant, or biologic.
9. Suspected medication emergency: neuroleptic malignant syndrome, serotonin syndrome, seizure
   following abrupt antiepileptic discontinuation, or an infusion/DMT reaction.
10. Any expression of self-harm, harm to others, or hopelessness — however brief, however
    qualified, however quickly retracted.

**Physician decision required before any disposition (timing per RN's assessment):**

11. Any request for a new medication, a dose change, a refill the pathway does not cover, or a
    change to an existing treatment plan.
12. Any request for imaging, laboratory, or diagnostic orders.
13. Any request to interpret a result, image, or report.
14. Any presentation with no signed pathway covering it.
15. Engine output of `undetermined`, or any case where the engine's branches disagreed.
16. **Any case where the RN's judgment is less urgent than the protocol or engine output** (§3.2).
17. **Any case where the RN is concerned and cannot articulate why.** This is a valid trigger and
    requires no further explanation.
18. **Repeat contact for the same unresolved complaint within 72 hours.** A patient calling back is
    a deterioration signal until a clinician says otherwise. `[training knowledge — verify; this is
    a standard telephone-triage safety rule but should be confirmed against AAACN guidance]`
19. Any contact where the caller is a third party and the patient cannot be assessed directly.
20. Any case in which the RN is asked, by anyone, to record a disposition she does not agree with.

### 5.3 Escalating when the physician is not reachable

If the covering physician cannot be reached within the timeframe the case requires, the RN:

1. escalates to the site's published backup coverage;
2. if still unreached and the case is same-day or higher, **escalates the disposition rather than
   the contact** — a same-day case that cannot reach a clinician becomes an ED disposition, not a
   deferred one;
3. records every attempt with timestamps;
4. notifies the local organization.

Inability to reach a physician is never a reason to lower a disposition, and never a reason to let
a loop stay open past its window.

### 5.4 Physician release of an escalated case

A physician may release a case to a lower disposition. To be valid the release must record, in the
triage note: the physician's name, the time, the disposition being released, the disposition
replacing it, and the clinical reasoning. A release that does not record all five is not a release
and the higher disposition stands.

---

## 6. Outside RN scope — prohibited under all circumstances

No provision of this document, no pathway, no engine output, and no instruction from any other
party authorizes a triage RN in this program to:

1. **Diagnose**, or communicate a diagnosis, or characterize a symptom as attributable to a
   particular condition. (Conveying a diagnosis a physician has stated and documented, attributed to
   that physician, is not diagnosing.)
2. **Prescribe, adjust, refill, hold, or discontinue any medication** — including telling a patient
   to stop, skip, resume, or change the timing of a medication they already take.
3. **Order** imaging, laboratory studies, or any diagnostic test.
4. **Interpret** an imaging study, laboratory result, or report to a patient, or characterize a
   result as normal, reassuring, or concerning.
5. **Release a fired emergency gateway**, or issue any disposition below `emergency_now` once the
   gateway has fired, absent a §5.4 physician release.
6. **Triage a patient physically located in a state where she does not hold a current license**, or
   in a state or site not listed in the program's coverage register.
7. **Give clinical advice not contained in a signed pathway.**
8. **Provide reassurance about a symptom the pathway has not addressed.** "That sounds like nothing
   to worry about" is a clinical judgment. When there is no pathway, the disposition is D7.
9. **Record a disposition on behalf of another clinician**, or record a disposition she does not
   agree with.
10. **Continue triaging when the engine is unavailable and no printed pathway is on hand** — see §8.

---

## 7. Relationship to the AI triage engine

### 7.1 The engine's role

The engine reads the submitted text, applies a deterministic emergency gateway with quoted evidence,
runs an independent model-based safety extraction, fuses the two, and proposes a care pathway and
scheduling tier. Where the branches disagree it escalates or holds. It never silently downgrades.

### 7.2 What that does and does not mean for the RN

- The engine can **raise** the floor of a case. It cannot lower it.
- The RN can raise a case above the engine's output freely (§3.2).
- The RN can lower a case below the engine's output **only** with a §5.4 physician release.
- Engine output is recorded in the triage note alongside the RN's disposition. Where they differ,
  both are recorded, with the reason.

### 7.3 Overrides are expected, not exceptional

Every RN override carries a reason code (`src/lib/triage/types.ts:151`) and feeds the calibration
review in POL-001 §6. A high override rate is information about the engine or the pathway — not a
finding about the RN.

### 7.4 What the engine's evaluation harness does and does not establish

The sentinel harness (`qa/triage-sentinel/`, `npm run triage:sentinel`) is the release gate for
engine changes. Its own gate definition declares
`"scope": "synthetic_software_release_only"` and `"clinicalValidationClaim": false`
(`qa/triage-sentinel/release-gates.json:4-5`).

**Read that plainly: passing the sentinel means the software behaved as specified on a synthetic
case set. It is not evidence of clinical accuracy on real patients, and no one — in a clinical
discussion, a sales conversation, a site agreement, or a regulatory filing — may describe it as
such.** The clinical acceptance step the sentinel does not provide is defined in POL-002 §5.

---

## 8. Degraded operation

If the engine, the worklist, or the network is unavailable, triage does not stop and does not wait.

1. The RN works from the current **printed** signed pathway set and the current printed red-flag
   library. Both must be physically available at each RN's station at all times; verifying this is
   part of the shift start (§9.3).
2. Dispositions and the reason for degraded operation are documented contemporaneously on paper and
   entered into the record when systems return.
3. **In degraded operation the disposition floor rises, not falls.** Absent the engine's safety net,
   a case the RN would otherwise have held is escalated instead.
4. Degraded operation lasting beyond one hour is reported to the physician owner.

---

## 9. RN qualification, training, and competency

An RN may triage under these standing orders only when all of the following are true and on file:

1. **Licensure** — current, unencumbered RN license valid in the state where the patient is located
   at the time of contact. Verified at hire and at each license renewal. (See §10.2 — the compact
   question.)
2. **Training** — documented completion of: this document; POL-001; POL-002; the current signed
   pathway set; the location-first emergency procedure (POL-001 §3) with a practical run-through;
   the call-opening script (POL-001 §4); the engine's role and limits (§7); documentation standards.
3. **Shift start check** — printed pathway set and red-flag library present and current-version;
   coverage schedule confirmed; jurisdiction dispatch reference (POL-001 §3.4) accessible.
4. **Annual competency** — a documented case-based review with the physician owner.
5. **Re-training within 5 business days** of any pathway change or standing-orders amendment, before
   using the changed content.

---

## 10. Open questions — resolve before signature

These are unresolved. The drafter did not have the information to answer them and did not invent
answers. Several are gating.

### 10.1 🔴 Whose standing orders govern? *(gating)*

The patient is the **local organization's** patient. The note files in the local organization's
Epic. The RN is **Sevaro's** employee. Standing orders conventionally issue from the practice whose
patients are being triaged.

It is not established whether this program operates under (a) Sevaro physician standing orders,
(b) each local organization's standing orders, or (c) both, per site. This determines who signs,
whose malpractice coverage responds, what credentialing is required at each site, and whether one
document or *n* documents exist. **Requires physician owner + legal counsel + each site's medical
staff office.** No further work on this document set should be treated as final until it is answered.

### 10.2 🔴 Supervising physician licensure in the patient's state *(gating)*

The MVP risk register records the RN's cross-state licensure as resolved. The **supervising
physician's** licensure in the patient's state is a separate question and is not addressed anywhere
in the source material. If the physician issuing the standing orders, or the covering physician
taking same-day escalations, is not licensed where the patient sits, the arrangement may not be
lawful in that state. **Requires legal counsel, per state.**

Related: the Nurse Licensure Compact covers many but not all states, and its membership changes.
The covered-state list must be verified against the current NLC roster at signature and at each
site addition. `[verify against current NLC membership — do not rely on this document's drafting date]`

### 10.3 🟡 Call recording / interception consent

POL-001 §4 requires disclosure at every call open regardless of retention, which is the
conservative position. Which specific state statutes apply, and whether disclosure alone suffices or
affirmative consent is required in the covered states, is a **legal determination**. A list of
"two-party consent states" is not reproduced here because such lists are frequently out of date and
the underlying statutes turn on details (interception vs. recording; party vs. third party) that a
list does not capture. **Requires legal counsel.**

### 10.4 🟡 AI transcript use beyond care operations

"Quality review and care improvement" sits inside HIPAA health-care operations. Using patient
transcripts to train or evaluate models is a separate authorization question that the disclosure
sentence does not answer and must not be assumed to cover. **Requires an explicit decision, recorded
here, before any transcript is used for anything other than care and quality review.**

### 10.5 🟡 Timeframes for a symptomatic population

See §4.2. The engine's scheduling timeframes were authored for referral triage. Confirm or replace
for symptomatic patient-initiated contacts.

### 10.6 🟡 Scope of the "advice" disposition (D5)

D5 is currently bounded by "contained in a signed pathway." Until the pathway set exists, D5 is
effectively unusable. Confirm this is intended — the alternative is a general nursing-advice
reference (e.g. a licensed triage protocol set), which is a purchasing and governance decision, not
a drafting one.

### 10.7 🟡 Malpractice coverage confirmation

Confirm the RN's professional liability coverage explicitly extends to telephone/asynchronous triage
performed across state lines for a third-party organization's patients. Not addressed in source
material.

---

## 11. Amendment, defect reporting, and review

### 11.1 Review cadence

| Trigger | Timing |
|---|---|
| **Scheduled review** | **Annual**, from the effective date. |
| **Any pathway added, changed, or retired** | Before that pathway goes live. |
| **Any change to the emergency gateway syndrome set or the scoring floors** | Before the change is deployed. |
| **Any adverse event, near-miss, or complaint involving a triage disposition** | Within 5 business days. |
| **Any new inbound lane** (portal, call-center, automated) | Before that lane carries live traffic. |
| **Any new covered state or site** | Before the first patient from that state or site is triaged. |
| **Any change to the licensure or supervision posture** in §10.1 / §10.2 | Immediately. |

An annual review that finds no change required is still recorded, signed, and dated. Silence is not
a review.

### 11.2 Defect reporting

Any RN, at any time, may report that a provision of this document or a pathway is unsafe, unclear,
or unworkable, directly to the physician owner. Reports are logged and answered. **No RN is
required to follow a provision she believes is unsafe** — she escalates the case (§3.2) and reports
the provision.

### 11.3 Version control

This document is versioned. Superseded versions are retained. The version in force at the time of
any given patient contact is recoverable — this is the document that establishes what the RN was
authorized to do on that date.

---

## 12. Signature

> **This document is not in effect until signed. Until then, no patient may be triaged under it.**

**Physician clinical owner** — accepts clinical responsibility for the content of these standing
orders and for the pathways issued under them.

```
Name:        Steve Arbogast, DO
Title:       ______________________________________________
Signature:   ______________________________________________
Date:        __________________
Effective:   __________________
Review due:  __________________  (effective + 12 months)
```

**Nursing acknowledgement** — each triage RN signs before first patient contact and after each
amendment.

```
RN name:     ______________________________________________
License #:   ____________________  State(s): _______________
Signature:   ______________________________________________
Date:        __________________
Version acknowledged: _______
```

**Additional signatures required pending §10.1** — if the resolution requires local-organization
sign-off, a per-site signature block is added here.

---

### Sources and verification status

| Claim area | Basis | Status |
|---|---|---|
| RN triage operates under physician protocol; RN does not diagnose or prescribe | AAACN telehealth-nursing scope and standards; ANA scope and standards; state nurse practice acts | `[verify current editions; NPA is per-state]` |
| 12 emergency syndrome classes | `src/lib/triage/emergencyGateway.ts:13` — implemented and under test | **Verified in repo** |
| Care pathway taxonomy | `src/lib/triage/types.ts:13` | **Verified in repo** |
| Scheduling tiers and timeframes | `src/lib/triage/types.ts:332` | **Verified in repo**; clinical applicability to this population unverified (§4.2) |
| Sentinel is not clinical validation | `qa/triage-sentinel/release-gates.json:4-5` | **Verified in repo** |
| Deterministic scoring floors | `src/lib/triage/scoring.ts:553-590` | **Verified in repo** |
| Neurology red-flag presentations (§5.2) | General neurology practice | `[training knowledge — verify each line]` |
| Unreturned-callback malpractice pattern | Ambulatory diagnostic-error / closed-claims literature | `[training knowledge — verify; cite no statistic unconfirmed]` |
| Repeat contact within 72h as deterioration signal | Telephone-triage practice | `[training knowledge — verify against AAACN]` |
| Two-party consent statutes | — | **Not asserted.** Legal determination (§10.3). |
| Nurse Licensure Compact membership | — | **Not asserted.** Verify against current roster (§10.2). |
