# API Contracts Reference

This document provides comprehensive API documentation for the Sevaro Clinical application. It is intended for engineering teams rebuilding these features in their own stack.

**Base URL:** `/api`

**Authentication:** All endpoints require Supabase Auth session (cookie-based). Requests without valid authentication return `401 Unauthorized`.

**Multi-tenancy:** Most endpoints are tenant-scoped using the `tenant_id` derived from server context.

---

## Table of Contents

1. [AI Endpoints](#ai-endpoints)
   - [Ask AI](#post-apiaiask)
   - [Chart Prep](#post-apiaichart-prep)
   - [Field Action](#post-apiaifield-action)
   - [Transcribe](#post-apiaitranscribe)
   - [Visit AI](#post-apiaivisit-ai)
   - [Scale Autofill](#post-apiaiscale-autofill)
   - [Synthesize Note](#post-apiaisynthesize-note)
   - [Generate Assessment](#post-apiaigenerate-assessment)
   - [Note Review](#post-apiainote-review)
   - [Historian Session](#post-apiaihistoriansession)
   - [Historian Save](#historian-save-endpoints)
2. [Patients](#patients)
3. [Visits](#visits)
4. [Appointments](#appointments)
5. [Medications](#medications)
6. [Allergies](#allergies)
7. [Clinical Scales](#clinical-scales)
8. [Clinical Plans](#clinical-plans)
9. [Dot Phrases](#dot-phrases)
10. [Saved Plans](#saved-plans)
11. [Feedback](#feedback)
12. [Patient Portal](#patient-portal)
13. [Admin/Demo](#admindemo)

---

## AI Endpoints

### POST /api/ai/ask

Ask clinical questions with patient context.

**Model:** `gpt-5-mini`

**Request Body:**
```typescript
{
  question: string;                    // Required - the clinical question
  context?: {
    patient?: string;                  // Patient name
    chiefComplaint?: string;           // Chief complaint
    hpi?: string;                      // HPI summary
    fullNoteText?: string;             // Full clinical note text (for "Ask AI about this note")
  };
  userSettings?: {
    globalAiInstructions?: string;
    documentationStyle?: 'concise' | 'detailed' | 'narrative';
    preferredTerminology?: 'formal' | 'standard' | 'simplified';
  };
}
```

**Response (200):**
```typescript
{
  response: string;                    // AI-generated answer
}
```

**Error Responses:**
- `400` - Question is required
- `401` - Unauthorized
- `500` - OpenAI API key not configured / Invalid API key

**Example Request:**
```json
{
  "question": "What are the first-line treatments for chronic migraine?",
  "context": {
    "patient": "Maria Santos",
    "chiefComplaint": "Chronic headache"
  }
}
```

**Example Response:**
```json
{
  "response": "First-line preventive treatments for chronic migraine include topiramate (50-100mg BID), propranolol (40-160mg daily), and amitriptyline (10-50mg at bedtime). CGRP monoclonal antibodies (erenumab, fremanezumab, galcanezumab) are also approved for chronic migraine prevention..."
}
```

---

### POST /api/ai/chart-prep

Generate pre-visit chart preparation summary.

**Model:** `gpt-5-mini`

**Request Body:**
```typescript
{
  patient: {
    id: string;
    first_name: string;
    last_name: string;
    date_of_birth?: string;
    gender?: string;
    mrn?: string;
  };
  noteData?: {
    chiefComplaint?: string[];
  };
  prepNotes?: Array<{
    category: string;
    text: string;
  }>;
  userSettings?: {
    globalAiInstructions?: string;
    documentationStyle?: 'concise' | 'detailed' | 'narrative';
    preferredTerminology?: 'formal' | 'standard' | 'simplified';
  };
}
```

**Response (200):**
```typescript
{
  sections: {
    summary: string;                   // 4-8 sentence narrative paragraph
    alerts?: string;                   // Urgent items with warning emoji prefix
    suggestedHPI?: string;             // Draft HPI paragraph
    suggestedAssessment?: string;      // 1-2 sentence clinical impression
    suggestedPlan?: string;            // 3-5 bullet point recommendations
  };
  response: string;                    // Formatted text version for backwards compatibility
}
```

**Error Responses:**
- `401` - Unauthorized
- `500` - OpenAI API key not configured / Error

**Example Response:**
```json
{
  "sections": {
    "summary": "Maria Santos is a 42-year-old woman presenting for follow-up of chronic migraine. She has been managed with topiramate 100mg BID with partial response. Last MIDAS score was 48 indicating severe disability. Key considerations include evaluating CGRP therapy eligibility.",
    "alerts": "",
    "suggestedHPI": "Patient returns for follow-up of chronic migraine, currently experiencing 12-15 headache days per month...",
    "suggestedAssessment": "Chronic migraine with inadequate response to current preventive therapy.",
    "suggestedPlan": "- Consider adding CGRP antagonist\n- Continue topiramate 100mg BID\n- Repeat MIDAS assessment\n- Follow up in 6 weeks"
  },
  "response": "Maria Santos is a 42-year-old woman..."
}
```

---

### POST /api/ai/field-action

Perform AI actions on clinical text fields (improve, expand, summarize).

**Model:** `gpt-5-mini`

**Request Body:**
```typescript
{
  action: 'improve' | 'expand' | 'summarize';  // Required
  text: string;                                 // Required - the text to transform
  fieldName: string;                            // Field context (hpi, ros, assessment, plan, allergies, findings)
  context?: {
    patient?: string;
    chiefComplaint?: string;
  };
  userSettings?: {
    globalAiInstructions?: string;
    sectionAiInstructions?: Record<string, string>;  // Per-section instructions
    documentationStyle?: 'concise' | 'detailed' | 'narrative';
    preferredTerminology?: 'formal' | 'standard' | 'simplified';
  };
}
```

**Response (200):**
```typescript
{
  result: string;                      // Transformed text
  action: string;                      // Echo of the action performed
  originalLength: number;              // Character count of input
  resultLength: number;                // Character count of output
}
```

**Error Responses:**
- `400` - Valid action required / Text content required
- `401` - Unauthorized
- `500` - OpenAI API key not configured

**Notes:**
- `expand` action uses lower temperature (0.3) to reduce hallucination risk
- Strict anti-hallucination guardrails: AI will not add new clinical information

---

### POST /api/ai/transcribe

Transcribe audio using Whisper with GPT cleanup.

**Models:** `whisper-1` (transcription) + `gpt-5-mini` (cleanup)

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| audio | File | Yes | Audio file (webm, mp3, mp4, m4a, ogg, wav) |

**Response (200):**
```typescript
{
  text: string;                        // Cleaned transcription
  rawText: string;                     // Original Whisper output
}
```

**Error Responses:**
- `400` - No audio file provided / Audio file is empty
- `401` - Unauthorized
- `500` - OpenAI API key not configured

---

### POST /api/ai/visit-ai

Full visit transcription and clinical content extraction.

**Models:** `whisper-1` (transcription) + `gpt-5.2` (extraction)

**Max Duration:** 120 seconds (server-side timeout)

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| audio | File | Yes | Audio recording (max 25MB) |
| patient | string (JSON) | No | Patient info object |
| chartPrep | string (JSON) | No | Chart prep context |
| userSettings | string (JSON) | No | User preferences |

**Response (200):**
```typescript
{
  success: boolean;
  visitAI: {
    hpiFromVisit: string;              // Extracted HPI narrative
    rosFromVisit: string;              // Extracted ROS in bullet format
    examFromVisit: string;             // Extracted physical exam findings
    assessmentFromVisit: string;       // Clinical assessment
    planFromVisit: string;             // Treatment plan in bullet format
    transcriptSummary: string;         // 2-3 sentence summary
    confidence: {
      hpi: number;                     // 0-1 confidence score
      ros: number;
      exam: number;
      assessment: number;
      plan: number;
    };
  };
  transcript: string;                  // Full transcript text
  segments: Array<{
    text: string;
    start: number;
    end: number;
  }>;
  duration: number | null;             // Recording duration in seconds
}
```

**Error Responses:**
- `400` - No audio file / File too large (>25MB) / No speech detected
- `401` - Unauthorized
- `500` - Error processing

---

### POST /api/ai/scale-autofill

AI-powered autofill for clinical assessment scales.

**Model:** `gpt-5.2`

**Request Body:**
```typescript
{
  scaleId: string;                     // Required - scale identifier (e.g., 'phq9', 'midas')
  clinicalText: string;                // Required - clinical notes to extract from
  patientContext?: {
    age?: number;
    sex?: string;
    diagnoses?: string[];
    medications?: string[];
    medicalHistory?: string[];
    allergies?: string[];
    vitalSigns?: {
      bloodPressure?: string;
      heartRate?: number;
      weight?: number;
      height?: number;
    };
  };
}
```

**Response (200):**
```typescript
{
  scaleId: string;
  scaleName: string;
  responses: Record<string, number | boolean | string>;  // Question ID -> answer
  confidence: Record<string, 'high' | 'medium' | 'low'>; // Per-question confidence
  reasoning: Record<string, string>;                      // Extraction reasoning
  missingInfo: string[];                                  // Questions without data
  suggestedPrompts: string[];                             // Questions to ask patient
  validationWarnings: string[];                           // Invalid response warnings
  questionsCount: number;
  answeredCount: number;
}
```

**Error Responses:**
- `400` - Scale ID required / Clinical text required / Scale not found
- `401` - Unauthorized
- `500` - OpenAI API key not configured

---

### POST /api/ai/synthesize-note

Synthesize multiple information sources into a cohesive clinical note.

**Model:** `gpt-5.2`

**Request Body:**
```typescript
{
  noteType: 'new-consult' | 'follow-up';
  noteLength: 'concise' | 'standard' | 'detailed';
  manualData: {
    chiefComplaint?: string | string[];
    hpi?: string;
    ros?: string;
    rosDetails?: string;
    physicalExam?: string;
    assessment?: string;
    plan?: string;
    allergies?: string;
    allergyDetails?: string;
  };
  chartPrepData?: {
    patientSummary?: string;
    suggestedHPI?: string;
    relevantHistory?: string;
    currentMedications?: string;
    imagingFindings?: string;
    scaleTrends?: string;
    keyConsiderations?: string;
    suggestedAssessment?: string;
    suggestedPlan?: string;
  };
  visitAIData?: {
    hpiFromVisit?: string;
    rosFromVisit?: string;
    examFromVisit?: string;
    assessmentFromVisit?: string;
    planFromVisit?: string;
  };
  scales?: Array<{
    scaleName: string;
    abbreviation: string;
    rawScore: number;
    maxScore?: number;
    interpretation: string;
    severity: string;
  }>;
  diagnoses?: Array<{
    name: string;
    icd10: string;
    isPrimary?: boolean;
  }>;
  imagingStudies?: Array<{
    studyType: string;
    date: string;
    impression: string;
    findings?: string;
  }>;
  recommendations?: Array<{
    category: string;
    items: string[];
  }>;
  patient?: {
    name: string;
    age?: number;
    gender?: string;
  };
  userSettings?: {
    globalInstructions?: string;
    sectionInstructions?: Record<string, string>;
    documentationStyle?: string;
  };
}
```

**Response (200):**
```typescript
{
  success: boolean;
  synthesizedNote: {
    chiefComplaint: string;
    hpi: string;
    ros: string;
    allergies: string;
    physicalExam: string;
    scales: string;
    imaging: string;
    assessment: string;
    plan: string;
  };
  noteType: string;
  noteLength: string;
}
```

---

### POST /api/ai/generate-assessment

Generate clinical assessment from selected diagnoses.

**Model:** `gpt-5.2`

**Request Body:**
```typescript
{
  context: {
    patientName?: string;
    patientAge?: number;
    patientGender?: string;
    chiefComplaints?: string[];
    hpi?: string;
    ros?: string;
    rosDetails?: string;
    physicalExam?: string;
    examFreeText?: string;
    vitals?: { bp?: string; hr?: string; temp?: string; weight?: string; bmi?: string };
    medications?: string[];
    allergies?: string[];
    medicalHistory?: string;
    historyDetails?: string;
    selectedDiagnoses: Array<{        // Required - at least one
      id: string;
      name: string;
      icd10: string;
    }>;
  };
  userSettings?: {
    globalAiInstructions?: string;
    sectionAiInstructions?: Record<string, string>;
    documentationStyle?: 'concise' | 'detailed' | 'narrative';
    preferredTerminology?: 'formal' | 'standard' | 'simplified';
  };
}
```

**Response (200):**
```typescript
{
  assessment: string;                  // Generated assessment text
}
```

**Error Responses:**
- `400` - At least one diagnosis must be selected
- `401` - Unauthorized
- `500` - OpenAI API key not configured

---

### POST /api/ai/note-review

Review clinical note for consistency, completeness, and quality issues.

**Model:** `gpt-5-mini`

**Request Body:**
```typescript
{
  sections: Array<{                    // Required - at least one section
    title: string;                     // Section name (e.g., "HPI", "Assessment")
    content: string;                   // Section content
  }>;
  noteType?: string;                   // 'new-consult' | 'follow-up'
  diagnoses?: string[];                // Active diagnosis names
}
```

**Response (200):**
```typescript
{
  suggestions: Array<{
    type: 'consistency' | 'completeness' | 'quality';
    message: string;                   // Specific, actionable suggestion
    sectionId: string;                 // Related section ID
    severity: 'warning' | 'info';
  }>;  // Max 6 suggestions, sorted by clinical importance
}
```

---

### POST /api/ai/historian/session

Create an ephemeral token for WebRTC connection to OpenAI Realtime API.

**Model:** `gpt-realtime` (voice) + `whisper-1` (transcription)

**Request Body:**
```typescript
{
  sessionType?: 'new_patient' | 'follow_up';  // Default: 'new_patient'
  referralReason?: string;
  patientContext?: string;             // Prior visit context
}
```

**Response (200):**
```typescript
{
  ephemeralKey: string;                // Short-lived API key for WebRTC
  sessionId: string;                   // Session identifier
  expiresAt: number;                   // Unix timestamp when key expires
}
```

**Error Responses:**
- `500` - OpenAI API key not configured / Failed to create session

---

### Historian Save Endpoints

#### POST /api/ai/historian/save

Save a completed historian interview session.

**Request Body:**
```typescript
{
  tenant_id?: string;
  patient_id?: string;
  session_type?: 'new_patient' | 'follow_up';
  patient_name?: string;
  referral_reason?: string;
  structured_output?: object;          // Extracted clinical data (JSONB)
  narrative_summary?: string;
  transcript?: string;
  red_flags?: object;                  // Identified red flags (JSONB)
  safety_escalated?: boolean;
  duration_seconds?: number;
  question_count?: number;
  status?: string;
}
```

**Response (200):**
```typescript
{
  session: {
    id: string;
    // ... all inserted fields
    reviewed: boolean;
    imported_to_note: boolean;
    created_at: string;
  };
}
```

#### GET /api/ai/historian/save

List historian sessions.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| tenant_id | string | Filter by tenant (defaults to server context) |
| patient_id | string | Filter by patient |

**Response (200):**
```typescript
{
  sessions: Array<{
    id: string;
    patient_id: string;
    patient: {                         // Joined patient data
      id: string;
      first_name: string;
      last_name: string;
      mrn: string;
    };
    session_type: string;
    structured_output: object;
    transcript: string;
    red_flags: object;
    status: string;
    created_at: string;
    // ... other fields
  }>;  // Max 10 results, ordered by created_at desc
}
```

---

## Patients

### POST /api/patients

Create a new patient.

**Request Body:**
```typescript
{
  firstName: string;                   // Required
  lastName: string;                    // Required
  dateOfBirth: string;                 // Required (YYYY-MM-DD)
  gender: 'M' | 'F' | 'O';            // Required
  mrn?: string;                        // Auto-generated if not provided
  phone?: string;
  email?: string;
  referringPhysician?: string;
  referralReason?: string;
}
```

**Response (201):**
```typescript
{
  patient: {
    id: string;
    user_id: string;
    mrn: string;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    gender: string;
    // ... other fields
  };
}
```

**Error Responses:**
- `400` - Missing required fields / Gender must be M, F, or O
- `401` - Unauthorized
- `409` - Duplicate MRN
- `500` - Internal error

---

### GET /api/patients/[id]

Get patient with full clinical history.

**Response (200):**
```typescript
{
  patient: {
    id: string;
    mrn: string;
    firstName: string;
    lastName: string;
    name: string;                      // Combined first + last
    dateOfBirth: string;
    age: number | null;
    gender: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    insuranceProvider: string | null;
    insuranceId: string | null;
    primaryCarePhysician: string | null;
    referringPhysician: string | null;
    referralReason: string | null;
    referralDate: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
  };
  medications: Array<{
    id: string;
    name: string;
    dosage: string | null;
    frequency: string | null;
    route: string | null;
    startDate: string | null;
    prescriber: string | null;
    notes: string | null;
  }>;
  allergies: Array<{
    id: string;
    allergen: string;
    reaction: string | null;
    severity: string | null;
  }>;
  visits: Array<{
    id: string;
    visitDate: string;
    visitType: string;
    chiefComplaint: string[];
    status: string;
    providerName: string | null;
    clinicalNote: {
      id: string;
      hpi: string | null;
      ros: string | null;
      physicalExam: object | null;
      examFreeText: string | null;
      assessment: string | null;
      plan: string | null;
      aiSummary: string | null;
      status: string;
    } | null;
  }>;
  appointments: Array<object>;         // Raw appointment records
  scoreHistory: Array<{
    id: string;
    scaleType: string;
    score: number;
    maxScore: number | null;
    interpretation: string | null;
    severity: string | null;
    completedAt: string;
  }>;
  imagingStudies: Array<object>;       // Raw imaging records
}
```

---

## Visits

### POST /api/visits

Create a new visit (when starting an appointment).

**Request Body:**
```typescript
{
  patientId: string;                   // Required
  appointmentId?: string;              // Links appointment to visit
  chiefComplaint?: string[];
  visitType?: string;                  // Default: 'new_patient'
  providerName?: string;
  priorVisitId?: string;
}
```

**Response (201):**
```typescript
{
  visit: {
    id: string;
    patient_id: string;
    user_id: string;
    visit_date: string;
    visit_type: string;
    chief_complaint: string[];
    status: 'in_progress';
    clinicalNote: {
      id: string;
      visit_id: string;
      status: 'draft';
    } | null;
  };
}
```

**Error Responses:**
- `400` - patientId is required
- `401` - Unauthorized
- `409` - Appointment already has an active visit (returns existing visitId)

---

### GET /api/visits/[id]

Get a visit with clinical note and patient info.

**Response (200):**
```typescript
{
  visit: {
    id: string;
    patient_id: string;
    visit_date: string;
    visit_type: string;
    chief_complaint: string[];
    status: string;
    clinical_notes: Array<object>;     // Joined clinical notes
    patient: object;                   // Joined patient data
  };
}
```

---

### PATCH /api/visits/[id]

Update a visit and its clinical note.

**Request Body:**
```typescript
{
  chiefComplaint?: string | string[];
  status?: string;
  clinicalNote?: {
    hpi?: string;
    ros?: string;
    rosDetails?: string;
    allergies?: string;
    allergyDetails?: string;
    historyAvailable?: string;
    historyDetails?: string;
    physicalExam?: object;
    assessment?: string;
    plan?: string;
    rawDictation?: string;
    aiSummary?: string;
    status?: string;
    vitals?: object;
    examFreeText?: string;
  };
}
```

**Response (200):**
```typescript
{
  visit: {
    // Updated visit with clinical_notes joined
  };
}
```

---

### POST /api/visits/[id]/sign

Sign and complete a visit.

**Model:** `gpt-5-mini` (for AI summary generation)

**Request Body:** None required

**Response (200):**
```typescript
{
  visit: {
    // Updated visit with status='completed'
    clinical_notes: [{
      status: 'signed';
      is_signed: true;
      signed_at: string;
      ai_summary: string;
    }];
  };
  aiSummary: string;                   // Generated summary
  message: 'Visit signed and completed successfully';
}
```

---

## Appointments

### GET /api/appointments

Get appointments with optional filters.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| date | string | Single date (YYYY-MM-DD) |
| startDate | string | Range start |
| endDate | string | Range end |
| patientId | string | Filter by patient |
| status | string | Filter by status (or 'All') |

**Response (200):**
```typescript
{
  appointments: Array<{
    id: string;
    appointmentDate: string;
    appointmentTime: string;
    durationMinutes: number;
    appointmentType: string;
    status: string;
    hospitalSite: string;
    reasonForVisit: string | null;
    schedulingNotes: string | null;
    visitId: string | null;
    priorVisitId: string | null;
    patient: {
      id: string;
      mrn: string;
      firstName: string;
      lastName: string;
      name: string;
      dateOfBirth: string;
      age: number | null;
      gender: string;
      phone: string | null;
      email: string | null;
      referringPhysician: string | null;
      referralReason: string | null;
    } | null;
    priorVisit: {
      id: string;
      visitDate: string;
      visitType: string;
      aiSummary: string | null;
    } | null;
  }>;
}
```

---

### POST /api/appointments

Create a new appointment.

**Request Body:**
```typescript
{
  patientId: string;                   // Required
  appointmentDate: string;             // Required (YYYY-MM-DD)
  appointmentTime: string;             // Required (HH:MM)
  appointmentType: string;             // Required
  durationMinutes?: number;            // Default: 30
  hospitalSite?: string;               // Default: 'Meridian Neurology'
  reasonForVisit?: string;
  priorVisitId?: string;
  schedulingNotes?: string;
}
```

**Response (201):**
```typescript
{
  appointment: {
    id: string;
    patient_id: string;
    appointment_date: string;
    appointment_time: string;
    appointment_type: string;
    status: 'scheduled';
    // ... other fields
  };
}
```

---

### GET /api/appointments/[id]

Get a single appointment with full related data.

**Response (200):**
```typescript
{
  appointment: {
    // ... all appointment fields
    patient: object;                   // Full patient data
    visit: object | null;              // Active visit with clinical notes
    prior_visit: object | null;        // Prior visit with clinical notes
  };
}
```

---

### PATCH /api/appointments/[id]

Update an appointment.

**Request Body:**
```typescript
{
  appointmentDate?: string;
  appointmentTime?: string;
  durationMinutes?: number;
  appointmentType?: string;
  status?: string;
  hospitalSite?: string;
  reasonForVisit?: string;
  visitId?: string;
  schedulingNotes?: string;
}
```

---

### DELETE /api/appointments/[id]

Cancel an appointment (soft delete).

**Response (200):**
```typescript
{
  appointment: {
    // ... appointment with status='cancelled'
  };
  message: 'Appointment cancelled';
}
```

---

## Medications

### GET /api/medications

List medications for a patient.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| patient_id | string | Required - patient UUID |
| status | string | Filter by status |
| all | 'true' | Include inactive medications |

**Response (200):**
```typescript
{
  medications: Array<{
    id: string;
    patient_id: string;
    medication_name: string;
    generic_name: string | null;
    dosage: string | null;
    frequency: string | null;
    route: string;
    start_date: string | null;
    end_date: string | null;
    prescriber: string | null;
    indication: string | null;
    status: string;
    is_active: boolean;
    notes: string | null;
    source: string;
    created_at: string;
  }>;
}
```

---

### POST /api/medications

Create a medication.

**Request Body:**
```typescript
{
  patient_id: string;                  // Required
  medication_name: string;             // Required
  generic_name?: string;
  dosage?: string;
  frequency?: string;
  route?: string;                      // Default: 'PO'
  start_date?: string;
  prescriber?: string;
  indication?: string;
  notes?: string;
  source?: string;                     // Default: 'manual'
}
```

**Response (201):**
```typescript
{
  medication: {
    // ... created medication record
  };
}
```

---

### GET /api/medications/[id]

Get a single medication.

---

### PATCH /api/medications/[id]

Update a medication.

**Request Body:** (all fields optional)
```typescript
{
  medication_name?: string;
  generic_name?: string;
  dosage?: string;
  frequency?: string;
  route?: string;
  start_date?: string;
  end_date?: string;
  prescriber?: string;
  indication?: string;
  status?: string;                     // 'active' | 'discontinued'
  discontinue_reason?: string;
  notes?: string;
  confirmed_by_user?: boolean;
}
```

**Notes:**
- When status is set to 'discontinued' and end_date is not provided, end_date is auto-set to today

---

### DELETE /api/medications/[id]

Hard delete a medication.

**Response (200):**
```typescript
{
  success: true;
}
```

---

## Allergies

### GET /api/allergies

List allergies for a patient.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| patient_id | string | Required - patient UUID |
| all | 'true' | Include inactive allergies |

**Response (200):**
```typescript
{
  allergies: Array<{
    id: string;
    patient_id: string;
    allergen: string;
    allergen_type: string;
    reaction: string | null;
    severity: string;
    onset_date: string | null;
    is_active: boolean;
    notes: string | null;
    source: string;
    created_at: string;
  }>;
}
```

---

### POST /api/allergies

Create an allergy.

**Request Body:**
```typescript
{
  patient_id: string;                  // Required
  allergen: string;                    // Required
  allergen_type?: string;              // Default: 'drug'
  reaction?: string;
  severity?: string;                   // Default: 'unknown'
  onset_date?: string;
  notes?: string;
  source?: string;                     // Default: 'manual'
}
```

---

### PATCH /api/allergies/[id]

Update an allergy.

**Request Body:** (all fields optional)
```typescript
{
  allergen?: string;
  allergen_type?: string;
  reaction?: string;
  severity?: string;
  is_active?: boolean;
  notes?: string;
  confirmed_by_user?: boolean;
}
```

---

### DELETE /api/allergies/[id]

Hard delete an allergy.

---

## Clinical Scales

### GET /api/scales

Fetch scale results for a patient.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| patientId | string | Required - patient UUID |
| scaleId | string | Filter by scale type |
| limit | number | Max results (default: 10) |

**Response (200):**
```typescript
{
  results: Array<{
    id: string;
    patient_id: string;
    visit_id: string | null;
    scale_id: string;
    responses: object;                 // Question ID -> answer mapping
    raw_score: number;
    interpretation: string | null;
    severity_level: string | null;
    grade: string | null;
    triggered_alerts: string[] | null;
    notes: string | null;
    completed_by: string;
    completed_at: string;
  }>;
}
```

---

### POST /api/scales

Save a scale result.

**Request Body:**
```typescript
{
  patientId: string;                   // Required
  scaleId: string;                     // Required
  responses: object;                   // Required - question responses
  rawScore: number;                    // Required
  visitId?: string;
  interpretation?: string;
  severityLevel?: string;
  grade?: string;
  triggeredAlerts?: string[];
  notes?: string;
}
```

**Response (200):**
```typescript
{
  result: {
    // ... created scale result
  };
}
```

---

## Clinical Plans

### GET /api/plans

Get clinical treatment plans.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| diagnosisId | string | Get plan for specific diagnosis |
| planKey | string | Get plan by its key |
| list | 'true' | List all plans (summary only) |
| search | string | Search plans by keyword |

**Response (200) - Single plan:**
```typescript
{
  plan: {
    id: string;
    title: string;
    icd10: string[];
    scope: string;
    notes: string[];
    sections: Record<string, string[]>;  // Category -> items
    patientInstructions: string[];
    referrals: string[];
    differential: string[];
    evidence: string[];
    monitoring: string[];
    disposition: string[];
    isGeneric: boolean;
  } | null;
  message?: string;                    // If not found
}
```

**Response (200) - List:**
```typescript
{
  plans: Array<{
    plan_id: string;
    title: string;
    icd10_codes: string[];
    linked_diagnoses: string[];        // Matching diagnosis IDs
    diagnosis_scores: Record<string, number>;  // Match quality scores
  }>;
}
```

---

### POST /api/plans/seed

Seed clinical plans from hardcoded data.

**Response (201):**
```typescript
{
  message: 'Clinical plans seeded successfully';
  count: number;                       // Number of plans seeded
}
```

---

## Dot Phrases

### GET /api/phrases

List all dot phrases for the current user.

**Response (200):**
```typescript
{
  phrases: Array<{
    id: string;
    user_id: string;
    tenant_id: string;
    trigger_text: string;              // e.g., ".neuroexam"
    expansion_text: string;            // The expanded text
    category: string;                  // e.g., "Physical Exam"
    description: string | null;
    scope: string;                     // 'global' | 'hpi' | 'ros' | 'assessment' | 'plan' | 'allergies'
    is_active: boolean;
    use_count: number;
    last_used: string | null;
    created_at: string;
  }>;  // Ordered by use_count descending
}
```

---

### POST /api/phrases

Create a new phrase.

**Request Body:**
```typescript
{
  trigger_text: string;                // Required - auto-prefixed with '.' if missing
  expansion_text: string;              // Required
  category?: string;                   // Default: 'General'
  description?: string;
  scope?: string;                      // Default: 'global'
}
```

**Response (201):**
```typescript
{
  phrase: {
    // ... created phrase
  };
}
```

**Error Responses:**
- `400` - trigger_text and expansion_text are required
- `409` - Phrase with this trigger already exists

---

### GET /api/phrases/[id]

Get a single phrase.

---

### PUT /api/phrases/[id]

Update a phrase.

**Request Body:** (all optional)
```typescript
{
  trigger_text?: string;
  expansion_text?: string;
  category?: string;
  description?: string;
  is_active?: boolean;
  scope?: string;
}
```

---

### DELETE /api/phrases/[id]

Delete a phrase.

---

### PATCH /api/phrases/[id]

Track phrase usage (increment use_count).

**Response (200):**
```typescript
{
  success: true;
}
```

---

### POST /api/phrases/seed

Seed default neurology phrases for the current user.

**Response (200) - Already seeded:**
```typescript
{
  message: 'User already has phrases';
  seeded: false;
}
```

**Response (201) - Newly seeded:**
```typescript
{
  message: 'Default phrases seeded successfully';
  seeded: true;
  count: number;                       // ~70+ default phrases
}
```

---

## Saved Plans

### GET /api/saved-plans

List saved (user-customized) plans.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| source_plan_key | string | Filter by source clinical plan |

**Response (200):**
```typescript
{
  plans: Array<{
    id: string;
    user_id: string;
    tenant_id: string;
    name: string;
    description: string | null;
    source_plan_key: string | null;
    selected_items: object;            // Which items from source plan
    custom_items: object;              // User-added items
    is_default: boolean;
    use_count: number;
    last_used: string | null;
    created_at: string;
  }>;
}
```

---

### POST /api/saved-plans

Create a saved plan.

**Request Body:**
```typescript
{
  name: string;                        // Required
  description?: string;
  source_plan_key?: string;
  selected_items?: object;
  custom_items?: object;
}
```

**Error Responses:**
- `400` - name is required
- `409` - Maximum of 10 saved plans reached

---

### GET /api/saved-plans/[id]

Get a single saved plan.

---

### PUT /api/saved-plans/[id]

Update a saved plan.

**Request Body:** (all optional)
```typescript
{
  name?: string;
  description?: string;
  selected_items?: object;
  custom_items?: object;
  is_default?: boolean;
}
```

---

### DELETE /api/saved-plans/[id]

Delete a saved plan.

---

### PATCH /api/saved-plans/[id]

Track usage (increment use_count).

---

## Feedback

### GET /api/feedback

List all feedback items with vote counts.

**Response (200):**
```typescript
{
  feedback: Array<{
    id: string;
    user_id: string;
    user_email: string;
    text: string;
    status: 'pending' | 'approved' | 'in_progress' | 'addressed' | 'declined';
    upvotes: string[];                 // Array of user IDs
    downvotes: string[];
    admin_user_id: string | null;
    admin_user_email: string | null;
    admin_response: string | null;
    status_updated_at: string | null;
    created_at: string;
    updated_at: string;
    comment_count: number;             // Computed from feedback_comments
  }>;
  currentUserId: string;
  isAdmin: boolean;
}
```

---

### POST /api/feedback

Submit new feedback.

**Request Body:**
```typescript
{
  text: string;                        // Required
}
```

**Response (200):**
```typescript
{
  feedback: {
    id: string;
    text: string;
    user_id: string;
    user_email: string;
    status: 'pending';
    upvotes: [];
    downvotes: [];
    created_at: string;
  };
}
```

---

### PATCH /api/feedback

Vote on feedback or update status (admin).

**Request Body - Vote:**
```typescript
{
  feedbackId: string;                  // Required
  voteType: 'up' | 'down';            // Required for voting
}
```

**Request Body - Edit Text (own feedback):**
```typescript
{
  feedbackId: string;
  action: 'updateText';
  text: string;
}
```

**Request Body - Admin Status Update:**
```typescript
{
  feedbackId: string;
  action: 'updateStatus';
  status: 'pending' | 'approved' | 'in_progress' | 'addressed' | 'declined';
  adminResponse?: string;
}
```

---

### GET /api/feedback/comments

Get comments for a feedback item.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| feedbackId | string | Required |

**Response (200):**
```typescript
{
  comments: Array<{
    id: string;
    feedback_id: string;
    user_id: string;
    user_email: string;
    text: string;
    is_admin_comment: boolean;
    created_at: string;
  }>;
}
```

---

### POST /api/feedback/comments

Add a comment.

**Request Body:**
```typescript
{
  feedbackId: string;                  // Required
  text: string;                        // Required
  isAdminComment?: boolean;
}
```

---

### DELETE /api/feedback/comments

Delete own comment.

**Request Body:**
```typescript
{
  commentId: string;                   // Required
}
```

---

### GET /api/feedback/admin

Get admin panel data (admin only).

**Response (200):**
```typescript
{
  seedAdmin: string;                   // Permanent admin email
  elevatedAdmins: string[];            // Dynamic admin list
  systemPrompts: Array<{
    id: string;
    name: string;
    file: string;
    model: string;
    description: string;
  }>;
}
```

---

### POST /api/feedback/admin

Add an elevated admin.

**Request Body:**
```typescript
{
  email: string;                       // Required
}
```

---

### DELETE /api/feedback/admin

Remove an elevated admin.

**Request Body:**
```typescript
{
  email: string;                       // Required
}
```

---

## Patient Portal

These endpoints are for the patient-facing portal and may not require full authentication.

### GET /api/patient/patients

List patients for portal (uses RPC function).

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| tenant_id | string | Default: 'default' |

**Response (200):**
```typescript
{
  patients: Array<{
    id: string;
    first_name: string;
    last_name: string;
    mrn: string;
    referral_reason: string | null;
  }>;
}
```

---

### POST /api/patient/register

Register a new patient (portal self-registration).

**Request Body:**
```typescript
{
  first_name: string;                  // Required
  last_name: string;                   // Required
  referral_reason?: string;
  tenant_id?: string;                  // Default: 'default'
}
```

**Response (200):**
```typescript
{
  patientId: string;
}
```

---

### GET /api/patient/context

Get patient context for AI historian.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| patient_id | string | Required |

**Response (200):**
```typescript
{
  patientName: string;
  referralReason: string | null;
  lastVisitDate: string | null;
  lastVisitType: string | null;
  lastNoteExcerpt: string | null;      // HPI + Assessment combined
  lastNotePlan: string | null;
  allergies: string | null;
  diagnoses: string | null;            // Active diagnoses with ICD-10
  lastNoteSummary: string | null;
}
```

---

### POST /api/patient/intake

Submit patient intake form.

**Request Body:**
```typescript
{
  patient_name: string;                // Required
  chief_complaint: string;             // Required
  date_of_birth?: string;
  email?: string;
  phone?: string;
  current_medications?: string;
  allergies?: string;
  medical_history?: string;
  family_history?: string;
  notes?: string;
  tenant_id?: string;
}
```

**Response (201):**
```typescript
{
  intake: {
    id: string;
    // ... all submitted fields
    created_at: string;
  };
}
```

---

### GET /api/patient/intake

List intake forms for tenant.

**Response (200):**
```typescript
{
  intakes: Array<object>;              // Max 20, ordered by created_at desc
}
```

---

### POST /api/patient/messages

Send a patient message.

**Request Body:**
```typescript
{
  patient_name: string;                // Required
  body: string;                        // Required - message content
  subject?: string;
  tenant_id?: string;
}
```

---

### GET /api/patient/messages

List messages for tenant.

---

## Admin/Demo

### POST /api/admin/reset-demo

Reset all demo data for a tenant (requires admin secret).

**Headers:**
| Header | Value |
|--------|-------|
| x-admin-secret | Must match ADMIN_RESET_SECRET env var |

**Request Body:**
```typescript
{
  tenant_id: string;                   // Required - tenant to wipe
}
```

**Response (200):**
```typescript
{
  message: 'Demo data reset for tenant "..."';
  results: {
    patient_messages: 'cleared' | 'error: ...' | 'skipped: ...';
    patient_intake_forms: string;
    clinical_notes: string;
    diagnoses: string;
    scale_results: string;
    clinical_scales: string;
    imaging_studies: string;
    dot_phrases: string;
    visits: string;
    patients: string;
  };
}
```

---

### POST /api/demo/reset

Reset demo data for the current user (authenticated).

**Response (200):**
```typescript
{
  message: 'Demo reset successful';
  cleaned: {
    visitsDeleted: number;
    appointmentsReset: boolean;
    futureAppointmentsDeleted: number;
    dynamicPatientsDeleted: number;
  };
}
```

---

### POST /api/demo/seed

Seed demo patients with full clinical histories.

**Request Body:**
```typescript
{
  patients: Array<{
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string;
    mrn?: string;
    phone?: string;
    email?: string;
    address?: string;
    referringPhysician?: string;
    referralReason?: string;
    medications?: Array<{
      medication_name: string;
      generic_name?: string;
      dosage?: string;
      frequency?: string;
      route?: string;
      indication?: string;
      prescriber?: string;
      start_date?: string;
      status?: string;
    }>;
    allergies?: Array<{
      allergen: string;
      allergen_type?: string;
      reaction?: string;
      severity?: string;
    }>;
    priorVisits?: Array<{
      visitDate: string;
      visitType: string;
      chiefComplaint: string[];
      clinicalNote: {
        hpi?: string;
        ros?: string;
        assessment?: string;
        plan?: string;
        ai_summary?: string;
        // ... other note fields
      };
      diagnoses?: Array<{
        icd10_code: string;
        description: string;
        is_primary?: boolean;
      }>;
      imagingStudies?: Array<{
        study_type: string;
        study_date: string;
        description: string;
        findings?: string;
        impression?: string;
      }>;
    }>;
    appointment?: {
      appointmentDate: string;
      appointmentTime: string;
      appointmentType: string;
      hospitalSite?: string;
      reasonForVisit?: string;
      durationMinutes?: number;
      schedulingNotes?: string;
    };
  }>;
}
```

**Response (200):**
```typescript
{
  message: 'Successfully seeded N patients';
  patients: Array<{
    patientName: string;
    patientId: string;
    visitsCreated: number;
    appointmentCreated: boolean;
  }>;
}
```

---

### GET /api/diagnostic

Check database setup and configuration.

**Response (200):**
```typescript
{
  timestamp: string;
  supabaseUrl: string;
  checks: {
    auth: {
      status: 'authenticated' | 'not authenticated';
      userId: string | null;
      error: string | null;
    };
    dot_phrases_table: {
      exists: boolean;
      error: string | null;
    };
    scope_column: {
      exists: boolean;
      error: string | null;
    };
    openai_key: {
      configured: boolean;
      error: string | null;
    };
    appointments_table: {
      exists: boolean;
      rowCount: number;
      error: string | null;
      code: string | null;
    };
  };
  overall: {
    dot_phrases_ready: boolean;
    transcription_ready: boolean;
  };
}
```

---

## Common Error Responses

All endpoints may return these errors:

| Status | Description |
|--------|-------------|
| 400 | Bad Request - Missing required fields or invalid input |
| 401 | Unauthorized - No valid session |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource does not exist |
| 409 | Conflict - Duplicate or constraint violation |
| 500 | Internal Server Error |

**Error Response Format:**
```typescript
{
  error: string;                       // Human-readable error message
  detail?: string;                     // Additional error details
  code?: string;                       // Database error code (if applicable)
}
```

---

## OpenAI Models Reference

| Endpoint | Model | Use Case |
|----------|-------|----------|
| /api/ai/ask | gpt-5-mini | General clinical Q&A |
| /api/ai/chart-prep | gpt-5-mini | Pre-visit summarization |
| /api/ai/field-action | gpt-5-mini | Text transformation |
| /api/ai/transcribe | whisper-1 + gpt-5-mini | Audio transcription |
| /api/ai/visit-ai | whisper-1 + gpt-5.2 | Full visit extraction |
| /api/ai/scale-autofill | gpt-5.2 | Scale data extraction |
| /api/ai/synthesize-note | gpt-5.2 | Note synthesis |
| /api/ai/generate-assessment | gpt-5.2 | Assessment generation |
| /api/ai/note-review | gpt-5-mini | Quality review |
| /api/ai/historian/session | gpt-realtime + whisper-1 | Voice interview |
| /api/visits/[id]/sign | gpt-5-mini | Summary generation |

**Model Pricing (approximate):**
- gpt-5-mini: $0.25/$2 per 1M input/output tokens
- gpt-5.2: $1.25/$10 per 1M input/output tokens
- whisper-1: $0.006 per minute of audio
- gpt-realtime: Varies (WebRTC session-based)
