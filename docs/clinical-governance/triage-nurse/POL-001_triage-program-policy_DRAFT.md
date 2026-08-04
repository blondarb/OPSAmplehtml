# POL-001 — Outpatient Neurology Triage Program: Governing Policy

| | |
|---|---|
| **Document ID** | POL-001 |
| **Version** | 0.1 — **DRAFT FOR CLINICAL REVIEW** |
| **Status** | ⚠️ **NOT APPROVED. NOT IN EFFECT.** |
| **Physician clinical owner** | Steve Arbogast, DO |
| **Drafted** | 2026-07-24 |
| **Effective date** | *(blank — set on signature)* |
| **Review cadence** | Annual, plus the triggers in SO-001 §11.1 |
| **Companion documents** | SO-001 (standing orders), POL-002 (pathway authorship & release) |

> Draft. Clinical and operational content below has **not** been verified by the physician clinical
> owner. Legal determinations are flagged and not answered. Source tags follow SO-001's convention.

---

## 1. Scope and structure

This policy governs the operation of the outpatient neurology triage program: what happens around
the disposition. SO-001 governs the disposition itself.

| Section | Covers |
|---|---|
| §2 | Loop closure — escalation on unreturned urgent callbacks |
| §3 | Emergency at distance — the location-first procedure |
| §4 | Call opening — disclosure and identity verification |
| §5 | Data handling — transcribe-don't-record, retention tiers |
| §6 | Program oversight — calibration, incidents, metrics |
| §7 | Preconditions to live operation |

---

## 2. Loop closure — unreturned urgent callbacks

### 2.1 Why this section exists first

The dominant harm pattern in telephone triage is not a wrong disposition. It is a **correct urgent
disposition whose callback was never returned, and which nobody noticed.**
`[training knowledge — verify against ambulatory closed-claims / diagnostic-error literature; do not
publish a statistic that has not been confirmed]`

A reminder that fires and is dismissed does not close a loop. **A tickler that only reminds is a
defect.** Every open loop in this program escalates on a clock, to a named human, without depending
on the RN remembering.

### 2.2 The controlling rule

> **No open loop closes by timeout. A loop closes only when a human confirms the contact happened,
> or a physician closes it with reasoning recorded. Elapsed time never closes anything.**

This restates SO-001 §3.4 and is the acceptance criterion for the follow-up tickler in the MVP
build: if the system can let an urgent loop age out silently, it is not ready for live use.

### 2.3 Escalation ladders by disposition

⚠️ **The intervals below are the drafter's recommendation, not established practice.** They are
scaled to each disposition's clinical window. The physician owner sets the final numbers.

**D1 — Emergency activation.** There is no callback ladder. The RN stays on the line until transport
is confirmed en route (§3). If contact is lost before that:

1. Immediate call back to the patient — continuously, not on a schedule.
2. Immediate call to the local site.
3. Immediate notification of the covering physician.
4. If the patient's location is known and they cannot be re-reached, call that jurisdiction's
   emergency dispatch (§3.4) and request a welfare check.
5. Nothing about this sequence waits for anything else in this document.

**D2 — Same-day clinician contact.**

| Step | Timing | Action |
|---|---|---|
| 1 | Immediately | First contact attempt. |
| 2 | +30 min | Second attempt. Message left on each attempt where the patient's recorded preference permits, containing **no clinical content** — callback request only, routed per §4.4. |
| 3 | +30 min | Third attempt. |
| 4 | Three attempts unsuccessful, **or** 2 hours before local site close — whichever is first | **Escalate: notify the local organization AND the covering physician.** Escalation is mandatory, not discretionary, and does not wait for the third attempt if the clock runs out first. |
| 5 | Loop remains open | Ownership transfers to the local site with the covering physician informed. The RN does not close it. |

**D3 — Expedited.** Three attempts across two business days, ≥4 hours apart. Unsuccessful → notify
local site → loop transfers, remains open.

**D4 — Routine.** Two attempts across five business days. Unsuccessful → written contact via the
local portal → loop may be closed with documentation.

**D5 — Nurse advice + follow-up.** The scheduled follow-up is itself an open loop and follows the
ladder of the acuity that generated it.

### 2.4 Bounce-back rule

A patient who contacts the practice again for the **same unresolved complaint within 72 hours** is
escalated to physician review regardless of the new contact's engine output (SO-001 §5.2 item 18).
The system must surface prior contacts on the same patient at the moment of triage. A triage
performed without visibility of a recent prior contact is a triage performed with the most important
fact missing.

### 2.5 Handoff at shift end

Open loops do not sit in an individual's queue overnight. At shift end, every open loop is
explicitly handed to a named receiving person or transferred to the local site. **An unassigned open
loop is an incident** (§6.2), not a housekeeping matter.

### 2.6 System requirements implied by this section

These are acceptance criteria for the build, stated here because the policy is unenforceable
without them:

1. Every disposition creates a loop object with an owner, a clock, and an escalation target.
2. Escalation fires automatically to a **named human**, not to a queue nobody owns.
3. A loop cannot be closed except by a recorded human action.
4. Every attempt is timestamped and recorded, including unsuccessful ones.
5. Prior contacts on the same patient are visible at triage time (§2.4).
6. Open loops are visible in aggregate to the physician owner, not only to the RN holding them.

---

## 3. Emergency at distance — the location-first procedure

### 3.1 The constraint

**911 routes to the caller's location.** A remote triage nurse dialing 911 reaches her own
jurisdiction's dispatch, not the patient's. She cannot dispatch to the patient. Every emergency
procedure in this program is built around that fact.

### 3.2 The procedure

Executed in order. Steps 1 and 2 precede all clinical discussion.

1. **Where is the patient right now?** Street address, or confirmation they are physically at the
   clinic. **Nothing else happens until this is answered.** If the patient cannot give an address,
   ask what they can see; ask anyone with them; ask whether their phone can share location.
2. **Who is with them?** If anyone is present — or the patient is at the local site — **that person
   dials 911** while the RN stays on the line.
3. **If the patient is alone:** instruct them to hang up and dial 911 themselves, and to call back
   after. If they cannot dial, the RN calls **that jurisdiction's 10-digit emergency dispatch
   number** (§3.4). Dialing 911 herself reaches her own area, not theirs.
4. **Do not let them drive themselves.** Request the fastest available transport.
5. **Establish the last-known-well time** and pass it to whoever is dialing. For time-dependent
   presentations this is the single most consequential fact the receiving team needs.
   `[training knowledge — last-known-well as the anchor for acute stroke care: AHA/ASA acute
   ischemic stroke guideline — verify current edition and cite]`
6. **Do not discuss treatment eligibility.** Time-window therapies are time-dependent and the
   **receiving ED determines eligibility on arrival.** The RN does not assess, predict, or comment
   on candidacy for any specific treatment — that is diagnosis and treatment planning, outside
   scope (SO-001 §6).
7. **Stay on the line until transport is confirmed en route.**
8. **Notify** the local site and the covering physician (concurrently — SO-001 §3.3).
9. **Document**: patient location, who dialed, dial time, last-known-well time, transport confirmed
   time, who was notified and when.

### 3.3 What must never happen

- The RN must never end the call before transport is confirmed, to make another call.
- The RN must never delay steps 1–3 to reach a physician (SO-001 §3.3).
- The RN must never tell a patient to drive, or to be driven, when EMS is indicated.
- The RN must never state or imply that a specific treatment will or will not be available.

### 3.4 Jurisdiction dispatch reference — a prerequisite, not a nicety

Step 3 requires a **10-digit emergency dispatch number for every jurisdiction the program covers**,
available at the RN's station and current.

⚠️ **This reference does not exist yet.** Building and maintaining it is a precondition to live
operation (§7). Requirements:

- One entry per covered county/municipality, not per state — dispatch is local.
- Verified at creation and **re-verified on the annual review cycle**; numbers change.
- Available on paper as well as on screen — this is needed exactly when systems may be degraded
  (SO-001 §8).
- Owner named.

### 3.5 Patient at the local site

When the patient is physically at a covered site, the site's own emergency response supersedes this
procedure. The RN's role is to notify site staff immediately and remain available. Each site's
internal emergency contact belongs in the same reference as §3.4.

### 3.6 Self-harm and violence risk

The `suicide_or_violence_risk` gateway class is an emergency disposition (SO-001 §5.1) and follows
§3.2, with two additions:

1. The RN does not leave the caller alone on the line while arranging help.
2. Crisis resources (988 Suicide & Crisis Lifeline in the US) are offered in addition to, never
   instead of, emergency activation when the risk is active.
   `[verify 988 as current US crisis line and confirm the program's intended crisis-referral
   posture with the physician owner]`

⚠️ **Open:** whether this program should carry a fuller behavioral-health crisis protocol, or should
route these contacts elsewhere entirely, is a scope decision for the physician owner. The drafter
does not recommend running behavioral-health crises through a neurology triage pathway without an
explicit decision to do so.

---

## 4. Call opening — disclosure and identity verification

### 4.1 When this applies

At the top of **every outbound call**, before any clinical discussion. The patient did not initiate
this call and may not be expecting it.

### 4.2 The script

Read in order:

1. **Identify.** "This is [name], a nurse calling on behalf of [site] neurology."
2. **Verify identity.** Confirm **two identifiers** — full name plus date of birth — before
   discussing anything clinical. If the person cannot confirm both, no PHI is disclosed; the RN
   states only that the practice is trying to reach the patient and asks for a return call to the
   local organization.
3. **Disclosure.** "This call is transcribed by an AI assistant for quality review and care
   improvement. Let me know if you'd prefer I not use it."
4. **Return path.** "If we get disconnected, call [local organization] back on [number] — they'll
   reach me."

### 4.3 Why disclosure is read even though audio is not retained

Not retaining audio does **not** cleanly remove the consent duty. Many state statutes turn on
**intercepting** a communication, not on storing one. The disclosure is therefore read on every
call regardless of retention posture.

**Wording is deliberate.** "Quality review and care improvement" sits inside HIPAA health-care
operations. "Data analytics" is broader, and using patient transcripts to train or evaluate models
is a **separate authorization question** that this sentence does not answer and must not be
stretched to cover (SO-001 §10.4).

⚠️ **Legal determination outstanding.** Whether disclosure alone suffices in every covered state, or
whether affirmative consent is required, is a legal question (SO-001 §10.3). This policy takes the
conservative position pending that answer. If a patient declines transcription, the RN proceeds
without it and documents the decline — declining transcription must never delay or degrade care.

### 4.4 Third parties, voicemail, and messages

- **Voicemail:** name and callback number only. **No clinical content, no reason for the call, and
  no implication of urgency** that could be overheard. This constrains §2.3 — the ladder escalates
  precisely because a message cannot carry the clinical weight.
- **Third party answers:** identity verification (§4.2 step 2) has not been satisfied. No PHI. Ask
  for the patient or leave a §4.4 voicemail-equivalent message.
- **Patient-authorized representatives:** honored per the local organization's records. The RN does
  not create or infer authorization.

### 4.5 The return path is load-bearing

Patients do not answer unknown numbers, and an unanswered return line is worse than none — an urgent
patient leaves a voicemail nobody hears in time. **The script therefore always routes the patient
back to the local organization**, which is staffed and answers. A dedicated Sevaro return number is
only worth adding if it will actually be answered, with a defined coverage window and an escalation
path of its own.

---

## 5. Data handling — transcribe, don't record

### 5.1 The principle

**Keep the clinical conclusion; discard the raw material on a schedule.** The note is the record.
Everything upstream of it is working material.

Audio is captured only long enough to produce the transcript, then discarded. The transcript and the
note persist. This materially shrinks both the retention surface and the discoverability surface
compared with keeping call recordings.

### 5.2 Retention tiers

| Artifact | Retention | Rationale |
|---|---|---|
| **Triage note** — disposition, what the RN knew, what she did | Full medical-record retention, matched to the local organization's policy for that site | It is the clinical record, and the defense if an outcome is questioned |
| **Call audio** | **Not retained.** Discarded once the transcript is produced | Removes the artifact most likely to outlive its purpose |
| **Transcript** | One short fixed window — **recommend 30–90 days**, then automatic purge | QA and dispute window. A transcript that outlives its purpose is discoverable and can be read against the note |
| **Pasted chart context** | Purge at encounter close | It is a copy of Epic's data. Epic is the record |
| **Worklist status, ticklers, loop objects** | Short, operational only | Unless a status encodes a clinical decision — in which case it belongs in the note, not the worklist |

⚠️ The 30–90 day transcript window is a **range pending a single decision**. Pick one number. A
range is not a policy, and selective application of a range is the trap in §5.4.

### 5.3 Single-owner rule

Each artifact has exactly one owner, and flows are one-way. The failure mode of a hybrid
Epic-plus-Sevaro system is double documentation — two half-true versions of the truth.

| Artifact | Owner |
|---|---|
| Triage / visit note | Authored here; **the Epic copy is final** |
| Orders, results, patient messages | Epic, period |
| Message sent to the patient via the local portal | **The local portal copy is the filed copy.** Ours records only that we sent it |
| Worklist, status, next action, loops | Ours, period — does not exist in Epic |
| Schedule | Epic is the source; ours holds a paste-parsed snapshot |

**The worklist is operational tracking, never a shadow chart.**

### 5.4 Two traps

1. **Backups silently extend real retention.** If point-in-time recovery or snapshots hold 35 days,
   a 30-day purge policy is fiction unless it covers them. The purge must be verified against actual
   backup and PITR configuration, and re-verified after any infrastructure change.
2. **Selective retention is worse than either extreme.** Keeping some calls and not others reads as
   spoliation. **One automatic clock, applied uniformly, with no human deletion path.** No one —
   including the physician owner — may delete an individual transcript early or preserve one past
   its window outside a documented legal hold.

### 5.5 Legal hold

A documented legal hold suspends automatic purge for the identified records only. Holds are issued
in writing, logged, and released in writing. A hold is the only permitted deviation from §5.4.

### 5.6 PHI gate

⚠️ **The moment the worklist holds real patient names or MRNs, PHI enters this system.** The
deferred security-audit findings for this repository (systemic API-authorization gap) become a
**blocking prerequisite**, not a backlog item. No live patient data may enter the system before
security remediation is complete and verified. This is recorded as a precondition in §7.

Related standing requirements: BAA in force with each covered organization, covering triage activity
specifically; PHI never in commits, logs, handoffs, or memory files; patient initials only in
internal discussion.

---

## 6. Program oversight

### 6.1 Calibration review

**Monthly**, the physician owner reviews:

- every RN override of an engine output, with reason codes;
- every case held for human review (D7) and how it resolved;
- every escalation that fired under §2.3;
- every case where the engine and the RN disagreed, in both directions.

The purpose is to tune the engine and the pathways. **It is not RN performance review** — see §6.3.

### 6.2 Incident reporting

Reported within **one business day** to the physician owner:

- any adverse outcome or near-miss involving a triage disposition;
- any open loop that escalated without resolution;
- any unassigned open loop (§2.5);
- any emergency activation where transport could not be confirmed;
- any case triaged outside the RN's licensure;
- any degraded operation exceeding one hour (SO-001 §8);
- any suspected PHI exposure.

Incidents trigger the 5-business-day standing-orders review in SO-001 §11.1.

### 6.3 Metrics — and how they must not be used

Tracked: contact volume by lane and disposition; time to first contact by disposition; escalation
rate under §2.3; loop closure rate and time; hold (D7) rate; override rate and direction.

> **Hold rate and override rate are engine-quality signals, not nurse-quality signals.** They must
> never appear in an individual RN's performance evaluation, and no target may be set that creates
> pressure to hold less or override less. A program that punishes holding will get less holding, and
> that is precisely the failure this document exists to prevent.

The one metric that *is* a hard operational requirement: **zero open loops closed by timeout** (§2.2).

### 6.4 Annual program review

Alongside the SO-001 §11.1 annual review: retention posture verified against actual backup
configuration (§5.4); jurisdiction dispatch reference re-verified (§3.4); licensure and BAA coverage
re-verified per site; pathway set reviewed per POL-002.

---

## 7. Preconditions to live operation

**None of the following may be waived to meet a date.** Each is a gate; all must be closed before
the first real patient is triaged.

| # | Precondition | Owner | Status |
|---|---|---|---|
| 1 | SO-001 signed and in effect | Physician owner | ⬜ Open — draft |
| 2 | POL-001 (this document) signed | Physician owner | ⬜ Open — draft |
| 3 | POL-002 signed; at least one signed pathway exists | Physician owner | ⬜ Open — draft |
| 4 | **§10.1 resolved — whose standing orders govern** | Physician owner + counsel | 🔴 Open — **gating** |
| 5 | **§10.2 resolved — supervising physician licensure per state** | Counsel | 🔴 Open — **gating** |
| 6 | RN licensure verified per covered state, against current NLC roster | Program | ⬜ Open |
| 7 | BAA in force per site, covering triage activity specifically | Program | ⬜ Open |
| 8 | **Security remediation complete** — the PHI gate in §5.6 | Engineering | 🔴 Open — **blocking** |
| 9 | Jurisdiction 10-digit dispatch reference built and verified (§3.4) | Program | 🔴 Open — **does not exist** |
| 10 | Loop-closure escalation implemented and tested per §2.6 — including proof that a loop **cannot** be closed by timeout | Engineering | ⬜ Open |
| 11 | Retention purge implemented and verified against backups/PITR (§5.4) | Engineering | ⬜ Open |
| 12 | Consent posture confirmed by counsel (§4.3) | Counsel | ⬜ Open |
| 13 | RN training complete and documented (SO-001 §9) | Physician owner | ⬜ Open |
| 14 | Printed pathway set + red-flag library available at each station (SO-001 §8) | Program | ⬜ Open |

---

## 8. Signature

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
| Loop-closure as the dominant triage harm pattern | Ambulatory diagnostic-error / closed-claims literature | `[training knowledge — verify; publish no statistic unconfirmed]` |
| 911 is location-routed; remote nurse cannot dispatch | Operating fact of US 911 architecture | Accepted as established; procedure built on it |
| Last-known-well as the critical handoff fact | AHA/ASA acute ischemic stroke guideline | `[verify current edition and cite section]` |
| ED determines treatment eligibility on arrival | Deliberate scope boundary, not a clinical claim | By design (SO-001 §6) |
| 988 as US crisis line | — | `[verify; and confirm intended crisis posture — §3.6]` |
| Interception-vs-storage basis of consent statutes | — | **Not asserted.** Legal determination (§4.3) |
| Retention tiers and single-owner model | MVP operating model, `public/concepts/triage-nurse/mvp-workflow.html` | **Verified in source material**; 30–90 day window still a range (§5.2) |
| Security remediation as PHI gate | Deferred audit findings, same source | **Verified in source material** |
