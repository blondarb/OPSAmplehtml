# Card 1: My Patients & Schedule — Product Playbook

> **⚠️ ACTIVE DEVELOPMENT (February 2026):** This card has been redesigned as the **Clinician Cockpit** — a two-column "overview of my day" view at `/physician`. The Cockpit layout is: Schedule (left column, ~380px) | Time-Phased Briefing (right column, flex). Notifications are accessed via a bell icon that opens a slide-over drawer (380px). Schedule features week-strip navigation with prev/next arrows, toggleable mini-month grid, and appointment cards with prep status badges. The briefing adapts to time of day (Morning/Midday/End of Day) with phase-specific narratives, icons, and gradient borders. There is no inline charting — clicking a patient navigates to the appointments view. For the current build's architecture, see the main CLAUDE.md and the codebase at `src/app/physician/` and `src/components/home/`.

---

## 1. Executive Summary

My Patients & Schedule is the physician's home base — the central workspace where a neurologist sees their patient list, reviews the day's schedule, opens individual patient charts, and makes clinical decisions informed by data flowing in from every other card in the platform. This card is the integration story. Triage (Card 3) classifies and routes a referral → the patient appears on the physician's schedule. The SDNE (Card 5) captures a structured neurological exam → the results populate the chart. The Follow-Up Agent (Card 4) contacts the patient after the visit → the conversation summary lands in the inbox. Wearable monitoring (Card 6) runs between visits → alerts and trend data appear in the patient timeline. The Command Center (Card 2) aggregates everything → but this card is where the physician does the actual clinical work. For investors, this card demonstrates that the platform is not a collection of disconnected prototypes — it is an integrated clinical workspace where AI-generated intelligence surfaces at the point of care. For clinicians, this card answers the question: "What does my day look like, and what do I need to know before I walk into the room?"

> **Design principle (CMIO):** Every other card in the platform produces data. This card *consumes* data. It must feel like a real EHR workspace — familiar enough that a neurologist immediately understands the layout, but intelligent enough that they see things they've never seen in Epic or Athena. The key differentiator is the **AI Pre-Visit Briefing**: a 15-second synthesized summary of everything the platform knows about the patient, generated fresh before every encounter.

---

## 2. How To Use This Section

- **Step 1:** Navigate to the **Clinician Cockpit** card from the homepage (top row, "Clinician Journey" track). This opens `/physician`, a two-column overview: Schedule (left) and Time-Phased Briefing (right). The breadcrumb bar shows "< Home | Clinician Cockpit | Demo".
- **Step 2:** In the Schedule column (left), use the week-strip navigation (Mon–Fri with prev/next arrows) to browse days. Toggle "Month view" to show a mini-month grid with appointment dots. Each appointment row displays: time, patient name, visit type badge (New/Follow-up/Urgent), chief complaint, prep status dot (green=ready, yellow=partial, red=needs prep), and alert icons.
- **Step 3:** Click the notification bell (top-right, with badge count) to open the slide-over notification drawer. Filter by All/Urgent/Messages/Tasks. Each notification card shows inline clinical data (vitals, wearable readings) and expandable detail sections.
- **Step 4:** Click on a patient row to navigate to the appointments view for full charting.
- **Step 4:** Before reviewing the chart, notice the **AI Pre-Visit Briefing** panel at the top of the center area. This is a synthesized summary pulling from triage results, follow-up conversations, wearable data, SDNE history, and prior visit notes — everything the platform knows about this patient, compressed into a 15-second read.
- **Step 5:** Navigate the chart tabs: **Summary** (AI briefing + longitudinal overview), **History** (HPI, ROS, meds, allergies, scales), **Imaging/Results** (studies with findings), **Physical Exams** (structured exam + SDNE data), **Recommendation** (assessment, DDx, plan with smart recommendations).
- **Step 6:** On the Summary tab, notice the cross-card data sections: Triage Result (from Card 3), Follow-Up Status (from Card 4), SDNE Exam History (from Card 5), and Wearable Trends (from Card 6). Each section links to the source card for full detail.
- **Step 7:** Use the inline AI tools: dictate into any text field (red mic button), expand with AI (teal star button), or insert a dot phrase (purple lightning button). These tools are available on every text field in the chart.
- **Step 8:** When documentation is complete, click "Generate Note" to produce a formatted clinical note that merges all sources — manual entry, Chart Prep dictation, Visit AI transcription, and AI-generated content — into a single, copy-ready document.
- **Step 9:** Review the generated note in the preview modal. Use "AI Review" to check for completeness, consistency, and quality. Use "Ask AI" to query anything about the note. When satisfied, click "Sign & Complete" to finalize the visit.

---

## 3. Clinical Context & Problem Statement

### The Problem

The physician's daily workflow in outpatient neurology is fragmented across multiple systems, each holding a piece of the clinical picture:

1. **The EHR** (Epic, Athena, eClinicalWorks) holds the patient's medical record, prior notes, orders, and results — but provides no intelligence. The physician reads through pages of prior documentation to prepare for each visit.
2. **The referral** arrived via fax, patient portal, or e-consult. If it was triaged, the triage recommendation may be on a sticky note, in an email, or in a queue the physician never checks.
3. **The phone messages** from post-visit follow-up calls — if they happened at all — are buried in the nurse's task list or scattered across voicemail, patient portal messages, and EHR InBasket items.
4. **The wearable data** — if the patient uses a smartwatch — is on the patient's phone. The physician has no access, no analysis, and no way to incorporate it into clinical decisions.
5. **The neurological exam** from the last visit is documented in free text: "Gait: slightly unsteady, improved from prior." Compared to what? Measured how?

The result: the physician spends 5-10 minutes per patient preparing for a 30-minute visit — scanning prior notes, searching for the referral, checking the task list for follow-up results — and still walks into the room missing critical context. This pre-visit preparation time is uncompensated, unreimbursable, and frequently inadequate.

### The Clinical Workflow

```
Pre-visit preparation → Patient arrives → History & exam → Assessment & plan → Documentation → Sign & close
```

My Patients & Schedule sits at the beginning: pre-visit preparation. It also encompasses the documentation phase at the end. The AI Pre-Visit Briefing eliminates the 5-10 minutes of manual chart review by synthesizing all available data into a single summary. The clinical documentation tools (dictation, AI assistance, dot phrases, note merge engine) reduce documentation time by 40-60%.

### Patient Population

Every patient on the neurologist's schedule:

- New patient referrals (triaged via Card 3)
- Follow-up patients (with or without interval follow-up data from Card 4)
- Patients with wearable monitoring data (Card 6)
- Patients with prior SDNE exam data (Card 5)
- Urgent add-ons and same-day appointments
- Telemedicine encounters

### Why AI Adds Value

- **Pre-visit synthesis**: AI reads everything the platform knows about a patient and produces a 15-second briefing — something no human can do consistently across 20+ patients per day
- **Cross-system integration**: AI connects data from triage, follow-up, wearable monitoring, and SDNE that would otherwise remain in separate silos
- **Documentation acceleration**: Voice dictation, AI-assisted field expansion, and the note merge engine reduce documentation time while improving note quality
- **Clinical decision support**: Smart diagnosis suggestions, treatment recommendations from neuro-plans, and clinical scale suggestions based on the patient's conditions
- **Continuous learning**: The pre-visit briefing improves over time as more data accumulates from each card

---

## 4. Functional Requirements

### 4.1 Schedule View (Landing Page)

| Element | Details |
|---|---|
| **Day selector** | Date picker defaulting to today. Left/right arrows for previous/next day. "Today" button to return. |
| **Schedule table** | Rows: Time slot, Patient Name (age/sex), Visit Type badge (New / Follow-up / Urgent / Telemedicine), Chief Complaint (from referral or last visit), Triage Tier badge (color-coded, from Card 3, if applicable), Alert indicators (wearable alert icon, follow-up escalation icon, pending message icon). |
| **Patient count** | Header shows: "12 patients · 3 new · 2 urgent · 1 telemedicine" |
| **Quick filters** | Pill buttons: All, New Patients, Follow-ups, Urgent, With Alerts |
| **Pre-visit briefing preview** | On hover/click of a patient row: a popover shows a condensed 3-line AI briefing. Full briefing available in the chart. |
| **Slot status indicators** | Each row shows: Empty (available), Checked in (blue), In progress (teal), Completed (green), No-show (gray), Cancelled (strikethrough) |

> **Design rationale (CMIO):** The schedule view must answer one question in under 3 seconds: "What's my day look like?" The triage badges and alert indicators are the critical visual elements — they tell the physician which patients need extra attention before they even open a chart. A neurologist seeing 20 patients per day cannot afford to open every chart to discover a wearable alert from 3 AM.

### 4.2 Patient Chart — Layout

The chart opens when a physician clicks a patient from the schedule. The layout follows the existing Sevaro clinical workspace:

| Panel | Position | Contents |
|---|---|---|
| **Left Sidebar** | 260px fixed | Patient demographics card (name, age, sex, DOB, insurance, badges), video/phone action buttons, quick links (PACS, VizAI, Epic), prior visits with AI summaries, score history with trends, allergy banner, medication summary, historian session cards |
| **Center Panel** | Flex | Tab navigation (Summary, History, Imaging/Results, Physical Exams, Recommendation), action bar (mic, AI, dot phrases, copy, Generate Note, Pend, Sign & Complete), active tab content |
| **Right Drawers** | Slide-in overlay | Voice Drawer (Chart Prep + Document, red theme), AI Drawer (Ask AI + Summary + Handout, teal theme), Dot Phrases Drawer (purple theme) |

### 4.3 Summary Tab — Cross-Card Integration Hub

This is the new tab that makes the "My Patients & Schedule" card the integration hub. It displays data from all other cards in a single view.

**AI Pre-Visit Briefing (Top Section)**

| Element | Details |
|---|---|
| **Briefing card** | White card with teal left border. Header: "AI Pre-Visit Briefing" with generation timestamp. Content: 3-5 paragraph synthesized summary. |
| **Data sources** | Below the briefing, small badges show which data sources contributed: "Triage ✓", "Follow-Up ✓", "Wearable ✓", "SDNE ✓", "Prior Notes ✓". Badges are grayed out if no data exists for that source. |
| **Refresh button** | Regenerate briefing (useful if new data arrived since last generation). |
| **Expand/collapse** | Briefing is expanded by default on first view, can be collapsed for returning visits. |

**Cross-Card Data Sections (Below Briefing)**

| Section | Source | Display |
|---|---|---|
| **Triage Result** | Card 3 (`triage_sessions`) | Tier badge, top 3 reasons, red flags, suggested workup, subspecialty routing. "View Full Triage →" link. Only shown for patients who went through triage. |
| **Follow-Up Status** | Card 4 (`followup_sessions`) | Most recent follow-up summary: date, method (SMS/voice), medication status, escalation flags, functional status. "View Conversation →" link. Shown if any follow-up session exists for this patient. |
| **SDNE Exam History** | Card 5 (`sdne_sessions`) | Most recent SDNE exam date, domain heatmap (GREEN/YELLOW/RED/GRAY), composite score, change from prior exam. "View Full SDNE →" link. Shown if any SDNE exam exists. |
| **Wearable Trends** | Card 6 (`wearable_daily_summaries`, `wearable_anomalies`) | Sparkline charts for key metrics (steps, sleep, HRV) over last 30 days, with anomaly markers. Active alerts listed. "View Timeline →" link. Shown if wearable data exists. |

> **Design rationale (CMIO):** The Summary tab is the physician's "cheat sheet." Before walking into the room, you glance at this tab and know: what the triage said, how the patient did after the last visit, whether their wearable data shows concerning trends, and how their neuro exam has changed over time. No other EHR in existence does this. This is the demo differentiator.

### 4.4 History Tab

| Section | Details |
|---|---|
| **Sticky section navigation** | Pill bar at top: Summary, Consult, HPI, ROS, Meds, Allergies, History, Scales. IntersectionObserver highlights active section. Click scrolls to target. |
| **Patient History Summary** | AI-generated longitudinal summary (Brief/Standard/Detailed modes). Editable. Auto-generates from prior visit data. |
| **Reason for Consult** | Two-tier selection: 9 primary categories (Headache, Movement, Seizure, Cognitive, Neuromuscular, MS/Neuroimmunology, Cerebrovascular, Sleep, Other) → contextual sub-options per category. Custom entry supported. |
| **HPI** | NoteTextField with dictation, AI assist, dot phrases. Accepts import from Historian (Card AI Historian), Chart Prep, and Visit AI. |
| **ROS** | Structured checkboxes (14 systems) with expandable detail fields. |
| **Medications** | Full medication list with add/edit/discontinue. Formulary typeahead from neuroFormulary.ts (~70 neurology medications). Dose, frequency, prescriber fields. |
| **Allergies** | Allergy chips with severity colors (mild=yellow, moderate=orange, severe=red). Reaction type field. |
| **Medical/Surgical/Family/Social History** | NoteTextFields with dictation/AI/dot phrase buttons. |
| **Clinical Scales** | Smart scale suggestions based on selected diagnoses. AI autofill from clinical notes. Score history with trends. 13+ scales: MIDAS, HIT-6, PHQ-9, GAD-7, MoCA, Mini-Cog, NIHSS, Modified Ashworth, ABCD2, DHI, ISI, ESS, UPDRS Motor, Hoehn & Yahr, EDSS, CHA₂DS₂-VASc, HAS-BLED, DN4, ODI, NDI. |

### 4.5 Imaging/Results Tab

| Element | Details |
|---|---|
| **Collapsible study cards** | One card per study type: MRI Brain, CT Head, CTA Head & Neck, MRA Head, MRI Spine, EEG, EMG/NCS, VEP, Sleep Study. |
| **Per-study fields** | Date picker, Impression dropdown (Normal/Abnormal/Pending/Not Ordered), Findings textarea (with dictation/AI/dot phrase buttons), PACS link. |
| **Longitudinal tracking** | Array-based: multiple study dates per type. Prior studies shown with date badges. |
| **Lab results** | Quick-add shortcuts for common neurology labs (CBC, CMP, TSH, B12, MMA, ESR/CRP, ANA, etc.). Custom lab entry. |
| **Add Study button** | For imaging types not in the default list. |

### 4.6 Physical Exams Tab

| Element | Details |
|---|---|
| **Vital signs** | Controlled inputs: BP, HR, Temp, Weight, BMI. Displayed in generated note. |
| **Structured/Free-text toggle** | Pill toggle between structured checkboxes and free-text NoteTextField. Persisted to localStorage. |
| **Structured exam** | Neurological examination checkboxes organized by system: Mental Status, Cranial Nerves, Motor, Sensory, Reflexes, Coordination, Gait, Speech/Language. |
| **Exam templates** | 5 predefined templates (Focused Headache, Movement Disorder, Seizure, Cognitive, General Neuro) + custom template saving. |
| **SDNE overlay** | If SDNE data exists (Card 5), a "View SDNE Data" button opens a side panel showing quantified exam results alongside the physician's manual exam — enabling direct comparison between objective digital metrics and clinical assessment. |
| **Exam-driven scales** | Scale buttons appear contextually: NIHSS (stroke exam), Modified Ashworth (spasticity), UPDRS Motor (Parkinson's). |

### 4.7 Recommendation Tab

| Element | Details |
|---|---|
| **Assessment** | AI-assisted assessment generation from selected diagnoses. Free-text editing with dictation/AI/dot phrase buttons. |
| **Differential Diagnosis** | Auto-populated from Reason for Consult selections. 166 neurology diagnoses with ICD-10 codes from diagnosisData.ts. Searchable picker with category filtering. Priority badges, reorder arrows, set primary. |
| **Smart Treatment Recommendations** | Per-diagnosis treatment plans from neuro-plans (127 clinical plans). Order sentence dropdowns with multiple dose options. "Add to Plan" button. Select all/deselect all. |
| **Plan** | NoteTextField for the treatment plan. Pre-populated from smart recommendations. Editable. |

### 4.8 Generate Note Modal

| Element | Details |
|---|---|
| **Note type selection** | New Patient, Follow-up, Procedure, Brief Note. |
| **Note length** | Brief, Standard, Detailed. |
| **AI synthesis** | Calls `/api/ai/synthesize-note` (gpt-5.2) to merge all sources: manual entry, Chart Prep dictation, Visit AI transcription, AI-generated content, imported Historian data. |
| **Preview** | Full formatted note with section headers (HPI, ROS, Exam, Assessment, Plan). Editable before signing. |
| **AI Review** | Collapsible panel with up to 6 suggestions: consistency, completeness, quality. Severity borders (amber warning, teal info). "Go to section" links. |
| **Ask AI** | Chat input for questions about the note. Full note context sent to gpt-5-mini. Suggested question pills. |
| **Actions** | Copy, Print, Sign & Complete, Pend (save as draft). |

### 4.9 Sample Demo Patients

The schedule should be pre-populated with patients that overlap with other cards' demo scenarios, telling a continuous story across the platform.

| Time | Patient | Age/Sex | Visit Type | Chief Complaint | Triage Tier | Cross-Card Data |
|---|---|---|---|---|---|---|
| 8:00 AM | Harold Jennings | 74M | New | PCP referral: "increasingly slow, shuffling gait" | Routine-priority (Yellow) | Triage result from Card 3 (buried Parkinsonism) |
| 8:30 AM | Maria Santos | 34F | Follow-up | MS follow-up, started Tecfidera | — | Follow-up conversation from Card 4 (mild flushing, taking as prescribed) |
| 9:00 AM | Linda Martinez | 58F | Follow-up | Parkinson's medication review | — | Wearable data from Card 6 (2 falls in 9 days, tremor trending up), SDNE from Card 5 (gait velocity decline) |
| 9:30 AM | James Okonkwo | 42M | Follow-up | New epilepsy, started Keppra | — | Follow-up escalation from Card 4 (reported seizure 2 days post-visit, URGENT) |
| 10:00 AM | Dorothy Chen | 72F | Follow-up | Memory clinic, started donepezil | — | Follow-up from Card 4 (medication not filled — insurance denied) |
| 10:30 AM | Sarah Mitchell | 28F | New | Chronic migraine, failed 3 preventives | Semi-urgent (Orange) | Triage result from Card 3 (failed therapies extracted) |
| 11:00 AM | Robert Alvarez | 55M | Follow-up | Parkinson's, dose increase | — | Follow-up from Card 4 (expressed hopelessness → CRITICAL escalation) |
| 11:30 AM | Eleanor Voss | 66F | New | New tremor, 6 months, right hand | Semi-urgent (Orange) | Triage result from Card 3 (resting tremor, possible PD) |

> **Design rationale (CMIO):** The demo schedule is not random patients — it's the same patients from other cards' demos, appearing in the physician's schedule with their cross-card data intact. When a demo presenter shows the triage of Harold Jennings in Card 3, then clicks over to My Patients & Schedule and opens Harold's chart, the triage result is already there. This is the "aha" moment that sells the integrated platform vision.

---

## 5. Technical Architecture

### 5.1 Frontend Components (React / Next.js)

```
src/
├── app/
│   └── physician/
│       └── page.tsx                    # Main physician workspace page (server component)
│   └── ehr/
│       └── page.tsx                    # Redirect alias → /physician
├── components/
│   ├── ClinicalNote.tsx                    # Master orchestrator component (~2,500 lines)
│   │                                       # Manages all clinical state, tab navigation,
│   │                                       # AI tool integration, note generation
│   ├── TopNav.tsx                          # Navigation: logo, search, queue tabs, timer, PHI toggle
│   ├── LeftSidebar.tsx                     # Patient card, prior visits, score history, allergy banner
│   ├── CenterPanel.tsx                     # Tab navigation, action bar, active tab content
│   ├── AiDrawer.tsx                        # AI assistant (Ask AI, Summary, Handout — teal theme)
│   ├── AiSuggestionPanel.tsx              # Inline AI suggestion panel for note fields
│   ├── VoiceDrawer.tsx                     # Voice & Dictation (Chart Prep, Document — red theme)
│   ├── DotPhrasesDrawer.tsx               # Dot phrases management (purple theme)
│   ├── NoteTextField.tsx                   # Reusable text field with dictation/AI/dot phrase buttons
│   ├── EnhancedNotePreviewModal.tsx       # Generate Note modal with AI review, ask AI
│   ├── ReasonForConsultSection.tsx         # Two-tier consult selection
│   ├── DifferentialDiagnosisSection.tsx    # DDx with ICD-10 codes
│   ├── SmartRecommendationsSection.tsx     # Treatment recommendations per diagnosis
│   ├── SmartScalesSection.tsx              # Clinical scales based on conditions
│   ├── ExamScalesSection.tsx              # Exam-driven scales (NIHSS, MAS)
│   ├── ImagingResultsTab.tsx              # Imaging/Results with collapsible study cards
│   ├── ScaleForm.tsx                       # Generic scale form component
│   ├── SettingsDrawer.tsx                 # User settings (AI instructions, appearance)
│   ├── HistorianSessionPanel.tsx          # Physician-side historian session viewer
│   ├── PatientHistorySummary.tsx           # AI-generated longitudinal summary
│   │
│   │   # ── Phase 2: Schedule View Components ──
│   ├── schedule/
│   │   ├── ScheduleView.tsx                # Day schedule table with patient rows
│   │   ├── ScheduleRow.tsx                 # Individual patient row with badges and alerts
│   │   ├── ScheduleFilters.tsx             # Quick filter pills (All, New, Follow-up, Urgent)
│   │   ├── PreVisitBriefingPopover.tsx     # Hover/click popover with condensed AI briefing
│   │   ├── DaySelector.tsx                 # Date picker with prev/next day arrows
│   │   └── SlotStatusBadge.tsx             # Checked-in, In-progress, Completed, No-show
│   │
│   │   # ── Phase 2: Summary Tab Cross-Card Sections ──
│   ├── summary/
│   │   ├── PreVisitBriefing.tsx            # Full AI Pre-Visit Briefing card
│   │   ├── DataSourceBadges.tsx            # Triage ✓, Follow-Up ✓, Wearable ✓, SDNE ✓
│   │   ├── TriageResultSection.tsx         # Triage tier, reasons, workup (from triage_sessions)
│   │   ├── FollowUpStatusSection.tsx       # Follow-up summary (from followup_sessions)
│   │   ├── SDNEHistorySection.tsx          # SDNE domain heatmap (from sdne_sessions)
│   │   ├── WearableTrendsSection.tsx       # Sparkline charts + anomalies (from wearable_*)
│   │   └── CrossCardLinkButton.tsx         # "View Full [Card] →" navigation button
```

### 5.2 Supabase Schema

The physician workspace primarily *reads* from tables created by other cards. The tables below are the existing tables it queries, plus new tables for schedule management.

**Existing Tables (Read by This Card)**

| Table | Source Card | Data Used |
|---|---|---|
| `patients` | Core | Demographics, insurance, badges |
| `visits` | Core | Visit records, status, clinical_notes join |
| `clinical_notes` | Core | HPI, ROS, assessment, plan, ai_summary, vitals, examFreeText |
| `diagnoses` | Core | Patient diagnoses with ICD-10 codes |
| `imaging_studies` | Core | Imaging records with findings |
| `scale_results` | Core | Clinical scale scores |
| `patient_medications` | Core | Medication records with dosage |
| `patient_allergies` | Core | Allergy records with severity |
| `dot_phrases` | Core | User-defined text expansion shortcuts |
| `historian_sessions` | AI Historian | Voice interview structured output, transcript, red flags |
| `triage_sessions` | Card 3 | Triage tier, dimension scores, reasons, workup, routing |
| `followup_sessions` | Card 4 | Conversation transcript, medication status, escalation flags |
| `followup_escalations` | Card 4 | Escalation details with severity and trigger text |
| `sdne_sessions` | Card 5 | Structured exam output, domain scores, composite score |
| `wearable_patients` | Card 6 | Wearable device connections, baseline metrics |
| `wearable_daily_summaries` | Card 6 | Daily metrics, anomalies, AI analysis |
| `wearable_anomalies` | Card 6 | Detected anomalies with severity and reasoning |
| `wearable_alerts` | Card 6 | Alerts generated from anomaly detection |

**New Table: `physician_schedules`**

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK, default gen_random_uuid()) | Schedule slot ID |
| `created_at` | `timestamptz` (default now()) | Record creation time |
| `physician_id` | `uuid` (FK to auth.users) | Which physician |
| `patient_id` | `uuid` (FK to patients) | Which patient |
| `visit_id` | `uuid` (FK to visits) | Associated visit record |
| `slot_date` | `date` | Appointment date |
| `slot_time` | `time` | Appointment time |
| `duration_minutes` | `integer` (default 30) | Appointment duration |
| `visit_type` | `text` | new_patient, follow_up, urgent, telemedicine, procedure |
| `chief_complaint` | `text` | Primary reason for visit |
| `triage_session_id` | `uuid` (FK to triage_sessions, nullable) | Link to triage result if patient was triaged |
| `slot_status` | `text` (default 'scheduled') | scheduled, checked_in, in_progress, completed, no_show, cancelled |
| `alert_flags` | `jsonb` | Array of active alerts: wearable, follow-up escalation, pending message |
| `previsit_briefing` | `text` | Cached AI Pre-Visit Briefing (regenerated on demand) |
| `previsit_briefing_sources` | `jsonb` | Which data sources contributed to the briefing |
| `previsit_briefing_generated_at` | `timestamptz` | When the briefing was last generated |
| `notes` | `text` | Staff notes (e.g., "patient requested interpreter") |
| `tenant_id` | `text` | Tenant identifier |

**New Table: `previsit_briefings`** (Phase 2 — persistent storage for briefings)

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Briefing ID |
| `patient_id` | `uuid` (FK) | Patient reference |
| `visit_id` | `uuid` (FK) | Associated visit |
| `generated_at` | `timestamptz` | Generation timestamp |
| `briefing_text` | `text` | Full AI-generated briefing (3-5 paragraphs) |
| `data_sources` | `jsonb` | Which sources contributed (triage, follow-up, wearable, sdne, prior_notes) with timestamps |
| `model_used` | `text` | AI model identifier |
| `token_usage` | `jsonb` | Prompt tokens, completion tokens, cost estimate |
| `physician_feedback` | `text` | Optional physician feedback on briefing quality |

### 5.3 API Endpoints

**`GET /api/schedule`** — Fetch day's schedule

Request query:
```
?date=2026-02-24&physician_id=uuid
```

Response:
```json
{
  "date": "2026-02-24",
  "total_patients": 12,
  "new_patients": 3,
  "follow_ups": 7,
  "urgent": 2,
  "slots": [
    {
      "id": "uuid",
      "time": "08:00",
      "duration_minutes": 30,
      "patient": {
        "id": "uuid",
        "name": "Harold Jennings",
        "age": 74,
        "sex": "M"
      },
      "visit_type": "new_patient",
      "chief_complaint": "Increasingly slow, shuffling gait",
      "triage_tier": "routine_priority",
      "triage_tier_display": "Routine-Priority — Within 4-6 Weeks",
      "slot_status": "scheduled",
      "alert_flags": [],
      "previsit_briefing_preview": "74M referred by PCP for progressive gait difficulty over 6 months. Triage identified possible early parkinsonism..."
    }
  ]
}
```

**`POST /api/previsit-briefing`** — Generate AI Pre-Visit Briefing

Request:
```json
{
  "patient_id": "uuid",
  "visit_id": "uuid"
}
```

Response:
```json
{
  "briefing_id": "uuid",
  "briefing_text": "Mr. Jennings is a 74-year-old man referred by his PCP, Dr. Anderson, for evaluation of progressive gait difficulty over the past 6 months. AI triage scored this referral as Routine-Priority (weighted score 2.7/5.0), identifying possible early parkinsonian features: shuffling gait, mild right-hand resting tremor noted by wife, and progressive slowness. No red flags were identified.\n\nNo prior neurology visits exist in the system. No follow-up conversations, SDNE exams, or wearable data are available — this is a new patient presentation.\n\nSuggested pre-visit workup from triage includes: MRI brain without contrast (to rule out NPH, structural lesion), DaTscan (if clinical exam is equivocal), and basic labs (TSH, B12, CMP). The referring PCP ordered an MRI brain which was read as 'mild periventricular white matter changes, age-appropriate. No mass, hemorrhage, or hydrocephalus.'\n\nKey points for today's visit: (1) Confirm parkinsonian features on exam — specifically assess for rest tremor, rigidity, bradykinesia, and postural instability. (2) Consider DaTscan if exam is equivocal. (3) Discuss whether to initiate dopaminergic therapy if diagnosis is confirmed. (4) Consider PT referral for fall prevention given gait difficulty.",
  "data_sources": {
    "triage": { "available": true, "session_id": "uuid", "tier": "routine_priority" },
    "follow_up": { "available": false },
    "sdne": { "available": false },
    "wearable": { "available": false },
    "prior_notes": { "available": false }
  },
  "generated_at": "2026-02-24T07:45:00Z",
  "model_used": "gpt-5.2"
}
```

**Existing Endpoints (Used by This Card)**

| Endpoint | Purpose |
|---|---|
| `POST /api/ai/chart-prep` | Pre-visit dictation with AI summary |
| `POST /api/ai/visit-ai` | Full visit transcription and extraction |
| `POST /api/ai/transcribe` | Voice-to-text transcription |
| `POST /api/ai/ask` | Ask AI questions with patient context |
| `POST /api/ai/field-action` | Improve/Expand/Summarize text fields |
| `POST /api/ai/synthesize-note` | Merge all sources into final note |
| `POST /api/ai/generate-assessment` | Generate clinical assessment from diagnoses |
| `POST /api/ai/note-review` | AI-powered note review for suggestions |
| `POST /api/ai/scale-autofill` | AI autofill for clinical scales |
| `GET /api/phrases` | List dot phrases |
| `POST /api/phrases` | Create dot phrase |
| `GET /api/scales` | Clinical scales API |
| `GET /api/medications` | Patient medication list |
| `GET /api/allergies` | Patient allergy list |
| `GET /api/plans?diagnosisId=` | Treatment plans (accepts diagnosis IDs and ICD-10 codes) |

### 5.4 External Services

| Service | Purpose |
|---|---|
| OpenAI gpt-5.2 | Pre-visit briefing synthesis, note synthesis, assessment generation, complex AI tasks |
| OpenAI gpt-5-mini | Ask AI, chart prep, transcription cleanup, field actions, note review |
| OpenAI Whisper | Voice-to-text transcription for dictation |
| OpenAI gpt-realtime | AI Neurologic Historian sessions (WebRTC) |
| Supabase | Database storage, auth, real-time subscriptions |
| Vercel | Frontend hosting and serverless API routes |

### 5.5 Data Flow

```
Physician opens schedule view
        ↓
GET /api/schedule → returns day's appointments with patient metadata
        ↓
For each patient slot:
  ├── Join to triage_sessions → pull triage tier badge
  ├── Join to followup_sessions → pull latest escalation flags
  ├── Join to wearable_alerts → pull active alert count
  └── Precompute briefing preview (first 3 lines)
        ↓
Physician clicks patient row → opens full chart
        ↓
fetchDashboardData() loads all patient data:
  ├── patients (demographics)
  ├── visits (current + prior with clinical_notes)
  ├── imaging_studies
  ├── scale_results (score history)
  ├── patient_messages
  ├── patient_intake_forms
  └── historian_sessions
        ↓
Summary Tab loads cross-card data:
  ├── triage_sessions → triage result
  ├── followup_sessions + followup_escalations → follow-up status
  ├── sdne_sessions → SDNE exam history
  └── wearable_daily_summaries + wearable_anomalies → trends and alerts
        ↓
POST /api/previsit-briefing → AI synthesizes all available data
        ↓
Pre-Visit Briefing displayed at top of Summary Tab
        ↓
Physician navigates chart tabs, enters documentation
        ↓
On "Generate Note":
  ├── Collect all manual entries
  ├── Collect Chart Prep AI summaries
  ├── Collect Visit AI extraction
  ├── Collect imported Historian data
  └── POST /api/ai/synthesize-note → merged final note
        ↓
Physician reviews, edits, signs → POST /api/visits/:id/sign
        ↓
Visit status → completed, patient slot → completed
```

---

## 6. AI & Algorithm Design

### 6.1 What the AI Does

The AI in this card performs six distinct functions:

1. **Pre-Visit Briefing Synthesis**: Reads all available cross-card data for a patient and produces a 3-5 paragraph summary optimized for a 15-second clinical read
2. **Chart Prep Summarization**: Processes pre-visit dictation into structured categories (HPI additions, medication notes, exam notes, plan ideas)
3. **Visit AI Extraction**: Transcribes and extracts clinical content from a full visit recording into structured fields (HPI, ROS, Exam, Assessment, Plan)
4. **Note Synthesis**: Merges all documentation sources into a single formatted clinical note
5. **Field-Level Actions**: Improve, expand, or summarize any text field in the chart
6. **Clinical Decision Support**: Smart diagnosis suggestions, treatment recommendations, scale suggestions, and assessment generation

### 6.2 Model Selection

| Function | Model | Rationale |
|---|---|---|
| Pre-Visit Briefing | gpt-5.2 | Complex multi-source synthesis requiring clinical reasoning |
| Chart Prep | gpt-5-mini | Straightforward summarization of dictated content |
| Visit AI | gpt-5.2 | Complex extraction from long transcripts with clinical precision |
| Note Synthesis | gpt-5.2 | Multi-source merge requiring consistency checking |
| Field Actions | gpt-5-mini | Simple improve/expand/summarize operations |
| Ask AI | gpt-5-mini | Conversational Q&A with patient context |
| Note Review | gpt-5-mini | Pattern-matching for consistency/completeness |
| Assessment Generation | gpt-5.2 | Clinical reasoning for differential diagnosis assessment |
| Scale Autofill | gpt-5.2 | Clinical data extraction with confidence scoring |

### 6.3 Pre-Visit Briefing Algorithm

The briefing synthesis follows a structured approach:

**Step 1: Data Collection**
Query all available data sources for the patient:
- `triage_sessions` → most recent triage result
- `followup_sessions` → most recent follow-up conversation + escalations
- `sdne_sessions` → most recent SDNE exam + change from prior
- `wearable_daily_summaries` → last 30 days of daily metrics
- `wearable_anomalies` → any anomalies in last 30 days
- `visits` + `clinical_notes` → prior visit notes (up to 5 most recent)
- `patient_medications` → current medications
- `patient_allergies` → allergies
- `diagnoses` → active diagnoses

**Step 2: Data Source Triage**
For each source, determine availability and recency:
- Available and recent (<30 days) → include in full
- Available but older (30-180 days) → include with recency note
- Available but very old (>180 days) → mention existence, summarize briefly
- Not available → note absence (e.g., "No wearable data available")

**Step 3: AI Synthesis**
Send collected data to gpt-5.2 with the Pre-Visit Briefing system prompt (Section 6.4).

**Step 4: Output Formatting**
Structure the briefing into 3-5 paragraphs:
1. **Patient overview** — who is this patient and why are they here today
2. **Key findings from AI tools** — triage results, follow-up status, wearable alerts
3. **Relevant history** — prior visits, medication changes, exam trends
4. **Actionable items for today** — what the physician needs to do/decide/examine

### 6.4 Pre-Visit Briefing System Prompt

```
You are a clinical briefing assistant for an outpatient neurology practice. Your task is to synthesize all available patient data into a concise pre-visit briefing that a neurologist can read in 15 seconds before walking into the exam room.

## YOUR ROLE
- You are a data synthesis tool, NOT a clinical decision-maker
- You present facts, flag concerns, and suggest focus areas — you do NOT diagnose or recommend treatments
- You write in the voice of a knowledgeable colleague providing a curbside consult: direct, factual, clinically precise

## PATIENT CONTEXT
Patient: {patient_name}, {age}{sex}
Visit Date: {visit_date}
Visit Type: {visit_type}
Chief Complaint: {chief_complaint}

## AVAILABLE DATA SOURCES

### Triage Result (Card 3)
{triage_data_or_"No triage data available — patient was not triaged through the AI system."}

### Follow-Up Conversation (Card 4)
{followup_data_or_"No follow-up data available."}

### SDNE Exam History (Card 5)
{sdne_data_or_"No SDNE exam data available."}

### Wearable Monitoring (Card 6)
{wearable_data_or_"No wearable data available."}

### Prior Visit Notes
{prior_notes_or_"No prior visits in the system — this is a new patient."}

### Current Medications
{medications_or_"No medications on file."}

### Active Diagnoses
{diagnoses_or_"No diagnoses on file."}

### Allergies
{allergies_or_"No known allergies."}

## BRIEFING FORMAT

Write 3-5 paragraphs. Each paragraph should be 2-4 sentences. Total target: 150-300 words.

**Paragraph 1: Patient Overview**
Who is this patient? Why are they here today? What is the visit type (new vs. follow-up)? If new: what did the referral say? If follow-up: what was the last visit about?

**Paragraph 2: Key Findings from Platform Data**
What did the AI triage find? What happened in the follow-up conversation? Are there wearable alerts? How has the SDNE exam changed? Highlight anything flagged, escalated, or concerning. If no data exists for a source, skip it — do not say "no data available" for every source, just omit.

**Paragraph 3: Relevant History & Trends**
Prior visit progression, medication changes, scale score trends. What is the clinical trajectory?

**Paragraph 4 (if applicable): Today's Focus**
Based on all available data, suggest 2-4 specific focus areas for today's visit. Frame as questions or exam priorities, not diagnoses or treatment recommendations.

## RULES

1. NEVER diagnose. Use "evaluate for," "assess," "consider," "rule out."
2. NEVER recommend specific treatments or medication changes.
3. If the only available data is the referral (new patient with no platform history), say so clearly and focus the briefing on what the referral says and what the visit should evaluate.
4. Include specific numbers when available: scale scores with interpretation, triage dimension scores, wearable metrics with normal ranges, SDNE composite scores.
5. Flag any escalated follow-up conversations prominently — if a patient reported a seizure or expressed suicidal ideation in their follow-up call, this MUST be in the first paragraph.
6. Flag any urgent wearable alerts prominently — if 2 falls were detected, this MUST be in the first paragraph.
7. If data sources conflict (e.g., follow-up says patient is "better" but wearable shows declining activity), note the discrepancy.
8. Write at a physician level — use medical terminology appropriately. This is clinician-to-clinician communication.
```

> **Source:** `src/lib/previsitBriefing/systemPrompt.ts` — exported as `PREVISIT_BRIEFING_SYSTEM_PROMPT`

### 6.5 Note Merge Engine

The note merge engine (`src/lib/note-merge/`) combines content from multiple sources into a unified clinical note:

| Source | Priority | Content |
|---|---|---|
| Manual entry | Highest | Text typed directly into chart fields by the physician |
| Visit AI extraction | High | AI-extracted clinical content from visit transcription |
| Chart Prep summaries | Medium | Pre-visit dictation summaries |
| Historian import | Medium | Structured output from AI Historian interview |
| AI-generated content | Lowest | Auto-generated assessment, recommendations |

**Merge rules:**
- Manual entry always wins — if the physician typed something in a field, that text is used
- If a field has both Visit AI and Chart Prep content, Visit AI takes precedence (it was captured during the actual visit)
- Chart Prep content that was explicitly "Added to Note" is treated as manual entry
- Historian import is additive — appended to HPI with "[From AI Historian Interview]" header
- Section-specific markers (`--- Chart Prep ---` / `--- End Chart Prep ---`) prevent content duplication on repeated Chart Prep runs

### 6.6 Guardrails Within the AI

| Guardrail | Implementation |
|---|---|
| No diagnosis in briefing | System prompt + output parsing to verify "evaluate for" / "consider" language |
| No treatment recommendations | System prompt forbids; parse for medication suggestions |
| Cross-patient contamination prevention | `resetAllClinicalState()` wipes all state on patient switch; `isSwitchingPatientRef` guards async callbacks |
| Autosave scoping | Autosave key includes patient ID to prevent data leakage between patients |
| Stale closure prevention | `noteDataRef` ref tracks current note data for async operations |
| PHI toggle | TopNav PHI toggle redacts patient identifying information in the UI |

---

## 7. Safety & Guardrails

### 7.1 Clinical Safety Boundaries

- **The AI Pre-Visit Briefing is informational, not prescriptive.** It presents data and suggests focus areas. It does not diagnose or recommend treatment.
- **The AI never modifies clinical data.** All AI outputs are presented as suggestions. The physician decides what to include in the final note.
- **Escalation flags are prominently displayed.** If a follow-up conversation triggered an urgent escalation (Card 4) or a wearable alert is active (Card 6), these flags appear at the top of the chart, not buried in a sub-panel.
- **Cross-patient contamination is prevented architecturally.** The `resetAllClinicalState()` function wipes all component state when switching between patients. Async callbacks from Chart Prep, Visit AI, and Historian import are guarded by `isSwitchingPatientRef` to prevent writing to the wrong patient's chart.
- **Note merge preserves physician authority.** Manual entry always overrides AI-generated content. The physician reviews and approves the final note before signing.

### 7.2 Data Integrity

| Risk | Mitigation |
|---|---|
| Stale data in briefing | Briefing includes generation timestamp. Refresh button available. Briefing regenerates when new data arrives (e.g., new follow-up conversation). |
| Missing cross-card data | Data source badges clearly show which sources contributed. Missing sources noted in briefing text. |
| Conflicting data sources | AI is instructed to flag discrepancies (e.g., patient says "better" in follow-up but wearable shows decline). |
| Autosave overwriting wrong patient | Autosave key includes patient ID. `resetAllClinicalState()` clears on patient switch. |
| Async race conditions | `isSwitchingPatientRef` boolean guards all async callbacks. Visit AI, Chart Prep, and Historian import check this ref before writing state. |

### 7.3 Regulatory Considerations

- **HIPAA**: All patient data is PHI. The chart displays real clinical data (in production) or realistic demo data (in POC). PHI toggle in TopNav provides a redaction mode for screenshots and presentations. Supabase RLS policies restrict data access by tenant.
- **Clinical documentation standards**: Generated notes include "AI-assisted" attribution. The physician signs the note, accepting clinical responsibility. AI-generated content is clearly marked in the merge engine.
- **21st Century Cures Act**: The platform supports information blocking prevention by making all patient data accessible in a single view. Cross-card data integration demonstrates interoperability.
- **mPractice Act / State licensing**: Telemedicine slots in the schedule are flagged for state-specific compliance. The platform does not provide clinical care — it is a documentation and decision support tool.

### 7.4 UI Disclaimers

**On the schedule view:**
> "AI Pre-Visit Briefings are generated summaries. Verify all clinical information before making treatment decisions."

**On the AI Pre-Visit Briefing:**
> "This briefing was synthesized by AI from available platform data. It is not a substitute for chart review. Data sources are indicated below."

**On the generated note:**
> "This note was generated with AI assistance. The signing clinician is responsible for verifying accuracy and completeness."

---

## 8. Demo Design

### 8.1 The 3-Minute Demo

**Minute 0:00-0:30 — The Physician's Morning**
"It's 7:45 AM. You're a neurologist about to start clinic. You open your schedule and see 12 patients. Before you even look at a chart, you can see: 3 are new referrals that were triaged by the AI (Card 3) — one flagged routine-priority for possible parkinsonism. One follow-up patient had an URGENT escalation from the AI follow-up agent (Card 4) — they reported a seizure two days after their visit. And one patient's Galaxy Watch detected 2 falls in the past week (Card 6). All of this before you've touched a chart."

**Minute 0:30-1:30 — The AI Pre-Visit Briefing**
- Click on Harold Jennings (new patient, triaged from Card 3)
- Show the Summary tab with the AI Pre-Visit Briefing: "Harold Jennings is a 74-year-old man referred by PCP for progressive gait difficulty over 6 months. AI triage scored this as routine-priority, identifying possible early parkinsonian features..."
- Point out the data source badges: "The system pulled from triage, the referral note, and the PCP's MRI — and synthesized it into something I can read in 15 seconds."
- Then click on Linda Martinez (follow-up patient with wearable data from Card 6 and SDNE data from Card 5)
- Show the cross-card sections: wearable sparklines showing 2 falls, SDNE gait velocity decline, follow-up conversation summary
- "Every other EHR shows you a blank chart. This one shows you everything the platform has learned about this patient — before you walk into the room."

**Minute 1:30-2:30 — Clinical Documentation**
- Open a patient chart, navigate to the History tab
- Quick demo of dictation (red mic button): speak a brief HPI, show it appearing in the field
- Quick demo of the dot phrase: type `.neuroexam`, show it expanding to a full exam template
- Click "Generate Note" → show the merged note combining manual entry + AI content
- "Documentation that used to take 15 minutes now takes 3. And the note is better, because it includes data from the triage, the follow-up call, and the wearable monitoring."

**Minute 2:30-3:00 — The Integration Story**
- Return to the schedule view
- "This is not six separate tools. It's one platform. The triage tool (Card 3) routes the patient here. The SDNE (Card 5) gives me objective exam data. The follow-up agent (Card 4) tells me what happened after the last visit. The wearable (Card 6) shows me what happened between visits. And the Command Center (Card 2) gives me the bird's-eye view. This card — My Patients & Schedule — is where it all comes together for clinical work."

### 8.2 Key Wow Moments

1. **AI Pre-Visit Briefing**: The moment the physician opens a chart and sees a synthesized summary pulling from triage, wearable, follow-up, and SDNE data — data that would normally be in 4 different systems. This is the "aha" moment that proves the platform is integrated.
2. **Same patients across cards**: Harold Jennings was triaged in Card 3, and now he's on the schedule in Card 1 with the triage result already in his chart. Linda Martinez has wearable data from Card 6 and SDNE data from Card 5, both visible in her chart. The patients tell a continuous story.
3. **3-minute documentation**: The combination of dictation, AI field actions, dot phrases, and the note merge engine reduces documentation time dramatically — a physician can see the note building in real-time.
4. **Escalation visibility**: James Okonkwo's urgent follow-up escalation (reported seizure from Card 4) is immediately visible on the schedule view — red alert icon — before the physician opens the chart.
5. **Schedule-level intelligence**: The schedule itself is smart — triage tier badges, alert icons, and briefing previews turn a simple appointment list into a clinical decision support tool.

### 8.3 Demo Walkthrough Script

**Opening the schedule:**
> "Good morning. I'm Dr. Arbogast, and this is my clinic for today. I can see at a glance: 12 patients, 3 new referrals, and — this is important — I can already see that James Okonkwo has a red alert. The AI follow-up agent called him after his last visit, and he reported a seizure. I know this before I've even opened his chart."

**Opening Harold Jennings' chart:**
> "Harold is a new patient. He was triaged by our AI triage tool — it scored him as routine-priority and flagged possible early parkinsonism. Let me open his chart... and here's the AI Pre-Visit Briefing. In three paragraphs, I know: what the referral said, what the MRI showed, and what I should focus on today. I didn't read through a 10-page referral packet — the AI read it for me."

**Opening Linda Martinez's chart:**
> "Linda has been in our system for a while. Look at this Summary tab — her Galaxy Watch data shows she's had 2 falls in 9 days, her resting tremor percentage is trending up, and her SDNE gait velocity declined by 15% since her last exam 3 months ago. The follow-up agent checked in with her last week and she reported increased stiffness. All of this is in one place."

**Quick documentation demo:**
> "Now let me show you how fast documentation can be. I click the mic button and dictate a brief HPI... it appears in the field. I type `.neuroexam` and my full exam template appears. When I'm done, I click Generate Note, and the system merges my dictation, my manual notes, and any AI-assisted content into a clean clinical note. Sign and done."

---

## 9. Phased Roadmap

### Phase 1: POC / Demo Version (Current Sprint)

**Scope:**
- Full clinical workspace as currently built (ClinicalNote component, all tabs, all AI tools)
- 8 pre-loaded demo patients on the schedule (overlapping with other cards' demo scenarios)
- Hardcoded schedule data (no real scheduling infrastructure)
- AI Pre-Visit Briefing generation from available cross-card data
- Summary tab with cross-card data sections (triage, follow-up, wearable, SDNE)
- All documentation tools: dictation, dot phrases, AI field actions, note merge, Generate Note
- Demo patients have realistic cross-card data seeded in Supabase

**Technical:**
- Next.js page at `/physician` (existing) and `/ehr` (redirect alias)
- ClinicalNote component (existing, ~2,500 lines)
- New `ScheduleView` component for the schedule landing page
- New `PreVisitBriefing` component for the Summary tab
- New cross-card data sections reading from existing Supabase tables
- New `/api/previsit-briefing` endpoint calling gpt-5.2
- Demo data seeded via Supabase migration

**Timeline:** 2-3 development sessions

> **CMIO recommendation:** The demo priority is the AI Pre-Visit Briefing and the cross-card integration on the Summary tab. The clinical documentation tools (dictation, dot phrases, note merge) already work. The wow moment is opening a chart and seeing data from triage, follow-up, wearable, and SDNE in one place — that's what investors and clinicians have never seen before.

### Phase 2: Clinical Pilot Version

**New Features:**
- Real schedule integration with EHR (HL7 FHIR Schedule resource, or Epic API)
- Dynamic schedule view with drag-and-drop rescheduling
- Auto-generation of pre-visit briefings overnight for the next day's schedule
- Briefing quality feedback loop (physician rates briefings, model improves)
- Template-based visit workflows per visit type (new patient template, follow-up template, procedure template)
- Multi-provider schedule view (for group practices)
- Schedule analytics: patient volume, no-show rates, average visit duration
- EHR write-back: push completed notes to Epic/Athena via FHIR DocumentReference

**Timeline:** 3-6 months post-POC

### Phase 3: Production / Scaled Version

**New Features:**
- Full EHR integration: bidirectional data sync with Epic, Cerner, Athena
- SMART on FHIR launch: physician workspace launches from within the EHR
- Multi-site scheduling across clinic locations
- Resident/fellow supervision workflow: attending reviews AI-assisted trainee notes
- Quality measure tracking: MIPS/HEDIS measure compliance alerts on the schedule
- Revenue cycle integration: suggested billing codes based on documentation complexity
- Patient-facing pre-visit questionnaire integration
- Voice-ambient documentation: always-on room microphone generates visit AI in background
- AI learning from physician edits: when a physician consistently modifies AI-generated content, the model adapts

**What Changes Between Phases:**
- Phase 1 → 2: Adds real EHR connectivity, dynamic scheduling, overnight briefing generation
- Phase 2 → 3: Adds bidirectional sync, ambient documentation, quality measures, revenue cycle

---

## 10. Open Questions & Decisions Needed

### Resolved

1. ~~**Schedule data source**~~ → **RESOLVED:** Phase 1 uses hardcoded demo data. Phase 2 integrates with EHR scheduling via FHIR.
2. ~~**Pre-Visit Briefing trigger**~~ → **RESOLVED:** Phase 1: generated on demand when physician opens chart. Phase 2: pre-generated overnight for next day's schedule.
3. ~~**Cross-card data display**~~ → **RESOLVED:** Summary tab shows consolidated cross-card data with "View Full →" links to source cards.
4. ~~**Note merge priority**~~ → **RESOLVED:** Manual entry > Visit AI > Chart Prep > Historian > AI-generated. Physician's own words always win.

### Still Open

5. **EHR integration partner for Phase 2**: Epic (via SMART on FHIR / App Orchard), Athena (via Marketplace), or EHR-agnostic via FHIR R4? Epic is the largest market but has the most restrictive API access. Athena is more developer-friendly but smaller market share in academic neurology.
6. **Pre-Visit Briefing personalization**: Should briefings adapt to individual physician preferences? (e.g., Dr. A wants medication-focused briefings, Dr. B wants exam-focused briefings). Or is a universal format sufficient for Phase 1-2?
7. **Schedule view as default landing page**: Should `/physician` default to the schedule view (requiring a click to open a chart), or directly to the current patient's chart (current behavior)? Schedule view is more realistic for production; direct-to-chart is faster for demos.
8. **Cross-card data freshness**: How often should cross-card data be refreshed? Real-time (expensive, potentially slow), on chart open (current approach), or cached with TTL? Wearable data in particular can change frequently.
9. **Multi-patient chart switching**: Current implementation resets all state when switching patients (`resetAllClinicalState()`). Should the system preserve unsaved work in a draft when switching, or is the hard reset the correct safety behavior?
10. **Billing code suggestion**: Should the AI suggest E/M level and billing codes based on documentation complexity in Phase 2? This is high value but enters a regulatory gray area — billing advice from AI could be viewed as upcoding facilitation if not carefully implemented.

### New Questions (from CMIO Review)

11. **Referral document attachment**: When a patient is triaged (Card 3) and the original referral note exists, should the full referral text be accessible from this card's chart, or only the triage summary? Physicians may want to read the original note.
12. **Follow-up conversation access**: Should the full follow-up conversation transcript (Card 4) be viewable from this card, or only the structured summary? For escalated cases, the transcript may contain critical context.
13. **SDNE raw data access**: Should the SDNE raw sensor data (Card 5) be accessible from this card, or only the structured domain scores? Research-oriented physicians may want the raw data; most clinicians just want the summary.
14. **Wearable data date range**: The Summary tab shows 30 days of wearable trends. Should this be configurable (7/14/30/90 days)? Longer ranges show more context but require more processing.
