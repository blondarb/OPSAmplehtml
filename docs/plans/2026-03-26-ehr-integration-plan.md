I now have a comprehensive understanding of the codebase. Let me compile the full integration plan.

---

# OPSAmple Clinical Platform -- Comprehensive Integration Plan

## 1. Feature-by-Feature Disconnection Map

### 1.1 `/patient` -- Patient Portal (Intake Forms)

**Data source:** REAL (RDS)
- `POST /api/patient/register` calls RPC `portal_register_patient` -- writes to `patients` table.
- `POST /api/patient/intake` inserts into `patient_intake_forms` table.
- `GET /api/patient/intake` reads from `patient_intake_forms` table.

**What works:** Registration and intake form submission persist to the database. Intake forms can optionally link to a `patient_id`.

**What is missing:**
- No automatic creation of a `neurology_consults` pipeline record when a patient completes intake via the patient portal. The intake form exists in isolation unless the user enters through the `/consult` pipeline.
- No email/SMS notification to staff when a new intake arrives.
- Patient portal is publicly accessible (no patient-side auth) -- fine for demo, but needs patient authentication for production.
- No way for the patient to see their own data (past visits, results, messages) -- the portal is write-only.

---

### 1.2 `/patient/historian` -- AI Neurologic Historian

**Data source:** REAL (RDS)
- `POST /api/ai/historian/save` inserts into `historian_sessions` table.
- If a `consult_id` is provided, it calls `linkHistorianToConsult()` to update `neurology_consults`.
- `GET /api/ai/historian/save` lists sessions from `historian_sessions` with patient JOIN.
- `POST /api/ai/historian/session` creates ephemeral OpenAI Realtime API tokens (no DB).

**What works:** Historian sessions save structured output, transcript, red flags, and narrative summaries to the database. Sessions link to both patients and consults when IDs are provided.

**What is missing:**
- Historian output is not auto-imported into the `clinical_notes` HPI field. There is an `imported_to_note` boolean flag, but no automation -- the physician must manually trigger import.
- Scale results from auto-administered scales during historian sessions save to `scale_results` but are not surfaced in the physician's clinical note view automatically.
- No mechanism to trigger historian from a patient portal link (e.g., "complete your pre-visit interview").

---

### 1.3 `/patient/messages` -- Patient Messages

**Data source:** REAL (RDS)
- `POST /api/patient/messages` inserts into `patient_messages` table.
- `GET /api/patient/messages` reads from `patient_messages` table.

**What works:** Messages persist to the database with direction (inbound), optional patient linking, and tenant scoping.

**What is missing:**
- No real-time notification to providers when a patient message arrives. The `notifications` table exists but nothing creates a notification row when a message is inserted.
- AI draft responses (`/api/ai/draft-response`) are generated via Bedrock but the draft is not saved back to the `patient_messages.ai_draft` column automatically.
- No outbound message capability from the physician side -- messages are inbound-only.
- No message threading or conversation view.

---

### 1.4 `/patient/tools` -- Body Map & Motor Tests

**Data source:** REAL (RDS)
- `POST /api/patient/tools` inserts into `patient_body_map_markers` and `patient_device_measurements`.
- `GET /api/patient/tools` reads by `consult_id` or `patient_id`.

**What works:** Full persistence of body map markers (26 regions, symptom types, severity, laterality) and device measurements (finger tapping, tremor detection, postural sway).

**What is missing:**
- Results are not surfaced in the physician's EHR view. The consult report generator (`/api/neuro-consults/[id]/report`) does query these tables, but the main `/ehr` clinical note UI does not display them.
- No link from the patient portal to trigger these tools in context of an upcoming visit.

---

### 1.5 `/ehr` -- Clinical Documentation

**Data source:** REAL (RDS)
- Uses `fetchDashboardData()` which queries: `patients`, `visits` (with JOINs to `clinical_notes`, `clinical_scales`, `diagnoses`), `imaging_studies`, `scale_results`, `patient_messages`, `patient_intake_forms`, `historian_sessions`.

**What works:** This is the most database-connected feature. It reads real patients, visits, clinical notes, imaging, scales, and historian sessions. Visits can be created, clinical notes saved, and notes signed.

**What is missing:**
- Patient selection is RANDOM when no `?patient=` param is provided -- there is no schedule-driven patient loading.
- No integration with the appointments system -- the physician should open a patient chart from today's schedule, not a random patient.
- Wearable data is not surfaced in the EHR view.
- Follow-up session summaries are not displayed.
- Body map / device measurement results from `/patient/tools` are not shown.
- The `imported_to_note` flag for historian sessions has no UI to trigger it.

---

### 1.6 `/physician` -- Physician Home (Clinical Cockpit)

**Data source:** REAL (RDS) -- same as `/ehr`
- Uses identical `fetchDashboardData()` function.

**What works:** Same data pipeline as `/ehr`. Renders `PhysicianPageWrapper` which includes the Clinical Cockpit two-column layout (schedule + briefing, notification drawer).

**What is missing:**
- Schedule column calls `/api/appointments` which falls back to DEMO_TEMPLATES when no real appointments exist in the database.
- Morning briefing is entirely hardcoded (DEMO_BRIEFING) -- the AI generation pipeline is stubbed with a TODO.
- Notification feed reads from the `notifications` table (real), but notifications must be manually seeded -- no system generates them automatically.

---

### 1.7 `/dashboard` -- Command Center (Operations Dashboard)

**Data source:** DEMO (hardcoded)
- `/api/command-center/metrics` -- returns `DEMO_METRICS` object (hardcoded counts). Has a detailed TODO comment listing the real queries needed.
- `/api/command-center/patients` -- returns `DEMO_PATIENTS` array (12 hardcoded patients with fake IDs like `p-1`). Not linked to real `patients` table.
- `/api/command-center/actions` -- returns `DEMO_ACTIONS` array (hardcoded action items). Not linked to `command_center_actions` table.
- `/api/command-center/briefing` -- returns `DEMO_BRIEFING` (hardcoded narrative).
- `/api/command-center/patients/[id]/summary` -- generates AI summary but from demo patient data.

**What is missing:** This is the most disconnected feature. ALL FIVE zones use hardcoded demo data:
1. Operational Summary / Briefing -- demo narrative
2. Status Bar (8 metric tiles) -- demo counts
3. Action Queue -- demo actions not linked to real DB
4. Patient Queue -- demo patients not linked to real DB
5. Quick Access Strip -- links only (this is fine)

The `command_center_actions` and `command_center_briefings` tables exist in the schema but are not used by any API route.

---

### 1.8 `/consult` -- Neuro Intake Pipeline

**Data source:** REAL (RDS)
- `POST /api/neuro-consults` creates records in `neurology_consults` table.
- Pipeline functions (`linkTriageToConsult`, `linkIntakeToConsult`, `linkHistorianToConsult`, `linkSDNEToConsult`) all write to `neurology_consults`.
- Triage `/api/triage` saves to `triage_sessions` and optionally creates/links consults.
- Report generation reads from `neurology_consults`, `scale_results`, `patient_body_map_markers`, `patient_device_measurements`, `red_flag_events`, and writes to `consult_reports`.

**What works:** This is the best-integrated feature. The full pipeline (Triage -> Intake -> Historian -> SDNE -> Report) is wired with database persistence and state tracking through an 11-state status machine.

**What is missing:**
- No automatic scheduling of an appointment when a consult reaches `historian_complete` or `complete` status.
- SDNE integration requires manual data entry (the iframe does not communicate back to the parent app via postMessage).
- Consult reports are generated but there is no workflow to convert a consult report into an EHR clinical note / visit.
- No notification when pipeline advances (e.g., "Historian session complete for patient X").

---

### 1.9 `/follow-up` -- AI Follow-Up Agent

**Data source:** REAL (RDS)
- `/api/follow-up/message` persists to `followup_sessions` (INSERT on first message, UPDATE on subsequent). Also creates `followup_escalations` and `followup_billing_entries`.
- `/api/follow-up/analytics` reads from `followup_sessions` and `followup_billing_entries` -- real DB queries.
- `/api/follow-up/billing` reads from `followup_billing_entries` -- real DB queries.
- `/api/follow-up/send-sms` uses Twilio + `followup_phone_sessions` (ephemeral mapping for live SMS demo).

**What works:** Conversation persistence is solid. Sessions, escalations, and billing entries all persist. Analytics and billing dashboards read real data.

**What is missing:**
- Demo scenarios (`DEMO_SCENARIOS`) are used to pre-populate patient context for the conversation UI. In production, patient context should come from the real `patients` + `visits` tables.
- SMS follow-ups use demo scenarios rather than real patient data.
- No mechanism to automatically initiate follow-up after a visit is completed.
- No notification to physician when an escalation is triggered during follow-up.

---

### 1.10 `/wearable` -- Wearable Monitoring

**Data source:** MIXED (Real + Demo)
- `/api/wearable/patients` reads from both `wearable_patients` (demo DB: `github_showcase`) and `wearable_patients` (live DB: `sevaro_monitor`). Deduplicates and prioritizes live data.
- `/api/wearable/demo-data` reads from both databases, normalizing iOS HealthKit data formats.
- Live patient data comes from a separate `sevaro_monitor` database written by the SevaroMonitor iOS app via Lambda.

**What works:** Real wearable data flows from the iOS app through Lambda to RDS (`sevaro_monitor` database). The web dashboard reads and normalizes this data. Demo patients provide fallback data.

**What is missing:**
- Wearable alerts are not written to the `notifications` table.
- Wearable data is not surfaced in the EHR or command center (command center metrics show hardcoded wearable counts).
- No alert acknowledgment workflow.
- Patient IDs in `sevaro_monitor` are not linked to patient IDs in `ops_amplehtml` -- the live patient entry has a hardcoded name ("Steve Arbogast").

---

### 1.11 `/rpm` -- Remote Patient Monitoring

**Data source:** REAL (External API)
- All RPM routes (`/api/rpm/devices`, `/api/rpm/vitals`, `/api/rpm/glucose`, `/api/rpm/alerts`, `/api/rpm/billing`) proxy to an external API at `https://3eyoktd935.execute-api.us-east-2.amazonaws.com` using an API key from Secrets Manager.

**What works:** RPM data comes from a real external API (Lambda-backed). Device connections, vitals, glucose readings, and alerts are fetched in real time.

**What is missing:**
- RPM data is completely isolated from the rest of the platform. No connection to `patients`, `visits`, or `clinical_notes` tables.
- RPM alerts are not written to the `notifications` table.
- RPM billing is separate from follow-up billing.
- No way to view RPM data within the EHR for a specific patient.

---

### 1.12 `/sdne` -- Digital Neurological Exam

**Data source:** EXTERNAL (iframe)
- Embeds an external Amplify-hosted SDNE dashboard via iframe.
- SDNE integration exists in the consult pipeline (`/api/neuro-consults/[id]/sdne`) for linking session results.

**What works:** The iframe renders. The consult pipeline has full SDNE linkage support (request, link, retrieve).

**What is missing:**
- No postMessage bridge between the iframe and OPSAmple. SDNE results must be manually entered or linked via API.
- The standalone `/sdne` page has no patient context -- it just shows the iframe.
- SDNE results linked to consults are not surfaced in the EHR clinical note.

---

### 1.13 `/triage` -- AI Triage

**Data source:** REAL (RDS)
- `POST /api/triage` runs Bedrock AI, saves to `triage_sessions`, and optionally creates/links `neurology_consults`.
- Supports validation framework (`/triage/validate/*`) with test cases.

**What works:** Full persistence. Triage results save with scores, red flags, recommendations, and auto-link to the consult pipeline.

**What is missing:**
- No notification when a high-urgency triage result comes in.
- No automatic scheduling for emergent/urgent triage results.
- Triage results are not visible in the command center metrics (hardcoded).

---

### 1.14 `/mobile` -- Mobile Clinical Interface

**Data source:** DEMO (hardcoded)
- Patient list uses `samplePatients` array (hardcoded, 8 patients).
- Chart view uses `samplePatients` lookup (hardcoded).
- Settings shows "Dr. Demo User" and "demo@sevaro.health".

**What is missing:** The mobile interface is entirely disconnected from the database. It needs to:
- Load patients from `/api/patients/list` or `/api/appointments`.
- Load chart data from `fetchDashboardData()` or equivalent.
- Connect voice recorder to `/api/ai/transcribe` and `/api/ai/visit-ai`.

---

### 1.15 Appointments System

**Data source:** MIXED (Real + Demo fallback)
- `GET /api/appointments` queries the `appointments` table with full JOINs. If NO appointments are found, it falls back to `DEMO_TEMPLATES` (8 hardcoded appointments).
- `POST /api/appointments` creates real appointments in the database.
- `POST /api/visits` creates visits linked to appointments.

**What is missing:**
- No seeded appointment data means the system always shows demo appointments.
- No integration with intake pipeline -- completing intake should auto-create an appointment.
- No appointment status updates when visits complete.

---

## 2. Data Flow Gaps -- The Patient Journey

```
Patient Registers  -->  Intake Form  -->  AI Historian  -->  Triage  -->
     [OK: DB]          [OK: DB]        [OK: DB]          [OK: DB]

Clinician Sees Patient  -->  EHR Documentation  -->  Follow-Up  -->
   [BROKEN: random]         [OK: DB]               [BROKEN: demo context]

Wearable Monitoring  -->  Next Visit
[ISOLATED: separate DB]  [BROKEN: no scheduling loop]
```

### Break Points:

**Break 1: Intake -> Triage (partial)**
Intake forms exist in `patient_intake_forms` but do not auto-trigger triage. The consult pipeline handles this when accessed via `/consult`, but the patient portal path (`/patient`) does not create a consult record.

**Break 2: Triage/Historian -> Clinician (scheduling gap)**
After triage completes and the consult reaches `historian_complete`, nothing schedules an appointment or alerts a clinician. The consult sits in the database until someone manually looks at `/consult`.

**Break 3: Clinician -> EHR (patient selection)**
The physician gets a RANDOM patient when opening `/ehr` rather than seeing their scheduled patients. There is no "click on today's schedule -> open chart" flow.

**Break 4: EHR -> Follow-Up (context gap)**
When a visit is completed, nothing automatically triggers a follow-up session. The follow-up agent uses demo patient scenarios instead of pulling context from the actual completed visit.

**Break 5: Follow-Up -> Wearable (data silo)**
Wearable data lives in a separate database (`sevaro_monitor`) with no patient ID linkage to the main database. Follow-up sessions cannot reference wearable trends.

**Break 6: Wearable -> Next Visit (no loop)**
Wearable alerts do not trigger appointments, notifications, or triage. There is no feedback loop.

**Break 7: All Features -> Command Center (demo wall)**
The command center reads zero real data. It should aggregate across all the systems that DO persist data.

**Break 8: All Features -> Notifications (no generation)**
The `notifications` table exists and the API reads from it, but nothing writes to it. No automated notification generation from any system event.

---

## 3. Integration Architecture

### 3.1 Notification Engine (Foundation)

**Needed for:** Every feature that needs to alert clinicians.

**New file:** `src/lib/notifications/engine.ts`

**Functions needed:**
- `createNotification(type, priority, title, body, patientId?, metadata?)` -- INSERT into `notifications`
- `bulkCreateNotifications(...)` -- batch insert

**Triggers (call sites):**
- Patient message received -> `POST /api/patient/messages` calls `createNotification('patient_message', ...)`
- Triage complete (urgent+) -> `POST /api/triage` calls `createNotification('triage_result', ...)`
- Follow-up escalation -> `POST /api/follow-up/message` calls `createNotification('followup_escalation', ...)`
- Historian red flag -> `POST /api/ai/historian/save` calls `createNotification('historian_red_flag', ...)`
- Wearable alert -> new cron or webhook handler calls `createNotification('wearable_alert', ...)`
- Unsigned note reminder -> `GET /api/incomplete-docs` side-effect or cron

**Complexity:** Medium | **Effort:** 12-16 hours | **Dependencies:** None | **Risk:** Low

---

### 3.2 Command Center -- Wire to Real Data

**Metrics API (`/api/command-center/metrics`):**
Replace `DEMO_METRICS` with real queries (the TODO comment already lists every query):
- `schedule`: `SELECT COUNT(*) FROM visits WHERE visit_date = CURRENT_DATE`
- `messages`: `SELECT COUNT(*) FROM patient_messages WHERE status = 'unread' AND direction = 'inbound'`
- `refills`: query `patient_medications` for approaching refill dates
- `results`: `SELECT COUNT(*) FROM imaging_studies WHERE impression IS NULL`
- `wearables`: query `wearable_alerts` (cross-database) or proxy via RPM API
- `followups`: `SELECT COUNT(*) FROM followup_sessions WHERE escalation_level IN ('same_day','urgent')`
- `triage`: `SELECT COUNT(*) FROM triage_sessions WHERE status = 'pending_review'` (need to add status column)
- `ehr`: `SELECT COUNT(*) FROM clinical_notes WHERE signed_at IS NULL`

**Patient Queue (`/api/command-center/patients`):**
Replace `DEMO_PATIENTS` with:
```sql
SELECT p.*, 
  (SELECT COUNT(*) FROM patient_messages pm WHERE pm.patient_id = p.id AND pm.status = 'unread') as pending_messages,
  (SELECT COUNT(*) FROM followup_sessions fs WHERE fs.patient_id = p.id AND fs.escalation_level IS NOT NULL) as pending_followups,
  ...
FROM patients p
ORDER BY urgency_score DESC
```
Need to compute urgency from pending item counts.

**Actions (`/api/command-center/actions`):**
Replace `DEMO_ACTIONS` with reads from `command_center_actions` table (already exists in schema).

**Briefing (`/api/command-center/briefing`):**
Wire the TODO pipeline: gather real data snapshot, send to Bedrock, cache in `command_center_briefings`.

**Complexity:** High | **Effort:** 40-60 hours | **Dependencies:** Notification engine, seeded appointment data | **Risk:** Medium (performance -- multiple cross-table queries)

---

### 3.3 Appointment-Driven Patient Flow

**Changes needed:**
1. Seed real appointment data (or build appointment creation UI on physician home).
2. Modify `/physician` schedule column to load from `/api/appointments` (already does, but data is demo).
3. Add "Start Visit" button on each appointment that calls `POST /api/visits` with the appointment's patient ID.
4. Modify `/ehr` to accept `?appointment=` param and load the linked patient.
5. When a consult completes triage, auto-create an appointment via `POST /api/appointments`.

**New table changes:** None (appointments table already exists).

**Complexity:** Medium | **Effort:** 16-24 hours | **Dependencies:** None | **Risk:** Low

---

### 3.4 Patient Portal -> Consult Pipeline Bridge

**Changes needed:**
1. When `POST /api/patient/intake` completes, auto-create a `neurology_consults` record by calling `createConsult()` with the intake data.
2. Pass the `consult_id` back to the patient portal so subsequent steps (historian, tools) link to it.
3. Add a patient-facing triage step that feeds intake text through `/api/triage`.

**New API route:** `POST /api/patient/start-consult` -- orchestrates: create consult -> link intake -> return consult ID.

**Complexity:** Medium | **Effort:** 12-16 hours | **Dependencies:** None | **Risk:** Low

---

### 3.5 Historian -> Clinical Note Auto-Import

**Changes needed:**
1. Add `POST /api/visits/[id]/import-historian` route that takes a `historian_session_id`, reads the structured output, and merges into the clinical note's HPI, ROS, and other fields using the existing note-merge engine (`src/lib/note-merge/`).
2. Add UI button in the EHR historian session panel to trigger import.
3. Update `imported_to_note` flag on `historian_sessions` after successful import.

**Complexity:** Medium | **Effort:** 12-16 hours | **Dependencies:** None | **Risk:** Medium (merge quality -- may need iteration)

---

### 3.6 Visit Completion -> Follow-Up Auto-Trigger

**Changes needed:**
1. When `POST /api/visits/[id]/sign` is called, check if the visit qualifies for follow-up.
2. Auto-create a follow-up task (new table: `followup_tasks` or use `command_center_actions`).
3. Populate patient context from the actual visit data rather than demo scenarios.
4. Add `/api/follow-up/from-visit` route that builds patient context from a visit ID.

**Complexity:** Medium | **Effort:** 16-20 hours | **Dependencies:** Notification engine | **Risk:** Low

---

### 3.7 Wearable Data Unification

**Changes needed:**
1. Create a patient mapping table linking `sevaro_monitor.wearable_patients.id` to `ops_amplehtml.patients.id`.
2. Add wearable summary to EHR left sidebar (new component or tab).
3. Wire wearable alerts into the notification engine.
4. Add wearable trend data to the command center metrics API.

**New table:** `patient_wearable_links (patient_id UUID REFERENCES patients(id), wearable_patient_id UUID, source TEXT)`

**Complexity:** High | **Effort:** 24-32 hours | **Dependencies:** Notification engine | **Risk:** Medium (cross-database queries, performance)

---

### 3.8 Mobile Interface -- Wire to Real Data

**Changes needed:**
1. Replace `samplePatients` with API call to `/api/appointments?date=today`.
2. Replace `samplePatients` chart lookup with call to `fetchDashboardData(patientId)` via a new client-side API.
3. Wire mobile voice recorder to `/api/ai/transcribe` and `/api/ai/visit-ai`.
4. Add mobile-specific auth flow.

**Complexity:** Medium | **Effort:** 16-24 hours | **Dependencies:** Appointment-driven flow | **Risk:** Low

---

### 3.9 SDNE PostMessage Bridge

**Changes needed:**
1. Add `postMessage` listener in the SDNE iframe host (`/sdne/page.tsx`) to receive session completion events.
2. Modify the SDNE app to send results via `postMessage` when a session completes.
3. Auto-call `/api/neuro-consults/[id]/sdne` with the results.
4. Display SDNE results in the EHR view (new section in the Recommendation tab).

**Complexity:** Medium | **Effort:** 16-20 hours | **Dependencies:** SDNE app changes (separate repo) | **Risk:** Medium (cross-origin security)

---

### 3.10 AI Draft Response Persistence

**Changes needed:**
1. After `POST /api/ai/draft-response` generates a draft, UPDATE `patient_messages SET ai_draft = $draft, draft_status = 'pending'` for the given `message_id`.
2. Add physician approval UI to review and send/edit the draft.
3. Create outbound message flow: approved draft -> INSERT new `patient_messages` row with `direction = 'outbound'`.

**Complexity:** Low | **Effort:** 8-12 hours | **Dependencies:** None | **Risk:** Low

---

## 4. Scope Estimates Summary

| # | Integration Piece | Complexity | Effort (hrs) | Dependencies | Risk |
|---|---|---|---|---|---|
| 3.1 | Notification Engine | Medium | 12-16 | None | Low |
| 3.2 | Command Center Real Data | High | 40-60 | 3.1, 3.3 | Medium |
| 3.3 | Appointment-Driven Flow | Medium | 16-24 | None | Low |
| 3.4 | Portal -> Consult Bridge | Medium | 12-16 | None | Low |
| 3.5 | Historian -> Note Import | Medium | 12-16 | None | Medium |
| 3.6 | Visit -> Follow-Up Trigger | Medium | 16-20 | 3.1 | Low |
| 3.7 | Wearable Unification | High | 24-32 | 3.1 | Medium |
| 3.8 | Mobile Real Data | Medium | 16-24 | 3.3 | Low |
| 3.9 | SDNE PostMessage Bridge | Medium | 16-20 | SDNE repo | Medium |
| 3.10 | AI Draft Persistence | Low | 8-12 | None | Low |

**Total estimate: 173-240 hours (roughly 5-7 developer-weeks)**

---

## 5. Phased Approach

### Phase 1: Core Patient Data Flow (Weeks 1-2)
**Goal:** A patient can register, complete intake, and appear on a physician's schedule.

| Task | Effort | Deliverable |
|---|---|---|
| 3.3 Appointment-Driven Flow | 16-24h | Physicians see real scheduled patients |
| 3.4 Portal -> Consult Bridge | 12-16h | Intake auto-creates consult pipeline record |
| 3.10 AI Draft Persistence | 8-12h | Message drafts save and can be sent |
| Seed appointment data migration | 4h | Real appointments in database |

**Value delivered:** End-to-end flow from patient registration through intake to appearing on the physician's schedule. Messages get AI-drafted responses that persist.

---

### Phase 2: Clinical Documentation (Weeks 3-4)
**Goal:** Historian output flows into clinical notes. Visit completion is tracked.

| Task | Effort | Deliverable |
|---|---|---|
| 3.5 Historian -> Note Import | 12-16h | One-click historian data import to note |
| 3.1 Notification Engine | 12-16h | Foundation for all automated alerts |
| Patient tools display in EHR | 8h | Body map / motor test results visible in chart |

**Value delivered:** The AI historian actually feeds the clinical note. Physicians see patient-reported data. Notification infrastructure is ready.

---

### Phase 3: AI Features & Follow-Up (Weeks 5-6)
**Goal:** Follow-up agents use real patient data. Escalations trigger notifications.

| Task | Effort | Deliverable |
|---|---|---|
| 3.6 Visit -> Follow-Up Trigger | 16-20h | Completed visits auto-trigger follow-up |
| Follow-up escalation notifications | 4h | Physicians alerted on escalations |
| Triage result notifications | 4h | Staff alerted on urgent referrals |

**Value delivered:** The post-visit loop closes. AI follow-up uses real visit context. Critical events generate alerts.

---

### Phase 4: Command Center & Monitoring (Weeks 7-9)
**Goal:** The command center becomes the real operational hub.

| Task | Effort | Deliverable |
|---|---|---|
| 3.2 Command Center Real Data | 40-60h | All 5 zones use live data |
| 3.7 Wearable Unification | 24-32h | Wearable data linked to patients |

**Value delivered:** The dashboard shows real practice metrics, real patient queues, and real action items. Wearable data is accessible across the platform.

---

### Phase 5: External Integrations & Mobile (Weeks 10-12)
**Goal:** SDNE integration, mobile interface, and polish.

| Task | Effort | Deliverable |
|---|---|---|
| 3.9 SDNE PostMessage Bridge | 16-20h | SDNE results auto-flow into consults |
| 3.8 Mobile Real Data | 16-24h | Mobile app uses real patient data |
| Twilio production configuration | 8h | SMS follow-up with real patient numbers |

**Value delivered:** The platform works on mobile with real data. SDNE exams integrate seamlessly. SMS follow-up is production-ready.

---

## Key Risks and Mitigations

1. **Cross-database queries (wearable):** The `sevaro_monitor` and `ops_amplehtml` databases are on the same RDS instance but require separate connection pools. Mitigation: Use the existing `getWearablePool()` pattern and keep cross-DB operations asynchronous.

2. **Command center performance:** Aggregating metrics across 8+ tables on every page load could be slow. Mitigation: Cache metrics in `command_center_briefings` table, refresh on a 5-minute interval or on-demand.

3. **Note merge quality:** Auto-importing historian output into clinical notes may produce formatting issues. Mitigation: The note-merge engine already exists (`src/lib/note-merge/`); build import as a preview-then-confirm flow.

4. **SDNE cross-origin messaging:** The iframe is on a different Amplify domain. Mitigation: Use `postMessage` with strict origin validation. Requires changes in both repos.

5. **Patient authentication:** The patient portal is currently public. For production EHR use, patient-side authentication is needed. This is out of scope for integration work but should be planned.

6. **Missing database tables:** Some features reference tables that may not have been created yet (e.g., `followup_sessions`, `followup_escalations`, `followup_billing_entries`, `triage_sessions`, `patient_intake_forms`, `appointments`). These tables are not in the migrations directory (migrations start at 032). Mitigation: Audit which tables exist before starting each phase; create migrations as needed.

---

## Summary

The codebase is more connected than it initially appears. The consult pipeline (`/consult` + `neurology_consults`) is genuinely well-integrated with Triage, Intake, Historian, SDNE, and Report generation all persisting to and reading from the database. The EHR documentation system also uses real data throughout.

The biggest disconnections are:
1. **Command Center** -- 100% demo data across all 5 zones
2. **Mobile** -- 100% hardcoded sample data
3. **Appointments** -- real API exists but falls back to demo templates
4. **The scheduling bridge** -- no connection between completed triage/consult and the physician's schedule
5. **Notification generation** -- the table and read API exist, but nothing writes notifications
6. **Wearable patient identity** -- separate database with no patient ID linkage

The phased approach prioritizes closing the patient registration -> scheduling -> documentation loop first (highest clinical value), then layering on AI features, the command center, and external integrations.
