# Patient Education & Handout Generator - Product Requirements Document

**Document Version:** 1.0
**Last Updated:** January 20, 2026
**Status:** Draft
**Author:** Product Team

---

## Executive Summary

The Patient Education & Handout Generator is an AI-powered feature that creates personalized, condition-specific educational materials for patients. The system leverages Vera Health's medical knowledge base (or alternative LLMs) to generate accurate, readable handouts that reinforce visit discussions and improve patient understanding.

---

## Problem Statement

### Current Pain Points

| Pain Point | Impact |
|------------|--------|
| **Generic handouts** | Pre-printed materials don't address patient's specific situation |
| **Outdated information** | Static PDFs become stale as guidelines change |
| **Reading level mismatch** | Medical language too complex for many patients |
| **Time to find/print** | Searching for appropriate handouts takes clinic time |
| **No personalization** | Can't include patient's specific medications, instructions |

### Provider Needs

- "I want to give them something specific to their migraine type"
- "The handout should match what we discussed today"
- "Make it simple enough for them to understand"
- "Include their actual medications and dosages"

---

## Solution Overview

AI-generated patient education materials that are:

```
┌─────────────────────────────────────────────────────────────────┐
│               PATIENT EDUCATION GENERATOR                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📋 PERSONALIZED       Include patient's actual diagnoses,      │
│                        medications, and visit-specific info     │
│                                                                 │
│  📖 READABLE           Appropriate reading level (6th-8th       │
│                        grade default, adjustable)               │
│                                                                 │
│  ✅ EVIDENCE-BASED     Powered by Vera Health or validated      │
│                        medical content sources                  │
│                                                                 │
│  🌐 MULTILINGUAL       Spanish, other languages available       │
│                                                                 │
│  🖨️ PRINT-READY        Formatted for easy printing or           │
│                        digital delivery (patient portal/email)  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Feature Specifications

### 1. Handout Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Condition Overview** | General information about a diagnosis | New diagnosis education |
| **Medication Guide** | How to take medication, side effects, warnings | New prescription |
| **Procedure Prep** | Pre/post procedure instructions | EMG, LP, Botox, etc. |
| **Lifestyle Guidance** | Diet, exercise, sleep, trigger avoidance | Migraine, epilepsy management |
| **Red Flag Warnings** | When to seek emergency care | Stroke symptoms, seizure safety |
| **Follow-up Instructions** | What to expect, when to return | Post-visit summary |
| **Clinical Trial Info** | Study-specific patient information | Research recruitment |

### 2. Generation Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    HANDOUT GENERATION FLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. TRIGGER                                                     │
│     ├─ Provider clicks "Generate Handout" in AI Tools           │
│     ├─ Auto-suggested based on diagnosis entered                │
│     └─ Template selected from library                           │
│                        │                                        │
│                        ▼                                        │
│  2. CONTEXT GATHERING                                           │
│     ├─ Patient demographics (age, reading level preference)     │
│     ├─ Diagnoses from current visit                             │
│     ├─ Medications prescribed                                   │
│     ├─ Specific instructions from plan                          │
│     └─ Language preference                                      │
│                        │                                        │
│                        ▼                                        │
│  3. AI GENERATION                                               │
│     ┌─────────────────────────────────────────────────────┐     │
│     │  Primary: Vera Health API                            │     │
│     │  Fallback: GPT-4 / Claude with medical prompts       │     │
│     │                                                      │     │
│     │  • Retrieves evidence-based content                  │     │
│     │  • Personalizes with patient context                 │     │
│     │  • Adjusts reading level                             │     │
│     │  • Formats for output                                │     │
│     └─────────────────────────────────────────────────────┘     │
│                        │                                        │
│                        ▼                                        │
│  4. PROVIDER REVIEW                                             │
│     ├─ Preview handout before delivery                          │
│     ├─ Edit/customize as needed                                 │
│     └─ Approve for patient                                      │
│                        │                                        │
│                        ▼                                        │
│  5. DELIVERY                                                    │
│     ├─ Print in clinic                                          │
│     ├─ Send to patient portal                                   │
│     ├─ Email to patient                                         │
│     └─ Save to chart                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3. User Interface

#### Handout Generator Panel

```
┌─────────────────────────────────────────────────────────────────┐
│  Patient Education Generator                            ✕ Close │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  HANDOUT TYPE                                                   │
│  [Condition Overview     ▼]                                     │
│                                                                 │
│  TOPIC                                                          │
│  [🔍 Search or select condition...]                             │
│                                                                 │
│  📌 SUGGESTED (based on visit):                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ☐ Chronic Migraine                                       │   │
│  │ ☐ Topiramate (new medication)                            │   │
│  │ ☐ Headache Diary Instructions                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  READING LEVEL                                                  │
│  ○ Simple (5th grade)                                           │
│  ● Standard (8th grade)                                         │
│  ○ Detailed (College level)                                     │
│                                                                 │
│  LANGUAGE                                                       │
│  [English              ▼]                                       │
│                                                                 │
│  INCLUDE                                                        │
│  [✓] Patient's medications                                      │
│  [✓] Follow-up instructions from visit                          │
│  [✓] Provider contact information                               │
│  [ ] Clinical trial information                                 │
│                                                                 │
│                              [Cancel]  [Generate Handout]       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Handout Preview/Edit

```
┌─────────────────────────────────────────────────────────────────┐
│  Handout Preview                                [Edit] [Print]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │  UNDERSTANDING YOUR CHRONIC MIGRAINE                    │   │
│  │  ═══════════════════════════════════════════════════    │   │
│  │                                                         │   │
│  │  Prepared for: Test Test                                │   │
│  │  Date: January 20, 2026                                 │   │
│  │                                                         │   │
│  │  WHAT IS CHRONIC MIGRAINE?                              │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Chronic migraine means having headaches on 15 or       │   │
│  │  more days per month, with at least 8 of those being    │   │
│  │  migraines. This is different from occasional           │   │
│  │  migraines that happen less often.                      │   │
│  │                                                         │   │
│  │  YOUR TREATMENT PLAN                                    │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Your provider has prescribed:                          │   │
│  │                                                         │   │
│  │  • Topiramate 50mg                                      │   │
│  │    Take one tablet twice daily (morning and evening)    │   │
│  │    with or without food.                                │   │
│  │                                                         │   │
│  │  WHAT TO EXPECT                                         │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  • It may take 4-8 weeks to see full benefit            │   │
│  │  • Common side effects: tingling in hands/feet,         │   │
│  │    difficulty finding words, decreased appetite         │   │
│  │  • Stay well hydrated to reduce kidney stone risk       │   │
│  │                                                         │   │
│  │  ⚠️ WHEN TO CALL US                                     │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Contact our office if you experience:                  │   │
│  │  • Severe side effects                                  │   │
│  │  • Headaches getting worse                              │   │
│  │  • Vision changes                                       │   │
│  │  • Confusion or memory problems                         │   │
│  │                                                         │   │
│  │  YOUR NEXT APPOINTMENT                                  │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Return in 3 months for follow-up                       │   │
│  │  Continue keeping your headache diary                   │   │
│  │                                                         │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Sevaro Neurology | (555) 123-4567                      │   │
│  │  This information is personalized for you and should    │   │
│  │  not be shared with others.                             │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  🟢 Evidence-based content via Vera Health                      │
│                                                                 │
│  [Send to Portal]  [Email to Patient]  [Print]  [Save to Chart] │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Content Sources

### Primary: Vera Health Integration

Vera Health provides evidence-based medical content with:
- 60M+ peer-reviewed papers
- Current clinical guidelines
- Patient-appropriate language generation
- Citation tracking

**API Usage:**

```json
{
  "request_type": "patient_education",
  "condition": "G43.709",
  "patient_context": {
    "age": 50,
    "reading_level": "standard",
    "language": "en",
    "medications": ["topiramate 50mg BID"],
    "specific_instructions": ["keep headache diary", "return in 3 months"]
  },
  "content_sections": ["overview", "treatment", "expectations", "warnings", "followup"],
  "output_format": "markdown"
}
```

### Fallback: Alternative LLMs

When Vera Health is unavailable or for supplemental content:

| LLM | Use Case | Considerations |
|-----|----------|----------------|
| **GPT-4** | General education content | Requires medical prompt engineering |
| **Claude** | Patient-friendly explanations | Good at appropriate reading levels |
| **Med-PaLM** | Medical accuracy priority | Limited availability |

**Fallback Prompt Template:**

```
You are a patient education specialist. Generate a patient handout about
[CONDITION] for a [AGE]-year-old patient.

Requirements:
- Reading level: [LEVEL] (use simple, clear language)
- Include: what the condition is, treatment plan, what to expect, warning signs
- Personalize with: [MEDICATIONS], [INSTRUCTIONS]
- Tone: Reassuring but informative
- Length: 1-2 pages when printed

Do NOT include:
- Medical jargon without explanation
- Frightening statistics
- Information that contradicts the provider's plan
```

---

## Handout Templates Library

### Neurology-Specific Templates

| Category | Templates |
|----------|-----------|
| **Headache** | Migraine Overview, Tension Headache, Cluster Headache, Medication Overuse, Botox for Migraine |
| **Epilepsy** | Seizure Safety, AED Guide, Driving Restrictions, Seizure First Aid (for family), Pregnancy & Epilepsy |
| **Movement** | Parkinson's Basics, Tremor Overview, DBS Patient Guide, Exercise for PD |
| **MS** | MS Overview, DMT Guide, Managing Fatigue, Relapse Recognition |
| **Stroke** | Stroke Prevention, TIA Warning Signs, Post-Stroke Recovery, FAST Signs (wallet card) |
| **Cognitive** | Memory Concerns, Dementia Caregiver Guide, Brain Health Tips |
| **Sleep** | Sleep Hygiene, OSA and CPAP, Restless Legs |
| **Procedures** | EMG/NCS Prep, Lumbar Puncture, EEG Instructions, MRI Preparation |

### Template Structure

```
Template: migraine_overview
─────────────────────────────────────────

Sections:
  1. What is [Condition]?
     - Simple definition
     - How common it is
     - Reassurance

  2. Your Diagnosis
     - [PERSONALIZED: specific type]
     - What this means for you

  3. Treatment Plan
     - [PERSONALIZED: medications]
     - How they work
     - What to expect

  4. Lifestyle Tips
     - Trigger avoidance
     - Sleep, diet, exercise
     - Stress management

  5. Warning Signs
     - When to call the office
     - When to go to ER
     - [CONDITION-SPECIFIC red flags]

  6. Resources
     - Patient organizations
     - Reliable websites
     - Support groups

  7. Your Follow-up
     - [PERSONALIZED: next appointment]
     - [PERSONALIZED: instructions]

Footer:
  - Practice contact info
  - Date generated
  - Personalization notice
```

---

## Reading Level Adjustment

### Flesch-Kincaid Targets

| Level | Grade | Flesch Score | Example |
|-------|-------|--------------|---------|
| **Simple** | 5th-6th | 80-90 | "Take your medicine two times a day." |
| **Standard** | 7th-8th | 60-70 | "Take your medication twice daily with meals." |
| **Detailed** | 10th-12th | 50-60 | "Administer the medication twice daily, preferably with food to minimize gastrointestinal side effects." |

### Simplification Rules

| Complex | Simplified |
|---------|------------|
| "prophylactic medication" | "medicine to prevent headaches" |
| "titrate the dose" | "slowly increase the amount" |
| "contraindicated" | "should not be used" |
| "paresthesias" | "tingling or numbness" |
| "photophobia" | "sensitivity to light" |

---

## Multilingual Support

### Phase 1 Languages

| Language | Status | Notes |
|----------|--------|-------|
| **English** | MVP | Default |
| **Spanish** | MVP | High demand in US |
| **Simplified Chinese** | Phase 2 | Growing need |
| **Vietnamese** | Phase 2 | Regional demand |

### Translation Approach

1. **AI Translation** - Vera Health or GPT-4 generates in target language
2. **Medical Terminology Validation** - Ensure accuracy of medical terms
3. **Cultural Adaptation** - Adjust examples and references as needed
4. **Human Review** - Flag for review if confidence low

---

## Delivery Options

| Method | Description | When to Use |
|--------|-------------|-------------|
| **Print** | Generate PDF, print in clinic | Immediate handoff, patients without tech |
| **Patient Portal** | Post to patient's portal account | Standard delivery, creates record |
| **Email** | Send directly to patient email | Quick delivery, patient preference |
| **Text/SMS** | Send link to view handout | Younger patients, quick access |
| **Save to Chart** | Store in patient record | Documentation, future reference |

### Print Formatting

- Letter size (8.5" x 11")
- Readable font (14pt minimum for body)
- High contrast (black on white)
- Practice logo/header
- Page numbers if multi-page
- "Personalized for [Patient Name]" notice

---

## Integration Points

### With AI Scribe

- Scribe detects education opportunities during visit
- Suggests relevant handouts based on conversation
- Auto-populates instructions from plan

### With AI Researcher (Vera Health)

- Same knowledge base powers both features
- Evidence citations available if patient requests
- CME credit tracking for provider

### With Dot Phrases

- Providers can create custom handout snippets
- Quick phrases can trigger handout generation
- `.edu-migraine` → generates migraine handout

---

## Provider Controls

### Customization Options

```
┌─────────────────────────────────────────────────────────────────┐
│  Handout Settings                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  DEFAULT READING LEVEL                                          │
│  [Standard (8th grade)    ▼]                                    │
│                                                                 │
│  DEFAULT LANGUAGE                                               │
│  [English                 ▼]                                    │
│                                                                 │
│  AUTO-SUGGEST HANDOUTS                                          │
│  [✓] Suggest based on new diagnoses                             │
│  [✓] Suggest based on new medications                           │
│  [ ] Suggest for every visit                                    │
│                                                                 │
│  PRACTICE BRANDING                                              │
│  Logo: [Upload]                                                 │
│  Practice Name: [Sevaro Neurology          ]                    │
│  Phone: [(555) 123-4567                    ]                    │
│  Website: [www.sevaroneurology.com         ]                    │
│                                                                 │
│  FOOTER TEXT                                                    │
│  [This information is personalized for you...]                  │
│                                                                 │
│  DELIVERY PREFERENCES                                           │
│  [✓] Always save to chart                                       │
│  [ ] Default to patient portal                                  │
│  [ ] Offer print option                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Content Approval

- All AI-generated content shown in preview first
- Provider can edit before delivery
- Option to flag content for review
- Audit trail of generated handouts

---

## Quality Assurance

### Content Validation

| Check | Method |
|-------|--------|
| **Medical accuracy** | Vera Health evidence-based; LLM content reviewed |
| **Reading level** | Automated Flesch-Kincaid scoring |
| **Personalization accuracy** | Verify patient data correctly inserted |
| **Completeness** | All required sections present |
| **Formatting** | Print preview before delivery |

### Provider Feedback Loop

- Thumbs up/down on generated content
- Common edits tracked to improve templates
- Flag inaccurate content for review

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Handouts generated per provider/week | >10 |
| Provider satisfaction | >4.2/5.0 |
| Patient portal view rate | >60% |
| Reading level compliance | >95% at target level |
| Generation time | <10 seconds |

---

## Privacy & Compliance

- Handouts contain PHI (patient name, medications)
- Must be delivered through secure channels
- Audit log of all generated handouts
- Patient can request copies through portal
- Retention per organization policy

---

## Future Enhancements

### Phase 2

- Video content generation (animated explainers)
- Interactive handouts (quizzes, checklists)
- Family/caregiver versions
- Condition-specific apps integration

### Phase 3

- Voice-narrated handouts (accessibility)
- AR/VR educational experiences
- Integration with wearables (medication reminders)

---

## Changelog

**v1.0 (January 20, 2026)**
- Initial document creation
- Core generation workflow
- Vera Health + LLM fallback architecture
- Template library structure
- Reading level adjustment specs
- Multilingual support framework

---

*Document maintained by Sevaro Product Team*
