# Evidence Engine — Strategy & Moat (post–*Nature* 2026)

**Date:** 2026-06-13
**Author:** Steve Arbogast (w/ Claude)
**Status:** Strategy memo — drives the two companion specs below
**Companion docs:**
- `2026-06-13-localizer-differential-hardening-spec.md` (the differential improver + B12 fix + eval harness)
- `2026-06-13-clinical-plans-hardening-plan.md` (hardening the ~360 recommendations)

---

## 1. The trigger

*Nature Medicine* (2026), **"General-purpose large language models outperform specialized clinical AI tools on medical benchmarks"** (s41591-026-04431-5) pitted two commercial specialized clinical AI products (**OpenEvidence**, **UpToDate Expert AI**) against three frontier models (GPT-5.2, Gemini 3.1 Pro, Claude Opus 4.6) on MedQA, HealthBench, and a real-clinical-query benchmark. **Frontier models won all three.** The authors' own caveat is the load-bearing part: *benchmark wins do not confirm deployment safety, patient outcomes, or regulatory/liability standing.*

**The question it raises for us:** is the Sevaro Evidence Engine — a repo of specialized neurologic knowledge — a waste of time?

## 2. The honest answer: it depends which half you mean

The "Evidence Engine" is really **two different things wearing one name**:

| Layer | What it is | Verdict under *Nature* |
|---|---|---|
| **A. Knowledge corpus (RAG)** | Bedrock Knowledge Base over AAN/AHA/IHS guideline PDFs (OpenSearch Serverless + Titan v2 embeddings, Sonnet 4.6 synthesis). Env `BEDROCK_KB_ID`. | **Threatened.** This is exactly the "curated corpus to make the model know neurology" the paper shows a frontier model already matches. It also carries a standing OpenSearch Serverless cost (~$300–700/mo) regardless of query volume. |
| **B. Structured, authored assets** | The ~360 clinical plans (ICD-10–matched, with dosing + `evidence[]` provenance), the localization logic, the scale library + condition→scale mapping, the formulary, triage calibration, and our own doc-in-the-loop feedback. | **Defensible — and *more* valuable as base models improve.** A frontier model cannot produce these on demand: they are verified, structured, proprietary, and auditable. |

**Bottom line: validate, don't scrap.** The paper is an argument to *build the measurement instrument we don't yet have* — not to delete code. We make the keep/cut decision per-layer, with data.

## 3. The moat thesis: small, verified, proprietary > big, generic, scraped

A bare "wrapped voice agent" on a frontier model gives any competitor 90% of the *conversational* capability for free. Our durable edge is **not** knowledge — it's the things the model has no access to:

1. **Verified clinical plans** — our authored protocols with dosing, contraindications, monitoring, and *checked* citations. (See plans-hardening doc.)
2. **A can't-miss / reversible-cause knowledge table**, keyed by presenting syndrome — the structured safety net that directly fixes the B12 miss. Small (dozens of rows), high-signal, curatable, and exactly what a generic agent lacks. (See localizer doc.)
3. **A localization map** — symptom/sign → neuroanatomical localization → lesion pattern. This is the specific reasoning Adam flagged as weak ("not offering a diffuse but multifocal white matter issue").
4. **Scale library + condition→scale mapping** — voice-administrable, single-item-paced, scored.
5. **Sevaro-proprietary signal** — triage scoring calibration, doc-in-the-loop validation labels (Likert/thumbs), formulary preferences, practice patterns. This compounds and is impossible to copy.

These are **small specialized databases**, not a giant corpus. That's the point: they're cheap to host (Postgres, not a vector cluster), fast, deterministic, verifiable, and ours.

## 4. The operating principle: Doc-in-the-loop V&V (Adam Cohen)

In his Apr 24, 2026 "Re: Next steps" email, Adam framed the discipline we should adopt before scaling anything:

> *"The more we have an approach to Verification & Validation (V&V) for every new AI and tech tool, the better… Verification is 'did we build what we intended?' Validation is 'does it work?'… we'll want our docs-in-the-loop for most referring- and patient-facing genAI apps we launch. Thus, we'll have them Likert-scale score or thumbs up/down each output for our simple initial validation."*

This is the backbone for everything that follows: **every hardening step is measured by a doc-in-the-loop rubric, not vibes.**

## 5. What this means concretely (sequenced)

1. **Build the eval harness first** (localizer doc §Eval). It's the single instrument that answers all three questions: localizer quality, plan quality, and "is the RAG KB worth keeping vs. a direct frontier-model call?" Seed it with the **B12 vignette** as regression test #1.
2. **Instrument the KB** — measure real query volume and the OpenSearch standing cost. If volume is low (likely), replace the KB's role in the localizer with **plan/formulary/localization-table injection** (cheaper, faster, auditable) rather than deleting blind.
3. **Harden the ~360 plans** (plans doc) — citation verification + doc-in-the-loop scoring. This converts "AI-generated, grounded as best we could" into trustworthy ground truth.
4. **Fix the differential improver** (localizer doc) — dual-axis ranking (likelihood **and** can't-miss/reversible) + probability calibration, per Adam.
5. **Tiered model routing** — Sonnet 4.6 for voice/synthesis (latency-critical); Opus 4.8 + moderate reasoning reserved for hard differentials only (reasoning adds latency — it is *not* automatically faster).

## 6. Open risks / things to verify

- **Plan store drift:** `sync-plans.ts` writes to **Supabase**; `/api/plans` reads via **node-postgres** (`from('clinical_plans')`). Confirm these point at the same database before making plans the primary grounding layer.
- **Stale localizer timeout:** code uses a 15 s `AbortController` while comments say "2-second." Reconcile when touched — 15 s on a path that fires every 3 turns of a live voice interview is a latency risk.
- **Opus 4.8 on Bedrock:** confirm region availability before routing any path to it; everything currently goes through Bedrock.

## 7. Surfaces in scope (per Adam's app walkthrough)

evidence.neuroplans.app / app.neuroplans.app apps: **Oncall**, **Reasoning (Exam Interpreter)**, **Neuroscribe**, **Neuroplan**, **NeuroCalculators**, **Exams**, **Neuro Pulse**, **Benchmarks**. The differential work centers on **Reasoning/Exam Interpreter** and the embedded **Historian Localizer**; the plans work centers on **Neuroplan**.
