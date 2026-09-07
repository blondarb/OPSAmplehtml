# Clinical policy corrections and independent-label package

Date: September 5, 2026. Source base: `8582bde` (full object ID in the external evidence manifest).
Branch: `fix/triage-clinical-policy-20260905`.

September 6 integration note: the unchanged triage migration was renamed from 062 to 063 because current main uses 062 for Historian. Historical verification below refers to its original number. The release receipt records current integration and deployment status.

The approved clinical corrections and synthetic counterexamples are implemented locally. The package improves urgency wording, source chronology, the scorer instructions, evaluation parity, and the independent reviewer form. It does not establish clinical accuracy. Migration 062, deployment, study membership, paid inference, clinical adjudication, and real-note validation have not been performed in this change.

## What changes for users

- A persisted immediate-review requirement displays **Clinician review now — do not defer until later today**. Emergency actions display **Emergency evaluation now**. A legacy outpatient tier cannot replace either action in polling, result cards, batch output, reports, consult summaries, or notification text.
- Held results suppress outpatient workup and destination advice. The original model response remains available as an audit artifact; it is not treated as an authorized disposition. Final disposition remains locked, with scheduling disabled.
- Source chronology records the decision time and preserves source-reported dates, precision, and quotations. A document date does not prove current clinical status, symptom onset, or clearance after an earlier assessment.
- Reviewers independently record action, latest safe assessment timing and its origin, services to involve, decisive missing facts, confidence, and comfort with the displayed comparison wait. Immediate actions use a zero-minute decision-time interval. Contradictory action/tier combinations are rejected in the form, API, and database.
- Results distinguish the new clinical assessments from descriptive legacy tier statistics. Action, timing, and service agreement are based on reviewer labels; AI comparison against these new labels is explicitly not evaluated.

## Algorithm changes and their limits

Scorer version: `neurology-outpatient-scorer-v2026-09-05-clinical-policy-2`. Gateway version: v5. The numeric weights, scoring implementation, and tier cutoffs are unchanged.

The prompt now distinguishes functional impairment from progression, avoids double counting failed therapies, removes an unsupported age-40 first-seizure rule, and requires condition-relevant rather than blanket imaging recommendations. Missing safety-critical facts cannot become normal findings. Current or unresolved focal symptoms, new papilledema, rapidly progressive weakness, possible cauda equina symptoms, and thunderclap headache are distinguished from documented, assessed, stable follow-up.

Functional seizures retain a neurological care pathway and consideration of co-occurring epilepsy. Stable uncomplicated radicular symptoms are distinguished from a new gait or myelopathic change. Suspected giant cell arteritis can involve ophthalmology and rheumatology; referral must not delay appropriate immediate clinical assessment. `MS / Neuroimmunology` is now a governed destination shared by types, the scorer contract, and the reviewer form.

These are evidence-informed policy repairs, not a new validated clinical score, a claim of calibrated model confidence, or proof that the current model is best in class. Live model comparisons and independently adjudicated clinical testing remain necessary.

## Chronology and deadlines

`clinicalTiming.ts` adds an optional, versioned envelope stored in the existing safety artifact. It binds a fixed decision clock to the SHA-256 digest of the complete source. Polling re-derives supported timing information from that source and clock rather than trusting stored or model-generated deadline numbers.

The current parser deliberately recognizes a small line-header grammar: note/document/encounter date, symptom onset/onset date, last verified status date, and completed assessment date. It accepts strict ISO dates or timestamp forms, preserves relative or conflicting assertions, and does not infer arbitrary prose chronology or document boundaries. Date-only assertions stay date-only. Unrecognized or conflicting information remains indeterminate.

Immediate actions establish an immediate decision-time deadline. Condition-specific timing remains indeterminate by default. A source-only, server-internal MS policy can demonstrate the onset-based 14-calendar-day assessment/treatment window when bound to an authorized confirmation. No current HTTP route accepts that policy selection. Only explicitly supported UTC calculations are enabled in this prototype; unknown or other time zones fail to an indeterminate deadline. The window is not a fresh two-week appointment allowance or permission to delay assessment, and does not recommend a treatment.

Organization availability and human routing overrides preserve the clinical timing envelope. This change does not connect a live scheduling inventory or shorten the elapsed clinical clock by moving a patient to another organization.

## Production and evaluation input parity

Ordinary-note scoring now receives the full authoritative source instead of a potentially lossy extraction summary. Persisted extraction binding and forged caller metadata rejection remain enforced.

For long packets, the sentinel's default path now uses the same production helpers for the validated clinical extraction, safety artifacts, and bounded adjudication text. Scorer and adjudicator receive the same bounded representation, including source evidence, timeline, and function. The full packet remains the chronology source. A focused test exercises the default sentinel dependencies with mocked model calls and verifies exact production projection parity, the 40,000-character bound, and the emergency floor.

Failed or invalid model branches retain adjudication/hold behavior. No model call in this local verification contacted a paid service. Existing completion-row locking and emergency authority remain in place.

## Synthetic package

The package contains **25 independent source notes covering 20 scenario groups**. Counterfactual comparisons are separate inputs. Notes are fictional, contain no patient identifiers, and do not instruct the reviewer which answer to select.

| Group | Coverage |
|---|---|
| C01 | Immediate clinician review displayed consistently across output paths |
| C02–C07 | Papilledema; uncertain diplopia/ptosis; ambulatory rapid weakness; cauda symptoms; CT-only thunderclap history; resolved unassessed focal symptoms |
| C08 | Functionally consequential MS symptoms beginning 12 days before a fixed decision clock |
| C09a/b | Stable functional seizures versus a new unassessed event type |
| C10a/b | Otherwise identical first-seizure referrals at ages 39 and 41 |
| C11 | Old document header, year boundary, and current focal symptoms |
| C12–C15 | Raw-source/summary disagreement; language uncertainty; dizziness without a documented eye-movement examination; typical migraine without an automatic imaging recommendation |
| C16a/b | Stable nondisabling radicular symptoms versus new gait disturbance |
| C17 | Suspected GCA and shared specialty care |
| C18–C19 | Organization availability without changing clinical timing; model-branch failure with a credible emergency signal |
| C20a/b/c | Two versus three failed therapies; greater unchanged baseline disability without invented progression |

Files:

- `qa/triage-sentinel/clinical-policy-cases.json`: versioned development catalog with engineering expectations and a fixed decision clock.
- `qa/triage-sentinel/clinical-policy-coverage.json`: links the 20 scenario groups to existing and new coverage.
- `qa/triage-sentinel/clinical-policy-study-cases.json`: source-only import array, 25 generic case titles, no model outputs or expected clinical labels. Give reviewers this package through the blinded study UI, not the engineering catalog.

The original sentinel catalog and historical studies are preserved. The new catalog is marked for live-ensemble evaluation; adding it does not mean those 25 model evaluations have run or passed. Counterexample notes are development safety examples, not a representative clinical accuracy cohort. Age and scoring comparisons are observations to collect, not invented numerical gold labels.

`clinicalPolicyRegistry.ts` recognizes exact approved source text and null structured demographics. A changed source or injected demographic field fails recognition. Cases in this package share the same configuration revision and decision clock; case identity is stored separately in the receipt. The operator-provided source commit is still an assertion, pending trusted build-artifact provenance.

## Simplest useful clinical validation sequence

1. Select two independent neurologist reviewers and a separate adjudicator/clinical owner. Names remain outstanding. Study access is explicit; selecting people here does not provision them.
2. After review and authorized integration, apply migration 063, create a fresh draft study, and import the source-only JSON through `POST /api/triage/validate/cases?study=<new-study>`. The existing route is insert-only and accepts at most 100 cases per request. Freeze the case set before labeling.
3. Have each neurologist label the same 25 notes independently, source only. Keep AI output and engineering expectations hidden. Use this small exercise to identify ambiguities in the form and policy; do not repeatedly tune and then count the same notes as held-out validation.
4. Record disagreements and clinically adjudicate them without altering original labels. A dedicated adjudication storage/UI workflow and the reference-label comparison remain unfinished. Do not substitute legacy majority tier voting for that work.
5. After formal unblinding and separate authorization for paid execution, run immutable model attempts against the frozen source/configuration revision. The synthetic runner remains off by default. Compare action, timing, destination, missed emergency threats, unnecessary escalation, appropriate abstention, and source-evidence support against adjudicated labels.
6. Use a new, governed sample of representative referral notes for retrospective silent validation, including other sites and relevant subgroups. Prespecify safety endpoints, uncertainty estimates, adjudication rules, and acceptance thresholds with the clinical owner. Obtain the required institutional data-use and QI/research determination before receiving those notes.

Reviewer agreement in the current dashboard is exact agreement on the encoded action, timing origin/value/unit/anchor, or sorted service set. It is descriptive: for example, equivalent intervals entered in different units are not normalized. Legacy insufficient-data ordering and unequal-rater statistics are not repaired by this change and must not become a clinical release criterion.

## Storage and safety review

Migration `063_triage_validation_clinical_assessment.sql` adds a nullable JSONB assessment and validates new inserts. It does not backfill old labels. The API returns a clear 503 if this storage has not been applied. The existing immutable-label, phase, tenant, role, blinded-results, and receipt boundaries are retained.

One independent clinical/security review identified four material gaps during implementation. All four were addressed before final verification: contradictory action/tier/wait labels, evaluation packets that differed from production, an omitted MS destination in the scorer contract, and combined comparison cases. The review also led to exposing the new clinical assessment in results rather than relying solely on the old tier dashboard.

Verification and browser evidence are recorded in `qa/runs/RUN-2026-09-05-CLINICAL-POLICY.md`. Passing software checks does not establish clinical validity or deployed behavior.

## Source registry

The September 5 guideline review checked the following primary sources. These guide the policy changes; specialist confirmation and local pathway ownership remain necessary.

| Source | Application |
|---|---|
| [NICE NG127, adult neurological referral](https://www.nice.org.uk/guidance/ng127/chapter/Recommendations-for-adults-aged-over-16) | Rapid weakness, cauda symptoms, and stable versus concerning radicular presentations |
| [NICE NG128, stroke/TIA recommendations](https://www.nice.org.uk/guidance/ng128/chapter/recommendations) and [AHA TIA statement](https://professional.heart.org/en/science-news/diagnosis-workup-risk-reduction-of-transient-ischemic-attack-in-the-emergency-department-setting) | Resolved symptoms do not remove the need for prompt acute assessment; avoid an urgency score that delays TIA assessment |
| [NICE NG228, subarachnoid haemorrhage](https://www.nice.org.uk/guidance/ng228/chapter/Recommendations) | Thunderclap history requires a credible completed assessment; a bare CT mention is not clearance |
| [NICE NG217, epilepsy diagnosis and assessment](https://www.nice.org.uk/guidance/ng217/chapter/diagnosis-and-assessment-of-epilepsy) | First suspected seizure specialist assessment; no unsupported age-40 triage threshold |
| [NICE NG220, MS recommendations](https://www.nice.org.uk/guidance/ng220/chapter/Recommendations), updated June 2026 | Functionally consequential relapse assessment/treatment as early as possible within an onset-based window, after considering infection and other causes |
| [IIH consensus guideline, JNNP](https://pmc.ncbi.nlm.nih.gov/articles/PMC6166610/) | Papilledema, visual-risk assessment, and urgent diagnostic evaluation |
| [AAN functional seizures guideline](https://www.neurology.org/doi/10.1212/WNL.0000000000214466) | Continuity of care and consideration of co-occurring epilepsy |
| [ACR Headache](https://acsearch.acr.org/docs/69482/Narrative/) and [SAEM GRACE-3](https://www.saem.org/publications/grace/grace-3) | Indication-specific testing; do not invent a reassuring HINTS examination or require blanket imaging |
| [BSR giant cell arteritis guideline](https://academic.oup.com/rheumatology/article/59/3/487/5714025) | Prompt assessment and shared ophthalmology/rheumatology care when indicated |

## Remaining integration gates

- Review and integrate this local commit; apply 063 and verify the real schema separately. Existing deployed migration 061 is not replaced or rerun by this work.
- Perform authorized deployed smoke testing, notification-path acceptance, and study access provisioning. This verification used local synthetic data only.
- Complete adjudication, canonical AI-versus-reference-label analysis, and trusted build/model/prompt provenance before interpreting model performance.
- Partner PDF/OCR, JSON/FHIR/API import/export contracts, OAuth/security work, live organization scheduling adapters, and cardiology/rheumatology policy validation remain the separately scoped work described in the earlier assessment. A governed service destination is not a validated multispecialty triage algorithm.
