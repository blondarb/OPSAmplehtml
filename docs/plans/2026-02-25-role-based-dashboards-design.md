# Role-Based Operations Dashboards Design

**Date:** 2026-02-25
**Status:** Approved
**Branch:** claude/cockpit-dashboard-separation

## Problem

The current Operations Dashboard (`/dashboard`) is a single-role hybrid that mixes MA-level task management with practice-manager-level metrics. In the teleneurology model, these roles have fundamentally different information needs:

- **MAs** are task-driven and real-time: "What do I do next for which patient for which doctor?"
- **Practice Managers** are metrics-driven and strategic: "How is the clinic performing?"

Additionally, the virtual MA model is unique — one MA may support 2-3 remote neurologists simultaneously across multiple clinic sites and home visits. No existing EHR product has a multi-provider virtual MA flow board.

## Solution

Split `/dashboard` into three pages:

- `/dashboard` — Role chooser landing page
- `/dashboard/ma` — MA Dashboard (light clinical theme, timeline-based flow board)
- `/dashboard/admin` — Practice Manager Dashboard (dark ops theme, metrics console)

## Operational Context

See memory file `operational-model.md` for full context. Key points:

- Doctors are always remote (at home), never at the clinic
- Patients may be at a clinic (with local MA) or at home
- Host EHR may be Epic or Cerner (or no integration)
- Orders placed in host EHR; notes generated in Synapse AI and pasted to host EHR
- Three AI data sources feed the dashboard: AI Scribe, AI Historian, SDNE

---

## Shared Data Model

### Provider

```typescript
interface Provider {
  id: string;
  name: string;
  credentials: 'MD' | 'DO' | 'NP';
  specialty: 'general_neurology' | 'headache' | 'epilepsy' | 'ms_neuroimmunology' | 'neuromuscular' | 'cerebrovascular' | 'sleep';
  status: 'available' | 'in_visit' | 'break' | 'offline';
  current_patient_id: string | null;
  next_patient_time: string | null;
  stats: {
    seen_today: number;
    remaining_today: number;
    running_behind_minutes: number;
  };
}
```

### Patient Schedule Item

```typescript
interface PatientScheduleItem {
  id: string;
  name: string;
  age: number;
  sex: 'M' | 'F';
  primary_diagnosis: string;
  appointment_time: string; // ISO timestamp
  appointment_duration: 30 | 60; // minutes
  visit_type: 'new' | 'follow_up' | 'urgent';
  provider_id: string;
  location: 'clinic' | 'home';
  clinic_site_id: string | null; // null if home
  flow_stage: 'not_arrived' | 'checked_in' | 'vitals_done' | 'ready_for_video' | 'in_visit' | 'post_visit' | 'completed' | 'no_show' | 'cancelled';
  ai_readiness: {
    historian_status: 'not_sent' | 'sent' | 'completed' | 'imported';
    sdne_status: 'not_applicable' | 'pending' | 'completed';
    chart_prep_status: 'not_started' | 'in_progress' | 'ready';
  };
  local_ma_assigned: boolean;
  video_link_active: boolean;
  chief_complaint: string;
}
```

### MA Task

```typescript
interface MATask {
  id: string;
  type: 'send_historian_link' | 'coordinate_local_ma' | 'tech_help' | 'prep_records' | 'process_refill' | 'route_message' | 'post_visit_task' | 'send_intake_form' | 'call_patient' | 'check_video';
  patient_id: string;
  provider_id: string;
  priority: 'urgent' | 'time_sensitive' | 'routine';
  status: 'pending' | 'in_progress' | 'completed';
  description: string;
  due_by: string | null; // ISO timestamp
  created_at: string;
}
```

### Clinic Site

```typescript
interface ClinicSite {
  id: string;
  name: string;
  location: string;
  timezone: string;
  providers_today: number;
  patients_today: number;
  local_ma_on_site: boolean;
  local_ma_name: string | null;
  ehr_integration: 'epic_fhir' | 'cerner_fhir' | 'none';
}
```

### Virtual MA

```typescript
interface VirtualMA {
  id: string;
  name: string;
  assigned_provider_ids: string[];
  role: 'primary' | 'float';
  active_task_count: number;
}
```

---

## Landing Page (`/dashboard`)

Simple role chooser on dark gradient background. Two glassmorphic cards:

- **MA Dashboard** card: icon, description ("Manage patient flow and tasks across your providers"), live teaser metric ("14 patients across 3 providers today"), "Enter" link
- **Practice Manager** card: icon, description ("Practice-wide metrics, staffing, and performance"), live teaser metric ("87% utilization, 3 sites active"), "Enter" link
- Demo disclaimer banner at bottom

---

## MA Dashboard (`/dashboard/ma`)

### Theme
- Light clinical: white/light gray (#F8FAFC) background, clean card borders, teal accent (#0D9488)
- Clean and task-oriented — not glassmorphic

### Layout: 3 Zones

#### Zone A — Provider Status Strip (top, sticky)
- Horizontal row of 3 provider cards
- Each card: name, credentials, status dot (green=available, red=in visit, yellow=behind, gray=offline), current/next patient, seen/remaining count
- Running-behind shows "+N min" in red
- Click provider card to filter flow board and task queue to that provider

#### Zone B — Patient Flow Board (center, main content)
- One horizontal timeline row per provider
- Time axis: 8:00–12:00 (morning) or 1:00–5:00 (afternoon), with block toggle
- Patient cards positioned at appointment slots:
  - Name, visit type badge (New/F-U/Urgent)
  - Flow stage via fill: solid=active, striped=ready/waiting, outline=not arrived, check=completed, X=no-show
  - Location badge: clinic or home icon
  - AI readiness: small dots — green check (historian done), blue check (SDNE done), purple check (chart prep done), hollow circle (missing)
  - Alert flag if MA attention needed
- Click patient card: expands inline detail panel with AI readiness breakdown, patient tasks, quick action buttons

#### Zone C — Task Queue (bottom, collapsible)
- Priority sorted: Urgent → Time-Sensitive → Routine
- Each task: type icon, patient name, provider, description, time context, action button
- Filter: All / By Provider / By Type
- Routine items collapsed by default
- Tasks auto-generated from patient flow status (e.g., historian not sent + visit within 60 min → "send historian link" task)
- Completing task updates flow board

### Patient Card Detail (expanded)
- Patient demographics, chief complaint, provider, appointment time
- Location with room number (if clinic)
- AI Readiness checklist (historian, SDNE, chart prep — each with status)
- Flow Status checklist (stages with current highlighted)
- Quick Actions: Send Historian Link, Call Patient, Check Video Status, Open Chart

### Controls
- Block toggle: Morning / Afternoon
- Provider filter (via status strip click)
- Task filter dropdown

---

## Practice Manager Dashboard (`/dashboard/admin`)

### Theme
- Dark ops: gradient (#0F172A → #1E293B), glassmorphic cards, indigo accent
- "Mission control" aesthetic — same as current dashboard

### Layout: 4 Zones

#### Zone 1 — Clinic Pulse (top metrics bar)
5 key metric tiles (reuses StatusTile pattern):

| Metric | Content |
|--------|---------|
| Patients Today | total / seen / remaining |
| Utilization | % of available time in visits, week-over-week trend |
| Avg Wait Time | check-in to video start, with trend |
| No-Shows | count + rate |
| AI Prep Rate | % of patients with historian OR chart prep done before visit |

#### Zone 2 — Left Column (3 stacked panels)

**Provider Performance:**
- Row per provider: name, utilization bar, seen/total, status note
- Red indicator if running behind

**Staffing & Coverage:**
- Virtual MA assignments (which MA → which providers)
- Clinic sites: name, local MA status, patient count, EHR integration badge
- Home visits group: count, virtual MA covers

**Pending Actions Overview:**
- Aggregate counts by type (refills, messages, results, orders, prior auths)
- Total with "View Action Queue →" link to MA Dashboard

#### Zone 3 — Right Column (3 stacked panels)

**Alerts:**
- Operational alerts (provider behind, patients missing pre-visit data, no-shows)
- Not clinical alerts — those go to clinician cockpit

**Today's Activity:**
- Chronological event log: check-ins, visit starts/ends, note signatures, historian completions, no-shows
- Each entry: time, event, patient, provider, site

**Quality Snapshot:**
- 4 metrics with progress bars:
  - Note completion rate (signed vs pending)
  - Note→EHR paste rate (critical teleneurology metric)
  - Follow-up completion rate
  - Triage turnaround vs target

#### Zone 4 — Site Comparison (bottom, collapsible)
- Table: site name, patient count, utilization %, avg wait, AI prep rate
- Totals row
- Collapsible — useful for multi-site, hideable for single-site

### Controls
- Site selector: All Sites / individual sites
- Refresh button with "last updated" timestamp
- Time context auto-shows current block

---

## Demo Data

### Providers

| Provider | Credentials | Specialty | Morning Patients | Story |
|----------|-------------|-----------|-----------------|-------|
| Dr. Anita Chen | MD | General Neurology | 7 | Efficient, on schedule. Has a no-show (Delgado — urgent GBS suspect). |
| Dr. Raj Patel | DO | Headache / Epilepsy | 7 | Steady. Good AI prep adoption. One gold-standard prepped patient (Kim). |
| Dr. Sofia Rivera | MD | MS / Neuroimmunology | 7 (1 cancelled) | Running +8 min behind. Complex MS patients. Needs support. |

### Virtual MAs

| MA | Assigned Providers | Story |
|----|-------------------|-------|
| Sarah | Chen + Patel | Experienced. Handling Santos tech issue + Brown post-visit tasks. |
| Marcus | Rivera + float | Newer. Rivera running behind adds pressure. Covering overflow. |

### Clinic Sites

| Site | EHR | Local MA | Patients |
|------|-----|----------|----------|
| Riverview Neurology | Epic FHIR | Jessica | 8 |
| Lakewood Medical | Cerner FHIR | Andrea | 6 |
| Home Visits | None | N/A (virtual MA) | 4 |

### 18 Morning Patients (demo snapshot at ~9:40 AM)

**Dr. Chen:**

| Time | Patient | Age/Sex | Type | Location | AI Ready | Flow Stage | Notes |
|------|---------|---------|------|----------|----------|------------|-------|
| 8:00 | Linda Martinez | 58F | F-U | Riverview | H✓ S✓ P✓ | Completed | Parkinson's. Wearable falls — cross-card patient. |
| 8:30 | Thomas Wright | 71M | F-U | Lakewood | H✓ P✓ | Completed | Epilepsy med check. Routine. |
| 9:00 | Carlos Delgado | 58M | New | Riverview | None | No-show | Progressive leg weakness (GBS?). Urgent no-show — safety concern. |
| 9:30 | Maria Santos | 34F | New | Home | H sent | Checked in | Migraine referral. Video not connecting — tech issue. |
| 10:00 | Harold Jennings | 74M | New | Riverview | H✓ P✓ | Not arrived | Possible parkinsonism. Cross-card (triage). |
| 10:30 | Angela Price | 45F | F-U | Home | None | Not arrived | MS follow-up. No pre-visit data sent. |
| 11:00 | William Torres | 62M | F-U | Lakewood | P✓ | Not arrived | Neuropathy. Routine. |

**Dr. Patel:**

| Time | Patient | Age/Sex | Type | Location | AI Ready | Flow Stage | Notes |
|------|---------|---------|------|----------|----------|------------|-------|
| 8:00 | Dorothy Chen | 72F | F-U | Riverview | H✓ P✓ | Completed | Memory. Insurance denied donepezil — cross-card. |
| 8:30 | Keisha Brown | 28F | F-U | Riverview | H✓ P✓ | Post-visit | Epilepsy. Keppra issue — cross-card. Tasks pending. |
| 9:00 | Robert Kim | 48M | New | Lakewood | H✓ S✓ P✓ | Vitals done | Headache. Gold standard AI prep. Ready for video. |
| 9:30 | Eleanor Voss | 66F | New | Home | H sent | Not arrived | New tremor. Needs historian reminder. |
| 10:00 | James Liu | 55M | F-U | Riverview | P✓ | Not arrived | Migraine. Routine. |
| 10:30 | Patricia Moore | 39F | F-U | Lakewood | None | Not arrived | Epilepsy. No pre-visit data. |
| 11:00 | David Nguyen | 44M | New | Riverview | H✓ P✓ | Not arrived | Sleep disorder referral. |

**Dr. Rivera:**

| Time | Patient | Age/Sex | Type | Location | AI Ready | Flow Stage | Notes |
|------|---------|---------|------|----------|----------|------------|-------|
| 8:00 | Sandra Williams | 41F | F-U | Lakewood | H✓ S✓ P✓ | Completed | MS. Routine, went well. |
| 8:30 | (cancelled) | — | — | — | — | — | Slot freed but Rivera still behind. |
| 9:00 | James Okonkwo | 42M | F-U | Riverview | H✓ P✓ | In visit (+8 min) | Post-seizure. Cross-card. Complex, running over. |
| 9:30 | Chen Dongyue | 37M | New | Riverview | H✓ S✓ P✓ | Checked in, vitals done | New MS referral. Waiting. |
| 10:00 | Robert Alvarez | 55M | F-U | Home | H✓ P✓ | Not arrived | MS + depression. Cross-card (safety flag). Sensitive. |
| 10:30 | Margaret Kim | 60F | F-U | Lakewood | P✓ | Not arrived | NMO. Infusion discussion. |
| 11:00 | Lisa Park | 32F | New | Riverview | None | Not arrived | Possible MS. No pre-visit data. |

### Cross-Card Patient Overlap

| Patient | Also appears in... |
|---------|-------------------|
| Linda Martinez | Wearable Monitoring (falls, tremor increase) |
| Carlos Delgado | AI Triage (urgent GBS suspect) |
| Harold Jennings | AI Triage (routine parkinsonism) |
| James Okonkwo | Follow-Up Agent (post-seizure escalation) |
| Keisha Brown | Follow-Up Agent (Keppra cessation) |
| Robert Alvarez | Follow-Up Agent (safety protocol — hopelessness) |
| Dorothy Chen | Follow-Up Agent (insurance denial) |
| Eleanor Voss | AI Triage (new tremor) |
| Maria Santos | AI Triage (chronic migraine) |

### Practice Manager Metrics (at ~9:40 AM)

| Metric | Value | Trend |
|--------|-------|-------|
| Patients Today | 42 (28 seen, 14 left) | — |
| Utilization | 87% | ↑ 4% vs last week |
| Avg Wait Time | 8 min | ↓ 2 min (improved) |
| No-Shows | 3 (7% rate) | — |
| AI Prep Rate | 71% | ↑ 12% vs last week |
| Note Completion | 85% (6 signed / 1 pending) | — |
| Note→EHR Paste | 71% (5 of 7 pasted) | — |
| Follow-Up Complete | 90% | — |
| Triage Turnaround | 42 min (target <60) | ✅ |

---

## Future Considerations

- **Demo data unification**: A future pass should unify patient data across all 7 platform cards for full continuity.
- **Real-time simulation**: The demo could simulate flow stage transitions over time (patient checks in, vitals done, etc.) for live demo impact.
- **Afternoon block**: Design supports it but demo data focuses on morning for simplicity.
- **MA workload balancing**: Future feature — auto-suggest rebalancing when one MA is overloaded.
- **Virtual MA ↔ Local MA chat**: In-app coordination channel between virtual and local MAs (future).

---

## Implementation Notes

- Reuse components: `StatusTile`, `UrgencyIndicator`, `ConfidenceBadge`, `SourceBadge`, `DisclaimerBanner`
- New components needed: `RoleChooser`, `ProviderStatusStrip`, `ProviderCard`, `PatientFlowBoard`, `TimelineRow`, `PatientFlowCard`, `PatientDetailPanel`, `MATaskQueue`, `MATaskCard`, `ProviderPerformancePanel`, `StaffingPanel`, `PendingActionsOverview`, `OperationsFeed`, `QualitySnapshot`, `SiteComparison`
- All data is demo/static — same pattern as existing dashboard (TypeScript constants, no real DB calls)
- API routes follow existing pattern: authenticate with Supabase, return demo data
