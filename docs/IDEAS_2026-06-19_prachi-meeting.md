# Outpatient Product Ideas — Steve / Prachi Strategy Meeting (2026-06-19)

> **Source:** ~2-hour Steve Arbogast & Prachi Apostolos strategy call, 2026-06-19. Idea
> capture only — not yet specced or committed. Uncertain names/terms marked `[?]`.
> Reconstructed from an on-device transcript; substance is high-confidence (~85%).
> These map to the existing `/triage`, `/consult` (AI Historian), and outpatient strategy
> surfaces in this repo.

---

## 1. Triage tool — referral-source-driven OP triage

Refines the existing `/triage` route. Key product decisions from the meeting:

- **Referral-source driven, NOT patient-direct.** Ingests documentation / notes / diagnostic
  testing (PDF or free text) sent *from a referral source*, not entered by the patient.
- **LLM + Sevaro's own urgency algorithm.** LLM processing combined with Sevaro's proprietary
  urgency-tiering algorithm: hyper-emergent (ER) → … → can-wait-6-months, with **adjustable
  time scales** based on each system's access and available service lines.
- **Outputs (the triage product):** *who* should see the patient, *how rapidly*, *what to do
  in the interim* (e.g., order MRI/EMG if not yet done), plus suggestions back to the
  referring provider.
- **Informs / prioritizes — does NOT schedule.** Schedulers act on the output and report back
  to the referral source. (Deliberate scope boundary: this is a prioritization tool, not a
  scheduling system.)
- **~2-day turnaround end-to-end**; the triage compute itself is ~60 sec (maybe 2 min —
  "essentially instant"). [?] The "<60 sec" claim is to be time-validated (see action items).
- **Customizable per health system.** The algorithm maps to that system's *actual* resources —
  e.g., Mayo's ~100 neurologists/subspecialists vs. Billings Clinic's single general
  neurologist. It needs to know the named specialists ("Bob/Joe/Sally are the headache
  specialists") to route specifically. Adding resources = adding tools the algorithm can use.
  *Current state only outputs a generic role (e.g., "headache specialist").*
- **Scaling thesis:** prove it in **neurology first**, then the algorithm/prompt-building
  compresses → faster validation for other **referral-heavy specialties** (rheumatology, ID,
  etc.); validate with each specialty's own experts.
- **Labor-force re-modeling (Prachi):** substitutes for **triage-nurse / coordinator
  workflows**; re-models coordinators / navigators away from data-mining in Epic toward
  programmatic development. (Compared to a "HIMS [?]" data tool from last year; cited as why
  Prachi valued Sevaro's tech when leaving Endeavor `[?]`.)
- **Built-in safety — "panic words":** red-flag safety comes from the algorithm's built-in
  flags (e.g., "right-sided weakness × 2 days → go to ED, don't pass go"). Prachi: build
  **neuro-specific "panic words."**

---

## 2. "AI Historian" — pre-visit history + auto-differential

Refines the existing `/consult` AI Historian. Key product decisions from the meeting:

- **OLD CARTS history + auto-differential.** Structured symptom history (OLD CARTS) plus an
  automatically generated differential.
- **Clinician-only summary.** Generates a clinician-facing summary; does **NOT** reveal the
  differential / its reasoning to the patient.
- **EHR-populating.** Writes into the chart (e.g., "AI historian interview completed — please
  review").
- **Patient-priming.** Primes the patient ahead of the visit. (A clinician — Michael Perfetti
  / "Pravetti" `[?]` — specifically valued this priming effect.)
- **Collapses history-taking → shorter visits → higher throughput.** Removes the 20–30 min of
  history-gathering so visits run **15–20 min**, letting a physician see **~2 patients in the
  slot instead of 1** (the patient-scheduled time is unchanged; the *ratio* changes). Better
  fidelity than MA/RN intake. **Do not downscale MAs** — the MA still gathers the base history
  + med rec; the historian *supplements*.
- **Intake modes:** pre-visit (~1 week ahead via phone/text), OR in-room pre-visit (~5 min, MA
  supervises), OR fed by the referral. Summary generated in ~1–2 min.
- **Phase 1A — commercial self-scheduling pathway (Prachi's add):** commercial-insurance
  patients can self-refer (no referral note). The historian acts as its own light triage.
  **Low-risk, fast-validation wedge** (non-emergent) → validate in a couple of months.
  Red-flag safety reuses the triage algorithm's built-in flags / "panic words."

---

## 3. Strategy deck (the "primary"/master OP-strategy deck)

- **Status:** draft ~**0.01**, ~**25 pages**, currently **overbuilt** (both Steve and Prachi
  agree). Won't be finalized for a few weeks, pending dialogue with **Adam & Chauncey** `[?]`.
- **Prachi is trimming it** toward: **exec summary** → current state → **clinical gap
  analysis** → **competitive landscape (Teladoc, Abridge)** → **maturity stage / revenue /
  path-to-market** → **blockers** → vision & investment (for investor conversations) →
  inpatient/outpatient tool placeholders → active health-system targets → audience / sell /
  partnership style → risks & mitigation → KPIs/reporting → **governance** → appendix
  (who's-doing-what).
- **The post-stroke 90-day pilot spins out to its own deck** (removed from the master deck).
- Per-tool operational care-model detail moves to the **respective tech decks**, not the
  master deck.
- Prachi did the backend **competitive research**. Path-to-market is "exactly what Erin &
  Becky `[?]` asked about."

---

## 4. Customers / BD pipeline

- **Marshall Medical** — live during the meeting (Raj texted Steve mid-call). Wants the
  **outpatient-model video** + a written overview; key question: **"how can we integrate a
  local neurologist into the program?"** Raj is pushing them forward; Prachi sent the proposal
  and a first-draft Marshall document.
- **Kaiser** — wanted/were told Sevaro would provide **virtual locums** (a doctor on video
  using Sevaro's system, ~6–12 mo, working from home). Steve's example of the "boring but
  tradeable" outpatient baseline (~35–50% markup service line) — sells the service; the tech
  is the moat / funding story.

---

## Cross-cutting framing (from the meeting)

- Raj's stance (per Steve): **"not going into anything that doesn't involve the tech — that's
  where the money is."** Outpatient services sell the service line; the tech (triage,
  historian, SDNE/SENSE) is the moat and the investor story.
- Both **aligned** that the **triage tool** and **AI historian** are the right early, low-risk
  bets (fast validation).
