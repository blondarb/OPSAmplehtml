# Localizer / Differential Improver — Hardening Spec

**Date:** 2026-06-13
**Status:** Spec — not yet implemented
**Parent:** `2026-06-13-evidence-engine-strategy-and-moat.md`
**Owner:** TBD (candidate intern task: eval harness scaffold — Riya)

This is the "differential improver" / "AI Historian search engine" we discussed. It is the **highest-leverage** component because the same differential reasoning feeds: the live Historian interview (`/consult`), persisted consult records (`neurology_consults`), post-visit patient outreach, and the Reasoning/Exam Interpreter app.

---

## 1. The defect (Adam Cohen, Apr 24 2026 email)

> *"Consider offering a probability ranking to help the user consider what is more or less common. I tried a sample B12 deficiency set of the symptoms (memory loss, increased DTRs, vibration loss) for the Exam Interpreter and it struggled a bit not offering a diffuse but multifocal white matter issue. It sort of got it. Then B12 deficiency was in there but lower on the DDx."*

Symptoms = memory loss + increased DTRs + vibration loss = **classic subacute combined degeneration (B12)**. Two failures:
1. **Localization** was weak (didn't cleanly name the dorsal-column + corticospinal pattern).
2. **B12 ranked too low** despite being genuinely high-likelihood for that exact triad.
3. **No probability/commonness calibration** shown to the user.

## 2. Root cause (current prompt design)

In `src/app/api/ai/historian/localizer/route.ts`, `QUESTION_GENERATOR_PROMPT` optimizes for **likelihood only**:
- *"Base likelihood on what the patient has reported — not on general prevalence."*
- *"List 2–4 candidate diagnoses, most likely first."*
- *"Prioritize questions that would distinguish between the top 2 differential diagnoses."*

Problems:
- **No "can't-miss / reversible" axis.** Treatable mimics (B12, folate, copper, thyroid, NPH, Wernicke, GPA/vasculitis, GBS, temporal arteritis, CO) are never elevated for safety reasons.
- **No localization-first step.** Differential is generated without an explicit neuroanatomical localization, so syndrome-defining patterns (SCD) don't anchor the DDx.
- **No commonness calibration.** Adam's "probability ranking" ask is unmet.
- **Extract-only-stated** (`SYMPTOM_EXTRACTOR_PROMPT`: *"Extract only what the patient has explicitly stated — do not infer"*) means risk factors that were never *asked* (diet/vegan, metformin, PPIs, alcohol, N₂O/"whippets", pernicious anemia) never enter the pipeline, so B12 risk is invisible.

## 3. The fix: dual-axis differential + localization-first

### 3a. Add an explicit localization step
Between symptom extraction and differential generation, generate a **localization hypothesis** (level: cortical / subcortical white matter / dorsal column / anterior horn / root / plexus / nerve / NMJ / muscle; laterality; distribution). Feed it into the differential prompt as an anchor. This directly addresses failure (1).

### 3b. Dual-axis ranking
Return **two ordered lists**, not one:
- `likelihood_ranked` — most probable first, *with a commonness tag* (`common | uncommon | rare`) to satisfy Adam's probability-ranking ask.
- `cant_miss` — reversible/dangerous diagnoses that must be considered even if not most likely, each with the **screening test** that rules it in/out (e.g., B12 → "B12 + MMA + homocysteine").

A diagnosis can appear in both (B12 in the SCD vignette should be high on *both*).

### 3c. Reversible-cause knowledge table (the small specialized DB / moat)
New Postgres table `reversible_cause_map` (curated, ~dozens of rows), keyed by presenting syndrome:

```
syndrome           | cant_miss_dx        | red_flag_features                          | screening_workup
-------------------+---------------------+--------------------------------------------+-----------------------------
myelopathy/SCD     | B12 deficiency      | ↑DTRs, vibration/proprioception loss, memory | B12, MMA, homocysteine, copper
neuropathy         | B12, folate, copper | length-dependent, gait                      | B12, MMA, folate, copper, TSH, A1c, SPEP
cognitive/dementia | B12, thyroid, NPH   | gait apraxia + incontinence (NPH triad)     | B12, TSH, RPR, NPH protocol MRI
...
```

The localizer joins on the localization/syndrome and **injects the matching can't-miss rows** into the differential prompt. This is grounding-by-injection from a *verified* table — not vector RAG — and it's the proprietary asset a generic agent lacks.

### 3d. Screening-question coverage
When a can't-miss row matches, the localizer must emit at least one `followUpQuestion` probing its risk factors (closing the extract-only-stated gap).

### 3e. Guard against over-firing
`cant_miss` must be **syndrome-appropriate**, not a blanket zebra list. The eval scores **both** sensitivity (catch B12 in the SCD vignette) and specificity (do **not** recommend a paraneoplastic panel for a clean tension headache).

## 4. Eval harness (build this FIRST)

`qa/localizer-evals/` — vignette-driven regression + scoring. This is the instrument that also answers the KB-vs-frontier question (run the same vignettes through current KB-RAG vs plan/table-injection vs bare Opus 4.8).

**Vignette schema:**
```json
{
  "id": "scd-b12-001",
  "source": "Adam Cohen, 2026-04-24",
  "input": { "transcript": [...], "exam": "memory loss, increased DTRs, vibration loss" },
  "gold": {
    "localization": ["dorsal columns", "corticospinal tract"],
    "must_include_dx": ["B12 deficiency / subacute combined degeneration"],
    "must_rank_top_n": { "dx": "B12 deficiency", "n": 3 },
    "must_screen": ["B12", "MMA"],
    "must_not_include": []
  }
}
```

**Seed set (~10–12 can't-miss vignettes):** B12/SCD (#1), NPH, Wernicke, hypothyroid dementia, GBS, temporal arteritis, CO poisoning, copper deficiency myelopathy, vasculitic neuropathy, CNS vasculitis, plus 2–3 **negative controls** (clean migraine, clean BPPV) for specificity.

**Scoring (doc-in-the-loop, per Adam's V&V):** automated checks (localization match, dx present, rank ≤ N, screening present, no over-firing) **plus** a clinician Likert pass (1–5) on differential quality. Track a baseline, then measure every prompt change against it.

## 5. Rollout

1. Build `qa/localizer-evals/` + B12 seed + runner. Get baseline miss-rate.
2. Add `reversible_cause_map` table + seed (migration).
3. Localization-first step + dual-axis prompt rewrite.
4. Wire table injection into the localizer; add screening-question rule.
5. Re-run evals; require B12 in top-3 + B12/MMA screening + no negative-control over-firing before merge.
6. Reconcile the 15 s vs "2 s" timeout comment while in the file.

## 6. Hot-revert

Gate behind `LOCALIZER_DUAL_AXIS=true` so we can fall back to single-axis without a deploy if latency or over-firing regresses.
