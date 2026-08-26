# Comprehensive Historian v4 — MVP Architecture

**Status:** Source candidate as of 2026-08-25. This diagram describes the intended isolated synthetic-QA implementation. It is not a claim of deployed acceptance, clinical validation, or autonomous diagnosis.

## The live interview

```mermaid
flowchart LR
    patient["Patient on phone"] <-->|"Speech and confirmed transcript"| app["Patient web app and canonical session controller"]
    app <-->|"PCM, transcripts, and tool events"| relay["Nova relay with text and audio quarantine"]
    relay <-->|"One continuous voice segment at a time"| henry["Henry: Amazon Nova 2 Sonic"]

    app --> state["Application-owned interview state"]
    state --> safety["Safety and terminal guard"]
    state --> fixed["Opening, age, scales, and pre-close rules"]
    state --> meds["Medication evidence and clarification ledger"]
    state --> conductor["Claude conductor every third patient turn"]
    state --> reviewer["Silent case-depth reviewer every fourth patient turn"]

    henry -->|"Proposes one conversational question"| arbiter["Exact question arbiter"]
    safety -->|"Highest priority"| arbiter
    fixed -->|"Required question when due"| arbiter
    meds -->|"Name, dose, or frequency clarification"| arbiter
    conductor -->|"One patient-specific replacement question"| arbiter
    reviewer -->|"Cited gaps and highest-value discriminator"| conductor
    reviewer --> closure["Application completion gate"]
    arbiter -->|"Approve exact text or reject"| relay
    relay -->|"Release only confirmed matching text and audio"| app

    classDef patient fill:#E0F2FE,stroke:#0369A1,color:#0C4A6E,stroke-width:1.5px;
    classDef voice fill:#EDE9FE,stroke:#6D28D9,color:#3B0764,stroke-width:1.5px;
    classDef control fill:#ECFDF5,stroke:#047857,color:#064E3B,stroke-width:1.5px;
    classDef danger fill:#FEF2F2,stroke:#B91C1C,color:#7F1D1D,stroke-width:2px;
    class patient,app patient;
    class relay,henry voice;
    class state,fixed,meds,conductor,reviewer,arbiter,closure control;
    class safety danger;
```

### The three AI roles

| Role | What it does | What it cannot do |
|---|---|---|
| **Henry — audible interviewer** | Conducts a natural voice conversation and proposes one question at a time. | Cannot make its own question audible until the application authorizes the exact wording. |
| **Claude conductor — intermittent question planner** | Uses the confirmed transcript and reviewer guidance to insert a case-specific, high-value neurologic question. | Does not speak directly, end the interview, or override safety and medication obligations. |
| **Silent case-depth reviewer — independent oversight role** | Audits transcript-cited coverage, contradictions, repetitions, medication evidence, safety, and eight case-depth dimensions. | Does not diagnose during the interview and cannot declare completion by itself. |

The eight depth dimensions are chief problem and goal; chronology and course; phenotype and severity; associated features and discriminators; functional impact; relevant history and risk; treatments and response; and prior evaluation. They are an internal evidence audit, not a patient-facing checklist.

### Medication behavior

```mermaid
flowchart LR
    mention["Patient says a medication name"] --> exact{"Exact transcript-supported name?"}
    exact -->|"No or ASR uncertainty"| clarify["Ask a name clarification; separate bounded counter"]
    clarify --> exact
    exact -->|"Yes"| amount{"Dose or amount known?"}
    amount -->|"No"| askAmount["Ask an app-owned dose question"]
    amount -->|"Yes"| schedule{"Frequency known?"}
    askAmount --> schedule
    schedule -->|"No"| askSchedule["Ask an app-owned frequency question"]
    schedule -->|"Yes"| closed["Medication entry closed"]
    askSchedule --> closed
    closed --> authority["Verified medication ledger is the only medication authority for reports and DDx"]

    classDef decision fill:#FFF7ED,stroke:#C2410C,color:#7C2D12,stroke-width:1.5px;
    classDef action fill:#ECFDF5,stroke:#047857,color:#064E3B,stroke-width:1.5px;
    classDef data fill:#EFF6FF,stroke:#1D4ED8,color:#1E3A8A,stroke-width:1.5px;
    class exact,amount,schedule decision;
    class clarify,askAmount,askSchedule action;
    class mention,closed,authority data;
```

- A symptom frequency cannot satisfy a medication-frequency question.
- An uncertain drug name is never silently corrected or presented as verified.
- Medication clarification has its own allowance, although every audible turn still counts toward the absolute 60-question safety ceiling.
- Unresolved medication information forces `complete_with_uncertainty` and a visible physician warning.

## Completion and post-session physician output

```mermaid
flowchart TB
    transcript["Confirmed transcript, signed live review, and medication ledger"] --> endReason{"How did the session end?"}

    endReason -->|"Normal closure proposed"| normal["Server-owned completion checks"]
    normal --> minimum["At least 12 patient turns and all 17 history domains nonmissing"]
    minimum --> depth["All eight case-depth dimensions assessed; no critical gap, active safety issue, or low-confidence closure"]
    depth --> medGate["Medication reconciliation closed and final open-door question answered"]
    medGate --> complete["Complete or complete with uncertainty"]

    endReason -->|"Mic, voice, provider, patient stop, safety, or hard ceiling"| partial["Partial or safety-escalated save"]
    complete --> save["Transactional session, append-only transcript, and DiagnosticSufficiencyV1"]
    partial --> save

    save --> job["Durable report-first worker"]
    job --> recompute["Recompute and match the diagnostic-sufficiency digest"]
    recompute --> report["Citation-grounded clinician history report"]
    report --> ddxGate{"Diagnostic sufficiency allows DDx?"}
    ddxGate -->|"No"| withheld["Differential explicitly withheld; limitation shown"]
    ddxGate -->|"Yes"| primary["Primary transcript-grounded differential"]
    primary --> audit["Thoroughness review plus blind cross-family differential and agreement"]

    report --> physician["Authenticated physician and QA view"]
    withheld --> physician
    primary --> physician
    audit --> physician
    save --> patientView["Patient summary and transcript; no differential"]

    classDef decision fill:#FFF7ED,stroke:#C2410C,color:#7C2D12,stroke-width:1.5px;
    classDef success fill:#ECFDF5,stroke:#047857,color:#064E3B,stroke-width:1.5px;
    classDef warning fill:#FEF2F2,stroke:#B91C1C,color:#7F1D1D,stroke-width:1.5px;
    classDef data fill:#EFF6FF,stroke:#1D4ED8,color:#1E3A8A,stroke-width:1.5px;
    classDef eval fill:#F5F3FF,stroke:#7C3AED,color:#4C1D95,stroke-width:1.5px;
    class endReason,ddxGate decision;
    class normal,minimum,depth,medGate,complete success;
    class partial,withheld warning;
    class transcript,save,patientView,physician data;
    class job,recompute,report,primary,audit eval;
```

### Report and differential safeguards

- The clinician history report is generated first for complete and partial sessions. Its clinical claims must be exact patient-transcript quotes; a completed report must contain grounded claims in the core concern/timeline, symptom characterization, discriminators, functional impact, and prior evaluation/treatment sections. It is an organized extractive history, not free model prose.
- The report model receives a medication-redacted transcript. The application appends the verified medication ledger and explicit limitations afterward.
- The differential is physician/QA-only. It is generated only when the server-derived sufficiency artifact permits it; partial, shallow, unavailable-gate, and mismatched-digest sessions receive a deterministic withheld result.
- Both diagnostic model paths receive a medication-redacted transcript plus only the verified medication summary. Every displayed diagnosis must retain at least one exact quote from a patient turn; historian questions and redaction markers cannot ground a diagnosis.
- Free-form model rationale, synthesis prose, and model-authored ICD-10 codes are not persisted or displayed. Candidate names remain investigational, quote-linked suggestions for physician review.
- Comprehensive v3/v4 report import into a clinical note is disabled in both the UI and server route until role, tenant, visit, patient, and session binding plus a cited-report import contract are implemented.
- Differential likelihoods are uncalibrated investigational estimates, not confidence intervals, and require physician review against the transcript and chart.

## Current acceptance boundary

Source tests can prove deterministic orchestration, evidence binding, report-first ordering, DDx withholding, medication exactness, retry/idempotency, and UI states. They cannot prove deployed AWS behavior, natural Galaxy microphone endurance, interview quality, or clinical validity. Those remain separate QA and clinician-UAT gates.

## Source anchors

- Live orchestration and precedence: `src/hooks/useRealtimeSession.ts`
- Reviewer contract and app-owned closure: `src/lib/historian/liveReviewContract.ts`
- Medication ledger: `src/lib/historian/medicationReconciliation.ts`
- Exact audible turn admission: `services/nova-sonic-relay/src/server.ts`
- Server-derived sufficiency: `src/lib/historian/diagnosticSufficiency.ts`
- Invitation save boundary: `src/lib/historian/invitedSave.ts`
- Report-first worker: `src/workers/historianEvalWorker.ts`
- Citation-grounded report: `src/lib/historian/eval/clinicianHistoryReport.ts`
- Medication-safe diagnostic input: `src/lib/historian/eval/diagnosticInput.ts`
- Physician report and DDx surface: `src/components/HistorianSessionPanel.tsx`
