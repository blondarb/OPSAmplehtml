# Clara — Stroke-Alert Dispatch Timing & the Unknown-LKW Safety Question

Owner: Steve (clinical). Status: **SHIPPED 2026-07-13** — classification downgrade (50f29f6, live-battery-verified 6/6) + voice-flow dispatch block WITH confirm-back-before-downgrade now in CLARA_VOICE_INSTRUCTIONS. Unknown-LKW remains flagged for deeper review (see below); confirm-back is the first mitigation.

Origin: Steve's 7/13 live test (session `36fc3af7`). A caller opened "emergency stroke consult"; onset was 2 days ago. The call stayed EMERGENT (would have paged MD1) even though a 2-day stroke is outside the treatment window. Steve: the page shouldn't fire on the activation *word* — it should fire once a fast triage set confirms an in-window acute stroke, so we don't overburden the single on-call MD1.

## The trigger model (agreed)

Decouple two events that are currently fused:
1. **Reassurance** — Clara says "I'm treating this as a stroke alert, getting the neurologist" — zero cost, immediate.
2. **The MD1 page** — the costly action (pulls the one on-call neurologist) — fires on a *confirmed in-window* acute stroke.

On a stroke alert, gather the **fast set, LKW first**: last known well · symptoms · name · MRN · DOB/age. Then:

| Signal after the fast gather | Action |
|---|---|
| LKW **≤24h** | **Page MD1 now** |
| LKW **unknown to the caller** (found-down, no witness, woke with it) | **Page MD1 now** — unknown could be minutes old |
| Deficit **worsening / fluctuating / new**, or **post-tPA/thrombectomy** change | **Page MD1 now** |
| Still ambiguous after one more question | **Page MD1 now** (default safe) |
| LKW **affirmatively >24h / "a couple days ago" AND deficit stable** | **No MD1 page** → STAT-2 line (callback ≤60 min) |

**Fire on the FIRST trigger that lands — do not make a hyperacute stroke wait for the full 5-item set.** If the caller leads with any acute signal ("just happened", "getting worse", "found down 20 min ago"), page immediately, mid-gather.

Safety asymmetry (the reason uncertainty always resolves toward paging): a delayed page on a real acute stroke costs brain; a false page costs an MD1 interruption. Not equal. We spend ~15s to get the one fact (LKW) that legitimately separates "page" from "STAT-2."

## ⚠️ OPEN SAFETY QUESTION — unknown LKW (Steve flagged for deeper review)

The sharp distinction: **"I don't know when it started" (unknown to the caller) ≠ "it started a couple days ago" (known, and known to be >24h).** The first PAGES (could be hyperacute); the second routes STAT-2 (affirmatively subacute). The current rulebook + draft encode this — genuine unknown stays EMERGENT, only an affirmative >24h downgrades.

Why this still needs thought (not "solved by one rule"):
- **ASR / phrasing risk:** a caller who *mumbles* or gives a vague "uh, a while ago / earlier" could be mis-parsed as either. Mis-hearing an unknown/recent onset as "old" would UNDER-triage a real stroke. The fail-safe must be: anything short of a *clear, affirmative* ≥24h stays EMERGENT.
- **"Woke up with it" / wake-up stroke:** LKW = when they went to sleep (could be <24h and thrombectomy-eligible), NOT the discovery time. Must page, not downgrade. (Gate-0 already treats wake-up as acute.)
- **Second-hand callers:** a nurse relaying "family said a couple days" — how firm is that onset? Confidence in the stated LKW should factor in.
- **The downgrade is the one UNDER-triage-capable path in the whole flow** — every other default fires MD1. So this branch deserves the most scrutiny and the most conservative parsing.

Action items for the deeper pass: (1) enumerate LKW phrasings and their correct tier (clear-old / clear-recent / vague / unknown / wake-up / second-hand); (2) decide the confidence bar for "affirmatively >24h"; (3) **DONE — Clara confirm-back on a downgrade is SHIPPED** ("the symptoms started about [two days] ago, and nothing new or worse since then?" → any hesitation/uncertainty/new-or-worse pages now); still needs live validation against vague/mumbled/second-hand phrasings; (4) red-team the downgrade path specifically for under-triage.

## Red-team round 1 — 2026-07-13 (commit 49df017)

Fired an adversarial LKW/downgrade battery at live `/classify`. **Two real under-triages found** (a genuine acute stroke dropped to STAT-2):
1. **Wake-up stroke** — "woke up this morning with weakness" + a stray "felt off a couple days ago" → non-emergent/STAT-2. Wake-up LKW is bedtime, thrombectomy-eligible → must be EMERGENT.
2. **Minimizing + unknown timing** — "probably nothing, weakness a couple days, family's not even sure when it started" → non-emergent/STAT-2. "Not sure when" = unknown → must be EMERGENT; the downplay drove it down.

Both fixed (safe direction): rulebook downgrade now requires CONFIDENT unambiguous >24h + NOT wake-up + hedged-onset-stays-EMERGENT + minimizing-never-lowers-tier; Gate-0 gained wake-up-with-deficit + post-tPA-deterioration floor patterns (the post-tPA gap was also confirmed here — was LLM-only). Held with no regression: stray "two days"=admission date, vague "a bit", new-worsening-buried, routine-framing-on-acute, clean subacute still downgrades.

**Still open:** mumbled/ASR-corrupted LKW (needs the live VOICE surface, not text /classify), second-hand-caller confidence weighting, and repeat rounds probing new angles. This path stays on the watch list — it is the only under-triage-capable branch in the flow.

## Draft voice-flow block (awaiting Steve review — NOT yet in the prompt)

To add to `CLARA_VOICE_INSTRUCTIONS` (src/app/api/ai/clara/session/route.ts):

> **STROKE-ALERT DISPATCH — when to actually page the neurologist.** The MD1 page pulls our one on-call neurologist, so fire it on a *confirmed in-window* stroke — but NEVER let uncertainty delay it. When a caller opens with a stroke alert / code stroke / "emergency stroke consult" / a new focal deficit:
> 1. **Reassure immediately** (this is not the page — it just keeps them with you): "Okay — I'm treating this as a stroke alert and getting our on-call neurologist ready."
> 2. **Gather the fast set, urgently, last-known-well FIRST** (it's the pivot): "Quickly — when was the patient last known well, what are the symptoms, and their name, MRN, and date of birth?" One breath, and take the answers in any order.
> 3. **Say "I'm connecting you to the on-call neurologist now" the moment ANY of these is true — don't wait for the rest:** last known well is within 24 hours; last known well is *unknown to the caller* (found down, no witness, woke up with it) — unknown could be minutes old, so page; the deficit is worsening, fluctuating, or brand-new, or there's been recent clot-buster/thrombectomy with any new change; or you genuinely can't tell — default to connecting.
> 4. **Only route to the STAT line instead of the hyperacute page when the caller AFFIRMATIVELY establishes onset is more than 24 hours / several days ago AND the deficit is stable** (nothing new, nothing worse): "Since it's been [two days], that's outside the acute-stroke window — I'll get you our on-call neurologist on the STAT line for a full evaluation." (Still a neurologist — just not a code-stroke page.)
> 5. **CRITICAL:** "I don't know when it started" (unknown) is NOT "it started a couple days ago" (known-old). The first connects you now; the second goes STAT. Never treat a genuine unknown as if it were old — when in doubt, connect now.
