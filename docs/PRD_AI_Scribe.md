# AI Scribe - Product Requirements Document

**Document Version:** 1.3
**Last Updated:** January 22, 2026
**Status:** Draft
**Author:** Product Team
**Owner:** Product Engineering / Clinical Informatics / Design

---

## Executive Summary

The AI Scribe is an integrated AI-driven system for ambient transcription and clinical note generation from provider-patient conversations. The system must be:

- **Embedded** in the EHR workflow (internal Synapse platform)
- **Secure, compliant, and auditable** across all specialties
- **Modular and customizable** (note styles, structure, preferences per provider)
- **Controlled by the provider** with in-workflow editing and AI prompting
- **Capable of surfacing** clinical insights, coding, orders, and smart recommendations
- **Extensible** for in-clinic, remote, and telemedicine across video/audio interfaces (browser, phone, desktop)

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Overview](#solution-overview)
3. [User Stories](#user-stories)
4. [System Architecture](#system-architecture)
5. [Core Feature Requirements](#core-feature-requirements)
6. [Customization & Templates](#customization--templates)
7. [Settings Dashboard](#settings-dashboard)
8. [In-Workflow AI Editing](#in-workflow-ai-editing)
9. [Transcript Viewer & Traceability](#transcript-viewer--traceability)
10. [Error Flagging & Gap Detection](#error-flagging--gap-detection)
11. [AI Processing Requirements](#ai-processing-requirements)
12. [Integration with Other Features](#integration-with-other-features)
13. [User Interface Requirements](#user-interface-requirements)
14. [Data Flow & Processing](#data-flow--processing)
15. [Privacy & Compliance](#privacy-and-compliance)
16. [Provider Oversight & Approval](#provider-oversight--approval)
17. [Performance Expectations](#performance-expectations)
18. [Analytics & Continuous Improvement](#analytics--continuous-improvement)
19. [Scalability & Specialties](#scalability--specialties)
20. [Phase 2+ Features](#phase-2-features)
21. [Success Metrics](#success-metrics)

---

## Problem Statement

### Current Pain Points

| Pain Point | Impact |
|------------|--------|
| **Documentation time** | Physicians spend 2+ hours/day on documentation after clinic |
| **Cognitive load** | Switching between patient interaction and typing disrupts care |
| **Incomplete capture** | Important details missed when documenting later from memory |
| **Template fatigue** | Click-heavy templates slow down natural documentation flow |
| **Burnout** | Documentation burden is leading cause of physician burnout |

### Target Metrics

| Metric | Current State | Target |
|--------|---------------|--------|
| Documentation time per visit | 15-20 minutes | 5-8 minutes |
| After-hours documentation | 2+ hours/day | <30 minutes/day |
| Note completion at visit end | 40% | 85% |
| Provider satisfaction | Low | High |

---

## Solution Overview

### Core Concept

The AI Scribe listens to the clinical encounter (with appropriate consent), transcribes the conversation in real-time, and uses medical AI to:

1. **Extract** relevant clinical information from natural conversation
2. **Organize** content into appropriate note sections (HPI, ROS, Exam, Assessment, Plan)
3. **Structure** data appropriately (ICD-10 codes, medication details, etc.)
4. **Present** draft documentation for physician review and approval

### Key Differentiators

- **Neurology-specific training** - Understands specialty terminology, scales, and workflows
- **Real-time processing** - Draft available immediately, not after the visit
- **Integrated workflow** - Works within existing Sevaro documentation interface
- **Physician-in-the-loop** - AI assists but physician reviews and approves all content

---

## User Stories

### Primary User Stories

#### US-1: Real-Time Transcription
**As a** neurologist
**I want** my conversation with the patient to be transcribed in real-time
**So that** I can focus on the patient instead of typing

**Acceptance Criteria:**
- Transcription appears within 2 seconds of speech
- Speaker diarization distinguishes physician from patient
- Medical terminology is accurately transcribed
- Transcription can be viewed during or after encounter

#### US-2: Automatic Note Organization
**As a** neurologist
**I want** the AI to organize transcribed content into note sections
**So that** I don't have to copy/paste or retype information

**Acceptance Criteria:**
- Content automatically mapped to: Chief Complaint, HPI, ROS, Exam, Assessment, Plan
- AI identifies which speaker's content goes where (patient symptoms vs physician findings)
- Duplicate/redundant information is consolidated
- Physician can review mapping before accepting

#### US-3: Structured Data Extraction
**As a** neurologist
**I want** the AI to extract structured data from conversation
**So that** I have discrete data elements for quality reporting and decision support

**Acceptance Criteria:**
- Medications mentioned are structured (name, dose, frequency, route)
- Diagnoses are suggested with ICD-10 codes
- Vital signs mentioned are extracted to appropriate fields
- Scale scores discussed are captured (e.g., "MIDAS score is 18")

#### US-4: Draft Review and Approval
**As a** neurologist
**I want** to review and edit AI-generated documentation before finalizing
**So that** I maintain responsibility for clinical accuracy

**Acceptance Criteria:**
- Clear visual distinction between AI-generated and manually entered content
- Inline editing capability for all AI-generated text
- Accept/reject controls for each section
- Audit trail of AI suggestions vs final approved content

#### US-5: Ambient Listening Mode
**As a** neurologist
**I want** the AI to listen throughout the visit without requiring button presses
**So that** my workflow is not interrupted

**Acceptance Criteria:**
- Single "start session" action begins ambient capture
- AI continues listening through natural conversation pauses
- Clear visual indicator shows when AI is listening
- Easy pause/resume controls if needed
- Automatic end-of-visit detection or manual stop

### Secondary User Stories

#### US-6: Conversation Playback
**As a** neurologist
**I want** to replay portions of the recorded conversation
**So that** I can verify accuracy of transcription or recall specific details

#### US-7: Template Suggestions
**As a** neurologist
**I want** the AI to suggest relevant templates or quick phrases based on the conversation
**So that** I can quickly complete standard documentation patterns

#### US-8: Multi-Language Support
**As a** neurologist seeing diverse patients
**I want** the AI to handle conversations in multiple languages
**So that** I can document visits with non-English speaking patients

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLINICAL ENCOUNTER                             │
│                                                                         │
│    ┌──────────┐         ┌──────────┐         ┌──────────┐              │
│    │ Physician │ ←────→ │  Patient  │         │   Audio   │              │
│    └──────────┘         └──────────┘         │  Capture  │              │
│                                              └─────┬─────┘              │
└────────────────────────────────────────────────────┼────────────────────┘
                                                     │
                                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        TRANSCRIPTION LAYER                               │
│                                                                         │
│    ┌─────────────────────────────────────────────────────────────┐     │
│    │                    Speech-to-Text Engine                     │     │
│    │              (Whisper / Azure Speech / Google)               │     │
│    │                                                             │     │
│    │  • Real-time streaming transcription                        │     │
│    │  • Medical vocabulary optimization                          │     │
│    │  • Speaker diarization                                      │     │
│    │  • Noise cancellation                                       │     │
│    └─────────────────────────────────────────────────────────────┘     │
│                                    │                                    │
│                                    ▼                                    │
│                         Raw Transcript + Timestamps                     │
└────────────────────────────────────┼────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      MEDICAL AI PROCESSING LAYER                         │
│                                                                         │
│    ┌─────────────────────────────────────────────────────────────┐     │
│    │              Medical Language Model (LLM)                    │     │
│    │         (ChatGPT Medical / Claude / Med-PaLM / etc.)         │     │
│    │                                                             │     │
│    │  Functions:                                                 │     │
│    │  • Clinical entity extraction                               │     │
│    │  • Note section classification                              │     │
│    │  • Medical terminology normalization                        │     │
│    │  • ICD-10 diagnosis suggestion (for note context)           │     │
│    │  • Content summarization & organization                     │     │
│    │  • Confidence scoring                                       │     │
│    │  Note: CPT/billing codes handled by Earnest RCM integration │     │
│    └─────────────────────────────────────────────────────────────┘     │
│                                    │                                    │
│                                    ▼                                    │
│                    Structured Clinical Content                          │
└────────────────────────────────────┼────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        SEVARO INTEGRATION LAYER                          │
│                                                                         │
│    ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐       │
│    │  Note Field │    │   Review    │    │   Recommendation    │       │
│    │  Population │    │   Interface │    │    Reconciliation   │       │
│    └─────────────┘    └─────────────┘    └─────────────────────┘       │
│                                                                         │
│    Outputs to:                                                          │
│    • HPI text field                                                     │
│    • ROS checkboxes/text                                               │
│    • Physical Exam findings                                            │
│    • Assessment section                                                │
│    • Plan/Recommendations                                              │
│    • ICD-10 diagnosis list                                             │
│    • Medication list                                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Details

#### 1. Audio Capture Layer
| Component | Options | Recommendation |
|-----------|---------|----------------|
| **Microphone** | Device mic, USB mic, array mic | High-quality USB or array mic for best results |
| **Audio Format** | WAV, WebM, Opus | Opus for streaming (low latency, good compression) |
| **Sample Rate** | 16kHz minimum | 16kHz for speech, 44.1kHz if needed |
| **Channels** | Mono or Stereo | Stereo preferred for speaker separation |

#### 2. Transcription Engine
| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **OpenAI Whisper** | Excellent accuracy, medical terms | Batch processing, latency | Good for post-processing |
| **Whisper Streaming** | Real-time capable | Requires infrastructure | Best for real-time |
| **Azure Speech** | HIPAA compliant, real-time | Cost, less accurate than Whisper | Enterprise option |
| **Google Speech** | Real-time, medical model | Cost, data handling | Alternative |
| **Deepgram** | Fast, medical vocabulary | Newer platform | Worth evaluating |

**Recommended Approach:**
- Real-time display: Whisper streaming or Azure Speech
- Final processing: Whisper large-v3 for accuracy

#### 3. Medical AI Processing
| Option | Pros | Cons |
|--------|------|------|
| **OpenAI GPT-4** | Excellent medical knowledge, available now | Cost, data handling |
| **Claude (Anthropic)** | Strong reasoning, safety focus | Similar considerations |
| **Azure OpenAI** | HIPAA BAA available, GPT-4 | Enterprise setup |
| **Med-PaLM 2** | Medical-specific training | Limited availability |
| **Custom fine-tuned** | Specialty-specific | Development effort |

**Recommended Approach:**
- Azure OpenAI with GPT-4 for HIPAA compliance
- Custom prompts tuned for neurology documentation

---

## Functional Requirements

### FR-1: Audio Capture

| Requirement | Priority | Description |
|-------------|----------|-------------|
| FR-1.1 | P0 | Capture audio from device microphone |
| FR-1.2 | P0 | Visual indicator when capture is active |
| FR-1.3 | P1 | Support external USB microphones |
| FR-1.4 | P1 | Noise cancellation / background filtering |
| FR-1.5 | P2 | Support for room microphone arrays |

### FR-2: Transcription

| Requirement | Priority | Description |
|-------------|----------|-------------|
| FR-2.1 | P0 | Real-time speech-to-text transcription |
| FR-2.2 | P0 | Medical terminology accuracy ≥95% |
| FR-2.3 | P0 | Latency ≤3 seconds from speech to display |
| FR-2.4 | P1 | Speaker diarization (physician vs patient) |
| FR-2.5 | P1 | Timestamp alignment with audio |
| FR-2.6 | P2 | Multi-language support (Spanish priority) |

### FR-3: AI Processing

| Requirement | Priority | Description |
|-------------|----------|-------------|
| FR-3.1 | P0 | Extract clinical content from transcript |
| FR-3.2 | P0 | Classify content by note section |
| FR-3.3 | P0 | Generate structured HPI narrative |
| FR-3.4 | P1 | Extract medication mentions with details |
| FR-3.5 | P1 | Suggest ICD-10 diagnosis codes |
| FR-3.6 | P1 | Extract vital signs and exam findings |
| FR-3.7 | P2 | Detect clinical scale scores mentioned |
| FR-3.8 | P2 | Summarize patient-reported symptoms |

### FR-4: Note Population

| Requirement | Priority | Description |
|-------------|----------|-------------|
| FR-4.1 | P0 | Populate HPI field with AI-generated content |
| FR-4.2 | P0 | Populate Assessment field |
| FR-4.3 | P0 | Populate Plan/Recommendations field |
| FR-4.4 | P1 | Populate ROS section |
| FR-4.5 | P1 | Populate Physical Exam section |
| FR-4.6 | P2 | Auto-populate diagnosis dropdown |

### FR-5: Review & Editing

| Requirement | Priority | Description |
|-------------|----------|-------------|
| FR-5.1 | P0 | Display AI-generated content for review |
| FR-5.2 | P0 | Allow inline editing of all content |
| FR-5.3 | P0 | Accept/reject controls per section |
| FR-5.4 | P1 | Confidence indicators on AI content |
| FR-5.5 | P1 | View original transcript alongside |
| FR-5.6 | P2 | Track changes between AI draft and final |

---

## AI Processing Requirements

### Prompt Engineering Specifications

The Medical AI layer requires carefully designed prompts for accurate clinical extraction.

#### Section Classification Prompt

```
SYSTEM: You are a clinical documentation assistant for neurology.
Analyze the following transcript excerpt and classify it into the
appropriate clinical note section.

Sections:
- CHIEF_COMPLAINT: Primary reason for visit
- HPI: History of present illness, symptom details, timeline
- ROS: Review of systems (systematic symptom inquiry)
- PMH: Past medical history
- MEDICATIONS: Current medications, changes, adherence
- ALLERGIES: Allergies and reactions
- SOCIAL_HISTORY: Social and lifestyle factors
- FAMILY_HISTORY: Family medical history
- PHYSICAL_EXAM: Examination findings (physician observations)
- ASSESSMENT: Clinical impression, diagnoses
- PLAN: Treatment plan, recommendations, follow-up
- OTHER: Administrative, small talk, not clinically relevant

Return JSON with: section, confidence (0-1), relevant_text
```

#### HPI Generation Prompt

```
SYSTEM: You are a neurology clinical documentation specialist.
Generate a professional HPI paragraph from the patient's reported
symptoms in this transcript.

Requirements:
- Use third-person medical narrative style
- Include: onset, location, duration, character, severity,
  timing, context, modifying factors, associated symptoms
- Use appropriate medical terminology
- Be concise but complete
- Note relevant negatives
- Do not include exam findings or assessment

Patient transcript: {transcript}
Previous notes context: {context}
```

#### Entity Extraction Prompt

```
SYSTEM: Extract structured clinical entities from this transcript.

Extract:
1. Medications: name, dose, frequency, route, changes
2. Diagnoses: condition, ICD-10 suggestion, status (active/resolved)
3. Vital signs: type, value, unit
4. Scale scores: scale name, score, interpretation
5. Symptoms: symptom, severity, duration, frequency
6. Allergies: allergen, reaction type

Return structured JSON for each entity type.
```

### Confidence Scoring

| Confidence Level | Threshold | UI Treatment |
|------------------|-----------|--------------|
| High | ≥0.85 | Green indicator, auto-populated |
| Medium | 0.60-0.84 | Yellow indicator, requires review |
| Low | <0.60 | Red indicator, manual entry suggested |

### Accuracy Targets

| Content Type | Target Accuracy | Measurement |
|--------------|-----------------|-------------|
| Transcription (general) | ≥92% | Word Error Rate (WER) |
| Medical terms | ≥95% | Medical WER |
| Section classification | ≥90% | F1 score |
| Medication extraction | ≥95% | Precision/Recall |
| Diagnosis suggestion | ≥85% | Top-3 accuracy |

---

## Integration with Other Features

### Recommendation Reconciliation

When AI Scribe generates recommendations AND the provider uses Smart Recommendations (e.g., Vera Health plan builder), the system must reconcile these sources.

#### Reconciliation Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    RECOMMENDATION SOURCES                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │   AI Scribe     │    │     Smart       │    │   Manual    │ │
│  │   Extracted     │    │ Recommendations │    │   Entry     │ │
│  │                 │    │  (Vera Health)  │    │             │ │
│  │ "Continue       │    │ "Continue       │    │ "Schedule   │ │
│  │  topiramate     │    │  topiramate     │    │  MRI brain" │ │
│  │  100mg BID"     │    │  50mg BID,      │    │             │ │
│  │                 │    │  increase to    │    │             │ │
│  │ "MRI brain      │    │  100mg BID"     │    │             │ │
│  │  to rule out    │    │                 │    │             │ │
│  │  secondary"     │    │ "Order MRI      │    │             │ │
│  │                 │    │  brain w/wo     │    │             │ │
│  └────────┬────────┘    │  contrast"      │    └──────┬──────┘ │
│           │             └────────┬────────┘           │        │
│           │                      │                    │        │
│           └──────────────────────┼────────────────────┘        │
│                                  │                             │
│                                  ▼                             │
│           ┌─────────────────────────────────────────┐          │
│           │      RECONCILIATION ENGINE              │          │
│           │                                         │          │
│           │  1. Detect duplicates (semantic match)  │          │
│           │  2. Identify conflicts                  │          │
│           │  3. Merge complementary items           │          │
│           │  4. Flag for physician review           │          │
│           └─────────────────────────────────────────┘          │
│                                  │                             │
│                                  ▼                             │
│           ┌─────────────────────────────────────────┐          │
│           │      UNIFIED RECOMMENDATION LIST        │          │
│           │                                         │          │
│           │  1. Continue topiramate 100mg BID       │          │
│           │     [Scribe + Smart Rec - MERGED]       │          │
│           │                                         │          │
│           │  2. Order MRI brain w/wo contrast       │          │
│           │     [Scribe + Manual - MERGED]          │          │
│           │                                         │          │
│           └─────────────────────────────────────────┘          │
│                                  │                             │
│                                  ▼                             │
│           ┌─────────────────────────────────────────┐          │
│           │         PHYSICIAN REVIEW                │          │
│           │                                         │          │
│           │  ☑ Accept  ☐ Edit  ☐ Remove            │          │
│           │                                         │          │
│           │  [Finalize Recommendations]             │          │
│           └─────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

#### Reconciliation Rules

| Scenario | Rule | Example |
|----------|------|---------|
| **Exact duplicate** | Keep one, note source | Two "Continue metformin 500mg BID" |
| **Semantic duplicate** | Merge, prefer more specific | "MRI brain" + "MRI brain w/wo contrast" → Keep detailed |
| **Conflicting dose** | Flag for review | "Topiramate 50mg" vs "Topiramate 100mg" |
| **Complementary** | Keep both | "Continue topiramate" + "Check BMP in 2 weeks" |
| **Source priority** | Smart Rec > Scribe > Manual (configurable) | When auto-resolving conflicts |

#### Integration Points

| Feature | Integration |
|---------|-------------|
| **Vera Health Plan Builder** | Receive structured recommendations via API |
| **Quick Phrases** | Scribe detects when phrase would apply, suggests |
| **Clinical Scales** | Auto-detect scale scores from conversation |
| **Drug Interaction Alerts** | Check extracted medications against alert system |
| **ICD-10 Suggestions** | Feed Scribe diagnoses to diagnosis dropdown |

### Vera Health Integration

Vera Health provides AI-powered Clinical Decision Support with evidence-based answers from 60M+ peer-reviewed papers and guidelines. Sevaro integrates with Vera Health via their API.

#### Vera Health Capabilities

| Capability | Description |
|------------|-------------|
| **Evidence-based answers** | Real-time search of medical literature with citations |
| **Guideline summaries** | AAN, AHA, specialty guidelines summarized on demand |
| **Plan builder** | Diagnosis-specific treatment recommendations |
| **Source citations** | Every recommendation linked to peer-reviewed source |
| **HIPAA compliant** | Safe for clinical use with PHI context |
| **CME credits** | +0.5 CME credits per clinical query |

#### Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEVARO ←→ VERA HEALTH                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SEVARO SENDS TO VERA:                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • Patient context (demographics, diagnoses, meds)        │   │
│  │ • Clinical question or query                             │   │
│  │ • Diagnosis for plan builder                             │   │
│  │ • Guideline request (e.g., "AAN migraine prophylaxis")   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────┐                          │
│                    │  VERA HEALTH    │                          │
│                    │  API            │                          │
│                    │  (ZeroEntropy)  │                          │
│                    └─────────────────┘                          │
│                              │                                  │
│                              ▼                                  │
│  VERA RETURNS TO SEVARO:                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • Evidence-based recommendations                         │   │
│  │ • Source citations (journal, year, DOI)                  │   │
│  │ • Confidence/evidence grade                              │   │
│  │ • Structured plan items                                  │   │
│  │ • CME credit tracking data                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### API Integration Specifications

| Endpoint | Purpose | Data Sent | Data Received |
|----------|---------|-----------|---------------|
| `/query` | Clinical questions | Question + patient context | Answer + citations |
| `/plan` | Treatment plans | Diagnosis codes, patient factors | Structured recommendations |
| `/guidelines` | Guideline lookup | Condition, topic | Summary + source links |
| `/search` | Literature search | Search terms | Relevant papers ranked |

#### Data Sent to Vera Health

```json
{
  "query_type": "plan_builder",
  "patient_context": {
    "age": 50,
    "sex": "male",
    "diagnoses": ["G43.909"],
    "current_medications": ["topiramate 50mg BID"],
    "allergies": ["sulfa"],
    "relevant_history": "chronic migraine, failed 2 preventives"
  },
  "clinical_question": "What are recommended next steps for migraine prophylaxis?",
  "specialty": "neurology"
}
```

#### Data Received from Vera Health

```json
{
  "recommendations": [
    {
      "id": "rec_001",
      "text": "Consider CGRP inhibitor (erenumab, fremanezumab, galcanezumab)",
      "evidence_grade": "A",
      "citations": [
        {
          "source": "Neurology 2021;96(3):e364-e390",
          "title": "AAN Guideline: Acute and Preventive Treatment of Migraine",
          "doi": "10.1212/WNL.0000000000011050"
        }
      ],
      "rationale": "Patient has failed 2+ oral preventives; CGRP inhibitors recommended as next line per AAN guidelines"
    },
    {
      "id": "rec_002",
      "text": "Continue topiramate if tolerated; may increase to 100mg BID",
      "evidence_grade": "B",
      "citations": [...]
    }
  ],
  "cme_credit": 0.5,
  "query_id": "vera_123456"
}
```

#### Use Cases

| Use Case | Trigger | Vera API Call |
|----------|---------|---------------|
| **AI Researcher** | Provider clicks "Ask AI" | `/query` with clinical question |
| **Plan Builder** | Provider opens plan builder for diagnosis | `/plan` with diagnosis + context |
| **Guideline Check** | "What do guidelines say about X?" | `/guidelines` with topic |
| **Evidence Lookup** | Provider wants source for recommendation | `/search` with recommendation text |
| **Smart Recommendations** | Auto-triggered after diagnosis entered | `/plan` with diagnosis |

---

## User Interface Requirements

### UI-1: Scribe Activation

**Location:** Top navigation bar or floating action button

**States:**
- **Inactive:** Microphone icon (gray)
- **Ready:** Microphone icon (teal), "Start Scribe" tooltip
- **Listening:** Animated waveform, "AI Listening" indicator, pulsing border
- **Processing:** Spinner, "Processing..." text
- **Paused:** Pause icon, "Paused" indicator
- **Error:** Red icon, error message

**Mockup:**
```
┌────────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🎙️ AI Scribe Active                    ⏸️ Pause  ⏹️ Stop │  │
│  │  ▁▃▅▇▅▃▁▃▅▇▅▃▁  Listening... (2:34)                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### UI-2: Live Transcript Panel

**Location:** Slide-out drawer or collapsible panel

**Features:**
- Real-time transcript display
- Speaker labels (Dr. / Patient)
- Timestamp markers
- Highlight current speech
- Scroll lock / auto-scroll toggle

**Mockup:**
```
┌─────────────────────────────────────────┐
│  Live Transcript            ▼ Collapse  │
├─────────────────────────────────────────┤
│  [0:00] Dr: "Good morning, how are     │
│  your headaches doing?"                 │
│                                         │
│  [0:05] Patient: "They're a bit better │
│  actually. I'm down to maybe three or  │
│  four a week instead of daily."        │
│                                         │
│  [0:12] Dr: "That's good improvement.  │
│  Any side effects from the topiramate?" │
│                                         │
│  [0:18] Patient: "Some tingling in my  │
│  fingers, but it's not too bad."       │
│                                         │
│  ▌ (listening...)                       │
└─────────────────────────────────────────┘
```

### UI-3: AI Draft Review Interface

**Location:** Overlay or side panel after scribe session ends

**Features:**
- Section-by-section review
- Confidence indicators
- Edit in place
- Accept/Reject buttons
- View source transcript
- Comparison with any existing content

**Mockup:**
```
┌─────────────────────────────────────────────────────────────────┐
│  AI Scribe Draft Review                              ✕ Close   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ HPI                                    🟢 High Confidence │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 50-year-old male presents for follow-up of chronic      │   │
│  │ migraines. Patient reports improvement in headache      │   │
│  │ frequency from daily to 3-4 per week since starting     │   │
│  │ topiramate. He notes mild paresthesias in fingers       │   │
│  │ but tolerating medication well overall. Denies nausea,  │   │
│  │ photophobia, or aura with recent headaches.            │   │
│  │                                                         │   │
│  │ [View Transcript]                    [✓ Accept] [✎ Edit] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Assessment                           🟡 Review Suggested │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 1. Chronic migraine without aura (G43.709) - improving  │   │
│  │    on current regimen                                   │   │
│  │ 2. Paresthesias - likely topiramate side effect         │   │
│  │                                                         │   │
│  │ [View Transcript]                    [✓ Accept] [✎ Edit] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Plan                                  🟡 Review Suggested │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 1. Continue topiramate 50mg BID - increase to 100mg BID │   │
│  │    if headaches remain frequent                         │   │
│  │ 2. Return in 3 months for follow-up                     │   │
│  │ 3. Patient to keep headache diary                       │   │
│  │                                                         │   │
│  │ ⚠️ Conflict detected with Smart Recommendations         │   │
│  │ [Reconcile Now]                                         │   │
│  │                                                         │   │
│  │ [View Transcript]                    [✓ Accept] [✎ Edit] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│         [Accept All & Populate Note]    [Discard Draft]        │
└─────────────────────────────────────────────────────────────────┘
```

### UI-4: Confidence Indicators

| Level | Visual | Usage |
|-------|--------|-------|
| High (≥85%) | 🟢 Green badge | "High Confidence" - safe to auto-accept |
| Medium (60-84%) | 🟡 Yellow badge | "Review Suggested" - recommend physician review |
| Low (<60%) | 🔴 Red badge | "Low Confidence" - manual entry recommended |

---

## Data Flow & Processing

### Real-Time Processing Pipeline

```
Audio Input (streaming)
    │
    ▼
┌─────────────────────────────┐
│ Chunking (100-500ms chunks) │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Speech-to-Text (streaming)  │
│ - Whisper / Azure Speech    │
│ - Returns partial results   │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Real-time display update    │
│ (show partial transcript)   │
└─────────────────────────────┘
    │
    │  (accumulate sentences)
    ▼
┌─────────────────────────────┐
│ AI Processing (batch)       │
│ - Every 30-60 seconds       │
│ - Or at natural pauses      │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Section classification      │
│ Entity extraction           │
│ Draft generation            │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Update draft preview        │
│ (show evolving note draft)  │
└─────────────────────────────┘
```

### Post-Visit Processing

```
Full transcript (complete)
    │
    ▼
┌─────────────────────────────┐
│ Final Whisper pass          │
│ (large model, best quality) │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Complete AI processing      │
│ - Full context available    │
│ - Better section mapping    │
│ - Reconcile with real-time  │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Generate final draft        │
│ Compare to real-time draft  │
│ Highlight any differences   │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Present for review          │
└─────────────────────────────┘
```

---

## Privacy and Compliance

### HIPAA Considerations

| Requirement | Implementation |
|-------------|----------------|
| **Data encryption** | TLS 1.3 in transit, AES-256 at rest |
| **Access controls** | Role-based access, audit logging |
| **BAA requirements** | Azure OpenAI has BAA; ensure all vendors covered |
| **Minimum necessary** | Only process/store clinically relevant content |
| **Patient consent** | Obtain consent for AI-assisted documentation |
| **Data retention** | Audio deleted after processing; transcript retained per policy |

### Consent Workflow

1. **Pre-visit notification:** Patient informed AI scribe may be used
2. **Start of visit:** Verbal consent obtained, documented
3. **Visual indicator:** Patient-visible indicator when AI is active
4. **Opt-out option:** Easy way to disable for specific patients/visits

### Audit Trail

| Event | Logged Data |
|-------|-------------|
| Scribe session start | Timestamp, user ID, patient ID, encounter ID |
| Scribe session end | Duration, audio length |
| AI processing | Model used, processing time |
| Draft generated | Section content hashes, confidence scores |
| Physician edits | Before/after content, edit type |
| Final approval | Timestamp, approving user |

---

## Quality and Accuracy

### Quality Assurance Process

1. **Regular accuracy audits:** Monthly review of sample transcripts
2. **Physician feedback:** In-app feedback mechanism
3. **Error categorization:** Track common error types
4. **Continuous improvement:** Update prompts based on feedback

### Error Handling

| Error Type | Handling |
|------------|----------|
| Audio quality issue | Alert user, suggest mic adjustment |
| Transcription failure | Fall back to manual entry, retry option |
| AI processing timeout | Show partial results, complete in background |
| Low confidence content | Flag clearly, require manual review |
| Speaker confusion | Allow manual speaker correction |

### Metrics & Monitoring

| Metric | Target | Measurement |
|--------|--------|-------------|
| Transcription WER | <8% | Automated comparison to corrected |
| Medical term accuracy | >95% | Manual audit sample |
| Section classification accuracy | >90% | Comparison to physician-corrected |
| Physician acceptance rate | >75% | Track accept vs edit rate |
| Time savings per visit | >50% | Pre/post implementation study |
| User satisfaction | >4.0/5.0 | In-app surveys |

---

## Customization & Templates

### Customizable Note Output

Providers can customize how AI-generated notes are formatted and structured.

#### Note Style Options

| Style | Description | Use Case |
|-------|-------------|----------|
| **Brief** | Concise, essential information only | High-volume clinics |
| **Detailed** | Comprehensive documentation | Complex cases, litigation risk |
| **Bullet** | Bulleted format throughout | Quick scanning |
| **Narrative** | Traditional paragraph style | Standard documentation |
| **SOAP** | Structured SOAP format | Problem-oriented documentation |

#### Template Configuration

```
Template Definition {
  id: "neuro-headache-fu"
  name: "Neurology Headache Follow-up"
  specialty: "neurology"
  visit_type: "follow_up"

  sections: {
    hpi: {
      style: "narrative"
      include: ["symptom_update", "medication_response", "side_effects"]
      required_elements: ["headache_frequency", "severity_change"]
    }
    assessment: {
      style: "numbered"
      include_icd10: true
    }
    plan: {
      style: "bullet"
      include_follow_up: true
    }
  }

  language_preferences: {
    use_abbreviations: true  // "HTN" vs "Hypertension"
    terminology_level: "standard"  // standard | patient-friendly | academic
  }
}
```

#### Per-Provider Customization

| Setting | Options | Default |
|---------|---------|---------|
| **Default note style** | Brief, Detailed, Bullet, Narrative, SOAP | Narrative |
| **Abbreviation preference** | Use standard abbreviations / Spell out | Abbreviations |
| **Pronoun style** | He/She, They, Patient | He/She |
| **Section ordering** | Customizable order | Standard |
| **Auto-include negatives** | Yes / No | Yes |

---

## Settings Dashboard

### Modular Settings System

A centralized settings dashboard allowing providers to configure their AI Scribe preferences.

#### Settings Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    SETTINGS HIERARCHY                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              SYSTEM DEFAULTS                         │   │
│  │         (Organization-wide settings)                 │   │
│  │  • Compliance requirements                           │   │
│  │  • Required disclaimers                              │   │
│  │  • Audit settings                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              SPECIALTY DEFAULTS                      │   │
│  │         (Neurology, Psychiatry, etc.)                │   │
│  │  • Default templates                                 │   │
│  │  • Common phrases                                    │   │
│  │  • Terminology preferences                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              PROVIDER PREFERENCES                    │   │
│  │         (Individual clinician settings)              │   │
│  │  • Personal templates                                │   │
│  │  • Note style preferences                            │   │
│  │  • Quick phrases                                     │   │
│  │  • UI preferences                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Settings Categories

| Category | Settings |
|----------|----------|
| **General** | Default note style, language, timezone |
| **Templates** | Manage custom templates, import/export |
| **Privacy** | Consent workflows, recording indicators |
| **Audio** | Microphone selection, noise cancellation |
| **AI Behavior** | Confidence thresholds, auto-population rules |
| **Notifications** | Alerts, reminders, error notifications |

### Settings UI Mockup

```
┌─────────────────────────────────────────────────────────────┐
│  Settings                                           ✕ Close │
├────────────────┬────────────────────────────────────────────┤
│                │                                            │
│  ▸ General     │  General Template Settings                 │
│  ▾ Templates   │  ────────────────────────────────────────  │
│    └─ Neuro    │                                            │
│  ▸ Privacy     │  Default Note Style    [Narrative     ▼]   │
│  ▸ Audio       │                                            │
│  ▸ AI Behavior │  Section Settings                          │
│  ▸ Notifications│  ────────────────────────────────────────  │
│                │                                            │
│                │  HPI Section                               │
│                │  ├─ Style:        [Narrative  ▼]           │
│                │  ├─ Auto-include negatives: [✓]            │
│                │  └─ Required elements: [Configure]         │
│                │                                            │
│                │  Assessment Section                        │
│                │  ├─ Style:        [Numbered   ▼]           │
│                │  └─ Include ICD-10: [✓]                    │
│                │                                            │
│                │  Plan Section                              │
│                │  ├─ Style:        [Bullet     ▼]           │
│                │  └─ Auto-follow-up: [✓]                    │
│                │                                            │
│                │            [Reset to Defaults] [Save]      │
└────────────────┴────────────────────────────────────────────┘
```

---

## In-Workflow AI Editing

### AI-Powered Text Actions

When text is selected or cursor is in a field, a toolbar appears with AI editing options.

#### Available Actions

| Action | Description | Example |
|--------|-------------|---------|
| **Ask AI** | Get information or suggestions | "What's the typical dose for topiramate?" |
| **Improve** | Enhance clarity and completeness | Makes text more concise or detailed |
| **Summarize** | Condense selected text | Long HPI → key bullet points |
| **Expand** | Add more detail | Brief note → comprehensive narrative |
| **Dictate** | Voice-to-text for selected field | Free-form dictation |
| **Complete** | AI completes partial text | "Patient reports..." → full sentence |
| **Rewrite** | Transform text style | "Make this more concise" |

#### Structured Edits

| Edit Type | Command | Result |
|-----------|---------|--------|
| **Gender change** | "Change gender to female" | Updates all pronouns |
| **Terminology** | "Use abbreviations" | HTN, DM, etc. |
| **Format** | "Convert to bullets" | Restructures as list |
| **Tone** | "Make patient-friendly" | Simplifies language |

#### Editing Toolbar UI

```
┌─────────────────────────────────────────────────────────────┐
│  ▌Selected text: "Patient reports headaches have improved"  │
├─────────────────────────────────────────────────────────────┤
│  [🔮 Ask AI] [✨ Improve] [📝 Summarize] [➕ Expand] [🎤 Dictate] │
│                                                             │
│  Quick actions: [More concise] [Add details] [Patient-friendly] │
└─────────────────────────────────────────────────────────────┘
```

### Provider Control

- Provider must be able to set tone/voice/detail level
- Control summary style preferences
- All AI edits require explicit acceptance
- Undo available for all AI modifications

---

## Transcript Viewer & Traceability

### Full Transcript Viewer

View the complete transcript alongside the generated note for verification.

#### Features

| Feature | Description |
|---------|-------------|
| **Side-by-side view** | Transcript and note visible together |
| **Section highlighting** | Click note section → highlights source transcript |
| **Timestamp sync** | Navigate by time markers |
| **Speaker labels** | Clear Dr. / Patient identification |
| **Search** | Find specific terms in transcript |

#### Traceability Linkage

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  ┌────────────────────────┐    ┌────────────────────────────────────────┐ │
│  │     TRANSCRIPT         │    │            GENERATED NOTE              │ │
│  ├────────────────────────┤    ├────────────────────────────────────────┤ │
│  │                        │    │                                        │ │
│  │ [0:05] Patient: "The   │◄──►│ HPI:                                   │ │
│  │ headaches are better,  │    │ Patient reports improvement in         │ │
│  │ maybe 3-4 a week now   │    │ headache frequency from daily to       │ │
│  │ instead of daily."     │    │ 3-4 episodes per week. [📎 0:05]       │ │
│  │                        │    │                                        │ │
│  │ [0:18] Patient: "Some  │◄──►│ Side effects: Mild paresthesias        │ │
│  │ tingling in my fingers │    │ in fingers, well-tolerated.            │ │
│  │ but it's not too bad." │    │ [📎 0:18]                              │ │
│  │                        │    │                                        │ │
│  └────────────────────────┘    └────────────────────────────────────────┘ │
│                                                                           │
│  [▶ Play from 0:05]  [Sync to transcript]  [Show all sources]             │
└───────────────────────────────────────────────────────────────────────────┘
```

#### Sync Options

- **Live sync:** Transcript scrolls as audio plays
- **Note-to-transcript:** Click note section to jump to source
- **Transcript-to-note:** Click transcript to see where it was used
- **Missing content:** Highlight transcript portions not included

---

## Error Flagging & Gap Detection

### AI-Driven Documentation Alerts

The system proactively identifies missing or incomplete documentation.

#### Alert Types

| Alert Type | Example | Severity |
|------------|---------|----------|
| **Missing required element** | "Headache duration not documented" | High |
| **Incomplete section** | "ROS incomplete - only 3 systems reviewed" | Medium |
| **Conflicting information** | "Duration stated as both 2 weeks and 1 month" | High |
| **Missing follow-up** | "No follow-up plan documented" | Medium |
| **Coding gap** | "Diagnosis mentioned but no ICD-10 selected" | Low |

#### Gap Detection Rules

```
Gap Detection {
  hpi_requirements: {
    headache: ["onset", "location", "duration", "severity", "frequency"]
    seizure: ["semiology", "duration", "frequency", "last_occurrence", "triggers"]
  }

  alerts: [
    {
      condition: "headache mentioned AND duration missing"
      message: "Headache duration not recorded"
      severity: "high"
      suggestion: "Ask: 'How long do your headaches typically last?'"
    }
  ]
}
```

#### Alert UI

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ Documentation Alerts (3)                        [Dismiss All] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔴 HIGH: Headache duration not documented                  │
│     Suggestion: Add duration to HPI                         │
│     [Add Now] [Dismiss] [Not Applicable]                    │
│                                                             │
│  🟡 MEDIUM: Follow-up interval not specified                │
│     Suggestion: Specify return visit timing                 │
│     [Add Now] [Dismiss]                                     │
│                                                             │
│  🟢 LOW: Consider adding MIDAS score                        │
│     Suggestion: Headache patient without disability score   │
│     [Add Scale] [Dismiss]                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Differentiation

The system clearly differentiates:
- **Required elements** (must address before signing)
- **Suggested improvements** (optional but recommended)
- **Informational** (FYI only)

---

## Provider Oversight & Approval

### Draft-Only Model

**All AI-generated content is ALWAYS a draft** until explicitly approved by the provider.

#### Approval Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    APPROVAL WORKFLOW                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. AI GENERATES DRAFT                                      │
│     ├─ All content marked as "AI-Generated"                 │
│     ├─ Confidence scores displayed                          │
│     └─ Source transcript linked                             │
│                        ▼                                    │
│  2. PROVIDER REVIEWS                                        │
│     ├─ Section-by-section review                            │
│     ├─ Inline editing enabled                               │
│     └─ Accept/Reject per section                            │
│                        ▼                                    │
│  3. PROVIDER EDITS (optional)                               │
│     ├─ All edits logged                                     │
│     ├─ Before/after captured                                │
│     └─ Edit reason optionally recorded                      │
│                        ▼                                    │
│  4. PROVIDER APPROVES                                       │
│     ├─ Explicit approval action required                    │
│     ├─ Timestamp and user recorded                          │
│     └─ Note status changes to "Approved"                    │
│                        ▼                                    │
│  5. NOTE FINALIZED                                          │
│     └─ Locked for editing (standard amendment process)      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Audit Trail

| Event | Captured Data |
|-------|---------------|
| Draft generated | Timestamp, AI model, confidence scores |
| Section reviewed | Timestamp, section, reviewer |
| Edit made | Before text, after text, editor, timestamp |
| Approval | Timestamp, approver, final content hash |

#### Change Tracking

```
┌─────────────────────────────────────────────────────────────┐
│  Edit History - HPI Section                         [Close] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Version 1 (AI Generated) - 2:34 PM                         │
│  ─────────────────────────────────────────────────────────  │
│  Patient reports headaches have improved from daily to      │
│  approximately 3-4 per week.                                │
│                                                             │
│  Version 2 (Dr. Smith edited) - 2:36 PM                     │
│  ─────────────────────────────────────────────────────────  │
│  Patient reports significant improvement in headache        │
│  frequency, now occurring 3-4 times weekly compared to      │
│  daily episodes previously. [+added detail]                 │
│                                                             │
│  ✓ Approved by Dr. Smith - 2:38 PM                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Performance Expectations

### Latency Requirements

| Operation | Target | Maximum |
|-----------|--------|---------|
| **Transcription display** | <2 seconds | 5 seconds |
| **Full note generation** | <2 minutes | 3 minutes |
| **AI edit response** | <3 seconds | 5 seconds |
| **Section classification** | Real-time | 2 seconds |

### Accuracy Requirements

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **Transcription WER** | <5% | <8% |
| **Medical term accuracy** | >97% | >95% |
| **Speaker diarization** | >95% | >90% |
| **Section classification** | >92% | >88% |

### Availability

| Metric | Target |
|--------|--------|
| **Uptime** | 99.9% |
| **Scheduled maintenance** | <4 hours/month, off-peak |
| **Degraded mode** | Manual transcription fallback available |

---

## Analytics & Continuous Improvement

### Tracked Metrics

#### Usage Metrics

| Metric | Description |
|--------|-------------|
| **Sessions per provider** | Daily/weekly AI Scribe usage |
| **Time saved per visit** | Comparison to baseline documentation time |
| **Acceptance rate** | % of AI content accepted without edit |
| **Edit frequency** | How often providers modify AI output |
| **Section usage** | Which sections use AI most/least |

#### Quality Metrics

| Metric | Description |
|--------|-------------|
| **Revision score** | Before/after comparison of AI vs final |
| **Common corrections** | Most frequently edited content types |
| **Gap detection hits** | How often alerts are addressed |
| **Provider feedback** | Explicit ratings and comments |

### Admin Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  AI Scribe Analytics Dashboard                    [Export]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Overview (Last 30 Days)                                    │
│  ───────────────────────────────────────────────────────    │
│  Total Sessions: 1,247    Avg Time Saved: 8.3 min/visit     │
│  Acceptance Rate: 78%     Provider Satisfaction: 4.2/5      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [Chart: Time Saved Trend]                          │   │
│  │   12 ┤                    ╭───╮                      │   │
│  │   10 ┤              ╭─────╯   ╰──╮                   │   │
│  │    8 ┤         ╭────╯            ╰──────             │   │
│  │    6 ┤    ╭────╯                                     │   │
│  │      └────────────────────────────────────────────   │   │
│  │        Week 1   Week 2   Week 3   Week 4             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Adoption by Service Line                                   │
│  ───────────────────────────────────────────────────────    │
│  Neurology:  ████████████████████░░░░  82%                  │
│  Psychiatry: ██████████████░░░░░░░░░░  58%                  │
│  Internal:   ████████░░░░░░░░░░░░░░░░  34%                  │
│                                                             │
│  Common Edit Patterns                                       │
│  ───────────────────────────────────────────────────────    │
│  1. Adding medication details (23%)                         │
│  2. Clarifying timeline (18%)                               │
│  3. Adding negatives (15%)                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Continuous Improvement Loop

1. **Collect** - Gather edit patterns and feedback
2. **Analyze** - Identify common corrections
3. **Improve** - Update prompts and models
4. **Deploy** - Release improvements
5. **Measure** - Track impact on metrics
6. **Repeat**

---

## Scalability & Specialties

### Specialty-Specific Instances

Each specialty has its own AI configuration:

| Specialty | Template Set | Terminology | Scales |
|-----------|--------------|-------------|--------|
| **Neurology** | Neuro templates | Neuro abbreviations | MIDAS, NIHSS, etc. |
| **Psychiatry** | Psych templates | DSM terminology | PHQ-9, GAD-7, etc. |
| **Internal Medicine** | General templates | Standard medical | Various |
| **Pain Management** | Pain templates | Pain terminology | Pain scales |

### Supported Visit Types

| Visit Type | Support Level |
|------------|---------------|
| **In-clinic** | Full support |
| **Telehealth (video)** | Full support |
| **Phone visits** | Full support |
| **Intake/screening** | Full support |
| **90-minute evaluations** | Full support |

### Multi-Language Support (Phase 3)

| Language | Phase | Notes |
|----------|-------|-------|
| English | Phase 1 | Primary |
| Spanish | Phase 3 | High priority |
| Mandarin | Phase 3 | Based on demand |

---

## Phase 2+ Features

### Phase 2: Workflow Automation

| Feature | Description |
|---------|-------------|
| **Task creation** | "Check labs in 2 weeks" → auto-creates task |
| **After-visit summary** | Auto-generate patient-facing summary |
| **Referral generation** | Create referral from visit discussion |
| **Fax/letter generation** | Generate correspondence from note |

### Earnest RCM Integration (Coding & Billing)

**Sevaro does NOT perform internal coding or billing suggestions.** All coding and billing recommendations are handled by **[Earnest RCM](https://www.earnestrcm.com/)**, our revenue cycle management partner.

#### Earnest RCM Overview

Earnest RCM is an AI-powered revenue cycle management platform that provides:

| Capability | Description |
|------------|-------------|
| **Claims Coding** | AI-powered ICD-10 and CPT code suggestions from clinical notes |
| **Code Auditing** | Maximizes first-pass rates by learning payer rules |
| **Eligibility Verification** | AI-automated payer calls and portal integrations |
| **Prior Authorization** | AI references payer criteria and cites clinical notes |
| **AR Follow-up** | Auto-schedule and power-dial follow-ups to payers |

#### Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEVARO → EARNEST RCM → LOCAL EHR             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SEVARO SUBMITS:                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • Finalized clinical note (after provider approval)      │   │
│  │ • Patient demographics                                   │   │
│  │ • Visit type and date of service                         │   │
│  │ • Provider information                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────┐                          │
│                    │   EARNEST RCM   │                          │
│                    │   AI Engine     │                          │
│                    └─────────────────┘                          │
│                              │                                  │
│                              ▼                                  │
│  EARNEST RCM RETURNS:                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • Suggested ICD-10 codes with supporting documentation   │   │
│  │ • Suggested CPT/E&M codes                                │   │
│  │ • HCC capture opportunities                              │   │
│  │ • Coding confidence scores                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  CODES POPULATED TO LOCAL EHR:                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • Diagnosis codes added to encounter                     │   │
│  │ • Billing codes added for health system billing          │   │
│  │ • Sevaro does NOT submit claims                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Workflow

1. **Provider completes and approves note** in Sevaro
2. **Note submitted to Earnest RCM** automatically or on demand
3. **Earnest RCM reviews** and returns code suggestions
4. **Codes added to local EHR** - ICD-10 and CPT codes populated
5. **Health system handles billing** - Sevaro does not submit claims

#### Security & Compliance

- HIPAA compliant with BAA
- SOC 2 certified
- No data retention by Earnest RCM beyond processing
- Full encryption of data in transit and at rest

#### Key Benefits

| Benefit | Impact |
|---------|--------|
| **First-pass rate optimization** | Reduces claim denials |
| **Payer rule learning** | Adapts to changing payer requirements |
| **No internal coding burden** | Offloads coding to specialists |
| **Faster reimbursement** | Accelerates revenue cycle |

### Phase 3: Guideline Integration

| Feature | Description |
|---------|-------------|
| **Guideline summaries** | "Summarize AAN migraine guidelines" |
| **Evidence citations** | Insert relevant citations |
| **Clinical decision support** | Alert when guidelines suggest different approach |

---

## Success Metrics

### Primary Success Metrics

| Metric | Baseline | 6-Month Target |
|--------|----------|----------------|
| **Burnout score** | Current | -30% improvement |
| **Chart closure same-day** | ~60% | >90% |
| **Documentation time per visit** | 15-20 min | <8 min |
| **After-hours charting** | 2+ hours/day | <30 min/day |

### Secondary Success Metrics

| Metric | Target |
|--------|--------|
| **Provider NPS** | >8 |
| **Patient satisfaction** | No negative impact |
| **Coding completeness** | P1 capture of all documented diagnoses |
| **Note draft completion** | 100% within 48 hours |

### Measurement Approach

1. **Baseline measurement** - 30 days before launch
2. **Weekly tracking** - During rollout
3. **Monthly reporting** - Ongoing
4. **Quarterly review** - Deep-dive analysis

---

## Implementation Notes

### Technical Approach

| Component | Approach |
|-----------|----------|
| **Input method** | Chrome plugin preferred; desktop/mobile fallback |
| **Browser support** | Chrome primary; Safari, Firefox secondary |
| **Platform integration** | Zoom, video, internal triage platforms |
| **AI Models** | Off-the-shelf (GPT-4); fine-tuning vs custom TBD |
| **Frameworks** | Open frameworks only (Whisper, AWS/Azure) |
| **No proprietary SDK** | Avoid vendor lock-in |

### Deployment Phases

| Phase | Scope | Timeline |
|-------|-------|----------|
| **Phase 1a** | Chart Prep with dictation | Initial release |
| **Phase 1b** | Visit AI (ambient recording) | +1-2 months |
| **Phase 2** | Add specialties, workflow automation | +3-6 months |
| **Phase 3** | Multi-language, guideline integration | +6-12 months |

---

## Detailed Implementation Phases

### Phase 1a: Chart Prep (Pre-Visit) - CURRENT

**Purpose:** Enable providers to prepare for visits by reviewing records and dictating observations before seeing the patient.

#### Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CHART PREP WORKFLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. PROVIDER OPENS CHART PREP                                   │
│     └─ AI Drawer → Chart Prep tab                               │
│                        ▼                                        │
│  2. REVIEW RECORDS                                              │
│     ├─ Referral notes                                           │
│     ├─ Imaging studies                                          │
│     ├─ Lab results                                              │
│     └─ Prior visit summaries                                    │
│                        ▼                                        │
│  3. DICTATE OBSERVATIONS                                        │
│     ├─ Click "Record Note" button                               │
│     ├─ Speak observations (any length)                          │
│     ├─ Click "Stop" when done                                   │
│     ├─ Audio sent to Whisper for transcription                  │
│     └─ AI auto-categorizes by content:                          │
│        • Imaging (MRI, CT, EEG, etc.)                           │
│        • Labs (blood, glucose, etc.)                            │
│        • Referral (consult, specialist, etc.)                   │
│        • History (PMH, surgical, family, etc.)                  │
│        • Assessment (impression, diagnosis, etc.)               │
│        • General (fallback)                                     │
│                        ▼                                        │
│  4. GENERATE AI SUMMARY                                         │
│     ├─ Click "Generate AI Summary"                              │
│     ├─ AI analyzes patient context + prep notes                 │
│     └─ Returns structured sections:                             │
│        • Key Considerations (highlighted)                       │
│        • Patient Summary                                        │
│        • Suggested HPI                                          │
│        • Relevant History                                       │
│        • Current Medications                                    │
│        • Imaging Findings                                       │
│        • Clinical Scale Trends                                  │
│        • Suggested Assessment                                   │
│        • Suggested Plan                                         │
│                        ▼                                        │
│  5. INSERT INTO NOTE                                            │
│     ├─ "Add All to Note" → Populates HPI, Assessment, Plan      │
│     └─ Or insert individual sections                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Technical Components

| Component | Implementation | Status |
|-----------|----------------|--------|
| **Voice Recording** | Browser MediaRecorder API, 250ms chunks | Complete |
| **Transcription** | OpenAI Whisper via `/api/ai/transcribe` | Complete |
| **Auto-categorization** | Keyword detection in transcribed text | Complete |
| **AI Summary** | GPT-4 via `/api/ai/chart-prep` | Complete |
| **Note Population** | `updateNote()` function in ClinicalNote | Complete |
| **Prep Notes Storage** | React state (session only) | Complete |
| **Prep Notes Persistence** | Database storage | Not started |

#### UI Elements

- **Chart Prep Tab** in AI Drawer
- **Dictation Section** with Record/Stop button, timer, transcription preview
- **Your Notes** section showing categorized prep notes
- **Generate AI Summary** button
- **Key Points** yellow highlight box
- **Collapsible Sections** for detailed AI content
- **Add All to Note** button

#### Files

- `/src/components/AiDrawer.tsx` - Chart Prep UI
- `/src/app/api/ai/chart-prep/route.ts` - AI summary generation
- `/src/hooks/useVoiceRecorder.ts` - Voice recording hook
- `/src/app/api/ai/transcribe/route.ts` - Whisper transcription

---

### Phase 1b: Visit AI (During Visit) - PLANNED

**Purpose:** Record provider-patient conversation during the visit and combine with Chart Prep notes to generate comprehensive documentation.

#### Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    VISIT AI WORKFLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. START VISIT RECORDING                                       │
│     ├─ Provider clicks "Start Visit Recording"                  │
│     ├─ Consent indicator shown                                  │
│     └─ Ambient capture begins                                   │
│                        ▼                                        │
│  2. CONDUCT VISIT                                               │
│     ├─ Normal provider-patient conversation                     │
│     ├─ Real-time transcription (optional display)               │
│     └─ Recording continues (5-30+ minutes)                      │
│                        ▼                                        │
│  3. END RECORDING                                               │
│     ├─ Provider clicks "End Recording"                          │
│     └─ Full audio sent for processing                           │
│                        ▼                                        │
│  4. AI PROCESSING                                               │
│     ├─ Whisper transcribes full conversation                    │
│     ├─ GPT-4 extracts clinical content                          │
│     ├─ Combines with Chart Prep notes                           │
│     └─ Generates draft note sections                            │
│                        ▼                                        │
│  5. REVIEW & APPROVE                                            │
│     ├─ Provider reviews AI-generated draft                      │
│     ├─ Edit/accept each section                                 │
│     └─ Finalize documentation                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Technical Requirements

| Requirement | Description | Priority |
|-------------|-------------|----------|
| **Long Recording** | Support 30+ minute recordings | P0 |
| **Speaker Diarization** | Distinguish provider from patient | P1 |
| **Real-time Display** | Show transcript as conversation happens | P1 |
| **Section Classification** | Auto-map content to HPI/ROS/Exam/Plan | P0 |
| **Prep Note Integration** | Merge Chart Prep with visit content | P0 |
| **Audio Storage** | Store audio for playback/verification | P2 |

#### Planned UI

- **Visit Recording Tab** in AI Drawer (or separate modal)
- **Start/Stop Recording** controls
- **Live Transcript** panel (optional)
- **Recording Duration** display
- **Draft Review** interface with Accept/Edit/Reject per section

---

### Phase 1 Feature Comparison

| Feature | Phase 1a (Chart Prep) | Phase 1b (Visit AI) |
|---------|----------------------|---------------------|
| **Recording Duration** | Short (10-60 seconds) | Long (5-30+ minutes) |
| **Content Source** | Provider observations only | Provider + Patient conversation |
| **Transcription** | Post-recording only | Real-time + post-processing |
| **Speaker ID** | Single speaker | Multi-speaker diarization |
| **Auto-categorization** | Keyword-based | AI section classification |
| **Note Population** | Manual insert | Auto-populate with review |

---

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Priority 1 focus | Documentation quality |
| Priority 2 focus | Clinical guidance |
| Consent flagging | Settings at EHR layer (TBD) |
| External EHR integration | Synapse only (no external) |
| Login requirements | No separate login (embedded in Synapse) |
| Coding support | Earnest RCM handles (external integration) |
| Template management | Tied to specialty instances (Synapse AI for X) |

---

## Appendix

### Glossary

| Term | Definition |
|------|------------|
| **WER** | Word Error Rate - transcription accuracy metric |
| **Diarization** | Identifying different speakers in audio |
| **Ambient capture** | Continuous listening without button presses |
| **Section classification** | Mapping content to note sections |
| **Entity extraction** | Identifying structured data from text |

### Related Documents

- PRD: Neurology Clinical Scales
- PRD: AI Researcher
- PRD: AI Summarizer
- PRD: Dot Phrases / Auto Text
- Sevaro MVP PRD v1.3

### External Partners

| Partner | Function | Reference |
|---------|----------|-----------|
| **Vera Health** | Clinical decision support, evidence-based recommendations | [verahealth.ai](https://www.verahealth.ai/) |
| **Earnest RCM** | Coding, billing, revenue cycle management | [earnestrcm.com](https://www.earnestrcm.com/) |

### References

1. OpenAI Whisper: https://openai.com/research/whisper
2. Azure Speech Services: https://azure.microsoft.com/en-us/services/cognitive-services/speech-services/
3. GPT-4 Medical Benchmarks: https://openai.com/research/gpt-4
4. HIPAA Security Rule: https://www.hhs.gov/hipaa/for-professionals/security/

---

## Changelog

**v1.3 (January 22, 2026)**
- Added Detailed Implementation Phases section
- Documented Phase 1a: Chart Prep workflow (current implementation)
- Documented Phase 1b: Visit AI workflow (planned)
- Added technical components, UI elements, and file references
- Added Phase 1 feature comparison table
- Updated deployment phases to reflect Chart Prep first approach

**v1.2 (January 20, 2026)**
- Added Earnest RCM integration for coding & billing
- Clarified that Sevaro does NOT do internal coding/billing
- Updated architecture to reflect external coding workflow

**v1.1 (January 20, 2026)**
- Expanded based on Ambient AI Feature Scope document
- Added Customization & Templates section
- Added Settings Dashboard specifications
- Added In-Workflow AI Editing with toolbar actions
- Added Transcript Viewer & Traceability features
- Added Error Flagging & Gap Detection
- Added Provider Oversight & Approval workflow
- Added Performance Expectations
- Added Analytics & Continuous Improvement dashboard
- Added Scalability & Specialties section
- Expanded Phase 2+ Features (workflow automation)
- Added comprehensive Success Metrics
- Added Implementation Notes and technical approach

**v1.0 (January 20, 2026)**
- Initial document creation
- Core architecture and requirements
- Recommendation reconciliation workflow
- UI/UX specifications
- Privacy and compliance section

---

*Document maintained by Sevaro Product Team*
