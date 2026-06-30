# Spec: Acoustic Speech Biomarkers for Neuro Exam (SDNE + Sevaro voice surfaces)

## Document Information

| Field | Value |
|-------|-------|
| Type | Spec / scoping doc |
| Created | 2026-06-30 |
| Status | Phase A scaffolded (2026-06-30) — pure-TS engine + route + capture UI shipped behind `VOICE_BIOMARKERS_ENABLED` (default off); engine bake-off + threshold tuning targeted for the 2026-07 test week. See "Phase A scaffold" at the end. |
| Motivation | The `menelly/AI_Ears` MCP server (audio analysis *beyond transcription* — "the whisper, the tremor, the breath") surfaced a capability category we don't have: treating captured voice as a measurable neuro signal, not just an ASR feed. |
| Owner | Sevaro Clinical Engineering |
| Related | `docs/PRD_SDNE_Integration.md`, `docs/references/voice-agent-field-lessons.md`, `docs/PRD_Neurology_Scales.md` |

---

## Problem

Every voice surface we ship today uses audio for exactly **one** thing: turning it into
text (Historian / Intake / Follow-Up via Realtime + Whisper; dictation + visit recording via
Deepgram Nova-3). The moment the transcript is extracted, the **waveform is discarded.**

In neurology that discarded signal is clinical data. Dysarthria, hypophonia (Parkinson's),
monopitch/reduced prosody, vocal tremor (essential/cerebellar), ataxic/scanning speech, and
breathiness (flaccid dysarthria) are all **acoustically measurable** and map to scored exam
items (MDS-UPDRS speech item 3.1, Frenchay Dysarthria Assessment). We capture the audio that
carries these signs and measure none of it.

### Current state (verified 2026-06-30, file:line)

- **SDNE already runs the canonical articulation task.** `src/lib/sdneTypes.ts:125` —
  `T08: { name: 'Pa-Ta-Ka (DDK)', domain: 'Facial' }`. But SDNE is an **external XR system**
  embedded via iframe (`src/app/sdne/page.tsx:13`, `sense.neuroplans.app`); results arrive as
  domain flags over `postMessage`. Whatever acoustic scoring T08 does (if any) happens in the
  SDNE repo, not here, and the raw acoustic metrics are not surfaced.
- **Sevaro-side audio is already POSTed to API routes** as FormData and forwarded to a vendor
  for transcription only — e.g. `src/app/api/ai/transcribe/route.ts:51` (dictation → Deepgram),
  `src/app/api/ai/visit-ai/route.ts` (diarized visit recording). No acoustic feature extraction
  anywhere in the stack.

So we have two independent surfaces where this belongs, and one of them (Sevaro-side capture)
is testable **without** XR hardware.

---

## Goal

Add an **acoustic speech-biomarker** capability: capture a short guided voice task, extract a
panel of clinically meaningful acoustic features, flag findings (GREEN/YELLOW/RED to match the
existing SDNE design language), and persist them as a longitudinal, scale-linked result.

Two delivery paths, prioritized by testability:

1. **Sevaro-side (this repo) — testable next week, no XR hardware.** A browser voice-task
   capture component + a Next.js analysis API route + a results card. This is the path we build
   and bench in the test week.
2. **SDNE-side (external repo) — strategic.** Enhance T08 and add sustained-phonation / reading
   tasks with full acoustic scoring at the source, surfaced through the existing SDNE panel as a
   Speech/Bulbar sub-domain. Out of scope for this repo; tracked as a hand-off to the SDNE team.

### Non-goals
- Any diagnostic claim. Output is a **measured sign that flags for clinician review**, same
  posture as triage red-flags. A clinical voice-biomarker product is a SaMD/regulatory
  conversation, explicitly deferred.
- Replacing or re-architecting the ASR pipeline.
- Standing up production Python infra before the bake-off proves it's warranted.

---

## Clinical targets (the data points to measure & compare)

| Sign | Condition signal | Acoustic feature | Capture task |
|------|------------------|------------------|--------------|
| Hypophonia / loudness decay | Parkinson's (hypokinetic) | RMS / SPL, intensity decay over utterance | Reading passage |
| Monopitch / reduced prosody | Parkinson's, depression | **F0 standard deviation / range** | Reading passage |
| Vocal tremor | Essential / cerebellar tremor | 4–8 Hz amplitude & frequency modulation in sustained vowel | Sustained /a/ ("ahhh") |
| Hoarseness / breathiness | Flaccid dysarthria, fold pathology | **jitter, shimmer, HNR** | Sustained /a/ |
| Phonatory instability | bulbar / phonatory weakness | max phonation time, F0 stability | Sustained /a/ |
| Articulatory rate & regularity | cerebellar / parkinsonian | **DDK syllable rate + inter-syllable regularity** | Pa-Ta-Ka |
| Slow/irregular rate, word-finding pauses | dysarthria, aphasia, apraxia | speaking rate, pause count/distribution | Reading + spontaneous |

The three capture tasks (sustained vowel, Pa-Ta-Ka, reading sentence) are the standard
SLP/neuro battery and cover the whole table in ~60–90 seconds.

Note: AI_Ears' spectral-flux onset detector — which I called "fragile for music" in the repo
review — is actually a legitimate **DDK syllable-rate detector** when the input is "pa-ta-ka."
Its key/tempo math is the wrong tool; its onset and RMS/dynamics math is reusable as a baseline.

---

## Engine bake-off (the "best tools out there" comparison for test week)

The core question the test week answers: **which engine do we standardize on, and does a
Praat-grade engine earn its infra cost over a pure-TS subset?** Candidates, scored on the same
recordings:

| Engine | Lang | Covers jitter/shimmer/HNR? | Fits our stack as-is? | Notes |
|--------|------|----------------------------|------------------------|-------|
| **Parselmouth (Praat)** | Python | ✅ gold standard | ❌ needs Python sidecar | Reference for voice-pathology research; the accuracy bar |
| **openSMILE / eGeMAPS** | C++/Py | ✅ standardized 88-feature set | ❌ Python/native | The citable clinical feature panel |
| **DisVoice** | Python | ✅ + articulation/prosody | ❌ Python, heavier deps | Purpose-built for dysarthria/Parkinson's |
| **Pure-TS subset** (Meyda + YIN/autocorr F0 + custom DDK/pause) | TS | ❌ (F0, loudness, rate, DDK only) | ✅ runs in our Next route today | No new infra; testable immediately |
| **AI_Ears** | Python | ❌ (no jitter/shimmer) | ❌ | Use only as a local reference baseline, not a dep |
| Hosted voice-biomarker API | — | varies | ⚠️ PHI / BAA gate | Fastest signal; only if BAA-covered |

**Recommended bake-off structure (run in parallel during test week):**
- **(a)** Ship the **pure-TS subset** in a Next API route so it runs in our real stack on the
  audio we already capture — proves the end-to-end path and covers loudness/monopitch/rate/DDK.
- **(b)** Run **Parselmouth (+ optionally eGeMAPS/DisVoice)** as a *local, un-deployed* bench
  on the **same recordings** to measure exactly what the gold standard adds (jitter/shimmer/HNR).
- Decision rule: if (a) separates the known profiles (normal vs PD vs ET) on the signs that
  matter, we ship TS-only first and add the Python sidecar later for the perturbation features.
  If it doesn't, the bench data justifies building the **Parselmouth sidecar** (FastAPI on its
  own Fargate/Lambda container, called from the Next route — mirrors how `/api/triage` already
  fans out to an async worker).

---

## Architecture decision for our stack

Constraint: Amplify SSR is a **Node Lambda — no Python runtime** (see `CLAUDE.md` deploy notes).
A Praat-grade engine therefore cannot live inside the Next app; it needs either (1) a separate
Python service or (2) a pure-TS/WASM implementation. The bake-off above decides which.

**Testable MVP (path 1, build for test week):**

1. **Capture** — `VoiceTaskCapture.tsx`: guided 3-task flow (on-screen prompt + countdown),
   browser `MediaRecorder` with the same `echoCancellation`/`noiseSuppression`/`autoGainControl`
   constraints already used in `useRealtimeSession`. Produces one audio blob per task.
   *Caveat: jitter/shimmer are mic/noise-sensitive — disable AGC for the sustained-vowel task or
   note it as a known confound; record the device/UA for QC.*
2. **Analyze** — new `POST /api/ai/voice-biomarkers` route, FormData audio in (mirrors
   `transcribe/route.ts`), biomarker-panel JSON out. v1 backend = the pure-TS subset module
   `src/lib/voice/acoustic.ts`. Behind `VOICE_BIOMARKERS_ENABLED` (default off until benched),
   consistent with our other hot-revertable feature flags.
3. **Flag** — `src/lib/voice/flagging.ts`: threshold each feature to GREEN/YELLOW/RED. Thresholds
   are **provisional** and tuned against the bench in test week; ship them as config, not magic
   numbers (the AI_Ears critique — don't hardcode unexplained cutoffs).
4. **Render** — `SpeechBiomarkerCard.tsx` reusing `SDNEFlagChip` styling so it reads as part of
   the same exam family.
5. **Persist** — write to `scale_results` mapped to the **MDS-UPDRS speech item** so it joins the
   existing longitudinal scale-trend infrastructure (same shape as wearable motor/tremor tracks).
   Reuse `resolveScalePatientId()` so results are patient-linked.

**Strategic path (path 2, SDNE-side):** the real exam already has T08 Pa-Ta-Ka and a head-mic.
Hand off to the SDNE team: add sustained-vowel + reading tasks, extract the full panel at source,
emit a `Speech`/`Bulbar` sub-domain in the existing `domain_flags` postMessage payload. Our panel
already renders whatever domains SDNE sends, so surfacing it here is mostly additive.

---

## Benchmark harness

We already have labeled clinical profiles to validate against (`docs/PRD_SDNE_Integration.md` §4):
- **James Morrison** — Parkinson's → expect hypophonia, low F0 variability, reduced/irregular DDK.
- **Eleanor Wright** — Essential Tremor → expect 4–8 Hz vocal tremor in sustained /a/.
- **Maria Santos** — Migraine/normal → expect a clean baseline.

Harness: a fixed set of voice-task recordings per profile in `qa/voice-biomarkers/`, run through
each candidate engine, output a comparison table (feature value vs expected direction). Success =
the panel **separates the three profiles on the expected signs**, and we can state which engine
gives the cleanest separation per feature. Add a `qa/TEST_CASES.yaml` entry and a test-week
mission brief in `qa/runs/`.

---

## Compliance note

Voice recordings + acoustic features derived from them are PHI. Keep capture/analysis within the
same BAA-covered boundary as the audio we already send to Deepgram/OpenAI. A pure-TS in-route
engine is the cleanest (audio never leaves our infra). A hosted biomarker API is gated on a BAA.
Do not log raw audio or patient-identified feature panels in plaintext app logs.

---

## Phasing / roadmap placement

- **Phase A (test week, this repo):** capture component + `/api/ai/voice-biomarkers` (TS subset)
  + flagging + card + `scale_results` write, behind `VOICE_BIOMARKERS_ENABLED`. Bake-off bench
  (a) vs (b) on the three labeled profiles. **Deliverable: a go/no-go on the Python sidecar.**
- **Phase B:** if warranted, stand up the Parselmouth sidecar for jitter/shimmer/HNR; tune
  thresholds from bench data; wire MDS-UPDRS speech-item scoring.
- **Phase C (SDNE-side):** push full acoustic scoring into the SDNE exam at the head-mic source;
  surface a Speech/Bulbar domain through the existing panel. Add passive analysis of Historian
  conversational audio (loudness/rate trend over an encounter, no extra patient task).

---

## Open questions

- Does T08 in the SDNE repo already compute DDK acoustics, or just record? (Confirm with SDNE
  team — determines whether path 2 is enhancement or net-new.)
- Pure-TS F0/perturbation: is a YIN/autocorrelation F0 + Meyda spectral subset accurate enough on
  a sustained vowel to flag monopitch and tremor, or is jitter/shimmer (Praat-only) load-bearing
  for the PD/ET separation? (The bench answers this directly.)
- Where does the card live for the Sevaro-side path — inside the SDNE panel as a Sevaro-captured
  sub-section, or as its own item in the Physical Exams tab?
- Threshold provenance: adopt published MDS-UPDRS / Frenchay cutoffs, or derive from our own
  labeled recordings? (Start with published, refine on bench.)

---

## Phase A scaffold (2026-06-30)

Shipped the testable MVP behind `VOICE_BIOMARKERS_ENABLED` (default **off** — the route
returns 503 until enabled). No production surface wires it in yet; it runs at the standalone
`/voice-biomarkers` page for test week.

**Architecture as built:** the browser decodes the recorded blob (`AudioContext.decodeAudioData`),
downmixes to mono, resamples to 16 kHz, and POSTs raw Int16 PCM to the route — so the Node Lambda
needs no ffmpeg and no Python. The route runs the pure-TS engine and returns a flagged panel.

**New files:**
- `src/lib/voice/types.ts` — `VoiceTask`, task prompts, `BiomarkerFeature` / `BiomarkerPanel`.
- `src/lib/voice/acoustic.ts` — zero-dependency time-domain engine (`ENGINE_ID = sevaro-ts-acoustic-v0.1`).
  Autocorrelation F0, RMS contour, voiced/pause timing, max phonation time, DDK onset rate +
  regularity (CV), 4–8 Hz tremor via F0-contour autocorrelation. Jitter/shimmer/HNR are computed
  frame-to-frame and **explicitly marked `approximate`** (Praat-grade cycle detection is the
  bake-off's job — directly addressing the AI_Ears "no jitter/shimmer" gap).
- `src/lib/voice/flagging.ts` — provisional GREEN/YELLOW/RED thresholds as **named, commented
  config** (`THRESHOLDS`) — to be tuned on the bench; `isVoiceBiomarkersEnabled()` master switch;
  worst-flag roll-up; `INVALID` when signal is too short.
- `src/app/api/ai/voice-biomarkers/route.ts` — `POST` (auth + flag gated), Int16 PCM in →
  `BiomarkerPanel` out; best-effort `scale_results` write (`scale_id = mds_updrs_speech_<task>`,
  0–2 severity from the overall flag) only when `patientId` is supplied; DB failure never fails
  the analysis.
- `src/lib/voice/clientCapture.ts` — decode/downsample/PCM helpers + `analyzeTask()` fetch wrapper.
- `src/components/voice/SpeechBiomarkerCard.tsx` — results card reusing `SDNEFlagChip` + QC banners.
- `src/components/voice/VoiceTaskCapture.tsx` — 3-task guided flow; capture with AGC / echo-cancel /
  noise-suppression **off** so the raw signal reaches the engine.
- `src/app/voice-biomarkers/page.tsx` — standalone runner (accepts `?patient=&visit=`).
- `src/lib/voice/__tests__/acoustic.test.ts` — vitest: F0 accuracy on a pure tone, 5 Hz tremor on
  an FM tone, ~6 syll/s DDK recovery + low CV, too-short gating, reading-panel monopitch. **7/7 pass.**

**Verification:** `npx tsc --noEmit` clean (0 errors), `npx vitest run` 7/7, `npx eslint` clean.
Not yet exercised end-to-end with a real microphone (needs a browser + `VOICE_BIOMARKERS_ENABLED`
on) — that's the first test-week step.

**Test-week to-dos (unchanged from the plan):** flip the flag on, capture the 3 labeled profiles
(Morrison/Wright/Santos), run the engine bench (a) vs the local Parselmouth bench (b), tune
`THRESHOLDS`, and decide go/no-go on the Python sidecar for real jitter/shimmer/HNR.

**Amplify note:** `VOICE_BIOMARKERS_ENABLED` is read via `process.env`; per the CLAUDE.md gotcha,
runtime access in prod SSR needs the `next.config` inline env block — wire that in only when we
promote this past the local/test-week stage.
