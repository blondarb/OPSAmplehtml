# Card 5: SDNE — Standardized Digital Neurologic Exam — Product Playbook

---

## 1. Executive Summary

The Standardized Digital Neurologic Exam (SDNE) is a Samsung Galaxy XR-based platform that digitizes and quantifies the neurological examination — transforming a traditionally subjective, provider-dependent clinical assessment into an objective, reproducible, data-driven exam. This card integrates the SDNE's outputs into the main outpatient demo site, consolidating what was previously a standalone display page into the unified platform. The page serves three audiences simultaneously: clinicians see how XR-collected exam data translates into structured clinical outputs, investors see a differentiated technology platform with hardware-software integration, and Samsung healthcare partnership teams see a compelling use case for Galaxy XR in clinical settings. The SDNE addresses a fundamental problem in neurology: the neurological exam is the most operator-dependent assessment in medicine, with high inter-rater variability, poor documentation, and no standardized digital format — making it nearly impossible to track disease progression quantitatively over time.

---

## 2. How To Use This Section

- **Step 1:** Navigate to the SDNE card from the homepage.
- **Step 2:** You will see a hero section explaining "What is the SDNE?" with a visual diagram of the XR headset-to-data pipeline.
- **Step 3:** Scroll to the **Architecture Overview** section showing the data flow: Galaxy XR headset → sensor data collection → API transmission → Supabase storage → clinical display.
- **Step 4:** The **Live Exam Output** section displays structured exam results. In demo mode, this shows pre-loaded exam data from a simulated patient. When connected to a live headset, it displays real-time data.
- **Step 5:** Click on individual exam modules (Eye Tracking, Gait Analysis, Tremor, Reaction Time, Speech) to see detailed results, visualizations, and clinical interpretation.
- **Step 6:** Each module shows: raw data visualization (chart/graph), quantified score, normative comparison, clinical interpretation text, and change-over-time trend (if multiple exams exist).
- **Step 7:** The **Future Roadmap** section shows the development trajectory and clinical applications pipeline.
- **Step 8:** The **Investor Narrative** section presents the market context, technology differentiation, and partnership value proposition.

---

## 3. Clinical Context & Problem Statement

### The Problem

The neurological examination is the cornerstone of neurological diagnosis and monitoring, yet it remains fundamentally subjective, irreproducible, and poorly suited for tracking disease over time.

**Inter-rater variability**: Two neurologists examining the same patient will often document different findings. Reflexes graded as "2+" by one provider may be "3+" by another. Tremor described as "mild" by one is "moderate" by another. Studies show inter-rater reliability for many components of the neurologic exam is only fair to moderate (kappa 0.4-0.6).

**Documentation gaps**: The neurologic exam is documented in free text, making quantitative comparison across visits impossible. "Gait: mildly unsteady" in January vs. "Gait: somewhat ataxic" in June — is the patient better, worse, or the same?

**Time constraints**: A thorough neurological exam takes 20-30 minutes. In a 30-minute follow-up appointment, with history-taking, medication reconciliation, and documentation, the exam is often abbreviated or deferred.

**No digital standard**: Unlike cardiology (ECG), pulmonology (spirometry), or ophthalmology (OCT), neurology has no widely adopted digital measurement tool for the core clinical exam. The SDNE changes this.

### The Clinical Workflow

Patient arrives → History taking → **Neurological Exam (SDNE)** → Assessment & Plan → Documentation

The SDNE sits in the exam phase. The patient wears the Galaxy XR headset and completes a series of structured exam modules (5-10 minutes). The data is transmitted to Supabase and displayed as a structured exam report that the neurologist reviews during the visit.

### Patient Population

- **Parkinson's disease**: Track tremor severity, gait velocity, reaction time over visits
- **Multiple sclerosis**: Track eye movement abnormalities, gait changes, cognitive processing speed
- **Epilepsy**: Post-seizure cognitive assessment, medication effect on processing speed
- **Concussion/TBI**: Baseline and recovery tracking via saccades, balance, reaction time
- **Dementia/MCI**: Cognitive processing speed, speech biomarkers, gait variability
- **Movement disorders**: Tremor quantification, bradykinesia measurement
- **Any neurological patient**: Objective, reproducible exam baseline

### Why This Matters

The SDNE creates a new data layer in neurology that does not currently exist: quantitative, time-series neurological exam data. This enables:

1. **Objective disease tracking**: Was the patient better or worse than 6 months ago? Now you have numbers, not adjectives.
2. **Earlier intervention**: Detect subtle decline before it's clinically obvious to the human eye.
3. **Research**: Standardized exam data across sites enables multi-center clinical trials with objective endpoints.
4. **Remote monitoring**: Future versions could run on consumer XR headsets at home.
5. **AI-powered insights**: Longitudinal exam data becomes substrate for predictive models.

---

## 4. Functional Requirements

### 4.1 Page Sections

**Section 1: What is the SDNE?**

| Element | Details |
|---|---|
| Hero visual | Illustration or photograph of Galaxy XR headset in a clinical setting |
| Explainer text | 3-4 paragraphs explaining the concept, accessible to non-technical readers |
| Key stats | "5-minute exam", "5 neurological domains", "Quantitative, reproducible, digital" |
| Visual pipeline diagram | Animated or static diagram: Headset → Data Collection → Cloud Processing → Clinical Display |

**Section 2: Architecture Overview**

| Element | Details |
|---|---|
| Architecture diagram | Technical data flow from XR headset to display |
| Technology stack callout | Galaxy XR, Android SDK, Supabase, Next.js |
| Integration points | Where SDNE connects to the broader platform (Supabase shared schema) |
| Data format | Structured JSON output per exam module |

**Section 3: Live/Simulated Exam Output Display**

| Element | Details |
|---|---|
| Patient header | Patient name (demo), date of exam, examiner, device ID |
| Module cards | 5 cards, one per exam module (see 4.2 below) |
| Overall summary | Composite score or dashboard-style summary |
| Trend view | Toggle to see current exam vs. historical (if multiple exams in demo data) |
| Raw data toggle | For technical audiences: show raw sensor data |
| Export button | "Export as PDF" — generates a structured exam report |

**Section 4: Future Roadmap**

| Element | Details |
|---|---|
| Timeline visualization | Horizontal roadmap with Phase 1/2/3 milestones |
| Clinical applications list | Which conditions and use cases are targeted in each phase |
| Research opportunities | Potential studies enabled by SDNE data |

**Section 5: Investor Narrative**

| Element | Details |
|---|---|
| Market context | Size of the neurology market, lack of digital exam tools, XR healthcare market growth |
| Technology moat | What makes SDNE defensible (hardware-software integration, clinical validation, data network effects) |
| Partnership value | Why this matters for Samsung's healthcare strategy |
| Competitive landscape | Brief comparison to existing digital neuro-assessment tools (CNS Vital Signs, BrainBaseline, etc.) |

> **Implementation note:** The current SDNE build uses an **8-domain Core-15 framework** rather than the 5 modules listed below. Domain organization differs from this playbook — refer to the standalone SDNE display site for the actual domain structure.

### 4.2 Exam Modules — Detailed

**Module 1: Eye Tracking / Saccadic Assessment**

| Parameter | Details |
|---|---|
| What it measures | Saccade latency (ms), saccade velocity (deg/s), saccade accuracy (% on target), smooth pursuit gain, nystagmus detection |
| Clinical relevance | Saccadic abnormalities are early markers for Parkinson's, MS, cerebellar disorders, concussion. Smooth pursuit deficits correlate with cognitive decline. |
| Display | Interactive chart: target position (green) vs. eye position (blue) over time. Scatter plot of saccade latency vs. accuracy. |
| Normative comparison | Age/sex-adjusted normal ranges displayed as shaded bands |
| Clinical interpretation | AI-generated text: e.g., "Saccade latency is elevated at 280ms (normal <220ms for age group), suggesting possible brainstem or frontal lobe involvement." |
| Sample data | Latency: 280ms (elevated), Velocity: 420 deg/s (normal), Accuracy: 88% (mildly reduced), Pursuit gain: 0.82 (mildly reduced), Nystagmus: None |

**Module 2: Gait Analysis / Balance Assessment**

| Parameter | Details |
|---|---|
| What it measures | Gait velocity (m/s), stride length (m), stride variability (CV%), cadence (steps/min), turn time (s), postural sway (cm), tandem gait deviation |
| Clinical relevance | Gait velocity is the "sixth vital sign" — slowing predicts falls, hospitalization, and cognitive decline. Stride variability increases in Parkinson's and cerebellar disease. Turn time is a sensitive marker for Parkinson's progression. |
| Display | Animated gait visualization (stick figure or footprint map). Bar chart of gait parameters vs. normative ranges. Balance sway area plot. |
| Normative comparison | Age/sex-adjusted normal ranges |
| Clinical interpretation | AI-generated: e.g., "Gait velocity is reduced at 0.8 m/s (normal >1.0 m/s for age). Stride variability is elevated at 8.2% (normal <5%), suggesting an emerging gait disorder consistent with early parkinsonian features." |
| Sample data | Velocity: 0.8 m/s (reduced), Stride length: 0.55m (reduced), Variability: 8.2% (elevated), Cadence: 105 steps/min (normal), Turn time: 3.2s (elevated), Sway area: 4.5 cm² (mildly elevated) |

**Module 3: Tremor Quantification**

| Parameter | Details |
|---|---|
| What it measures | Tremor frequency (Hz), tremor amplitude (mm), tremor regularity (coefficient of variation), tremor type classification (rest vs. postural vs. kinetic), laterality (right vs. left vs. bilateral) |
| Clinical relevance | Frequency distinguishes essential tremor (6-12 Hz) from Parkinson's tremor (4-6 Hz). Amplitude tracks severity. Tremor type aids diagnosis. Objective tracking eliminates the subjectivity of "mild/moderate/severe." |
| Display | FFT (Fast Fourier Transform) frequency spectrum plot. Time-series acceleration trace. Amplitude trend over multiple exams. |
| Normative comparison | Diagnostic ranges rather than age norms (Parkinson's range vs. essential tremor range) |
| Clinical interpretation | AI-generated: e.g., "Dominant tremor frequency of 4.8 Hz with rest-predominant characteristics, consistent with parkinsonian tremor. Amplitude 2.3mm (moderate). Right hand dominant." |
| Sample data | Frequency: 4.8 Hz, Amplitude: 2.3mm, CV: 0.15, Type: rest, Laterality: right dominant |

**Module 4: Reaction Time / Cognitive Processing Speed**

| Parameter | Details |
|---|---|
| What it measures | Simple reaction time (ms), choice reaction time (ms), processing speed index, accuracy (%), intra-individual variability |
| Clinical relevance | Processing speed is one of the earliest cognitive domains affected in MS, dementia, and post-concussion. Intra-individual variability (inconsistency) is an independent predictor of cognitive decline. |
| Display | Reaction time distribution histogram. Trial-by-trial scatter plot. Processing speed index comparison to norms. |
| Normative comparison | Age/education-adjusted normal ranges |
| Clinical interpretation | AI-generated: e.g., "Choice reaction time 420ms (age-adjusted normal <380ms). Intra-individual variability is elevated (CV 22%, normal <15%), suggesting subtle processing inefficiency consistent with early cognitive change." |
| Sample data | Simple RT: 310ms, Choice RT: 420ms (elevated), Processing Speed Index: 88 (low-normal), Accuracy: 95%, Variability CV: 22% (elevated) |

**Module 5: Speech / Voice Biomarkers**

| Parameter | Details |
|---|---|
| What it measures | Speech rate (words/min), articulation rate (syllables/s), pause frequency, pause duration (ms), fundamental frequency (Hz), frequency variability, voice tremor index, phonation time (s) |
| Clinical relevance | Speech changes are early biomarkers for Parkinson's (hypophonia, monotone), ALS (dysarthria), MS (scanning speech), and cognitive decline (word-finding pauses). Voice tremor correlates with essential tremor and cerebellar tremor. |
| Display | Waveform visualization of speech sample. Pitch contour plot. Speech parameter radar chart comparing to norms. |
| Normative comparison | Age/sex-adjusted ranges |
| Clinical interpretation | AI-generated: e.g., "Speech rate reduced at 120 words/min (normal 140-170). Fundamental frequency variability decreased (monotone speech pattern). Pause frequency elevated. Pattern is consistent with hypokinetic dysarthria, commonly seen in Parkinson's disease." |
| Sample data | Speech rate: 120 wpm (reduced), Articulation rate: 3.8 syl/s (reduced), Pause frequency: 12/min (elevated), F0: 110 Hz, F0 variability: 8 Hz (reduced), Voice tremor index: 0.3 (mildly elevated) |

### 4.3 Composite Dashboard

| Element | Details |
|---|---|
| Radar/spider chart | 5 axes representing the 5 modules, showing patient's score vs. normative range |
| Overall concern level | Green/Yellow/Red indicator: "Within normal limits" / "Some parameters outside normal range" / "Multiple domains abnormal — clinical review recommended" |
| Change summary | If multiple exams exist: "Compared to exam on [date]: Gait velocity declined 0.12 m/s, tremor amplitude increased 0.4mm, processing speed improved 5 points" |
| AI narrative summary | 3-5 sentence overview: "This exam reveals findings most consistent with early Parkinson's disease. The resting tremor at 4.8 Hz, reduced gait velocity with increased stride variability, and hypokinetic speech pattern form a coherent clinical picture. Cognitive processing speed shows only mild reduction. Recommend comparison with follow-up exam in 3-6 months to assess progression rate." |

---

## 5. Technical Architecture

> **Implementation note:** The current `/sdne` route is an **iframe embed** pointing to the standalone SDNE display site, not a native Next.js page. There are no `/api/sdne/*` API routes, no SDNE-specific Supabase tables, and no AI interpretation calls in this repo. The component tree, schema, and API endpoints described below reflect the planned architecture, not the current build.

### 5.1 Frontend Components (React / Next.js)

```
src/
├── app/
│   └── sdne/
│       └── page.tsx                      # Main SDNE page
├── components/
│   └── sdne/
│       ├── SDNEHero.tsx                      # "What is SDNE" explainer section
│       ├── PipelineDiagram.tsx                # XR → Cloud → Display visual
│       ├── ArchitectureOverview.tsx            # Technical architecture section
│       ├── ExamOutputContainer.tsx             # Main exam results container
│       ├── PatientExamHeader.tsx               # Patient info + exam metadata
│       ├── ExamModuleCard.tsx                  # Generic module card component
│       ├── EyeTrackingModule.tsx               # Eye tracking results + charts
│       ├── GaitAnalysisModule.tsx              # Gait analysis results + charts
│       ├── TremorModule.tsx                    # Tremor quantification results
│       ├── ReactionTimeModule.tsx              # Cognitive processing speed
│       ├── SpeechBiomarkersModule.tsx          # Speech/voice analysis
│       ├── CompositeRadarChart.tsx             # 5-axis radar/spider chart
│       ├── OverallAssessmentBanner.tsx         # Green/Yellow/Red composite
│       ├── TrendComparisonView.tsx             # Multi-exam comparison
│       ├── NormativeBandChart.tsx              # Reusable chart with norm bands
│       ├── RawDataToggle.tsx                   # Show/hide raw sensor data
│       ├── ExamPDFExport.tsx                   # Export as PDF report
│       ├── FutureRoadmap.tsx                   # Roadmap timeline
│       ├── InvestorNarrative.tsx               # Market context and value prop
│       └── DisclaimerBanner.tsx                # Safety disclaimer
```

### 5.2 Supabase Schema

> **Implementation note:** None of the SDNE-specific Supabase tables below exist in the current build. The iframe embed manages its own data independently of this repo's Supabase instance.

**Table: `sdne_exams`**

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Exam session ID |
| `created_at` | `timestamptz` | Exam timestamp |
| `patient_id` | `uuid` | Patient identifier |
| `patient_name` | `text` | Display name (demo only) |
| `examiner_id` | `text` | Clinician/examiner identifier |
| `device_id` | `text` | Galaxy XR device identifier |
| `device_model` | `text` | XR device model (e.g., "Galaxy XR Gen1") |
| `firmware_version` | `text` | Device firmware version |
| `exam_duration_seconds` | `integer` | Total exam time |
| `exam_status` | `text` | completed, partial, error |
| `composite_score` | `float` | Overall composite score (0-100) |
| `concern_level` | `text` | normal, borderline, abnormal |
| `ai_narrative_summary` | `text` | AI-generated clinical narrative |
| `ai_model_used` | `text` | Model used for interpretation |

**Table: `sdne_module_results`**

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Module result ID |
| `exam_id` | `uuid` (FK → sdne_exams) | Parent exam |
| `module_type` | `text` | eye_tracking, gait, tremor, reaction_time, speech |
| `raw_data` | `jsonb` | Complete raw sensor data |
| `processed_metrics` | `jsonb` | Calculated clinical parameters |
| `normative_comparison` | `jsonb` | Comparison to age/sex norms |
| `clinical_interpretation` | `text` | AI-generated interpretation |
| `concern_level` | `text` | normal, borderline, abnormal |
| `quality_score` | `float` | Data quality indicator (0-1) |

**Table: `sdne_normative_data`**

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Normative data ID |
| `module_type` | `text` | Which exam module |
| `parameter_name` | `text` | Specific metric (e.g., "saccade_latency") |
| `age_range_min` | `integer` | Lower age bound |
| `age_range_max` | `integer` | Upper age bound |
| `sex` | `text` | male, female, all |
| `mean` | `float` | Normative mean |
| `std_dev` | `float` | Standard deviation |
| `percentile_5` | `float` | 5th percentile |
| `percentile_25` | `float` | 25th percentile |
| `percentile_50` | `float` | Median |
| `percentile_75` | `float` | 75th percentile |
| `percentile_95` | `float` | 95th percentile |
| `source` | `text` | Reference source for norms |

### 5.3 API Endpoints

**`POST /api/sdne/exam`** — Receive exam data from Galaxy XR headset

Request body:
```json
{
  "device_id": "string",
  "patient_id": "string",
  "exam_modules": [
    {
      "module_type": "eye_tracking",
      "raw_data": { ... },
      "timestamp": "ISO8601"
    }
  ]
}
```

**`GET /api/sdne/exam/:id`** — Retrieve processed exam results

**`GET /api/sdne/exam/:id/module/:module_type`** — Get specific module results

**`GET /api/sdne/patient/:patient_id/trend`** — Get longitudinal exam data for trend analysis

**`POST /api/sdne/interpret`** — Generate AI interpretation for exam results

Request body:
```json
{
  "exam_id": "uuid",
  "patient_context": {
    "age": 65,
    "sex": "male",
    "diagnoses": ["Parkinson's disease"],
    "medications": ["Carbidopa/Levodopa 25/100 TID"]
  }
}
```

Response body:
```json
{
  "module_interpretations": {
    "eye_tracking": "Saccade latency elevated at 280ms...",
    "gait": "Gait velocity reduced at 0.8 m/s...",
    "tremor": "Dominant tremor frequency 4.8 Hz...",
    "reaction_time": "Choice reaction time mildly elevated...",
    "speech": "Speech rate reduced with monotone pattern..."
  },
  "composite_narrative": "This exam reveals findings most consistent with...",
  "concern_level": "abnormal",
  "recommended_follow_up": "Repeat SDNE in 3-6 months to assess progression"
}
```

**`GET /api/sdne/demo-data`** — Returns pre-loaded demo exam data

### 5.4 External Services

| Service | Purpose |
|---|---|
| OpenAI API (gpt-5.2) | Clinical interpretation of exam results |
| Supabase | Data storage, real-time display updates |
| Galaxy XR SDK | Headset data collection (separate repo) |
| Recharts / D3.js | Data visualization (frontend) |

### 5.5 Data Flow

```
Galaxy XR Headset
├── Eye tracking cameras → saccade/pursuit data
├── IMU sensors → gait/balance/tremor data
├── Hand tracking → tremor/kinetic data
├── Microphone → speech/voice data
└── Response buttons → reaction time data
        ↓
Galaxy XR App (Android) processes raw sensor data into structured metrics
        ↓
POST /api/sdne/exam → Supabase (raw + processed data)
        ↓
POST /api/sdne/interpret → OpenAI API generates clinical interpretations
        ↓
Interpretations stored back in Supabase
        ↓
Frontend reads from Supabase → renders exam modules, charts, narrative
        ↓
Clinician reviews during visit → may export as PDF for chart
```

### 5.6 Architecture Decision: Standalone Repo vs. Consolidated

**Recommendation:** Keep the Galaxy XR repo as the device-side source code. It handles sensor data collection, on-device processing, and API transmission. The outpatient sample site becomes the sole display/consumption layer. The standalone SDNE display page in the XR repo should be deprecated and redirect to the outpatient site.

```
[Galaxy XR Repo]                    [Outpatient Sample Site]
├── XR app code                     ├── SDNE display page
├── Sensor collection               ├── Clinical interpretation
├── On-device processing            ├── Normative comparison
├── API transmission ──────────────→├── Visualization
└── (Remove standalone display)     ├── PDF export
                                    └── Investor narrative
```

---

## 6. AI & Algorithm Design

> **Implementation note:** The current iframe-based SDNE build uses **rule-based interpretation only** — no AI/LLM calls are made. The AI-powered interpretation described in this section is planned but not yet implemented.

### 6.1 What the AI Does

The AI performs clinical interpretation of quantified exam data. It does NOT perform the measurement — that is done by the XR headset's sensors and algorithms. The AI:

1. **Compares** each parameter to age/sex-adjusted normative ranges
2. **Identifies** patterns across modules that suggest specific diagnoses or progression
3. **Generates** clinical narrative text that a neurologist would find useful and accurate
4. **Tracks** changes over time if longitudinal data is available
5. **Flags** concerning findings that warrant attention

### 6.2 Model Selection

**Primary: OpenAI gpt-5.2** (clinical interpretation, narrative generation, structured output)

Rationale:
- Strong at synthesizing multi-parameter clinical data into coherent narratives
- Follows structured output formats reliably
- Appropriate guardrails against over-diagnosis
- Cost-effective for per-exam interpretation
- Existing integration with the project's OpenAI API infrastructure

> **🔄 AI Model Flexibility (Platform Policy):** The demo uses OpenAI models, but the production platform is designed to be **model-agnostic**. Production deployments may use different providers optimized for specific capabilities: **Deepgram** (Nova-3 Medical) for clinical speech recognition and transcription, **Anthropic Claude** for complex clinical reasoning and multi-step analysis, **specialized providers** (e.g., Snowflake, domain-specific models) for billing, coding, and diagnostic pattern matching. All AI integrations are abstracted behind API route handlers — model swaps require only changing the API call, not the clinical logic, system prompts, or frontend. BAA requirements apply to whichever provider handles PHI in production.

### 6.3 System Prompt — Draft

```
You are a clinical decision support system that interprets quantified neurological exam data collected by the SDNE (Standardized Digital Neurologic Exam) platform. You generate clinical interpretations for neurologists reviewing exam results.

## YOUR ROLE
- You interpret quantified exam data in clinical context
- You are NOT a diagnostic tool — you identify patterns and flag findings
- All interpretations must be framed as observations, not diagnoses
- You support the neurologist's clinical decision-making

## PATIENT CONTEXT
Age: {age}
Sex: {sex}
Known diagnoses: {diagnoses}
Current medications: {medications}
Prior SDNE exams: {prior_exam_count} (dates: {prior_exam_dates})

## EXAM DATA
{structured_exam_data_json}

## NORMATIVE REFERENCE DATA
{normative_ranges_json}

## INTERPRETATION INSTRUCTIONS

For each exam module, generate:
1. A 2-3 sentence clinical interpretation noting which parameters are normal, borderline, or abnormal
2. Clinical significance of any abnormal findings
3. If prior exams exist: comparison showing improvement, stability, or decline

For the composite narrative:
1. Synthesize findings across all modules into a coherent 3-5 sentence clinical picture
2. Note any cross-module patterns (e.g., gait slowing + tremor + speech changes = parkinsonian pattern)
3. Suggest appropriate follow-up interval
4. If findings are concerning, recommend specific clinical follow-up

## OUTPUT FORMAT
Return JSON:
{
  "module_interpretations": {
    "eye_tracking": "interpretation text",
    "gait": "interpretation text",
    "tremor": "interpretation text",
    "reaction_time": "interpretation text",
    "speech": "interpretation text"
  },
  "composite_narrative": "overall synthesis text",
  "concern_level": "normal | borderline | abnormal",
  "key_findings": ["finding 1", "finding 2"],
  "cross_module_patterns": ["pattern description"],
  "recommended_follow_up": "text",
  "change_from_prior": "improved | stable | declined | mixed | no_prior_data"
}

## RULES
1. NEVER diagnose. Use: "findings consistent with," "pattern suggestive of," "consider evaluation for"
2. NEVER recommend specific medications or treatments
3. Always note data quality issues if quality_score < 0.7 for any module
4. If data is insufficient or unreliable, say so rather than over-interpreting
5. All findings framed as supporting information for the treating neurologist
6. Include measurement units and normative ranges in interpretations
7. If multiple prior exams exist, comment on the trajectory (e.g., "steady decline over 3 exams spanning 18 months")
```

### 6.4 Guardrails Within the AI

| Guardrail | Implementation |
|---|---|
| No diagnosis | Language checking in system prompt + output validation |
| Data quality gating | If any module quality_score < 0.7, flag interpretation as limited |
| Normative range accuracy | Norms stored in database (not hallucinated by AI); AI references provided norms |
| No treatment recommendations | System prompt constraint + output scanning |
| Clinical plausibility check | If AI output contains clinically implausible values, flag for review |

---

## 7. Safety & Guardrails

### 7.1 Clinical Safety Boundaries

- **The SDNE supplements, never replaces, the clinical exam.** The neurologist must perform their own assessment. SDNE data is additional information.
- **The AI interprets data, never diagnoses.** All language must be suggestive, not definitive.
- **Data quality matters.** If sensor data is poor quality (patient moved, device error), the system must flag this prominently rather than generate misleading interpretations.
- **Normative data limitations.** Normative ranges are population-level and may not apply to every individual. This must be disclosed.

### 7.2 Escalation Logic

| Trigger | Action |
|---|---|
| Module concern level = abnormal for 3+ modules | Display prominent alert: "Multiple exam domains outside normal range — clinical review recommended" |
| Significant decline from prior exam | Display: "Notable change detected compared to prior exam on [date]. Review recommended." |
| Data quality issue | Display: "Data quality for [module] was below threshold. Results should be interpreted with caution." |
| Device malfunction | Display: "Exam data may be unreliable due to device error. Consider repeating affected modules." |

### 7.3 Regulatory Considerations

- **FDA**: A quantified neurological exam tool that provides clinical interpretations is likely a Software as a Medical Device (SaMD). For POC/demo, this is an investigational/research tool. For clinical deployment, FDA 510(k) or De Novo classification may be required. Predicate devices exist (e.g., computerized cognitive testing, quantitative EEG). Regulatory strategy should be developed in Phase 2.
- **Samsung partnership considerations**: Samsung may have their own regulatory pathway preferences for Galaxy XR healthcare applications. Coordinate early.
- **Clinical validation**: Before any clinical use, the SDNE must be validated against gold-standard neurological assessments (e.g., UPDRS for Parkinson's, EDSS for MS, MoCA for cognition). This is a Phase 2-3 activity.

### 7.4 UI Disclaimers

**On the exam output page:**
> "The SDNE is an investigational digital neurological examination tool. Results are intended to supplement, not replace, clinical assessment by a qualified neurologist. All measurements and interpretations should be confirmed by clinical examination."

**On individual module interpretations:**
> "AI-generated interpretation. Review in context of complete clinical picture."

---

## 8. Demo Design

### 8.1 The 3-Minute Demo

**Minute 0:00-0:40 — The Problem**
"The neurological exam hasn't changed in 100 years. It's subjective — 'reflexes are brisk,' 'gait is unsteady' — and it varies from doctor to doctor. You can't track disease progression with adjectives. The SDNE changes that."

**Minute 0:40-1:40 — The Technology**
- Show the pipeline diagram: Galaxy XR headset → 5-minute exam → objective data
- Click through each exam module: "Eye tracking measures saccade latency to the millisecond. Gait analysis captures stride length to the centimeter. Tremor is quantified by frequency and amplitude."
- Show the radar chart: "One view, five domains, instant comparison to normal."

**Minute 1:40-2:30 — Clinical Value**
- Show the trend view with two exams: "Here's the same patient, 6 months apart. Gait velocity dropped from 0.92 to 0.80. Tremor amplitude increased. Speech slowed. The AI synthesizes: 'Findings suggest progressive parkinsonian features.' Now the neurologist has objective data to guide treatment decisions."

**Minute 2:30-3:00 — The Vision**
"This is the first digital standard for the neurological exam. Every neurology visit produces quantitative data. Over time, this creates the largest dataset of objective neurological exam data ever collected — a dataset that enables AI to predict progression, optimize treatment, and detect disease years earlier than current methods."

### 8.2 Key Wow Moments

1. **Quantification**: Seeing subjective exam findings turned into precise numbers
2. **Radar chart**: The 5-axis visualization that instantly communicates neurological status
3. **Trend comparison**: Side-by-side exam data showing objective disease progression
4. **AI synthesis**: Cross-module pattern recognition that mirrors clinical reasoning
5. **Samsung partnership**: Hardware-software integration that differentiates from pure-software competitors

### 8.3 Demo Data — Pre-loaded Exams

**Demo Patient: Robert Williams, 65M, Parkinson's disease**

Exam 1 (6 months ago):
- Eye tracking: saccade latency 250ms (borderline), pursuit gain 0.88 (mildly reduced)
- Gait: velocity 0.92 m/s (low-normal), stride variability 6.1% (borderline)
- Tremor: 4.6 Hz, amplitude 1.8mm (mild), right rest tremor
- Reaction time: choice RT 400ms (borderline), variability CV 18%
- Speech: rate 135 wpm (low-normal), F0 variability 12 Hz (mildly reduced)

Exam 2 (current):
- Eye tracking: saccade latency 280ms (elevated), pursuit gain 0.82 (reduced)
- Gait: velocity 0.80 m/s (reduced), stride variability 8.2% (elevated)
- Tremor: 4.8 Hz, amplitude 2.3mm (moderate), right rest tremor
- Reaction time: choice RT 420ms (elevated), variability CV 22% (elevated)
- Speech: rate 120 wpm (reduced), F0 variability 8 Hz (reduced)

This pair demonstrates clear progression across all domains — a powerful demo narrative.

---

## 9. Phased Roadmap

### Phase 1: POC / Demo Version (Current Sprint)

**Scope:**
- SDNE page integrated into outpatient demo site
- Pre-loaded demo data (2 exams for 1 patient)
- All 5 exam module visualizations with normative comparison
- AI-generated clinical interpretations via OpenAI API
- Composite radar chart and narrative summary
- Trend comparison view
- Architecture diagram and investor narrative sections
- No live XR headset connection (demo data only)

**Technical:**
- Next.js page at `/sdne`
- Supabase tables with seeded demo data
- OpenAI API for interpretation
- Recharts for visualizations

**Timeline:** 1-2 development sessions

### Phase 2: Clinical Pilot Version

**New Features:**
- Live connection to Galaxy XR headset via API
- Real-time data ingestion from XR app
- Additional demo patients and exam scenarios
- PDF report generation with clinic branding
- Normative database expansion (more age/sex ranges)
- Clinical validation study design support
- Multi-patient view for research mode

**Timeline:** 3-6 months, coordinated with Samsung XR team

### Phase 3: Production / Scaled Version

**New Features:**
- FDA regulatory submission materials
- Validated normative database from clinical studies
- Disease-specific exam protocols (Parkinson's module, MS module, concussion module)
- Remote/home exam capability via consumer XR
- Integration with clinical trial platforms for objective endpoints
- Multi-site data aggregation for research
- ML models trained on longitudinal SDNE data for disease prediction

**What Changes Between Phases:**
- Phase 1 → 2: Adds live XR connection, real-time data, validation study support
- Phase 2 → 3: Adds FDA readiness, validated norms, disease-specific protocols, remote capability

---

## 10. Open Questions & Decisions Needed

1. **Standalone repo fate**: Should the Galaxy XR SDNE repo's standalone display page be archived, deprecated, or maintained in parallel? Recommendation: deprecate and redirect to outpatient site.
2. **Live headset demo**: Is there a functioning Galaxy XR headset available for live demos, or is Phase 1 entirely simulated data?
3. **Normative data source**: The demo uses illustrative normative ranges. For clinical pilot, where do validated norms come from? Published literature? Internal study?
4. **Exam module priority**: Are all 5 modules equally important for Phase 1, or should we prioritize certain modules (e.g., tremor + gait for Parkinson's focus)?
5. **Samsung branding**: How prominently should Samsung/Galaxy XR branding appear on this page? Is there a co-branding agreement?
6. **Data format from XR app**: What is the actual data format the Galaxy XR app will send? Need schema coordination with the XR development team.
7. **Clinical validation pathway**: When does formal clinical validation begin? Is there IRB approval needed for collecting SDNE data from real patients?
8. **Competitive positioning**: How much of the investor narrative should reference competitors (CNS Vital Signs, BrainBaseline, C3 Logix)? Aggressive positioning or neutral?
9. **Remote exam capability**: Is remote/home SDNE a Phase 2 or Phase 3 goal? This significantly affects architecture decisions now.
10. **Research mode**: Should there be a "research mode" where exams can be anonymized and aggregated for population-level analysis? If so, consent model and data governance need to be designed now.
