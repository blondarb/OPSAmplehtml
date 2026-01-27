# PRD: Working Demo - End-to-End Patient Workflow

## Overview

This PRD defines the complete workflow for a working demonstration of Sevaro Clinical, enabling:
1. Viewing scheduled appointments
2. Opening patient charts with real clinical history
3. Creating and saving clinical notes
4. Scheduling follow-up appointments
5. Viewing prior visit data in subsequent appointments

## User Stories

### US-1: New Patient Consultation
**As a neurologist**, I want to see a new patient referral on my schedule, open their chart, document the visit, and schedule a follow-up.

**Acceptance Criteria:**
- New patient appears on appointments list with "New Consult" type
- Referral reason is visible
- Patient demographics and referral information are pre-populated
- I can document HPI, exam, assessment, and plan
- I can schedule a follow-up appointment
- Note is saved to database

### US-2: Follow-up Visit
**As a neurologist**, I want to see a follow-up patient on my schedule, review their prior visit, and document the current visit.

**Acceptance Criteria:**
- Follow-up appears on appointments list
- Clicking opens chart with prior visit summary visible
- Prior visit AI summary is available
- Prior visit diagnoses and medications are visible
- I can document the current visit
- Changes since last visit can be noted

### US-3: Schedule Follow-up
**As a neurologist**, I want to schedule a follow-up appointment after completing a visit.

**Acceptance Criteria:**
- "Schedule Follow-up" action available after signing note
- Can select follow-up interval (1 week, 2 weeks, 1 month, 3 months, 6 months, 1 year)
- New appointment appears on calendar for selected date
- Appointment links to current visit as "prior visit"

---

## Data Model

### Database Tables

#### 1. `patients` (existing, needs updates)
```sql
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mrn TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  gender TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  insurance_provider TEXT,
  insurance_id TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  primary_care_physician TEXT,
  referring_physician TEXT,
  referral_reason TEXT,
  referral_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2. `appointments` (new table)
```sql
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  appointment_type TEXT NOT NULL, -- 'new-consult', 'follow-up', '3-month-follow-up', etc.
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'confirmed', 'checked-in', 'in-progress', 'completed', 'cancelled', 'no-show'
  hospital_site TEXT,
  reason_for_visit TEXT,
  visit_id UUID REFERENCES visits(id), -- Links to the visit record once started
  prior_visit_id UUID REFERENCES visits(id), -- Links to the previous visit for follow-ups
  notes TEXT, -- Scheduling notes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3. `visits` (existing, needs updates)
```sql
-- Add columns to track appointment linkage
ALTER TABLE visits ADD COLUMN appointment_id UUID REFERENCES appointments(id);
ALTER TABLE visits ADD COLUMN prior_visit_id UUID REFERENCES visits(id);
```

#### 4. `clinical_notes` (existing, ensure these fields)
- hpi, ros, allergies, physical_exam, assessment, plan
- ai_summary (generated after signing)
- raw_dictation (JSON)
- status: 'draft', 'pended', 'signed'

---

## Sample Patient Data

### Patient 1: Maria Santos (New Patient - Headache Referral)

**Demographics:**
- Name: Maria Santos
- DOB: 1985-03-15 (Age: 39)
- Gender: Female
- MRN: 2024-00142
- Phone: (555) 234-5678
- Insurance: Blue Cross Blue Shield

**Referral Information:**
- Referring Physician: Dr. Jennifer Walsh, Family Medicine
- Referral Date: January 15, 2026
- Referral Reason: "Chronic daily headaches x 6 months, not responding to OTC medications. Patient reports associated photophobia and nausea. Please evaluate for migraine vs other etiology."

**Medical History:**
- Hypertension (controlled on lisinopril 10mg)
- Anxiety (on sertraline 50mg)
- Appendectomy (2010)

**Medications:**
- Lisinopril 10mg daily
- Sertraline 50mg daily
- Ibuprofen 400mg PRN (taking daily for headaches)

**Allergies:**
- Sulfa (rash)

**Social History:**
- Works as accountant (high stress, long computer hours)
- Non-smoker, occasional wine
- Married, 2 children
- Poor sleep due to headaches

---

### Patient 2: Robert Chen (Follow-up - Parkinson's Disease)

**Demographics:**
- Name: Robert Chen
- DOB: 1958-11-22 (Age: 67)
- Gender: Male
- MRN: 2023-00089
- Phone: (555) 876-5432
- Insurance: Medicare

**Diagnosis:**
- Parkinson's Disease (diagnosed 2023)
- Essential Tremor (longstanding)
- Type 2 Diabetes

**Prior Visit Summary (October 15, 2025):**
"67-year-old male with Parkinson's disease diagnosed 18 months ago. Currently on carbidopa-levodopa 25/100 TID with good motor response but experiencing mild wearing-off symptoms in late afternoon. No dyskinesias. Tremor well-controlled. Gait stable with occasional festination. UPDRS Motor Score: 24. Plan: Continue current medications, consider adding rasagiline if wearing-off worsens. Return in 3 months."

**Medications:**
- Carbidopa-levodopa 25/100mg TID
- Metformin 1000mg BID
- Atorvastatin 40mg daily

**Allergies:**
- NKDA

**Current Visit Reason:**
- 3-month follow-up for Parkinson's disease
- Patient reports increased afternoon tremor and stiffness

---

## Workflow Implementation

### Phase 1: Database Setup

1. **Create appointments table**
2. **Insert sample patients** (Maria Santos, Robert Chen)
3. **Insert sample appointments** for both patients
4. **Insert prior visit data** for Robert Chen

### Phase 2: Appointments Integration

1. **Update PatientAppointments.tsx** to fetch real data from database
2. **Create API endpoint** `/api/appointments` for CRUD operations
3. **Link appointment click** to load actual patient data

### Phase 3: Patient Chart Loading

1. **Update dashboard page** to accept patient ID parameter
2. **Fetch patient data** including demographics, history, medications
3. **Fetch prior visits** and display AI summaries
4. **Load referral information** for new patients

### Phase 4: Note Saving

1. **Create API endpoint** `/api/visits` for creating/updating visits
2. **Implement "Pend" button** - saves note as draft
3. **Implement "Sign & Complete"** - finalizes note, generates AI summary
4. **Update appointment status** to 'completed'

### Phase 5: Follow-up Scheduling

1. **Add "Schedule Follow-up" modal** after signing
2. **Create new appointment** linked to current visit
3. **Update appointments list** to show new follow-up
4. **Calendar integration** for date selection

---

## API Endpoints

### GET /api/appointments
Returns appointments for a date range
```typescript
Query params: startDate, endDate, status, patientId
Response: { appointments: Appointment[] }
```

### POST /api/appointments
Creates a new appointment
```typescript
Body: { patientId, date, time, type, reason, hospitalSite }
Response: { appointment: Appointment }
```

### PATCH /api/appointments/[id]
Updates appointment status or details
```typescript
Body: { status?, visitId?, notes? }
Response: { appointment: Appointment }
```

### GET /api/patients/[id]
Returns full patient record with history
```typescript
Response: {
  patient: Patient,
  appointments: Appointment[],
  visits: Visit[],
  medications: Medication[],
  allergies: Allergy[]
}
```

### POST /api/visits
Creates or updates a visit
```typescript
Body: { appointmentId, patientId, clinicalNote, status }
Response: { visit: Visit }
```

### POST /api/visits/[id]/sign
Signs and completes a visit
```typescript
Response: { visit: Visit, aiSummary: string }
```

---

## UI Components to Build/Update

### 1. PatientAppointments.tsx
- [ ] Fetch real appointments from database
- [ ] Show patient demographics on hover/expand
- [ ] Display referral reason for new consults
- [ ] Show "prior visit" indicator for follow-ups

### 2. ClinicalNote.tsx
- [ ] Accept patientId from URL or state
- [ ] Load patient data on mount
- [ ] Display referral information for new patients
- [ ] Show prior visit summary for follow-ups

### 3. LeftSidebar.tsx
- [ ] Update to show real patient data
- [ ] Display medications list
- [ ] Show allergies prominently
- [ ] Prior visits from database

### 4. ScheduleFollowupModal.tsx (new)
- [ ] Date picker with preset intervals
- [ ] Time slot selection
- [ ] Reason for follow-up (auto-populated from diagnoses)
- [ ] Confirmation and create appointment

### 5. NoteActionBar.tsx
- [ ] "Pend" saves to database
- [ ] "Sign & Complete" finalizes
- [ ] "Schedule Follow-up" opens modal

---

## State Management

### Global State (Context or Zustand)
```typescript
interface AppState {
  currentPatient: Patient | null;
  currentAppointment: Appointment | null;
  currentVisit: Visit | null;
  noteData: NoteData;
  isDirty: boolean;

  // Actions
  loadPatient: (patientId: string) => Promise<void>;
  loadAppointment: (appointmentId: string) => Promise<void>;
  saveNote: (status: 'draft' | 'pended' | 'signed') => Promise<void>;
  scheduleFollowup: (options: FollowupOptions) => Promise<void>;
}
```

---

## Demo Flow Script

### Scenario 1: New Patient - Maria Santos

1. **Open Appointments** - See Maria Santos listed for today at 9:00 AM
   - Type: "New Consult"
   - Reason: "Chronic headaches"
   - Status: "Scheduled"

2. **Click to Open Chart**
   - Patient demographics auto-populated
   - Referral letter visible in sidebar
   - "New Patient" badge displayed
   - Prior visits section shows "No prior visits"

3. **Document the Visit**
   - Select "Headache" as reason for consult
   - Document HPI based on referral and interview
   - Complete neurological exam
   - Enter assessment: "Chronic migraine without aura"
   - Document plan: Start preventive medication, lifestyle modifications

4. **Sign & Complete**
   - AI generates visit summary
   - Note status changes to "Signed"
   - Appointment marked "Completed"

5. **Schedule Follow-up**
   - Select "6 weeks"
   - New appointment created
   - Visible on future date in appointments list

### Scenario 2: Follow-up - Robert Chen

1. **Open Appointments** - See Robert Chen listed for today at 10:30 AM
   - Type: "3 Month Follow-up"
   - Reason: "Parkinson's Disease"
   - Status: "Confirmed"

2. **Click to Open Chart**
   - Patient demographics shown
   - Prior visit (October 2025) visible with AI summary
   - Current medications listed
   - UPDRS history shown in Score History

3. **Review Prior Visit**
   - Click to expand October visit summary
   - See previous UPDRS score (24)
   - Review previous plan

4. **Document Current Visit**
   - Note progression of symptoms
   - Update UPDRS (now 28)
   - Adjust medication: Add rasagiline
   - Update plan

5. **Sign & Complete**
   - AI generates new summary
   - New UPDRS score added to history

6. **Schedule Follow-up**
   - Select "3 months"
   - New appointment created

---

## Implementation Priority

### Sprint 1: Database & Sample Data
1. Create appointments table
2. Insert sample patients with full history
3. Insert sample appointments
4. Insert prior visit data for Robert Chen

### Sprint 2: Read Flow
1. Fetch real appointments in PatientAppointments
2. Load patient data when clicking appointment
3. Display patient info in LeftSidebar
4. Show prior visits and AI summaries

### Sprint 3: Write Flow
1. Save note data to database
2. Implement Pend functionality
3. Implement Sign & Complete
4. Generate and store AI summary

### Sprint 4: Scheduling
1. Create ScheduleFollowupModal
2. Create appointments via API
3. Link follow-up to current visit
4. Update appointments list

---

## Success Metrics

- [ ] Can view appointments for any date
- [ ] Can open patient chart from appointment
- [ ] Patient history loads correctly
- [ ] Prior visits display AI summaries
- [ ] Can save note as draft (Pend)
- [ ] Can sign and complete note
- [ ] AI summary generates on sign
- [ ] Can schedule follow-up appointment
- [ ] Follow-up appears on calendar
- [ ] Follow-up shows link to prior visit

---

## Technical Notes

### Supabase RLS Policies
- All tables need user_id column for RLS
- For demo, can use service role key or disable RLS temporarily

### AI Summary Generation
- Use existing `/api/ai/chart-prep` or create dedicated endpoint
- Generate on sign, store in clinical_notes.ai_summary

### Real-time Updates
- Consider Supabase realtime for appointment status updates
- Not required for MVP demo

---

## File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── appointments/
│   │   │   ├── route.ts          # GET, POST appointments
│   │   │   └── [id]/route.ts     # PATCH, DELETE appointment
│   │   ├── patients/
│   │   │   └── [id]/route.ts     # GET patient with full history
│   │   └── visits/
│   │       ├── route.ts          # POST create visit
│   │       └── [id]/
│   │           ├── route.ts      # GET, PATCH visit
│   │           └── sign/route.ts # POST sign visit
│   └── dashboard/
│       └── page.tsx              # Updated to handle patient loading
├── components/
│   ├── PatientAppointments.tsx   # Updated with real data
│   ├── ScheduleFollowupModal.tsx # New component
│   └── ...
└── lib/
    └── types/
        └── appointments.ts       # Type definitions
```

---

## Appendix: SQL Scripts

See `SETUP_WORKING_DEMO.sql` for complete database setup including:
- Table creation
- Sample data insertion
- RLS policies (if needed)
