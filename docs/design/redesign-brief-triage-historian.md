# Redesign brief — /triage and /patient/historian

Repo: `blondarb/OPSAmplehtml` · AWS Amplify (`main.d3ietjwgco4g2t.amplifyapp.com` → `app.neuroplans.app`)
Targets: `app.neuroplans.app/triage` and `app.neuroplans.app/patient/historian`

**Context you need:** these two pages are being shown to Mayo Clinic on Aug 7, 2026 and to
Novant Health on Aug 12. They are the two products in Sevaro's outpatient QI track. They must
read as clinical instruments, not as internal demos. Today they read as internal demos.

Do the correctness fixes in Part 1 before the visual work in Parts 2–4. One of them is a
claim the live page makes that Sevaro's own engineering notes contradict.

---

## PART 1 — Correctness fixes (do these first, they are not cosmetic)

### 1.1 `/triage` claims determinism it does not have

The page currently describes its output as a **"deterministic triage tier assignment."**
Sevaro's internal record contradicts this directly: the engine is documented as
*"NONDETERMINISTIC on borderline notes even at temp-0 (same note → hold/urgent/hold)."*

Remove the word "deterministic" everywhere it appears in the UI. Replace the claim with an
accurate description of what is actually deterministic — the **rubric** is fixed and
inspectable (five dimensions, fixed weights 30/25/20/15/10, seven tiers), even though the
model's reading of a borderline note may vary.

Suggested replacement copy:

> Fixed five-dimension rubric with published weights. Borderline notes may score differently
> across runs; tier boundaries and red-flag overrides do not.

Do not silently delete the caveat — surface it. An academic partner reading an honest
limitation trusts the rest of the page more, not less.

### 1.2 `/patient/historian` has no consent and no identity verification

The Mayo deck claims this tool performs **"IDENTITY VALIDATION — Patient/caregiver confirms
full name + date of birth before intake begins."** The live page has no such step. It also
requests microphone access with no consent language at all.

Add a gate before the microphone is requested, containing:

- Plain-language explanation that an AI will conduct the interview and it is recorded
- Explicit consent control the user must actively select (not pre-checked)
- Identity confirmation: full name + date of birth, before any clinical question is asked
- A visible statement that this is **not** for emergencies, with a direct instruction to call
  911 or go to an ED for stroke symptoms, seizure, thunderclap headache, or new weakness
- A statement that the output is a draft reviewed by a clinician and is not a diagnosis

This is a partner-facing safety requirement, not a nicety. Sevaro's own safety document
(SAFE-1, SAFE-2) records these as agreed but never specified or built.

### 1.3 Remove developer scaffolding from both pages

`/triage` currently exposes a **"Testing Guide & What's Next"** section with links to GitHub
PRs. Move all of it behind an internal-only route or remove it. Same for anything else that
reads as build state rather than product.

Also retitle: **"AI Triage Tool Demo"** → **"Neuro Navigator"**. That name is being
standardized across all Sevaro surfaces; the tool currently appears under three different
names ("Neuro Navigator", "AI Referral Triage", "Smart Referral Routing"). Use Neuro
Navigator everywhere.

### 1.4 Input hardening on `/triage`

The paste field currently accepts up to 5,000,000 characters. Cap it at something defensible
(50,000 is generous for a referral packet), show a character counter, and reject oversized
PDF uploads client-side with a clear message rather than failing at the model call.

---

## PART 2 — Shared design system (build once, apply to both)

Right now the two pages do not look like one product. Define a single token set in one place
and import it into both.

**Palette.** Neutral, clinical, low-chroma. One accent used sparingly.

- Surface: near-white, not pure white. Cards a half-step off the page background.
- Text: near-black at high contrast; a secondary grey for supporting copy; a tertiary for metadata.
- One brand accent, used only for primary actions and active states — never for decoration.
- Semantic set for urgency tiers, ordered and perceptually distinct. Must remain
  distinguishable in grayscale and for the common color-vision deficiencies — tier is
  clinical information, so it cannot rely on hue alone. Pair every tier color with a text
  label and a distinct shape or weight.

**Type.** One family, system stack is fine. A tight scale — no more than five sizes. Generous
line height on body copy. Numerals tabular wherever scores or tiers are displayed.

**Elevation.** Hairline borders and generous whitespace. No drop shadows, no gradients, no
glassmorphism. Clinical software that looks like a consumer app reads as unserious to a
governance committee.

**Density.** Comfortable, not cramped and not airy. This is a tool someone uses forty times a
day, not a landing page.

Meet WCAG 2.1 AA contrast throughout. Full keyboard operability, visible focus rings, correct
labels and ARIA on every control. A health system will check this.

---

## PART 3 — `/triage` (Neuro Navigator)

**The job of this page:** paste a referral note, get a defensible tier back, understand why.

**Layout.** Two panes on desktop, stacked on mobile. Input left, result right. The result
should appear beside the input, not replace it — a clinician needs to see the note and the
reasoning together.

**Input pane.**
- One large, obvious textarea. This is the primary action; it should dominate.
- Sample cases as one-click fill chips directly under it, labeled by presentation
  (e.g. "Thunderclap headache", "Progressive weakness", "Stable migraine follow-up",
  "Insufficient information"). Include one that returns INSUFFICIENT DATA — showing the tool
  declining to guess is a strong demo moment.
- File upload as a secondary, smaller affordance beneath the textarea.
- Single primary button: **Triage**.

**Result pane.**
- Tier as the largest element, with its timeframe beside it (e.g. `URGENT · within 1 week`).
- Immediately below: the five dimension scores with their weights visible. This is the
  credibility of the whole product — a committee needs to see it is a rubric, not a black box.
  A simple labeled bar per dimension, tabular numerals, weight shown as a small superscript
  or trailing label.
- Red-flag overrides shown distinctly and above the score breakdown when they fire, because
  they supersede the score.
- Recommended subspecialist, and the 0–3 workup items to start while the patient waits.
- The stability caveat from §1.1, in a quiet but visible position.
- Copy and download actions on the result.

**Emergency path.** When the tier is EMERGENT, the result should visually take over — this is
the one place where a strong, unmissable treatment is correct. Direct instruction to redirect
to the ED, not a subtle tier chip.

**Latency.** The model call runs 50–60 seconds. Do not leave a dead button. Show a progress
state with the actual stages ("Reading referral… scoring dimensions… checking red flags…").
If streaming is available from the Bedrock call, stream. Sixty seconds of nothing in front of
Mayo is worse than any styling problem on this page.

---

## PART 4 — `/patient/historian`

**The job of this page:** a patient, possibly elderly, possibly unwell, completes a voice
interview without help.

**Assume the hardest user.** Large type, high contrast, very large touch targets, minimal
choice. This should look closer to a well-designed government service page than to a product
landing page.

**Flow.** Consent and identity (from §1.2) → scenario or visit context → interview → summary.
One screen per step, one primary action per screen, a visible step indicator.

**During the interview.**
- Show the current question as text at all times. Voice-only excludes anyone hard of hearing
  and anyone in a noisy room.
- Live transcript of what the system heard, so the patient can see if they were misunderstood.
- An obvious way to repeat a question, correct an answer, pause, and stop entirely.
- Clear microphone state — listening vs processing vs speaking must be unmistakable.
- Progress against the ~23-question cap.

**At the end.** Show the patient a plain-language summary of what was captured and let them
correct it before submission. Do not show the working diagnosis or differential to the
patient — that goes to the clinician, and showing it to the patient turns a draft into an
apparent diagnosis.

**Engine selector.** The current voice-engine dropdown (OpenAI / Nova Sonic) is a developer
control on a patient-facing page. Move it behind an internal route or a query parameter.

---

## Constraints

- **Synthetic data only.** Every sample and scenario must be obviously fictional. No real
  notes, no real identifiers, nothing resembling a real patient.
- **Do not change the triage logic**, the five-dimension rubric, the weights, the tier
  thresholds, or the red-flag override behavior. This is a presentation-layer change.
- **Preserve human-in-the-loop-by-exception**: clean confident referrals route through; only
  red flags, low confidence, borderline tiers, and too-thin referrals surface to a physician.
- Neither OpenAI nor the Nova path is under a Sevaro BAA. Nothing in this work may create a
  path for real PHI to enter either page.
- Both pages currently sit in `PUBLIC_ROUTES` with no authentication and no audit logging.
  That is being handled separately as a program-level security gate — **do not** consider it
  solved by this work, and do not add anything that assumes an authenticated user exists.
- Both must render well on a laptop screen shared over Microsoft Teams.

## Definition of done

1. No claim on either page contradicts Sevaro's internal engineering record.
2. Both pages share one visible design system.
3. `/triage` shows the rubric, not just the answer.
4. `/patient/historian` cannot start recording before consent and identity confirmation.
5. No developer scaffolding, GitHub links, or engine selectors visible to an external viewer.
6. WCAG 2.1 AA on both.
