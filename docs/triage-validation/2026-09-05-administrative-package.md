# Neuro Navigator: administrative review and local implementation

September 5, 2026. Local, synthetic-only preparation. Nothing in this package establishes clinical validation or deployment.

The repository already contains substantial triage and evaluation infrastructure. Keep it. The priority is making its evidence trustworthy and its reviewer workflow easy, then completing one partner integration and validating one intended use. A newer model alone does not establish safer decisions.

## What changed locally

- The existing reviewer journey is shorter: assigned study link, next unfinished source-only case, urgency, destination, confidence, comfort with the wait attached to the reviewer's own selected urgency, optional reasoning, save and advance. Supplied age and sex are visible alongside the source. Original labels lock; correction requests append without replacing them.
- New studies require explicit tenant-bound membership. Physician, triage-nurse and operational labels are distinct. Two active physician reviewers must complete all frozen cases before unblinding; nurse labels do not silently become a physician reference standard. This is a preparation workflow, not a determination that two reviewers are sufficient for every study.
- Historical studies can be registered as read-only archives after matching aggregate case/review/run counts. Existing identities, dates and scores are preserved. Unknown historical blinding/source provenance remains unknown. No actual archive or user mapping was performed.
- Evaluations now record an immutable attempt before inference and a terminal receipt afterward, including errors. The input hash binds text, age and sex. A receipt must match its attempt's case, source, configuration, scope and actor. Missing terminal receipts remain visible as incomplete attempts. Scorer consistency and clinical ensemble scopes remain separate.
- Synthetic evaluation uses the existing pure scorer and sentinel ensemble, without clinical persistence. This matters because the ordinary clinical intake can create emergency-action rows whose database triggers enqueue delivery. It must not be repurposed for silent evaluation. Existing source seeding remains available in draft; automatic clinical-intake scoring is held. The correctly implemented 202/poll behavior is retained as an isolated transport adapter, not connected to clinical notification tables.
- Evaluations are default disabled and limited to exact built-in synthetic source/demographic tuples. Model configuration is recorded and actually passed to the scorer. The supplied source commit is explicitly operator-asserted; activation still requires build/artifact verification. No paid inference was run.
- A bounded organization-routing module and a review-only translation prototype were added, as described below. Neither is wired into live clinical routing.
- Earlier local foundations patched Next.js, closed selected lookup/message authorization gaps, held unverified billing export, and tightened emergency-context rules. Those source repairs do not establish that the surrounding app is ready for PHI.

## Easiest way to start validation

After separate integration approval, an administrator reviews and applies migration **061**, inventories historical metadata, registers archives with their real existing study IDs and exact counts, creates a new empty synthetic study, imports cases, assigns reviewers and opens labeling. Migration 060 belongs to the separately merged Localizer work; the earlier unapplied triage 060 draft has been renamed. Do not apply both triage drafts. No self-service user grants are supplied.

Give each reviewer one link: `/triage/validate?study=<assigned-study>`. Review five to seven cases per session. Read the source, select urgency and destination, answer whether the displayed wait for that selected urgency feels safe, select confidence, optionally explain, then save. The next unfinished case opens automatically. Reloading resumes from server-saved progress. Do not open prior AI reports or other reviewers' answers while labeling. These familiar synthetic cases are development exercises, not an unseen clinical test set.

The triage nurse should review operational suitability and their independent triage judgment. Keep those results separate from the physician reference. After physician completion, formally unblind and adjudicate disagreements without replacing originals. **Adjudication storage/UI and an administrator setup/phase-management UI remain unfinished**; use a governed separate dated adjudication record until those are implemented. The correction-request feature is not an adjudication system.

Use the existing 26 cases first, then an approved consecutive retrospective feasibility cohort, enriched safety cases separately, and a fresh holdout after tuning. Before any real notes, settle the intended use, clinical owner, privacy/data path, institutional QI/research determination and acceptance rules. Prespecify dangerous delay and emergency sensitivity, not just agreement. Measure holds, failures, routing errors, review time and repeatability. The proposed 80–100-referral pilot is feasibility work; it cannot prove rare-event safety. Do not present old documented scores as newly verified database results.

Historical dashboards remain available only through authorized archive access. New receipts are retrieved through the evaluations API using an exact configuration revision. The older dashboard explicitly labels its AI comparisons as legacy case snapshots. Its ordinal statistics currently place insufficient-data in the tier ordering and need correction, along with missing/unequal-rater denominators and uncertainty estimates, before use in any release decision. This work preserves those records; it does not certify their statistical interpretation.

## Guideline-to-policy review

Sources reviewed September 5, 2026. NICE is a UK guideline source; these are evidence anchors for US clinical-owner review, not assertions of a US partner's approved policy. Only the narrow prompt corrections below were implemented. The model must not infer that an old date, prior visit or translation proves a current emergency has resolved.

| Situation | Authoritative anchor | Local disposition |
|---|---|---|
| Suspected cauda equina constellation | [NICE NG127, 1.7.3](https://www.nice.org.uk/guidance/ng127/chapter/Recommendations-for-adults-aged-over-16) | Earlier local correction removed walking/stability as an outpatient exemption. Preserve immediate-assessment safety handling; clinical owner approves exact mapping. |
| Rapid symmetric limb weakness | [NICE NG127, 1.7.2](https://www.nice.org.uk/guidance/ng127/chapter/Recommendations-for-adults-aged-over-16) | Prompt now calls for immediate neurological assessment including bulbar/respiratory function; walking ability is not clearance. |
| Suspected subarachnoid hemorrhage/thunderclap | [NICE NG228, 1.1.5](https://www.nice.org.uk/guidance/ng228/chapter/Recommendations) | Prompt no longer treats a prior ED visit or named test alone as completed emergency clearance. |
| Suspected TIA | [AHA scientific-statement overview](https://professional.heart.org/en/science-news/diagnosis-workup-risk-reduction-of-transient-ischemic-attack-in-the-emergency-department-setting), [NICE NG128](https://www.nice.org.uk/guidance/ng128/resources/stroke-and-transient-ischaemic-attack-in-over-16s-diagnosis-and-initial-management-pdf-66141665603269) | Preserve time-critical assessment even when symptoms resolve. Need a signed rule for onset/decision timing and missing onset; do not use an acute-risk score to manufacture an outpatient delay. No new threshold introduced. |
| First suspected seizure | [NICE NG217, 1.1.1](https://www.nice.org.uk/guidance/ng217/chapter/diagnosis-and-assessment-of-epilepsy) | Two-week specialist assessment is a policy-review anchor, with acute emergencies handled separately. Not implemented as an unapproved universal timing rule. |
| Headache red flags versus stable primary headache | [NICE CG150](https://www.nice.org.uk/guidance/cg150/chapter/Recommendations) | Retain structured source evidence and missing-information handling. A stable diagnosis label must not negate newly documented red flags. Further condition-level validation required. |
| Five dimensions, weights, tier cutoffs and displayed waits | Repository's local scoring design | These are local heuristics, not validated guideline-derived coefficients. No new numeric thresholds were invented. Calibrate only on development data, then freeze and test independently. |

The existing gateway + safety extraction + scorer + fusion + selective adjudication is a modern, useful architecture. Its advantage must be demonstrated with end-to-end safety and reproducibility evidence. Prompt compliance tests do not establish clinical performance. Important next cases include copied-forward events, conditional instructions, conflicting dates, unresolved symptoms, unreadable pages, missing facts, multi-condition referrals and abstention.

## Organization customization

The new pure module separates clinical need from local service availability. It retains clinical urgency and preferred specialty, then checks an approved, tenant-matching versioned capability configuration. Exact subspecialty capabilities are required; general neurology is not silently treated as equivalent. Emergency, same-day, undetermined or scheduling-locked decisions remain clinical safety holds. Missing configuration yields clinician review. Unavailable capability yields an explicit external route when configured, otherwise review. Human override appends actor, reason, time and configuration provenance without lowering clinical urgency.

[Illustrative JSON examples](organization-routing-examples.json) cover a synthetic tertiary center with subspecialists and a smaller general service. Neither represents Mayo's actual configuration. Customers may configure service availability, destinations and referral contacts under governance. Clinical emergency rules, urgency thresholds and required evidence require clinical approval. Remaining integration includes server-owned configuration storage, authorization, approval/version lifecycle, routing UI and external-referral workflow. This is a tested local module, not an installed customer feature.

## Incoming languages

Automatic draft translation is feasible. The existing Bedrock adapter is reused in a disabled synthetic prototype that retains the original, declared/detected language, source hash, translated-segment hash, model/prompt version and exact source-aligned spans. A side-by-side component displays both. Unknown/mixed/conflicting language and structural problems are flagged; failed output preserves the original. Every translation remains `review_required` or held and is never authoritative for triage. Numeral checks catch only some changes; they cannot prove correct negation, terminology, timing or meaning.

[Anthropic's multilingual documentation](https://platform.claude.com/docs/en/build-with-claude/multilingual-support) supports general feasibility, not clinical accuracy in every language. This prototype has synthetic structural tests only; it has no live endpoint, approved-language performance set, bilingual acceptance, durable translation store or deployed tenant configuration. A caller-provided synthetic policy is a code boundary, not a production PHI authorization mechanism.

Text translation, scanned-PDF OCR, audio interpretation and translated clinician output are separate capabilities. [Textract's best practices](https://docs.aws.amazon.com/textract/latest/dg/textract-best-practices.html) list printed English, Spanish, German, Italian, French and Portuguese support; do not promise arbitrary-script scanned referrals from text-model language capability. Validate extraction and translation independently for each intended language/document type, including units, numerals, negation and mixed language. No real consult was translated.

## APIs and additional specialties

Today: internal authenticated JSON/text intake with asynchronous polling; native PDF/DOCX/TXT extraction; structured triage output. Still needed: a partner-scoped versioned contract, machine authentication, patient/source binding, idempotency, durable job/error semantics, complete OCR wiring, signed result delivery and partner-specific EHR adapters. A redirect named cardiology or rheumatology is not a specialty triage engine.

Reuse identity, ingestion, provenance, jobs and review infrastructure for another specialty. Add a specialty-owned policy module with required facts, emergency exclusions, timing rules, destinations, citations and a separate evaluation set. Start with one bounded referral family with its specialist owner, rather than renaming the neurology prompt. Neurology validation does not transfer to another specialty or population.

## Remaining gates, in order

1. Integrate only after reviewing local changes and migration compatibility. No live DB was inspected or migrated; actual historical inventory and authorization mapping remain operator work.
2. Finish adjudication, exact-revision result UI and statistical corrections; verify the deployed build/model provenance and a complete notification-free intake/extraction evaluation sink.
3. Close remaining security/integration findings from the original review, especially OAuth state/redirect/PKCE and deployed access/secret boundaries. The selected route fixes are not a full application security certification.
4. Obtain clinical policy, data-path and study approvals; complete independent development review, then appropriately designed clinical validation and silent workflow evaluation.
5. Productize one partner interface, one organization configuration and explicitly evaluated language scope. Additional specialties follow their own clinical signoff and evidence.

Partner-safe description: an AI-assisted neurology referral-triage prototype with substantial safety and evaluation infrastructure, currently being prepared for independent validation and partner integration. No validated performance, general multilingual clinical accuracy or autonomous scheduling claim is supported.
