# Demo Smoke Test — AI Historian + AI Triage

**For:** Riya
**Date requested:** 2026-06-26
**Why:** Steve may run a live demo on **Monday**. We need to confirm the two patient-journey AI tools actually work end-to-end on production — especially the **Historian voice conversation** and **Triage processing speed** on artificial notes.
**Time needed:** ~1–2 hours
**Site:** https://app.neuroplans.app  (no login required for these two pages)
**Browser:** Chrome on a laptop with a **working microphone** (the Historian is voice-only)

---

## What's already been checked (by automation)

- **Triage** runs end-to-end and returns a correct, well-structured result. ✅
- **Historian** page loads, scenarios select, and the backend session starts (`POST /api/ai/historian/session` → 200), then shows **"Connecting…"** — but the actual **voice conversation could not be tested** because automation has no microphone and can't speak. **That's the part we need you for.**

So focus your time on: **(1) the Historian voice round-trip**, and **(2) Triage speed.**

---

## Test 1 — AI Historian (voice interview)  ← highest priority

1. Go to **https://app.neuroplans.app/patient/historian**
2. Select **"New Patient: Headache Referral"**, click **Start Voice Interview**, and **Allow** the microphone prompt.
3. Wait through "Connecting…". **Note how long it takes** to start (seconds).
4. Have a normal spoken conversation as if you were the patient with headaches. Answer its questions out loud.

**Record for each of these — Pass / Fail + notes:**

| Check | Pass? | Notes (timing, what broke) |
|---|---|---|
| Did it get past "Connecting…" and actually start? | | |
| Did the AI **speak** a greeting/first question? | | |
| Did it **hear you** and respond on-topic? | | |
| Did it work through a real headache history (location, onset, triggers, etc.)? | | |
| Audio quality — any cut-outs, long dead air, talking over you? | | |
| Did it end cleanly / produce any summary? | | |

5. **Repeat once** with **"Follow-Up: Migraine Management"** to see if a second scenario behaves the same.

> If it **never gets past "Connecting…"**, that's the key failure — note how long you waited, what the mic permission did, and grab a screenshot. Open the browser console (F12 → Console) and screenshot any red errors.

---

## Test 2 — AI Triage (speed on artificial notes)  ← Steve specifically wants this fast

1. Go to **https://app.neuroplans.app/triage**
2. Click **Load Sample** → pick a sample, then **Triage This Patient**. **Time it** from click to result appearing.
3. Then paste your **own artificial/made-up referral note** (a few sentences — e.g. a headache or numbness referral), click **Triage This Patient**, and **time it again**.
4. Try **2–3 different artificial notes** of varying length.

**Record:**

| Note | Length | Time to result (sec) | Result tier | Made sense? |
|---|---|---|---|---|
| Sample | short | | | |
| Your note 1 | | | | |
| Your note 2 | | | | |

> Heads-up: in our automated run, triage took **~50–60 seconds** to return. Steve wants this **quick** for the demo, so timing is the main thing to capture here. Flag anything that takes much longer, errors out, or returns a result that doesn't fit the note.

---

## How to report back

Reply to Steve on Slack (or drop a copy in this file / `qa/runs/`) with:
- The two tables above filled in.
- Any screenshots of errors or stuck screens (especially the Historian "Connecting…" hang and any red console errors).
- Your one-line gut read: **"demo-ready" / "demo-ready with caveats" / "not yet"** for each tool.

Thanks! This directly de-risks Monday's demo.

---

## For next week — triage algorithm + latency tune-up (Riya)

Context: the triage scoring algorithm was built against older AI Scribe versions and hasn't been revisited. While you're checking whether it's still current, two latency levers are worth folding in (the single Bedrock call generating ~2,000–2,500 output tokens is ~80% of the wait):

- **Already shipped (Steve, 2026-06-26):** prompt caching on the static triage system prompt + faster client poll interval (1.5s → 1s). These help repeated/back-to-back runs and perceived speed but don't change the algorithm.
- **#4 — Trim output verbosity (biggest single win, needs your validation).** The system prompt (`src/lib/triage/systemPrompt.ts`, ~21KB) asks for long per-dimension justifications + long workup/red-flag lists. Tightening these (e.g. ≤1 sentence per dimension, cap lists) roughly **halves** generation time. Must be re-run against `qa/TEST_CASES.yaml` so scoring consistency (currently ~99%) doesn't regress.
- **#5 — Model A/B (free, no code change).** There's an env override `BEDROCK_TRIAGE_MODEL` (default = Sonnet 4.6). Point a preview at **Haiku 4.5** and time it against the test cases — Haiku is ~2–3× faster. *Caveat:* triage is clinical-safety and Haiku is weaker on clinical nuance, so treat this as a measured A/B, not a swap. Capture both **speed and accuracy** vs. Sonnet before deciding.

Relevant files: `src/lib/triage/systemPrompt.ts` (prompt), `src/lib/triage/scoring.ts` (deterministic tier logic), `src/app/api/triage/route.ts` (the call), `qa/TEST_CASES.yaml` (validation set).
