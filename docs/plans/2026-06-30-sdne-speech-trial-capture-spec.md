# Spec: SDNE Headset Speech Capture + Multi-Engine Bake-off (cross-repo)

## Document Information

| Field | Value |
|-------|-------|
| Type | Cross-repo spec (SDNE headset side + Sevaro analysis side) |
| Created | 2026-06-30 |
| Status | Proposed — headset capture is SDNE-repo work; the analysis harness is built in this repo |
| Owner | Sevaro / SDNE (same team) |
| Related | `docs/plans/2026-06-30-acoustic-speech-biomarkers-spec.md`, `docs/PRD_SDNE_Integration.md` |

> This spec spans two repos. The **capture** side (recording audio + tasks on the Samsung XR
> headset) is work for the **SDNE repo** (`sense.neuroplans.app`). The **analysis** side (multi-engine
> scoring + agreement/reproducibility stats) is **already built in this repo** — see "What exists"
> below. Nothing here runs on the headset until the SDNE build ships it.

---

## Goal

Add acoustic speech biomarkers to the SENSE (SDNE Core-15) exam as a **Speech/Bulbar** capability,
and run **normalization + reproducibility trials** to decide (a) which analysis engine we standardize
on and (b) which features are stable enough to threshold. Riya + Steven drive the trials.

Guiding principle (per the 2026-06-30 decision): **capture once, score with every engine, decide
later.** Do NOT re-record to compare engines — archive the raw audio and fan it out to all engines.
Re-record only *deliberately*, for test-retest reliability.

---

## Two axes (keep them separate)

| Axis | Question | Method |
|------|----------|--------|
| **Engine** | Which engine is best (pure-TS vs Praat/Parselmouth vs openSMILE/DisVoice)? | Score the **same** recording with **all** engines. Never re-record. Compare with ICC + Bland–Altman. |
| **Reliability** | Is our capture reproducible? | **Deliberately repeat** captures (test-retest): N reps × ≥2 sessions × ≥2 headsets. Compare with test-retest ICC + within-subject CV. |

---

## Capture requirements (SDNE headset side)

The head-mic is a reproducibility **advantage** (fixed mic-to-mouth geometry, identical hardware every
session) — but only if capture is locked down:

1. **Lossless audio.** WAV/PCM (or FLAC) at **44.1 or 48 kHz**, mono. **No Opus/AAC/MP3** — lossy
   codecs smear jitter/shimmer/HNR, the exact features we're measuring. (The web-app demo records
   Opus@16 kHz — that is NOT trial-grade; the headset path must capture lossless.)
2. **Fixed input gain, AGC/echo-cancel/noise-suppression OFF.** Any auto-gain destroys loudness,
   shimmer, and decay measurements. Lock the mic path.
3. **Calibration tone.** Emit a known-level reference tone per session so absolute loudness is
   comparable across sessions/devices.
4. **Metadata per recording** (JSON sidecar): `subjectId`, `profile` (if a labeled trial), `task`,
   `rep`, `sessionId`, `headsetId`, `micId`, `sampleRate`, `bitDepth`, `gain`, `roomNoiseFloorDb`,
   `calibrationToneDbfs`, `examiner`, `timestamp`.

## Task battery

| Task | Status in SDNE | Captures |
|------|----------------|----------|
| **Pa-Ta-Ka (DDK)** | **Exists — T08** (`sdneTypes.ts`) | Add raw-audio capture + upload; today it flags without exposing acoustics. |
| **Sustained /a/** | New | Phonation stability, tremor, jitter/shimmer/HNR, max phonation time. |
| **Reading passage** | New | Loudness + decay (hypophonia), monopitch, rate, pauses. |

## Upload + scoring contract

1. Headset uploads, per recording: the **lossless audio** + the **metadata JSON** to a backend
   endpoint (BAA-covered storage — voice is PHI; encrypt at rest, keep the raw audio as the archival
   source of truth).
2. Backend **scores with all engines simultaneously** — this repo's `scoreAllEngines()` fans out to
   the pure-TS engine (in-process) and the Praat/Parselmouth sidecar (`VOICE_PRAAT_URL`) in parallel,
   returning every engine's full feature map tagged `engine + version`.
3. Backend stores **every engine's** feature vector (not just the winner) keyed by
   `(subjectId, task, rep, engine, version)`.
4. For the **live SENSE exam** (post-trials), the backend rolls the chosen engine's flags into a
   **Speech/Bulbar** domain and emits it in the existing SDNE `domain_flags` payload — this app's
   `/sdne` page already renders whatever domains SDNE sends (`src/app/sdne/page.tsx`), so surfacing it
   is additive.

### Proposed `Speech`/`Bulbar` domain shape (fits existing SDNE types)
Add `'Speech'` to `SDNEDomain` (or fold into the existing `'Facial'`/Bulbar domain) and emit task
results (`T08` + new sustained-vowel/reading tasks) with the acoustic metrics under
`SDNETaskResult.metrics`. No change needed to this app's renderer beyond a label.

---

## Reproducibility trial design (Riya + Steven)

- **Subjects:** start with the labeled profiles (James Morrison=PD, Eleanor Wright=ET, Maria
  Santos=normal), expand to a normative cohort.
- **Reps:** ≥3 per task per session.
- **Sessions:** ≥2 (different days) to capture day-to-day variance.
- **Devices:** ≥2 headsets to capture hardware variance.
- **Analysis:** run this repo's bench (below) → per-feature **engine-agreement ICC**, **test-retest
  ICC**, **within-subject CV**, and **profile separation**. Pare to features that are BOTH reproducible
  (high test-retest ICC / low CV) AND separate the profiles. Decide the Python-sidecar go/no-go from
  whether Praat's jitter/shimmer/HNR add separation the pure-TS engine can't.

---

## What exists (this repo, built 2026-06-30)

The analysis half is done and tested — the SDNE session only needs to add capture + upload and point
at these:

- `src/lib/voice/engines.ts` — engine registry + `scoreAllEngines()` (parallel fan-out); pure-TS
  in-process, `parselmouthEngine` HTTP adapter to a sidecar (`VOICE_PRAAT_URL`, unavailable-safe).
- `src/lib/voice/stats.ts` — `icc21` (ICC(2,1) absolute agreement), `blandAltman`, `withinSubjectCv`,
  `iccLabel`.
- `src/lib/voice/bench.ts` — `buildBenchReport()`: engine agreement + test-retest + separation per
  task/feature/engine.
- `src/lib/voice/wav.ts` — lossless WAV reader (16/24/32-bit int + float).
- `scripts/voice-bench.ts` — CLI: `npx tsx scripts/voice-bench.ts <manifest.json> <audioDir> [--csv out.csv]`.
- `POST /api/ai/voice-biomarkers?allEngines=1` — live multi-engine scoring for one capture.
- Tests: `src/lib/voice/__tests__/{stats,analysis}.test.ts` (ICC/BA/CV, WAV round-trip, fan-out,
  bench aggregation).

## What the SDNE-repo session needs to build

1. Head-mic **lossless capture** (44.1/48 kHz, gain locked, AGC off) during T08 + two new tasks.
2. **Calibration tone** + metadata JSON emission.
3. **Upload** endpoint/flow to BAA-covered storage; call the backend scorer (or reuse
   `scoreAllEngines`) server-side and persist every engine's output.
4. **Speech/Bulbar domain** in the exam result + `postMessage` payload.
5. Stand up the **Parselmouth sidecar** (FastAPI + Praat) so `VOICE_PRAAT_URL` is live for the
   simultaneous fan-out — the one piece that needs Python, kept out-of-process by design.

---

## Open questions

- Storage target for raw trial audio (S3 + SSE-KMS under BAA is the default assumption) — confirm.
- Sidecar hosting (Fargate vs Lambda container) and whether the SENSE exam calls it synchronously or
  the backend does post-upload.
- Sustained-vowel + reading task UX inside the XR flow (prompts, timers, retry) — SDNE-side design.
