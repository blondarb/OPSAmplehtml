# HANDOFF — OPSAmplehtml

_Single source of truth for cross-AI handoffs. Claude (Cowork/Claude Code) and
ChatGPT/Codex read this FIRST and update it LAST. Plain language. No PHI (initials
only). No secrets._

## Snapshot (keep current)
- Status: Active — verified July 13, 2026 (per CLAUDE.md "Body of Work").
- Driver this week: Clara AI phone-triage stroke-alert red-teaming and dispatch-flow hardening, plus Nova Sonic relay/audio fixes (per CLAUDE.md "Recent", Jul 11–13).
- Lives in: https://github.com/blondarb/OPSAmplehtml.git

## Open threads / next actions
- [ ] Create a governed real-note testing path: PhysioNet MIMIC-IV-Note credentialing, selected n2c2 access, and DUA-compatible compute that does not send restricted notes to an unapproved third-party API.
- [ ] Draft a silent retrospective AI-triage validation protocol and obtain a formal institutional QI-versus-research/IRB determination before receiving partner referral notes.
- [ ] Harden the executive demo into one synthetic post-discharge journey: referral triage → informed AI historian → optional SENSE/SDNE → source-labeled clinician prep report, with a precomputed fallback for latency.
- [ ] Decide whether the historian should receive the raw referral, a bounded source-grounded referral packet, or retrieval access; current implementation passes triage summary/priority/red flags rather than the entire referral text.
- [ ] Verify the remaining cross-product handoffs end-to-end: SENSE/SDNE result return, consult report to EHR/chart prep, and Sevaro Evidence Engine desktop-scribe consumption.

## Decisions log (append-only, newest first)

## Session log (append-only, newest first)
### 2026-07-21 · Claude Code · Synapse 3.0 "One Surface" concept published
- Did: published `/concepts/synapse-3/unified-surface.html` (self-contained, fictional data) + new first homepage Concepts card (Orbit icon); tweaked old "Synapse 3.0?" card dek to mark provenance. 7 role lenses on one time-spine incl. mid-session additions neuro hospitalist + EEG reader (real anchor: EEG Report Builder); Dr. Vega demos the legal multi-role day; "Daylight" light design language (full departure from 2.0). Locally verified over http (all lenses, toggles, canvas swaps, zero console errors).
- Next: Amplify auto-deploys on push; session log mirrors to Asana card "Unified app / Synapse 3.0". Concept only — nothing wired to engines.

### 2026-07-19 · Claude Code · Triage 403 fix + false-hold root cause and fix
- Did: (1) Fixed "Access denied" on /triage — `clinical_access_memberships` (migration 048) was EMPTY in prod; provisioned both steve@sevaro.com Cognito subs as `clinician`, tenant `default`, directly in RDS. No provisioning path exists yet (no seed/admin UI); teammates still 403 until provisioned. (2) Root-caused the "Human review required — scoring blocked" false holds: the safety-extraction prompt permits `no_time_critical_signal` alongside non-time-sensitive critical unknowns, but the validator demanded `same_day_clinician_review` for ANY unknown and discarded the branch on mismatch → fusion `undetermined` → unrecoverable hold (adjudicator is downgrade-forbidden by design). Reproduced live with the exact prod referral texts (Gutierrez: 3 benign unknowns, 0 signals, deterministic kill; Sandoval: intermittent scorer JSON flake). Fix: validator now floors `care_pathway` from the model's own signals (emergency signal ⇒ emergency_now; immediate-review signal ⇒ ≥ same_day) instead of throwing, never downgrades a stated pathway, logs when flooring fires; prompt gained the matching consistency rule; scorer gets one retry on non-timeout failures.
- Files: `src/lib/triage/modelSafetyExtraction.ts`, `src/lib/triage/modelSafetyExtractor.ts`, `src/lib/triage/processTriageInBackground.ts`, `tests/triage/modelSafetyExtraction.test.ts`, `CLAUDE.md`.
- Verification: triage suite 1,760 passed; tsc + lint clean; live Bedrock repro of both failures now passes; offline sentinel releaseGateEligible; live sentinel run + Bedrock cross-family review (gpt-oss-120b + DeepSeek-R1) same session — both models' Critical/High claims verified as false positives against the code (terminal failedModelBranch catch intact; flooring only ever raises), their observability suggestion adopted (floor warn log).
- Decisions: benign, non-time-sensitive unknowns no longer force a same-day hold (restores the prompt's signed-off intent; no tier definitions changed; understated pathways now floor upward instead of dying into a generic hold — strictly safer for the emergency direction). Adjudicator remains downgrade-forbidden — untouched, flagged as an open dial.
- Also: reason-specific denial messages on all 13 triage routes (`clinicalAccessDeniedMessage()` — 401 "Please sign in" vs 403 "not provisioned" vs 503), because a signed-out Chrome profile looked identical to a provisioning failure; extraction quality spot-checked in prod (Gutierrez summary is note-specific, confidence high) — "triager doesn't read the note" impression was the hold wall, not the extractor.
- Next: provisioning path for `clinical_access_memberships` (seed or admin script) before team testing; consider moving the outpatient scorer to the strict tool-output path like the safety extractor.
- Did: verified the intended product journey against current code and authoritative data/governance sources. The integrated `/consult` flow now embeds triage, AI Historian, patient tools, optional SDNE linkage, and a unified source-labeled report. Confirmed that historian context currently includes triage priority, chief complaint, summary, red flags, and prior intake—not the full raw referral. Reviewed current MIMIC-IV-Note and n2c2 access steps and federal QI/research and HIPAA deidentification guidance. No clinical data were accessed and no product code or deployment changed.
- Files/links touched: `HANDOFF.md`; read `src/lib/consult/contextBuilder.ts`, `src/components/consult/ConsultPipelineView.tsx`, `src/components/consult/HistorianStepPanel.tsx`, `src/components/consult/EmbeddedHistorian.tsx`, `src/lib/consult/report/report-builder.ts`, `src/app/sdne/page.tsx`, and relevant project documentation; reviewed official PhysioNet/MIMIC, Harvard n2c2, HHS OHRP, and HHS OCR guidance.
- Decisions: treat the overall product story as referral triage → informed patient history → optional digital exam → unified clinician preparation/documentation. Do not describe the full-note-to-historian or final desktop-scribe handoff as fully proven yet. Treat 200–500 retrospective referrals as an initial silent validation study, not definitive clinical validation, and obtain a formal institutional QI-versus-research/IRB determination. Do not place MIMIC/n2c2 notes into the current hosted model pipeline until the applicable DUA and compute arrangement are confirmed compatible.
- Open questions / needs Claude: select the institutional IRB/HRPP sponsor and validation partner; decide whether the historian needs full raw text or bounded source-grounded retrieval; verify the consult-report-to-Sevaro-desktop-scribe handoff; confirm live SENSE/SDNE result return and current demo latency.
- Next: create two concise artifacts if Steve approves: (1) MIMIC/n2c2 access and compliant-compute checklist, and (2) a one-page retrospective validation/QI-IRB concept with endpoints, labeling plan, and data-flow diagram. Then scope a polished five-minute administrator/finance demo using synthetic data only.

### 2026-07-13 · ChatGPT · Real clinical-note dataset research
- Did: searched authoritative sources for real, deidentified clinical notes that could strengthen triage testing. Confirmed that MIMIC-IV-Note and n2c2/i2b2 provide controlled-access real notes, but primarily hospital discharge summaries, progress reports, and radiology reports rather than outpatient neurology referrals. Found published use of real outpatient neurology clinic letters, but no downloadable public corpus; identified NeuroDiscovery AI as a possible governed collaboration source. No notes or patient data were downloaded.
- Files/links touched: `HANDOFF.md`; reviewed PhysioNet MIMIC-IV-Note, Harvard n2c2 data sets, the peer-reviewed ExECT neurology clinic-letter study, and NeuroDiscovery AI's data-access materials.
- Decisions: use MIMIC-IV-Note and n2c2 only as real-world documentation robustness sets, not as proof of outpatient referral-triage accuracy. Treat true validation as a governed partner study using deidentified historical referral notes with independent neurologist labels. Do not use random internet notes or weak-provenance scraped collections as validation data.
- Open questions / needs Claude: whether Steve wants a one-page access/application checklist and a partner validation protocol; legal, privacy, DUA, and possible IRB requirements must be confirmed before receiving partner data.
- Next: apply for MIMIC-IV-Note and selected n2c2 corpora for offline robustness testing; separately recruit one or more neurology partners for a silent retrospective validation set that matches the intended referral workflow.

### 2026-07-13 · ChatGPT · Triage demo and validation-partner readiness review
- Did: verified the curated triage safety architecture is contained in current `origin/main`; confirmed the live `/triage` page is publicly visible but both anonymous create and extract calls correctly return 401; reran the full offline sentinel on current code (29/29 evaluable synthetic cases acceptable, all software gates pass) and 404 focused sentinel/emergency/route-safety tests passed. Reviewed the July 12 classifier bake-off and production-readiness audit. No product code, database, deployment, or access policy changed.
- Files/links touched: `HANDOFF.md`; read-only review of triage code, `docs/clinical-safety/`, `qa/triage-sentinel/`, `qa/triage-validation/BAKEOFF_2026-07-12.md`, and the live `app.neuroplans.app/triage` surface. Generated a temporary sentinel report under `/tmp` only.
- Decisions: the tool is ready for controlled synthetic demonstrations and to begin governed validation-partner work; it is not ready for anonymous arbitrary-text access or clinical reliance. Preserve clinician authorization and add a separately scoped demo/partner access boundary rather than opening the clinical endpoints.
- Open questions / needs Claude: migrations 048 and 050–055 are documented as not yet applied; AWS credentials were unavailable to inspect the Amplify job directly; checked-in live sentinel reports cover only 1–2 case subsets despite a CLAUDE.md summary claiming a 26/26 live run; the classifier remains deliberately over-triage-prone and the 26-case expected labels still need independent clinical sign-off.
- Next: if Steve approves, design an expiring signed demo link limited to built-in synthetic referrals, then a separate authenticated partner-validation workflow with versioned cases, independent labels, feedback capture, and no clinical routing or patient binding.

### 2026-07-13 · ChatGPT · AI intake outpatient scenario expansion
- Did: reviewed the four existing synthetic outpatient intake scenarios and the recently improved shared Henry/Nova voice-intake flow. Started design work for adding two nonredundant outpatient scenarios; no application code or deployment changed.
- Files/links touched: `HANDOFF.md`; reviewed `src/lib/historianTypes.ts`, `src/components/NeurologicHistorian.tsx`, and recent Historian/intake commits.
- Decisions: Steve approved new tremor/parkinsonism and new memory/cognitive concern as the two additional scenarios. Keep this as a small scenario-library change on the existing public intake route; preserve synthetic-only use and the current consent flow.
- Open questions / needs Claude: awaiting Steve's approval of the exact card/guidance design; no application code has changed yet.
- Next: approve the concise design, then document it and implement with focused tests.

### 2026-07-13 · ChatGPT · AI voice intake agent public demo link check
- Did: confirmed the recently improved AI voice intake agent (internally named the AI Historian) at `https://app.neuroplans.app/patient/historian` is live and already bypasses Cognito via the existing `/patient` public-route rule; confirmed the page shows synthetic scenarios and supports `?scenario=headache_new` for a preselected demo. No product code or deployment changed.
- Files/links touched: `HANDOFF.md`; reviewed `src/middleware.ts`, `src/app/patient/historian/page.tsx`, `src/components/NeurologicHistorian.tsx`, the Historian session/save routes, and the live site response.
- Decisions: the existing preselected scenario link is sufficient for Steve's immediate no-password demo. Treat it as synthetic-only: completed conversations are currently recorded/transcribed and written to `historian_sessions`.
- Open questions / needs Claude: for broad sharing, decide whether to add a dedicated `/demo/historian` boundary that rejects real-patient context, avoids clinical DB persistence/notifications, labels synthetic-only use, and adds abuse/cost controls.
- Next: Steve tests the preselected headache link on his phone; implement the dedicated demo boundary only if he wants a hardened, broadly shareable version.

### 2026-07-13 · Claude Code · Handoff system initialized
- Did: created HANDOFF.md + AGENTS.md; pointed CLAUDE.md at HANDOFF.md
- Next: both AIs read HANDOFF.md first, update it last
