# Clara — Cross-Model Safety Review (gpt-oss-120b on Bedrock) — 2026-07-13

Independent adversarial review of today's stroke-downgrade safety logic (guard + rulebook + Gate-0), asked to hunt ONLY for ways a real acute stroke could still be under-triaged. Model: `openai.gpt-oss-120b-1:0` (us-east-2, HIPAA-safe). Every finding was then verified against the live code by Claude — open-weight reviewers misread intent, so nothing here is acted on unverified.

## Claude's triage of the findings

| # | Reviewer claim | Severity claimed | Verified verdict |
|---|---|---|---|
| 1/7 | STROKE_CONTEXT + Gate-0 miss tingling / paresthesia / heaviness / posterior-circulation (vertigo, gait, diplopia, dysphagia) | Critical | **PARTLY REAL.** For ACUTE versions, Gate-0 + rulebook already catch them (the guard only matters on the >24h downgrade path). But adding **tingling / paresthesia / heaviness** to the stroke lexicon is a cheap, over-triage-SAFE hardening — worth doing. **Posterior-circulation (dizziness/vertigo/gait)** is the central-vs-peripheral sensitivity call Steve owns — NOT an autonomous add. |
| 2 | Guard only runs on consultType==='non-emergent'; an acute stroke MISLABELED as ct-return/rounding/outpatient bypasses it | Critical | **PLAUSIBLE DESIGN QUESTION (Steve's call).** Real in theory, but those types have their OWN safety logic (CT-return→presumed-stroke-alert path), and the reviewer's blanket "run the guard on ct-return/rounding too" would over-triage legit CT-returns/rounding. Needs a clinical decision, not a blind fix. |
| 6 | "family thinks it was three days ago" evades the uncertainty guard | High | **FALSE POSITIVE.** GUARD_UNCERTAINTY already includes `(i|he|she|they|we|patient|family|…)\s+thinks?` — "family thinks" IS caught → forces emergent. Reviewer missed the existing alternation. |
| 3 | STABLE_SIGNAL misses "still the same" | Medium | **NOT A SAFETY RISK.** Missing a stable signal → guard forces emergent → over-triage → safe. Precision-only, low priority. |
| 4 | CONFIDENT_OVER_24H misses "a few days ago"/"several weeks" | Medium | **NOT A SAFETY RISK** (and "last week" IS matched — reviewer wrong there). Missing → over-triage → safe. Precision-only. |

## Bottom line
The guard is **escalate-only as designed** — none of the findings show a NEW way to under-triage that isn't already backstopped by Gate-0/rulebook. Net actionable: (a) one safe lexicon hardening (tingling/paresthesia/heaviness), and (b) one clinical design question for Steve (guard scope vs ct-return/rounding + posterior-circulation sensitivity). The rest are false positives or over-triage-safe precision nits. Full raw review: scratchpad/review.txt (archived below).

---

## Raw reviewer output
**Adversarial Safety Review – “Stroke‑downgrade Guard”**  
*Focus: can a genuine acute stroke still be routed as **NON_EMERGENT / STAT‑2** ?*  

Below are every concrete weakness that could let a true stroke slip through, the severity of the resulting under‑triage, the exact caller‑phrase that would exploit it, and a minimal code‑change to close the gap.  If a component is already safe, that is noted in a one‑sentence comment.  

---

## 1.  `evaluateStrokeDowngradeGuard` – **STROKE_CONTEXT** regex is *not exhaustive*

| Severity | Issue | Example caller phrase that bypasses the guard | Why it bypasses | Fix (add to `STROKE_CONTEXT`) |
|----------|-------|-----------------------------------------------|-----------------|------------------------------|
| **Critical** | Posterior‑circulation symptoms not covered (vertigo, gait instability, diplopia, dysphagia, “severe headache”, “worst headache of my life”). | *“She’s suddenly dizzy and can’t walk straight – the nurse says she’s having a stroke.”* | No word from the current list (`stroke|weak|numb|paralys|hemipar|facial droop|droop|slur|aphasi|dysarthr|vision loss|field cut|neglect|ataxi|can’t move|can’t speak|can’t see|face is droop`) matches “dizzy”, “walk”, “diplopia”, “dysphagia”, “headache”. Guard never fires → the LLM could downgrade to STAT‑2 based on an ambiguous “a couple of days ago”. | ```ts\n+  // posterior‑circulation & hemorrhagic clues\n+  /\\b(?:vertigo|dizzy|dizziness|gait|unsteady|balance|walking|walk\\s+unstable|walking\\s+poorly|diplopia|double\\s+vision|blurred\\s+vision|vision\\s+disturb|dysphagia|trouble\\s+swallow|severe\\s+headache|worst\\s+headache|thunderclap\\s+headache)\\b/i,\n``` |
| **Critical** | “Tingling / pins‑and‑needles” (common hemiparesthesia) missing. | *“He has a tingling sensation on his right arm and leg.”* | “tingling” not in list → guard never sees stroke context. | ```ts\n+  /\\b(?:tingling|pins?\\s+and\\s+needles|pins?\\s+and\\s+needle|paresthesi[ae])\\b/i,\n``` |
| **Critical** | “Sudden loss of consciousness / LOC” that can be due to large‑vessel stroke not captured. | *“She collapsed and is now confused, we think it’s a stroke.”* | “collapsed” / “loss of consciousness” not in list; guard stays silent. | ```ts\n+  /\\b(?:collapse[d]?|lost\\s+consciousness|unresponsive|passed\\s+out)\\b/i,\n``` |

*Impact*: With any of the above phrases a real acute stroke can be classified as **NON_EMERGENT** because the guard does not recognize the case as “stroke‑context”. The downstream downgrade logic (LLM) then runs unchecked – a dangerous under‑triage.

---

## 2.  Guard **does NOT run for non‑emergent consult types other than `non‑emergent`**

`evaluateStrokeDowngradeGuard` returns early unless `consultType === 'non-emergent'`.  

| Severity | Issue | Example caller phrase that leads to mis‑classification | How it bypasses | Fix |
|----------|-------|--------------------------------------------------------|-----------------|-----|
| **Critical** | LLM may label a genuine acute stroke as `ct-return`, `rounding`, or `outpatient` (all non‑emergent types) when it mistakenly thinks imaging is already completed or the call is a follow‑up. The guard never examines these branches, so an acute stroke can be routed to a low‑priority queue. | *“We just got the CT results, they say there’s an occlusion, the patient is still weak on the right side.”* → LLM sets `consultType = CT_RETURN`. | Guard is bypassed because `consultType !== 'non-emergent'`. No safety veto. | Change the early‑exit condition to *any* consult type that is **not** `EMERGENT` **and** is not a clearly non‑stroke category (e.g., `ceribell-eeg`, `outpatient‑followup` that lack stroke signals). Simple fix:  

```ts
// before: if (consultType !== 'non-emergent') …
if (!['emergent', 'ct-return', 'rounding', 'ceribell-eeg', 'outpatient'].includes(consultType?.toLowerCase() || '')) {
  // still non‑emergent but could be a stroke mis‑routed → force escalation
}
```  

Or more robust: add a whitelist of *allowed* non‑emergent types (e.g., `ct-return` only when `STROKE_CONTEXT` **and** `!STABLE_SIGNAL`). If the stroke context is present but the stable signal is missing, force emergent.

---

## 3.  `STABLE_SIGNAL` regex is too narrow – may miss common phrasing of “no change”

| Severity | Issue | Example phrase that indicates stability but is missed | Result | Fix |
|----------|-------|------------------------------------------------------|--------|-----|
| **Medium** | Does not capture “unchanged” with a preceding “still”. | *“He’s still the same as yesterday, nothing new.”* | `STABLE_SIGNAL` fails → guard treats as “no confident stable >24 h”, forcing emergent (over‑triage – safe). | Add `/\bstill\s+the\s+same\b/` or broader `/\b(still|remains?)\s+(unchanged|the\s+same|as\s+before)\b/`. Over‑triage is safe, but expanding improves precision and keeps the guard from unnecessarily vetoing a legitimate sub‑acute downgrade. |

---

## 4.  `CONFIDENT_OVER_24H` regex misses common colloquials (“last week”, “a few days ago”, “several weeks”)  

| Severity | Issue | Example phrase that correctly signals > 24 h but is missed | Impact | Fix |
|----------|-------|-------------------------------------------------------------|--------|-----|
| **Medium** | No match for “last week”, “a few days ago”, “several days ago”. | *“It started last week and has been stable.”* | Guard thinks there is *no* confident >24 h onset → forces emergent (over‑triage). Safe, but reduces useful downgrades. | Expand regex:  

```ts
const CONFIDENT_OVER_24H = /(?:\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,3})\s+(?:days?|weeks?|months?)\b|\b(?:last|previous)\s+(?:week|month|day)\b|\b(?:a\s+few|several)\s+(?:days?|weeks?|months?)\b|\b(?:since|last)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)\b)/i;
```

---

## 5.  `GUARD_UNCERTAINTY` does **not** capture “I’m pretty sure it started …” (which is *not* uncertain) – **no safety impact**  

The guard only needs to *detect* uncertainty; missing a phrase that actually conveys certainty does not create a under‑triage risk. **Safe**.  

---

## 6.  Rule‑book wording – “KEEP EMERGENT … whenever ANY of these is true” – relies on the LLM to recognise the listed cues, but the guard only looks for a subset (uncertainty, fluctuation, wake‑up, worsening).  

| Severity | Issue | Example that satisfies rule‑book but not guard | Result |
|----------|-------|-----------------------------------------------|--------|
| **High** | “The family is *not* sure when it began, but they *think* it was three days ago.” The rule‑book says **any uncertainty → stay EMERGENT**. The guard’s `GUARD_UNCERTAINTY` captures “not sure” but may miss “think” when combined with a confident‑looking time. | LLM could downgrade because the time looks confident, while the guard sees no explicit uncertainty token → **stroke could be downgraded**. | Add a broader uncertainty pattern: `/\b(?:think|believe|guess|assume|suspect|imagine|feels? like)\b.*\b(?:started|began|occurred)\b/i` combined with hedging words. This ensures any *qualifier* before a time reference is caught. |

---

## 7.  Gate‑0 additions – new weakness patterns are good, but **still miss “right‑hand tingling”** and **“left‑leg heaviness”** (no “weakness” or “numbness”).  

| Severity | Issue | Example | Bypass | Fix |
|----------|-------|----------|--------|-----|
| **Critical** | No pattern for “tingling”, “pins‑and‑needles”, “heaviness”, “heavy”. | *“He feels a heaviness on his left leg.”* | Stroke context not detected → guard never runs. | Add to RED_FLAG_BANK patterns (see #1). |

---

# Summary of Action Items (ordered by risk)

| Priority | Code Location | Change |
|----------|---------------|--------|
| **Critical** | `redFlagGate.ts` → `STROKE_CONTEXT` | Append posterior‑circulation, dysphagia, diplopia, severe headache, tingling, heaviness, collapse, etc. |
| **Critical** | `redFlagGate.ts` → `evaluateStrokeDowngradeGuard` early‑exit | Replace `if (consultType !== 'non-emergent')` with a check that runs for **any** non‑emergent consult type that *could* be a stroke (e.g., `ct-return`, `rounding`). Force emergent when stroke context present but stable signal missing. |
| **High** | `redFlagGate.ts` → `GUARD_UNCERTAINTY` | Add qualifier pattern for “think/guess/believe … started …”. |
| **Medium** | `redFlagGate.ts` → `CONFIDENT_OVER_24H` | Expand to include “last week”, “a few days ago”, “several weeks”, etc. |
| **Medium** | `redFlagGate.ts` → `STABLE_SIGNAL` | Include “still the same”, “remains unchanged”. |
| **Low** | `redFlagGate.ts` → `STABLE_SIGNAL` / `GUARD_FLUCTUATION` | Add “back again” synonym already present; no change needed. |
| **Low** | Documentation / tests | Add unit‑tests for all new regexes, especially for wake‑up, worsening, and the new posterior‑circulation terms. |

---

### Bottom‑line

- **Current guard is *escalate‑only* in theory, but its scope is too narrow** (stroke‑context, consult‑type, and symptom coverage).  
- The two **critical** gaps above can let a genuine acute stroke be sent to the STAT‑2 queue without any safety veto.  
- Implement the fixes, run the new test suite, and the downgrade path will truly be **deterministic and safe**.