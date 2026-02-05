# PRD: Appointments Dashboard and Patient Management

**Version**: 1.0
**Last Updated**: February 5, 2026
**Status**: Engineering Specification
**Target Audience**: Engineering team using Claude Code

---

## 1. Overview

### 1.1 Purpose

This PRD documents the Appointments Dashboard and Patient Management features for Sevaro Clinical, an AI-powered clinical documentation platform for neurology outpatient practices. These features handle patient scheduling, appointment lifecycle management, patient data access, and the connection between scheduled appointments and clinical visits.

### 1.2 Scope

- **Appointments Dashboard**: Calendar-based scheduling interface with day/week/month views
- **Patient Management**: Patient demographics, search, queue management, and history display
- **Visit Lifecycle**: Creation, documentation, and completion of clinical visits
- **Navigation Components**: TopNav (search, queues, timer) and LeftSidebar (patient context)

### 1.3 Key User Flows

```
Appointment Creation → Patient Selection → Visit Start → Clinical Documentation → Sign & Complete
                                              ↓
                                     (Schedule Follow-up)
```

---

## 2. User Stories

### 2.1 Appointments Dashboard

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| US-AD-01 | Clinician | View my appointments for today | I can see my daily schedule at a glance |
| US-AD-02 | Clinician | Switch between day/week/month views | I can plan my schedule at different time horizons |
| US-AD-03 | Clinician | Filter appointments by status, type, and site | I can focus on specific appointment categories |
| US-AD-04 | Clinician | Click an appointment to open the patient chart | I can quickly access patient information |
| US-AD-05 | Clinician | Hover over an appointment to see prior visit AI summary | I can preview patient context before the visit |
| US-AD-06 | Clinician | Reschedule an appointment | I can adjust scheduling when needed |
| US-AD-07 | Clinician | Cancel an appointment | I can remove appointments that won't occur |
| US-AD-08 | Clinician | See new consult referral notes on hover | I understand why the patient was referred |
| US-AD-09 | Clinician | Schedule a new appointment | I can add patients to my calendar |
| US-AD-10 | Clinician | Navigate between dates easily | I can view past and future appointments |

### 2.2 Patient Management

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| US-PM-01 | Clinician | Search for patients by name or MRN | I can quickly find a specific patient |
| US-PM-02 | Clinician | Use voice dictation in the search bar | I can search hands-free |
| US-PM-03 | Clinician | See patient demographics at a glance | I have context before the encounter |
| US-PM-04 | Clinician | View prior visits with AI summaries | I can review the patient's history |
| US-PM-05 | Clinician | See score history trends | I can track patient progress over time |
| US-PM-06 | Clinician | View active medications and allergies | I have critical safety information |
| US-PM-07 | Clinician | Switch between work queues | I can manage different patient populations |
| US-PM-08 | Clinician | See a billing timer | I can track time-based billing codes |
| US-PM-09 | Clinician | Lock my screen for PHI protection | I can step away securely |
| US-PM-10 | Clinician | Access quick links to external systems | I can launch PACS, Epic, or VizAI |

### 2.3 Visit Lifecycle

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| US-VL-01 | Clinician | Start a visit from an appointment | A clinical note is created for documentation |
| US-VL-02 | Clinician | Pend (save draft) my note | I can continue documentation later |
| US-VL-03 | Clinician | Sign and complete a visit | The note is finalized with an AI summary |
| US-VL-04 | Clinician | Schedule a follow-up after completing a visit | The patient's next appointment is booked |

---

## 3. Appointments Dashboard

### 3.1 Component Architecture

```
AppointmentsDashboard (Parent)
├── Header
│   ├── Title: "Patient Appointments"
│   ├── ViewSwitcher: [Day | Week | Month]
│   ├── DateNavigation: [< | Today | >]
│   └── ScheduleButton: "Schedule Appointment"
├── DemoHintBanner (optional)
├── Filters
│   ├── HospitalFilter (dropdown)
│   ├── StatusFilter (dropdown)
│   ├── TypeFilter (dropdown)
│   └── RefreshButton
├── ViewContent
│   ├── DayView (when viewMode === 'day')
│   ├── WeekView (when viewMode === 'week')
│   └── MonthView (when viewMode === 'month')
└── SummaryFooter
```

### 3.2 View Modes

#### 3.2.1 Day View

**Layout**: Table/list format with sortable time column

**Columns**:
| Column | Width | Content |
|--------|-------|---------|
| Time | 120px | Formatted appointment time (e.g., "9:00 AM") |
| Site | 120px | Hospital site with status indicator dot |
| Patient | 200px | Patient name, MRN, age/gender |
| Reason | 140px | Color-coded reason badge with icon |
| Status | 160px | Status badge with icon |
| Type | 140px | Appointment type (New Consult, Follow-up, etc.) |
| Actions | 50px | Three-dot menu |

**Status Badge Colors**:
```typescript
const statusConfigs = {
  confirmed: { color: '#059669', icon: 'checkmark' },
  scheduled: { color: '#059669', icon: 'checkmark' },
  'in-progress': { color: '#3B82F6', icon: 'clock' },
  completed: { color: '#6B7280', icon: 'check-circle' },
  cancelled: { color: '#DC2626', icon: 'x-circle' },
}
```

**Reason Badge Colors** (by condition keyword):
```typescript
const REASON_COLORS = {
  headache: { bg: '#F3E8FF', text: '#7C3AED', border: '#C4B5FD' },
  migraine: { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
  weakness: { bg: '#D1FAE5', text: '#047857', border: '#6EE7B7' },
  tremor: { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' },
  seizure: { bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5' },
  memory: { bg: '#E0E7FF', text: '#4338CA', border: '#A5B4FC' },
  parkinson: { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' },
  stroke: { bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5' },
  neuropathy: { bg: '#D1FAE5', text: '#047857', border: '#6EE7B7' },
  sleep: { bg: '#E0E7FF', text: '#4338CA', border: '#A5B4FC' },
  ms: { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
  default: { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' },
}
```

**Row Interactions**:
- Click row: Select patient, open chart
- Hover row: Show popover (for follow-ups/new consults) and quick action buttons
- Quick actions on hover: "Launch EPIC", "Launch PACS"

**Actions Menu** (three-dot):
- Open Chart
- Reschedule
- Cancel (danger style)

#### 3.2.2 Week View

**Layout**: 7-column grid (Monday-Sunday)

**Column Structure**:
```
┌──────────────────────────────────────────────────────────────────────┐
│ MON Jan 6    │ TUE Jan 7    │ ... │ SUN Jan 12   │
├──────────────┼──────────────┼─────┼──────────────┤
│ [header]     │ [header]     │     │ [header]     │
│ count badge  │ count badge  │     │ count badge  │
├──────────────┼──────────────┼─────┼──────────────┤
│ AppointmentCard │            │     │              │
│ AppointmentCard │            │     │              │
│ ...          │              │     │              │
└──────────────┴──────────────┴─────┴──────────────┘
```

**Column Header**:
- Day name (short): "Mon", "Tue", etc.
- Date: "Jan 6"
- Count badge with load-level colors

**Load Level Indicators**:
```typescript
const getLoadLevel = (count: number) => {
  if (count === 0) return 'empty'    // transparent
  if (count <= 3) return 'light'     // green #D1FAE5
  if (count <= 8) return 'normal'    // neutral
  return 'heavy'                      // amber #FEF3C7
}
```

**AppointmentCard** (in week view):
- Left border color indicates type (red = new-consult, teal = follow-up, amber = next-day)
- Time (13px, bold)
- Patient name (last, first initial)
- Reason badge
- Status + Type row

**Interactions**:
- Click column header: Drill down to day view for that date
- Hover card: Show detailed popover

#### 3.2.3 Month View

**Layout**: 6-week calendar grid

**Grid Structure**:
```
┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│   Mon   │   Tue   │   Wed   │   Thu   │   Fri   │   Sat   │   Sun   │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│   1 ○3  │   2     │   3 ●5  │   4     │   5     │   6     │   7     │
│ 9a Smith│         │ 9a Jones│         │         │         │         │
│ 10a Lee │         │ 10a Wong│         │         │         │         │
│ +2 more │         │ +3 more │         │         │         │         │
├─────────┼ ... ────┴─────────┴─────────┴─────────┴─────────┴─────────┤
```

**Day Cell**:
- Date number (circled if today)
- Count badge with load colors
- Mini appointment lines (max 4 visible)
- "+N more" overflow link

**Compact AppointmentCard**:
- Colored dot (by type)
- Short time (e.g., "9a")
- Last name only

**Stats Bar** (shown below calendar):
- Total appointments
- New consults (count + percentage)
- Follow-ups (count + percentage)
- Completion rate
- Busiest day

**Interactions**:
- Click date number: Drill down to day view
- Click "+N more": Drill down to day view
- Hover appointment line: Show detailed popover

### 3.3 Appointment Popover

**Trigger**: Hover on appointment row/card with 300ms enter delay, 200ms leave delay

**Position**: Right of anchor element, flips left if viewport overflow

**Content Types**:

#### 3.3.1 Follow-up Popover
Shows AI summary from prior visit:
```
┌──────────────────────────────────────────────────────┐
│     ● AI-GENERATED VISIT SUMMARY ●                   │
│          PATIENT HISTORY OVERVIEW                    │
├──────────────────────────────────────────────────────┤
│ Last Visit: 01/10/2026          [prior visit]        │
├──────────────────────────────────────────────────────┤
│ ▼ CLINICAL SUMMARY:                                  │
│ ┌────────────────────────────────────────────────┐   │
│ │ Patient presents for 3-month follow-up of      │   │
│ │ chronic migraine. Reports 50% reduction in     │   │
│ │ headache frequency with current prophylaxis... │   │
│ └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

#### 3.3.2 New Consult Popover
Shows referral note (typewriter style):
```
┌──────────────────────────────────────────────────────┐
│                    REFERRAL NOTE                      │
│           Neurology Consultation Request              │
├──────────────────────────────────────────────────────┤
│ DATE: 02/05/2026                                      │
│                                                       │
│ REFERRING PHYSICIAN:                                  │
│ Dr. Sarah Thompson, DO                                │
│ Family Medicine                                       │
│                                                       │
│ CHIEF COMPLAINT:                                      │
│ Recurrent headaches, rule out migraine                │
│                                                       │
│ CLINICAL HISTORY:                                     │
│ Patient referred for evaluation of recurrent          │
│ headaches. 45 y/o female presenting with...          │
└──────────────────────────────────────────────────────┘
```

### 3.4 Filter Options

```typescript
const HOSPITAL_SITES = [
  'All',
  'Meridian Neurology',
  'New Media',
  'CHH',
  'Outpatient Center'
]

const STATUSES = [
  'All',
  'Scheduled',
  'Confirmed',
  'In-Progress',
  'Completed',
  'Cancelled'
]

const APPOINTMENT_TYPES = [
  'All',
  'new-consult',
  'next-day',
  'follow-up',
  '3-month-follow-up',
  '6-month-follow-up',
  '12-month-follow-up'
]
```

### 3.5 Reschedule Modal

**Trigger**: Actions menu > Reschedule

**Content**:
```
┌──────────────────────────────────────────────────────┐
│ Reschedule Appointment                               │
├──────────────────────────────────────────────────────┤
│ John Smith · 3 Month F/U                             │
│                                                       │
│ Date                                                  │
│ ┌────────────────────────────────────────────────┐   │
│ │ [date picker: 2026-02-15]                      │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
│ Time                                                  │
│ ┌────────────────────────────────────────────────┐   │
│ │ [time picker: 09:30]                           │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
│                         [Cancel]  [Reschedule]       │
└──────────────────────────────────────────────────────┘
```

**Behavior**:
- Pre-populates with current date/time
- Disabled submit until both fields have values
- Calls `PATCH /api/appointments/{id}` with new date/time
- Refreshes appointment list on success

### 3.6 Cancel Modal

**Trigger**: Actions menu > Cancel

**Content**:
```
┌──────────────────────────────────────────────────────┐
│ Cancel Appointment?                                   │
├──────────────────────────────────────────────────────┤
│ John Smith                                            │
│ 9:00 AM · 3 Month F/U                                │
│                                                       │
│                             [Keep]  [Cancel Appointment]
└──────────────────────────────────────────────────────┘
```

**Behavior**:
- Calls `DELETE /api/appointments/{id}` (soft delete - sets status to 'cancelled')
- Refreshes appointment list on success

### 3.7 State Management

**Persisted to localStorage**:
- `sevaro-calendar-view`: Current view mode ('day' | 'week' | 'month')

**Component State**:
```typescript
interface AppointmentsDashboardState {
  viewMode: CalendarViewMode
  selectedDate: string           // YYYY-MM-DD
  appointments: Appointment[]
  loading: boolean
  error: string | null
  hospitalFilter: string
  statusFilter: string
  typeFilter: string
}
```

### 3.8 Props Interface

```typescript
interface AppointmentsDashboardProps {
  onSelectPatient?: (appointment: Appointment) => void
  onScheduleNew?: () => void
  demoHint?: string | null
  onDismissHint?: () => void
  refreshKey?: number  // Increment to force refresh
}
```

---

## 4. Patient Management

### 4.1 Patient Demographics

**Data Model** (from `patients` table):
```typescript
interface Patient {
  id: string
  mrn: string
  firstName: string
  lastName: string
  dateOfBirth: string           // ISO date
  age: number | null            // Calculated
  gender: 'M' | 'F' | 'O'
  phone: string | null
  email: string | null
  address: string | null
  timezone: string
  insuranceProvider: string | null
  insuranceId: string | null
  primaryCarePhysician: string | null
  referringPhysician: string | null
  referralReason: string | null
  referralDate: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
}
```

**Display in LeftSidebar**:
```
┌─────────────────────────────────────────────┐
│ [Avatar] John Smith               [Edit]    │
│          45, M #123456                      │
├─────────────────────────────────────────────┤
│ [Video Button]  [Phone Button]              │
└─────────────────────────────────────────────┘
```

### 4.2 Patient Search (TopNav)

**Location**: TopNav, left section

**Input Field**:
- Placeholder: "Search for patient name or MRN"
- Width: 260px
- Border: Solid 1px, turns red when recording

**Voice Dictation Button**:
- Uses `useVoiceRecorder` hook
- Mic icon turns red with red background when recording
- Transcribed text populates search field

**Search Behavior**:
- Currently client-side only (no API endpoint defined)
- Future: Should call `/api/patients/search?q={query}`

### 4.3 Queue Tabs (TopNav)

**Location**: TopNav, right of search bar (desktop only)

**Queue Configuration**:
```typescript
const queues = [
  { id: 'acute', label: 'Acute Care', count: 0 },
  { id: 'rounding', label: 'Rounding', count: 0 },
  { id: 'eeg', label: 'EEG', count: 0 },
  { id: 'outpatient', label: 'Outpatient', count: 1 },
]
```

**Tab Styling**:
- Active: Teal background (#0D9488), white text
- Inactive: White background, gray border, gray text
- Pill shape with count badge

**Behavior**:
- Click switches active queue
- Currently does not filter appointments (UI-only state)

### 4.4 Prior Visits (LeftSidebar)

**Location**: LeftSidebar, collapsible section

**Header Controls**:
- Collapse/expand chevron
- "AI Summary" toggle switch

**Visit Card**:
```
┌─────────────────────────────────────────────┐
│ Jan 10, 2026                   [Follow-up]  │
│ Chronic migraine                            │
│ Dr. Smith                                   │
├─────────────────────────────────────────────┤
│ (Expanded when clicked)                     │
│ ┌─────────────────────────────────────────┐ │
│ │ ★ AI Summary                            │ │
│ │ Patient reports improved symptoms with  │ │
│ │ current treatment. Continue current     │ │
│ │ regimen and reassess at next visit.     │ │
│ └─────────────────────────────────────────┘ │
│ [View Full Note]                            │
└─────────────────────────────────────────────┘
```

**Visit Type Badges**:
- New Patient: Green badge (#D1FAE5)
- Follow-up: Blue badge (#DBEAFE)

**View Full Note Modal**:
- Shows complete clinical note sections (HPI, ROS, Exam, Assessment, Plan)
- Falls back to AI Summary if sections are empty
- Includes Copy Note and Close buttons

### 4.5 Score History (LeftSidebar)

**Location**: LeftSidebar, collapsible section

**Score Card**:
```
┌─────────────────────────────────────────────┐
│ MIDAS                        ↗ Improving    │
├─────────────────────────────────────────────┤
│ Jan 16, 2026         18 Moderate            │
│ Jan 10, 2026         24 Moderate            │
│ Dec 15, 2025         42 Severe              │
│ Nov 1, 2025          56 Severe              │
└─────────────────────────────────────────────┘
```

**Trend Indicators**:
- Improving: Green (#10B981) with up-trend arrow
- Stable: Gray (#6B7280) with horizontal line
- Worsening: Red (#EF4444) with down-trend arrow

**Trend Calculation**:
```typescript
const calculateTrend = (scores: number[], lowerIsBetter: boolean) => {
  if (scores.length < 2) return 'stable'
  const [latest, previous] = scores
  if (lowerIsBetter) {
    return latest < previous ? 'improving' : latest > previous ? 'worsening' : 'stable'
  }
  return latest > previous ? 'improving' : latest < previous ? 'worsening' : 'stable'
}
```

### 4.6 Medications & Allergies Summary (LeftSidebar)

**Location**: LeftSidebar, collapsible section

**Severe Allergy Alert**:
```
┌─────────────────────────────────────────────┐
│ ⚠ Penicillin (anaphylaxis), Sulfa (rash)   │
└─────────────────────────────────────────────┘
```
- Red background (#FEE2E2) for severe/life-threatening allergies
- Only shown if any allergy has severity 'severe' or 'life-threatening'

**Medication List**:
- Green dot indicator
- Medication name (bold) + dosage (muted)
- Shows active medications only

**Allergies Section**:
- Appears below medications with divider
- Simple comma-separated list of allergen names

---

## 5. Visit Lifecycle

### 5.1 Create Visit

**Trigger**: Select patient from appointments dashboard

**Process**:
1. User clicks appointment row
2. `onSelectPatient(appointment)` callback fires
3. Parent component calls `POST /api/visits` with:
   - `patientId`
   - `appointmentId`
   - `chiefComplaint` (from appointment.reasonForVisit)
   - `visitType` (mapped from appointment.appointmentType)
4. API creates visit record and empty clinical note
5. API updates appointment status to 'in-progress'
6. Dashboard navigates to clinical note view

### 5.2 Pend (Save Draft)

**Location**: CenterPanel action bar, "Pend" button

**Process**:
1. User clicks "Pend" button
2. `PATCH /api/visits/{id}` called with current note data
3. Clinical note status remains 'draft'
4. Autosave also runs periodically (debounced)

### 5.3 Sign & Complete

**Location**: CenterPanel action bar, "Sign & Complete" button

**Process**:
1. User clicks "Sign & Complete"
2. `POST /api/visits/{id}/sign` called
3. API generates AI summary using GPT-5-mini
4. API updates clinical note: `status='signed'`, `is_signed=true`, `signed_at=now()`
5. API updates visit: `status='completed'`
6. API updates appointment: `status='completed'`
7. Optional: Schedule Follow-up modal appears

### 5.4 Visit Status State Machine

```
scheduled → in_progress → completed
              ↓
          cancelled
```

**Clinical Note Status**:
```
draft → signed
```

---

## 6. TopNav Components

### 6.1 Component Structure

```typescript
interface TopNavProps {
  user: User
  onSignOut: () => void
  openAiDrawer: (tab: string) => void
  onOpenSettings: () => void
  onOpenIdeas: () => void
  onToggleSidebar?: () => void
  isSidebarOpen?: boolean
  onResetDemo?: () => void
}
```

### 6.2 Left Section

| Component | Description |
|-----------|-------------|
| Hamburger Menu | Mobile only - toggles sidebar visibility |
| Logo | Brain icon - opens Ideas/Getting Started drawer |
| Search Bar | Patient search with voice dictation |
| Queue Tabs | Acute Care, Rounding, EEG, Outpatient (desktop only) |

### 6.3 Right Section

| Component | Description |
|-----------|-------------|
| Billing Timer | Dropdown with pause/resume/reset and billing code selection |
| PHI Toggle | Visual indicator (desktop only) |
| Lock Screen | Button that shows lock overlay |
| Notifications | Bell icon with badge and dropdown panel |
| AI Launcher | Orange sparkle button with AI tools menu |
| User Avatar | Dropdown with Settings, Reset Demo, Sign Out |

### 6.4 Billing Timer

**Timer Display**: `HH:MM:SS` format with billing code badge

**Billing Codes**:
```typescript
const BILLING_CODES = [
  { code: 'MD2', label: 'MD2 - Subsequent Hospital Care (20-35 min)', color: '#0D9488' },
  { code: 'MD3', label: 'MD3 - Subsequent Hospital Care (35+ min)', color: '#7C3AED' },
  { code: '99213', label: '99213 - Office Visit (15-29 min)', color: '#3B82F6' },
  { code: '99214', label: '99214 - Office Visit (30-44 min)', color: '#F59E0B' },
  { code: '99215', label: '99215 - Office Visit (45+ min)', color: '#EF4444' },
]
```

**Dropdown Content**:
- Large timer display
- Play/Pause toggle button
- Reset button
- Billing code radio selection

### 6.5 Notifications Panel

**Sample Notification Types**:
- `alert`: Red icon, critical results
- `message`: Blue icon, messages from colleagues
- `task`: Green icon, completed tasks
- `system`: Gray icon, system updates

**Features**:
- Unread count badge on bell icon
- "Mark all read" action
- Click notification to mark individual as read
- Max height 400px with scroll

### 6.6 Lock Screen

**Trigger**: Lock icon button in TopNav

**Overlay**:
- Full screen black overlay (rgba(0,0,0,0.9))
- Centered lock icon and "Screen Locked" message
- "Unlock Screen" button
- "Session will timeout after 15 minutes" notice

---

## 7. LeftSidebar Components

### 7.1 Component Structure

```typescript
interface LeftSidebarProps {
  patient: any
  priorVisits: any[]
  scoreHistory: any[]
  patientMessages?: any[]
  historianSessions?: any[]
  onImportHistorian?: (session: any) => void
  isOpen?: boolean
  onClose?: () => void
  medications?: PatientMedication[]
  allergies?: PatientAllergy[]
}
```

### 7.2 Sections (Top to Bottom)

| Section | Description |
|---------|-------------|
| Hospital/Location | Practice name with local time clock |
| Patient Card | Demographics, Video/Phone buttons |
| Quick Links | PACS viewer, VizAI, Epic |
| Medications & Allergies | Collapsible, shows active meds and allergy alerts |
| Prior Visits | Collapsible, expandable visit cards with AI summaries |
| Score History | Collapsible, scale scores with trend indicators |
| Patient Messages | Optional, shows unread patient messages |
| AI Historian Sessions | Optional, shows completed voice interview sessions |

### 7.3 Responsive Behavior

**Desktop** (>1024px):
- Fixed 260px width
- Always visible

**Mobile** (<1024px):
- Slide-in overlay from left
- Dark backdrop when open
- Close button or backdrop click to dismiss

---

## 8. API Contracts

### 8.1 Appointments API

#### GET /api/appointments

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| date | string | Single date filter (YYYY-MM-DD) |
| startDate | string | Range start (YYYY-MM-DD) |
| endDate | string | Range end (YYYY-MM-DD) |
| patientId | string | Filter by patient UUID |
| status | string | Filter by status |

**Response**:
```typescript
{
  appointments: Array<{
    id: string
    appointmentDate: string      // YYYY-MM-DD
    appointmentTime: string      // HH:MM:SS
    durationMinutes: number
    appointmentType: string
    status: string
    hospitalSite: string
    reasonForVisit: string | null
    schedulingNotes: string | null
    visitId: string | null
    priorVisitId: string | null
    patient: {
      id: string
      mrn: string
      firstName: string
      lastName: string
      name: string
      dateOfBirth: string
      age: number | null
      gender: string
      phone: string
      email: string
      referringPhysician: string | null
      referralReason: string | null
    } | null
    priorVisit: {
      id: string
      visitDate: string
      visitType: string
      aiSummary: string | null
    } | null
  }>
}
```

#### POST /api/appointments

**Request Body**:
```typescript
{
  patientId: string              // Required
  appointmentDate: string        // Required, YYYY-MM-DD
  appointmentTime: string        // Required, HH:MM
  durationMinutes?: number       // Default: 30
  appointmentType: string        // Required
  hospitalSite?: string          // Default: 'Meridian Neurology'
  reasonForVisit?: string
  priorVisitId?: string
  schedulingNotes?: string
}
```

**Response**: `{ appointment: AppointmentRecord }` (201)

#### GET /api/appointments/{id}

**Response**: `{ appointment: AppointmentWithRelations }`

#### PATCH /api/appointments/{id}

**Request Body** (all optional):
```typescript
{
  appointmentDate?: string
  appointmentTime?: string
  durationMinutes?: number
  appointmentType?: string
  status?: string
  hospitalSite?: string
  reasonForVisit?: string
  visitId?: string
  schedulingNotes?: string
}
```

**Response**: `{ appointment: AppointmentRecord }`

#### DELETE /api/appointments/{id}

**Behavior**: Soft delete - sets status to 'cancelled'

**Response**: `{ appointment: AppointmentRecord, message: 'Appointment cancelled' }`

### 8.2 Patients API

#### POST /api/patients

**Request Body**:
```typescript
{
  firstName: string              // Required
  lastName: string               // Required
  dateOfBirth: string            // Required, YYYY-MM-DD
  gender: 'M' | 'F' | 'O'       // Required
  mrn?: string                   // Auto-generated if not provided
  phone?: string
  email?: string
  referringPhysician?: string
  referralReason?: string
}
```

**Response**: `{ patient: PatientRecord }` (201)

**Error Responses**:
- 400: Missing required fields
- 409: Duplicate MRN

#### GET /api/patients/{id}

**Response**:
```typescript
{
  patient: {
    id: string
    mrn: string
    firstName: string
    lastName: string
    name: string
    dateOfBirth: string
    age: number | null
    gender: string
    phone: string | null
    email: string | null
    address: string | null
    insuranceProvider: string | null
    insuranceId: string | null
    primaryCarePhysician: string | null
    referringPhysician: string | null
    referralReason: string | null
    referralDate: string | null
    emergencyContactName: string | null
    emergencyContactPhone: string | null
  }
  medications: Array<{
    id: string
    name: string
    dosage: string
    frequency: string
    route: string
    startDate: string
    prescriber: string
    notes: string
  }>
  allergies: Array<{
    id: string
    allergen: string
    reaction: string
    severity: string
  }>
  visits: Array<{
    id: string
    visitDate: string
    visitType: string
    chiefComplaint: string[]
    status: string
    providerName: string
    clinicalNote: ClinicalNote | null
  }>
  appointments: AppointmentRecord[]
  scoreHistory: Array<{
    id: string
    scaleType: string
    score: number
    maxScore: number
    interpretation: string
    severity: string
    completedAt: string
  }>
  imagingStudies: ImagingStudy[]
}
```

### 8.3 Visits API

#### POST /api/visits

**Request Body**:
```typescript
{
  patientId: string              // Required
  appointmentId?: string
  chiefComplaint?: string[]
  visitType?: string             // Default: 'new_patient'
  providerName?: string
  priorVisitId?: string
}
```

**Response**: `{ visit: VisitWithClinicalNote }` (201)

**Error**: 409 if appointment already has an active visit

#### GET /api/visits/{id}

**Response**: `{ visit: VisitWithPatientAndNotes }`

#### PATCH /api/visits/{id}

**Request Body**:
```typescript
{
  chiefComplaint?: string[]
  status?: string
  clinicalNote?: {
    hpi?: string
    ros?: string
    rosDetails?: object
    allergies?: string
    allergyDetails?: object
    historyAvailable?: object
    historyDetails?: object
    physicalExam?: object
    assessment?: string
    plan?: string
    rawDictation?: string
    aiSummary?: string
    status?: string
    vitals?: object
    examFreeText?: string
  }
}
```

**Response**: `{ visit: VisitWithClinicalNote }`

#### POST /api/visits/{id}/sign

**Purpose**: Sign and complete the visit

**Behavior**:
1. Generates AI summary using GPT-5-mini
2. Updates clinical note to signed status
3. Updates visit to completed status
4. Updates linked appointment to completed status

**Response**:
```typescript
{
  visit: VisitWithClinicalNote
  aiSummary: string
  message: 'Visit signed and completed successfully'
}
```

---

## 9. Database Schema

### 9.1 patients Table

```sql
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mrn TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  gender TEXT CHECK (gender IN ('M', 'F', 'O')) NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  timezone TEXT DEFAULT 'America/Los_Angeles',
  insurance_provider TEXT,
  insurance_id TEXT,
  primary_care_physician TEXT,
  referring_physician TEXT,
  referral_reason TEXT,
  referral_date DATE,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  UNIQUE(user_id, mrn)
);

-- RLS: Users can only access their own patients
```

### 9.2 visits Table

```sql
CREATE TABLE visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visit_date TIMESTAMPTZ NOT NULL,
  visit_type TEXT CHECK (visit_type IN ('new_patient', 'follow_up', 'urgent', 'telehealth')) NOT NULL,
  chief_complaint TEXT[] DEFAULT '{}',
  status TEXT CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')) DEFAULT 'scheduled',
  provider_name TEXT,
  appointment_id UUID REFERENCES appointments(id)
);

-- Indexes: patient_id, user_id, visit_date
-- RLS: Users can only access their own visits
```

### 9.3 appointments Table

```sql
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id),
  prior_visit_id UUID REFERENCES visits(id),
  created_by UUID REFERENCES auth.users(id),
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  appointment_type TEXT NOT NULL DEFAULT 'follow_up',
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show')),
  hospital_site TEXT,
  reason_for_visit TEXT,
  scheduling_notes TEXT
);

-- Indexes: patient_id, appointment_date, status, tenant_id
-- RLS: Authenticated users can read/write all appointments
```

### 9.4 Entity Relationships

```
patients (1) ─────< (N) visits
    │                    │
    │                    │
    │                    └───── (1) clinical_notes
    │
    └─────────< (N) appointments
                    │
                    ├── visit_id ────────> visits (current visit)
                    └── prior_visit_id ──> visits (for AI summary)
```

---

## 10. Implementation Notes

### 10.1 Date Handling

**Timezone-Safe Date String Conversion**:
```typescript
const toDateString = (date: Date): string => {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}
```

**Week Range Calculation** (Monday start):
```typescript
const getWeekRange = (date: Date) => {
  const dayOfWeek = date.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(date)
  monday.setDate(date.getDate() + mondayOffset)
  // ... return 7 days
}
```

### 10.2 Popover Hover Behavior

Uses a custom `useHoverPopover` hook with configurable delays:
```typescript
const useHoverPopover = (enterDelay = 300, leaveDelay = 200) => {
  // Tracks hovered element ID
  // Manages anchor rect for positioning
  // Clears timeouts on unmount
  return { hoveredId, anchorRect, onEnter, onLeave, onPopoverEnter, onPopoverLeave }
}
```

### 10.3 Appointment Type Border Colors

```typescript
const TYPE_BORDER_COLORS = {
  'new-consult': '#EF4444',      // Red
  'next-day': '#F59E0B',          // Amber
  'follow-up': '#0D9488',         // Teal
  '3-month-follow-up': '#0D9488',
  '6-month-follow-up': '#0D9488',
  '12-month-follow-up': '#0D9488',
}
```

### 10.4 Mobile Responsiveness

**Breakpoints**:
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

**Mobile-Specific Behavior**:
- Queue tabs hidden
- PHI toggle hidden
- Sidebar slides in as overlay
- Hamburger menu in TopNav

---

## 11. Files Reference

### 11.1 Components

| File | Purpose |
|------|---------|
| `src/components/appointments/AppointmentsDashboard.tsx` | Main dashboard with view switching and filters |
| `src/components/appointments/DayView.tsx` | Table view with reschedule/cancel modals |
| `src/components/appointments/WeekView.tsx` | 7-column weekly grid |
| `src/components/appointments/MonthView.tsx` | Calendar grid with stats bar |
| `src/components/appointments/AppointmentCard.tsx` | Reusable appointment card (week/month) |
| `src/components/appointments/AppointmentPopover.tsx` | Hover popover with hook |
| `src/components/appointments/appointmentUtils.ts` | Types, constants, helper functions |
| `src/components/TopNav.tsx` | Navigation bar with search, timer, notifications |
| `src/components/LeftSidebar.tsx` | Patient context sidebar |

### 11.2 API Routes

| File | Purpose |
|------|---------|
| `src/app/api/appointments/route.ts` | GET list, POST create |
| `src/app/api/appointments/[id]/route.ts` | GET single, PATCH update, DELETE cancel |
| `src/app/api/patients/route.ts` | POST create patient |
| `src/app/api/patients/[id]/route.ts` | GET patient with full history |
| `src/app/api/visits/route.ts` | POST create visit |
| `src/app/api/visits/[id]/route.ts` | GET/PATCH visit |
| `src/app/api/visits/[id]/sign/route.ts` | POST sign and complete |

### 11.3 Database Migrations

| File | Purpose |
|------|---------|
| `supabase/migrations/001_initial_schema.sql` | patients, visits, clinical_notes tables |
| `supabase/migrations/016_appointments_table.sql` | appointments table with RLS |

---

## 12. Future Enhancements

### 12.1 Not Yet Implemented

- [ ] Patient search API endpoint
- [ ] Queue filtering of appointments
- [ ] Drag-and-drop rescheduling in calendar views
- [ ] Recurring appointment creation
- [ ] Appointment conflict detection
- [ ] Provider availability calendar
- [ ] Waitlist management
- [ ] SMS/email appointment reminders
- [ ] Check-in workflow with ETA tracking

### 12.2 Known Limitations

1. **Queue tabs are UI-only**: Switching queues does not filter appointments
2. **Search is client-side placeholder**: No backend search endpoint
3. **Single provider view**: No multi-provider calendar support
4. **No recurring appointments**: Each appointment must be created individually
5. **Timer not persisted**: Resets on page refresh

---

## Appendix A: Type Definitions

```typescript
// From appointmentUtils.ts

export interface AppointmentPatient {
  id: string
  mrn: string
  firstName: string
  lastName: string
  name: string
  dateOfBirth: string
  age: number | null
  gender: string
  phone: string
  email: string
  referringPhysician: string | null
  referralReason: string | null
}

export interface Appointment {
  id: string
  appointmentDate: string
  appointmentTime: string
  durationMinutes: number
  appointmentType: string
  status: string
  hospitalSite: string
  reasonForVisit: string | null
  schedulingNotes: string | null
  visitId: string | null
  priorVisitId: string | null
  patient: AppointmentPatient | null
  priorVisit: {
    id: string
    visitDate: string
    visitType: string
    aiSummary: string | null
  } | null
}

export type CalendarViewMode = 'day' | 'week' | 'month'

export type AppointmentsByDate = Record<string, Appointment[]>
```

---

*End of PRD*
