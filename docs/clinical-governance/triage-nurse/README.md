# Outpatient Neurology Triage — Clinical Governance Document Set

> ⚠️ **ALL DRAFTS. NOTHING IS SIGNED. NO PATIENT MAY BE TRIAGED UNDER ANY OF THIS.**
> Drafted 2026-07-24 for review by **Steve Arbogast, DO**, physician clinical owner.

This set exists because of one open item on the triage-nurse MVP risk register: *"Physician standing
orders — do not exist yet. Must be authored, with a policy document around them. **Gates live use.**"*

## The documents

| Doc | Covers | Read it for |
|---|---|---|
| [SO-001](SO-001_triage-rn-standing-orders_DRAFT.md) | **Standing orders** | What the RN may do alone (D1–D7), what mandates a physician, what is outside scope, how the AI relates to her authority, signature block, review cadence |
| [POL-001](POL-001_triage-program-policy_DRAFT.md) | **Program policy** | Loop closure and callback escalation, location-first emergency procedure, call-opening disclosure and identity verification, transcribe-don't-record retention tiers, oversight, preconditions to going live |
| [POL-002](POL-002_pathway-authorship-and-release_DRAFT.md) | **Pathway governance** | Who writes a pathway, who signs it, what must pass before it touches a patient (Gate A sentinel + Gate B clinical acceptance), change control, retirement |

Source material: `public/concepts/triage-nurse/` (MVP operating model, concept overview, working
demo) and the implemented engine at `src/lib/triage/`.

## The four ideas the set is built on

1. **The nurse disposes; the AI proposes.** Engine output is decision support. A disposition exists
   only when an RN records one.
2. **Escalation is always permitted; de-escalation never is.** An RN may raise a case above the
   protocol or engine output freely, without justifying it. She may lower it only with a recorded
   physician decision. This mirrors the engine's own design.
3. **Emergency activation is never gated on reaching a physician.** Act, then notify concurrently.
4. **No case closes by timeout.** The dominant triage harm pattern is a correct urgent disposition
   whose callback nobody returned. A tickler that only reminds is a defect.

## The one thing to read if you read nothing else

`qa/triage-sentinel/release-gates.json` declares its own scope:

```json
"scope": "synthetic_software_release_only",
"clinicalValidationClaim": false
```

**Passing the sentinel means the software behaved as specified on synthetic cases. It is not
clinical validation.** The document set treats it as one of two required gates and adds Gate B —
physician content review, independent clinical review, and a silent shadow run against de-identified
real traffic — because Gate A structurally cannot establish clinical correctness. Nothing in a
clinical, commercial, contractual, or regulatory context may describe the sentinel as clinical
validation.

---

## Decision register — what needs Steve

Consolidated from all three documents. 🔴 gates the program; 🟡 shapes it.

### 🔴 Gating — nothing final until these are answered

| # | Question | Where | Needs |
|---|---|---|---|
| 1 | **Whose standing orders govern?** Patient is the local org's, note files in their Epic, RN is Sevaro's. Determines who signs, whose malpractice responds, what credentialing each site needs, and whether this is one document or *n*. | SO-001 §10.1 | Steve + legal counsel + each site's medical staff office |
| 2 | **Supervising physician licensure in the patient's state.** RN cross-state licensure is resolved; the physician's is a separate, unaddressed question. If the covering physician isn't licensed where the patient sits, the arrangement may not be lawful there. | SO-001 §10.2 | Legal counsel, per state |
| 3 | **Security remediation** — the moment the worklist holds real names or MRNs, the deferred API-auth findings become blocking. | POL-001 §5.6 | Engineering; Steve sequences |
| 4 | **Jurisdiction 10-digit dispatch reference does not exist.** The location-first procedure requires it and cannot run without it. | POL-001 §3.4 | Program owner named by Steve |
| 5 | **De-identified real-traffic sample does not exist.** Gate B's shadow run needs it; so does re-gating the new input lanes. | POL-002 §6.4 | Steve + site agreements |

### 🟡 Recommendation-grade — drafts carry a recommendation; override or confirm

| # | Decision | Draft's recommendation | Where |
|---|---|---|---|
| 6 | Callback escalation intervals | D2: 3 attempts / 30 min apart, escalate at 3 failures **or** 2h before site close, whichever first | POL-001 §2.3 |
| 7 | Transcript retention window | Pick **one** number in 30–90 days. A range is not a policy | POL-001 §5.2 |
| 8 | Sentinel case minimums per pathway | ≥1 must-fire per stop-list exit, ≥1 hard negative per must-fire, ≥1 per terminal, ≥1 per unknown branch | POL-002 §6.2 |
| 9 | Shadow-run minimum | ≥30 real contacts or 4 weeks, whichever first; any under-triage is a hard stop | POL-002 §6.4 |
| 10 | Scheduling timeframes | Engine's tier timeframes were authored for *referral* triage. Confirm or replace for symptomatic patient-initiated contacts | SO-001 §4.2 |
| 11 | Advice disposition (D5) scope | Bounded to verbatim signed-pathway text. Until pathways exist, D5 is unusable — confirm that's intended vs. licensing a protocol set | SO-001 §10.6, POL-002 §9.4 |

### 🟡 Genuine clinical questions — asked as questions, no recommendation offered

| # | Question | Why no recommendation | Where |
|---|---|---|---|
| 12 | **§5.2 red-flag list.** 20 presentations mandating physician involvement, drafted from general neurology knowledge and tagged `[training knowledge — verify]`. Every line needs your verification. | Clinical content is yours to author, not the drafter's to assert | SO-001 §5.2 |
| 13 | **Behavioral-health crises.** `suicide_or_violence_risk` is a gateway class, so these contacts will arrive. Should this program carry a fuller crisis protocol, or route them out entirely? | Options differ in patient-safety character; no confident recommendation | POL-001 §3.6 |
| 14 | **Independent reviewer.** POL-002 requires a clinician who isn't an author. With one physician owner, that person doesn't exist yet. | Staffing decision | POL-002 §9.1 |
| 15 | **Which pathways first.** Highest volume vs. shortest time-to-harm. | Clinical prioritization is yours | POL-002 §9.3 |

### 🟡 Legal — not answered, deliberately

| # | Question | Where |
|---|---|---|
| 16 | Consent posture per covered state — disclosure sufficient, or affirmative consent required? No state list is reproduced; such lists go stale and the statutes turn on distinctions a list doesn't capture. Drafts take the conservative position (disclose on every call) pending counsel. | POL-001 §4.3, SO-001 §10.3 |
| 17 | AI transcript use beyond care operations. "Quality review and care improvement" sits inside HIPAA operations; model training is a separate authorization question the disclosure sentence does not cover. | SO-001 §10.4 |
| 18 | RN malpractice coverage explicitly extending to cross-state async triage for a third party's patients. | SO-001 §10.7 |

---

## What is deliberately absent

Things the drafter could have written and chose not to, because inventing them would be worse than
leaving the gap visible:

- **A two-party-consent state list.** Goes stale; statutes turn on interception-vs-storage and
  party-vs-third-party distinctions a list flattens. Legal determination.
- **The current Nurse Licensure Compact roster.** Changes; must be checked live at signature and at
  each site addition.
- **Malpractice statistics.** The loop-closure argument is made on the mechanism, not on a number
  the drafter could not confirm.
- **Thrombolysis time windows or eligibility criteria.** The ED determines eligibility on arrival;
  the RN never assesses candidacy. Naming a window would invite exactly the scope violation the
  standing orders prohibit.
- **Any pathway content.** POL-002 governs authorship; it contains no clinical pathway. The MS
  pathway in the demo is a shape, not content, and is labelled illustrative.

## Preconditions to live operation

The full gate list is **POL-001 §7** — 14 items, five of them currently red. None may be waived to
meet a date.
