# Neuro Navigator: independent validation packet

Source-only preparation · September 5, 2026 · Synthetic data only until separately approved

The first study is a feasibility study of adult outpatient neurology referral decision support. It does not authorize automatic scheduling, patient messages, clinical deployment, or processing real notes in this application. Two independent neurologists label the same frozen source packets before seeing any model answers. A third clinician adjudicates disagreements afterward.

## What Steve and the reviewers need to do

1. Name the clinical owner, two independent neurologist reviewers and adjudicator; choose the intended referral types and exclusions. An operational reviewer can separately judge scheduling feasibility.
2. Agree on maximum safe waiting windows and unsafe-delay definitions before scoring cases. Do not redefine the labels to match the engine.
3. Begin with the existing 26 synthetic cases as a development exercise. Reviewers receive randomized source-only case numbers, full notes and this short form. Remove expected-tier clues from titles, filenames and case descriptions. Keep emergency and insufficient-information options available.
4. Each clinician submits independently. Original judgments become immutable. Do not open the triage demo, prior model reports, results screen or another clinician's ratings while labeling. Prior exposure to these familiar examples must be disclosed; they cannot serve as an unseen test set.
5. After all assigned ratings are submitted, the study owner authorizes unblinding. Preserve pre-adjudication agreement. Add adjudication as a separate dated record; never replace the independent labels.
6. Before partner referrals: obtain institutional QI/research determination and privacy/data-path approval. The planned 80–100 consecutive eligible partner referrals are a feasibility cohort, not proof of rare-event safety. Use separate enriched safety cases and later a fresh holdout. Prospective silent evaluation and supervised clinical use require separate decisions.

## One short form per case

| Field | Entry |
|---|---|
| Case code and source revision | Opaque study case code; no patient identifiers |
| Pathway | Emergency evaluation / same-day clinician review / outpatient / more information / outside scope |
| Maximum acceptable wait | Agreed study window, anchored to referral receipt/decision time |
| Destination | Specialty/subspecialty; multiple acceptable choices or uncertain |
| Safe to wait that long? | Yes / no / cannot determine |
| Missing decisive information | Short selection or sentence |
| Supporting evidence | Source page/span; avoid copying identifiers |
| Confidence in your judgment | High / moderate / low |

Record operational feasibility separately. A lack of appointments does not justify reducing clinical urgency. For the synthetic exercise the repo previously estimated 1.5–2 hours per neurologist; record actual time.

The current application form already captures tier, destination, confidence, factors and reasoning. Until dedicated fields are implemented, put pathway, acceptable wait and the safe-to-wait answer in reasoning using the above labels. The current form is not yet the complete proposed study instrument. The dedicated short-form fields and separate adjudication storage remain next work.

## Implemented source controls and activation requirements

Migration `060_triage_validation_governance.sql` introduces a tenant-bound study registry and explicit study membership. It creates no memberships, maps no legacy studies and grants no access. Application study access requires both existing clinical authorization and active study membership. Missing schema or unassigned studies fail closed.

Study phases are draft → labeling → unblinded. The database prevents case changes after draft and prevents submitted review changes/deletes. Unblinding requires two assigned reviewer members with submitted ratings for every active case. Administration is separately assigned: being an app admin does not automatically make someone a study administrator. Reviewers always receive source-only cases; collective reviews and results require unblinded phase. The self-service profile cannot assign privileges.

Only a study admin can insert source-only cases into a draft study, using `POST /api/triage/validate/cases?study=<study>`. Duplicate cases conflict rather than overwrite. Reviewer links use `/triage/validate?study=<study>`, and result links `/triage/validate/results?study=<study>`. Study provisioning and phase transitions need an approved operator workflow; there is intentionally no self-service access-grant endpoint in this slice. Review the existing database column types/constraints before applying the migration. No production migration or access grant was performed.

Legacy auto/seed/rerun web endpoints return 409 after authorization. They overwrite evidence or use an incomplete scoring path, and some treated an asynchronous 202 as a completed evaluation. The approved replacement is the complete-pipeline definition below. Source-only case setup and independent labeling remain available after governed study provisioning.

## Complete-pipeline evaluation definition — next implementation

Use the exact frozen candidate and model/prompt/schema/rule configuration. Submit through authenticated intake and retain the accepted session ID. Poll until a terminal processing state, retaining the response and safety state; a 202 is never an evaluation result. Exercise native PDF and text paths separately, and add OCR only after its governed path is available.

Run the production sequence: source/extraction binding → deterministic gateway → model safety extraction → structured scorer → conservative fusion/adjudication → persisted final recommendation/hold. Neither direct `runTriage` scoring nor reconstructed weighted totals substitute for this sequence. Stop before patient binding, finalization, alerts to people, write-back or scheduling. Evaluation side effects require an isolated synthetic study environment, not the clinical notification infrastructure.

Every immutable run receipt should contain:

- Study, case revision and source hash; full-page coverage and extraction method/quality.
- Source document dates, event dates, decision-as-of time and unresolved temporal ambiguity. Text-written date headings are not trusted authority to lower urgency.
- Source commit, model identifiers by role, prompt/rule/schema versions, temperatures and configuration digest.
- Gateway, safety, scoring and adjudicator results; final pathway, priority, reasons, evidence spans and scheduling lock.
- Errors, holds, retries, duration and cost. Failures stay in the denominator.
- Separate independent labels and later adjudication reference.

No paid model run or actual full-pipeline partner evaluation was performed in this foundation slice. A new immutable runner/receipt schema remains necessary; do not re-enable old endpoints as a shortcut.

## Readout and advancement

Report unsafe delays and dangerous under-triage separately from unnecessary escalation, routing agreement, missing-information holds, extraction omissions, unsupported claims, repeat-run instability, latency and reviewer effort. Include emergency/same-day sensitivity and confidence intervals. Weighted kappa is secondary and does not substitute for safety-specific metrics.

Keep consecutive referrals separate from the enriched safety set: include current emergencies, negative statements, conditional ED instructions, historical events, copied-forward notes, new findings appended to old notes, conflicting sources, unreadable/missing pages and uncertain identity. Every patient belongs to only one development/holdout partition. Freeze the test set before calibration; obtain fresh cases after tuning. Define the next-stage acceptance thresholds with clinical/statistical owners rather than inventing them from observed results.

Zero misses among 100 independent relevant cases still gives approximately a 2.95% one-sided 95% upper bound on miss probability; only ten emergency-positive cases would give approximately 25.9%. These illustrations explain why the feasibility cohort cannot establish rare-emergency safety.

## Clinical source for the narrow policy correction

NICE NG127 recommendation 1.7.3 recommends immediate assessment in the specified new cauda-equina symptom constellation. The source prompt no longer treats walking ability/stability as permission for an outpatient wait. No new scoring threshold was introduced. Clinical approval is still needed before activating the change.

[NG127 referral guidance](https://www.nice.org.uk/guidance/ng127/chapter/Recommendations-for-adults-aged-over-16) · [TRIPOD-LLM reporting](https://www.tripod-statement.org/wp-content/uploads/2025/01/TRIPOD-LLM-Article.pdf) · [HHS QI/research guidance](https://www.hhs.gov/ohrp/regulations-and-policy/guidance/faq/quality-improvement-activities/index.html)
