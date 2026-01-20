# Dot Phrases / Auto Text - Product Requirements Document

**Document Version:** 1.0
**Last Updated:** January 20, 2026
**Status:** Draft
**Author:** Product Team

---

## Executive Summary

Dot Phrases (also known as Auto Text, Smart Text, or Quick Phrases) is a text expansion feature that allows providers to insert pre-defined text snippets into clinical notes using short abbreviations. This feature dramatically reduces documentation time by enabling one-click or shortcut-triggered insertion of commonly used phrases, templates, and structured content.

---

## Problem Statement

### Current Documentation Pain Points

| Pain Point | Impact |
|------------|--------|
| **Repetitive Typing** | Same phrases typed hundreds of times per week |
| **Inconsistent Documentation** | Variation in language, completeness |
| **Time Waste** | Minutes lost per note on standard content |
| **Cognitive Load** | Remembering exact wording for common statements |
| **Copy-Paste Errors** | Wrong patient info carried over from templates |

### Provider Needs

- "I type the same normal neuro exam 50 times a week"
- "I need my standard migraine follow-up plan template"
- "Let me quickly insert my normal ROS"
- "I want to customize my own shortcuts"

---

## Solution Overview

Dot Phrases provides a text expansion system with:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DOT PHRASES SYSTEM                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TRIGGER                          EXPANSION                     │
│  ───────                          ─────────                     │
│  .wnl         →    "Within normal limits"                       │
│                                                                 │
│  .neuroexam   →    "Mental status: Alert and oriented x3,      │
│                     appropriate affect. Cranial nerves II-XII   │
│                     intact. Motor: 5/5 strength throughout..."  │
│                                                                 │
│  .migraine    →    "Assessment: Chronic migraine without aura   │
│                     Plan:                                       │
│                     1. Continue [medication] [dose]             │
│                     2. Lifestyle modifications discussed..."    │
│                                                                 │
│  .deny        →    "Patient denies fever, chills, weight       │
│                     loss, night sweats, fatigue..."             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## MVP Feature Specifications

### 1. Phrase Library

**What:** Centralized repository of text snippets organized by category

**Categories:**

| Category | Examples |
|----------|----------|
| **Physical Exam** | Normal neuro exam, abnormal findings, specific tests |
| **Review of Systems** | Normal ROS, focused ROS, denials by system |
| **HPI Templates** | Headache HPI, seizure HPI, weakness HPI |
| **Assessment/Plan** | Diagnosis-specific templates, follow-up plans |
| **Patient Education** | Instructions, warnings, lifestyle advice |
| **Procedures** | Consent language, procedure notes |
| **General** | Greetings, closings, common statements |

**Library Structure:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Dot Phrases Library                          [+ New Phrase]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🔍 Search phrases...                                           │
│                                                                 │
│  MY PHRASES (15)                                          [▼]   │
│  ├── .myneuro      Custom neurological exam                     │
│  ├── .mymigraine   My migraine plan template                    │
│  └── .mysig        My signature block                           │
│                                                                 │
│  PHYSICAL EXAM (24)                                       [▼]   │
│  ├── .neuroexam    Complete normal neurological exam            │
│  ├── .neuroabn     Neurological exam with findings              │
│  ├── .mental       Mental status examination                    │
│  ├── .cranial      Cranial nerve examination                    │
│  ├── .motor        Motor examination                            │
│  ├── .sensory      Sensory examination                          │
│  ├── .reflex       Reflex examination                           │
│  ├── .cerebellar   Cerebellar examination                       │
│  └── .gait         Gait and station                             │
│                                                                 │
│  REVIEW OF SYSTEMS (12)                                   [▼]   │
│  ├── .rosnl        Normal review of systems (all negative)      │
│  ├── .rosneuro     Neurological ROS                             │
│  ├── .roshead      Headache-focused ROS                         │
│  └── .deny         Standard denial statement                    │
│                                                                 │
│  HPI TEMPLATES (18)                                       [▼]   │
│  ├── .hpiha        Headache HPI template                        │
│  ├── .hpiseiz      Seizure HPI template                         │
│  ├── .hpiweak      Weakness HPI template                        │
│  └── .hpidizzy     Dizziness HPI template                       │
│                                                                 │
│  ASSESSMENT/PLAN (32)                                     [▼]   │
│  ├── .migraine     Chronic migraine plan                        │
│  ├── .tension      Tension headache plan                        │
│  ├── .epilepsy     Epilepsy follow-up plan                      │
│  └── .parkinson    Parkinson's disease plan                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Phrase Triggers

**Trigger Methods:**

| Method | How It Works | Example |
|--------|--------------|---------|
| **Dot Prefix** | Type period + abbreviation | `.neuroexam` |
| **Quick Phrases Menu** | Click ⚡ icon on text field | Select from dropdown |
| **Keyboard Shortcut** | `Cmd/Ctrl + .` | Opens phrase search |
| **Slash Command** | Type `/` + phrase name | `/neuroexam` |

**Trigger Behavior:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRIGGER FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Provider types in text field:                               │
│     "The patient's examination was .neuroexam"                  │
│                              ▲                                  │
│                              │                                  │
│  2. System detects dot phrase trigger                           │
│                              │                                  │
│                              ▼                                  │
│  3. OPTION A: Auto-expand (if exact match)                      │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ "The patient's examination was Alert and oriented    │     │
│     │ x3, appropriate affect. Cranial nerves II-XII       │     │
│     │ intact. Motor: 5/5 strength throughout. Sensory:    │     │
│     │ Intact to light touch. Reflexes: 2+ and symmetric.  │     │
│     │ Coordination: Normal finger-to-nose, heel-to-shin.  │     │
│     │ Gait: Normal, tandem intact."                       │     │
│     └─────────────────────────────────────────────────────┘     │
│                                                                 │
│     OPTION B: Show dropdown (if multiple matches)               │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ .neuro...                                            │     │
│     │ ┌─────────────────────────────────────────────────┐ │     │
│     │ │ .neuroexam    Complete normal neurological exam │ │     │
│     │ │ .neuroabn     Neurological exam with findings   │ │     │
│     │ │ .neurofocal   Focal neurological exam           │ │     │
│     │ └─────────────────────────────────────────────────┘ │     │
│     └─────────────────────────────────────────────────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Quick Phrases Menu

**What:** Context-aware dropdown accessible from every text field

**UI:**

```
┌─────────────────────────────────────────────────────────────────┐
│  HPI                                                   [🎤] [⚡] │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Patient presents with...                                    ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│     ┌────────────────────────────────────────────┐              │
│     │ ⚡ Quick Phrases                            │              │
│     ├────────────────────────────────────────────┤              │
│     │ 📌 RECENT                                  │              │
│     │   .hpiha     Headache HPI template         │              │
│     │   .deny      Standard denial               │              │
│     ├────────────────────────────────────────────┤              │
│     │ 📁 HPI TEMPLATES                           │              │
│     │   .hpiha     Headache HPI                  │              │
│     │   .hpiseiz   Seizure HPI                   │              │
│     │   .hpiweak   Weakness HPI                  │              │
│     │   .hpidizzy  Dizziness HPI                 │              │
│     ├────────────────────────────────────────────┤              │
│     │ 🔍 Search all phrases...                   │              │
│     │ [Manage Phrases]                           │              │
│     └────────────────────────────────────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Context Awareness:**

| Field | Suggested Phrases |
|-------|-------------------|
| HPI field | HPI templates, symptom descriptions |
| ROS field | ROS templates, denial statements |
| Physical Exam | Exam templates by system |
| Assessment | Diagnosis templates |
| Plan | Plan templates, patient instructions |

### 4. Phrase Editor

**What:** Interface for creating and editing phrases

**UI:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Edit Dot Phrase                                        [Save]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ABBREVIATION (trigger)                                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ .neuroexam                                                  ││
│  └─────────────────────────────────────────────────────────────┘│
│  ⚠️ Must start with period, no spaces, 3-20 characters         │
│                                                                 │
│  TITLE (description)                                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Complete Normal Neurological Examination                    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  CATEGORY                                                       │
│  [Physical Exam                    ▼]                           │
│                                                                 │
│  PHRASE CONTENT                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Mental Status: Alert and oriented to person, place, time,  ││
│  │ and situation. Appropriate affect. Speech fluent without   ││
│  │ dysarthria.                                                 ││
│  │                                                             ││
│  │ Cranial Nerves: II-XII intact. Pupils equal, round,        ││
│  │ reactive to light. Visual fields full. Extraocular         ││
│  │ movements intact without nystagmus. Facial sensation and   ││
│  │ strength symmetric. Hearing intact. Palate elevates        ││
│  │ symmetrically. Tongue midline.                             ││
│  │                                                             ││
│  │ Motor: 5/5 strength in all extremities. Normal bulk and    ││
│  │ tone. No pronator drift.                                   ││
│  │                                                             ││
│  │ Sensory: Intact to light touch throughout.                 ││
│  │                                                             ││
│  │ Reflexes: 2+ and symmetric in biceps, triceps, patellar,   ││
│  │ and Achilles. Toes downgoing bilaterally.                  ││
│  │                                                             ││
│  │ Coordination: Normal finger-to-nose and heel-to-shin.      ││
│  │ No dysdiadochokinesia.                                     ││
│  │                                                             ││
│  │ Gait: Normal gait and station. Tandem walk intact.         ││
│  │ Romberg negative.                                          ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  OPTIONS                                                        │
│  [✓] Show in Quick Phrases menu                                 │
│  [ ] Require confirmation before insert                         │
│                                                                 │
│                                    [Delete]  [Cancel]  [Save]   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5. Phrase Ownership Levels

**Hierarchy:**

| Level | Description | Editable By |
|-------|-------------|-------------|
| **System** | Pre-built phrases from Sevaro | Administrators only |
| **Organization** | Shared across practice/institution | Practice admins |
| **Specialty** | Neurology-specific templates | Department leads |
| **Provider** | Personal custom phrases | Individual provider |

**Conflict Resolution:**
- Provider phrases override specialty phrases
- Specialty phrases override organization phrases
- If same abbreviation exists at multiple levels, show disambiguation dropdown

---

## Pre-Built Phrase Library

### Physical Examination

#### Complete Neurological Exam (.neuroexam)

```
Mental Status: Alert and oriented to person, place, time, and situation.
Appropriate affect. Speech fluent without dysarthria.

Cranial Nerves: II-XII intact. Pupils equal, round, reactive to light.
Visual fields full to confrontation. Extraocular movements intact without
nystagmus. Facial sensation and strength symmetric. Hearing intact bilaterally.
Palate elevates symmetrically. Sternocleidomastoid and trapezius strength 5/5.
Tongue midline without fasciculations.

Motor: 5/5 strength in all extremities. Normal bulk and tone. No pronator drift.

Sensory: Intact to light touch, pinprick, vibration, and proprioception throughout.

Reflexes: 2+ and symmetric in biceps, triceps, brachioradialis, patellar, and
Achilles. Toes downgoing bilaterally.

Coordination: Normal finger-to-nose and heel-to-shin bilaterally.
No dysdiadochokinesia.

Gait: Normal gait and station. Tandem walk intact. Romberg negative.
```

#### Mental Status Exam (.mental)

```
Alert and oriented to person, place, time, and situation. Attention intact
(spells WORLD backwards without error). Speech fluent, naming intact, repetition
intact, comprehension intact. Fund of knowledge appropriate. Memory: 3/3
registration, 3/3 recall at 5 minutes. No evidence of neglect.
```

#### Cranial Nerve Exam (.cranial)

```
CN II: Visual acuity intact, visual fields full to confrontation. Fundoscopic
exam reveals sharp disc margins bilaterally.
CN III, IV, VI: Pupils equal, round, reactive to light (3mm→2mm). Extraocular
movements intact without nystagmus. No ptosis.
CN V: Facial sensation intact to light touch in V1, V2, V3 distributions
bilaterally. Masseter strength symmetric.
CN VII: Face symmetric at rest and with activation. Forehead wrinkling intact.
CN VIII: Hearing intact to finger rub bilaterally.
CN IX, X: Palate elevates symmetrically. Gag intact.
CN XI: Sternocleidomastoid and trapezius strength 5/5 bilaterally.
CN XII: Tongue midline, no atrophy or fasciculations.
```

### Review of Systems

#### Complete Normal ROS (.rosnl)

```
Constitutional: Denies fever, chills, weight loss, weight gain, fatigue, night sweats.
Eyes: Denies vision changes, eye pain, diplopia.
ENT: Denies hearing loss, tinnitus, vertigo, nasal congestion, sore throat.
Cardiovascular: Denies chest pain, palpitations, edema, dyspnea on exertion.
Respiratory: Denies cough, shortness of breath, wheezing.
Gastrointestinal: Denies nausea, vomiting, diarrhea, constipation, abdominal pain.
Genitourinary: Denies dysuria, frequency, urgency, hematuria.
Musculoskeletal: Denies joint pain, muscle weakness, back pain.
Skin: Denies rash, lesions, pruritus.
Neurological: See HPI.
Psychiatric: Denies depression, anxiety, suicidal ideation.
```

#### Headache-Focused ROS (.roshead)

```
Neurological: Per HPI. Denies focal weakness, numbness, vision changes,
speech difficulties, dizziness, vertigo. No recent head trauma.
Constitutional: Denies fever, weight loss. Reports fatigue possibly related
to headache frequency.
Eyes: Denies eye pain, visual aura (unless noted in HPI).
ENT: Denies sinus pressure, nasal congestion, jaw pain/clicking.
Psychiatric: See PHQ-9 score. Denies suicidal ideation.
Sleep: See sleep quality discussion in HPI.
```

### HPI Templates

#### Headache HPI (.hpiha)

```
Patient presents for [follow-up/evaluation] of [headache type].

Headache Characteristics:
- Frequency: [X] days per month
- Duration: [X] hours per episode
- Intensity: [X]/10 at worst
- Quality: [throbbing/pressure/stabbing/dull]
- Location: [unilateral L/R / bilateral / frontal / occipital / holocephalic]

Associated Symptoms:
- Nausea: [yes/no], Vomiting: [yes/no]
- Photophobia: [yes/no], Phonophobia: [yes/no]
- Aura: [yes/no] - if yes: [visual/sensory/motor/speech]

Triggers: [stress / sleep deprivation / certain foods / hormonal / weather / none identified]

Current Treatment:
- Preventive: [medication, dose, duration, response]
- Abortive: [medication, frequency of use, effectiveness]

Impact: MIDAS score [X] ([minimal/mild/moderate/severe] disability)
```

#### Seizure HPI (.hpiseiz)

```
Patient presents for [follow-up/evaluation] of [seizure type/epilepsy].

Seizure History:
- Last seizure: [date/time ago]
- Frequency: [X] per [week/month/year]
- Seizure-free duration: [X months/years]

Seizure Semiology:
- Warning/aura: [yes/no] - if yes: [description]
- Motor manifestations: [generalized tonic-clonic / focal / myoclonic / atonic]
- Consciousness: [preserved / impaired / lost]
- Duration: [X] seconds/minutes
- Post-ictal: [confusion duration / weakness / speech difficulty]

Triggers: [sleep deprivation / missed medications / alcohol / stress / catamenial / none]

Current AED Regimen:
- [Medication 1]: [dose], level [X] on [date]
- [Medication 2]: [dose], level [X] on [date]

Medication Adherence: [good / occasional missed doses / significant non-compliance]
Side Effects: [none / list specific]
```

### Assessment/Plan Templates

#### Chronic Migraine Plan (.migraine)

```
Assessment:
Chronic migraine [without aura / with aura] (G43.709/G43.719)
- Current frequency: [X] headache days/month
- MIDAS score: [X] ([interpretation])
- Response to current preventive: [excellent/good/partial/poor]

Plan:
1. Preventive Therapy
   - [Continue/Start/Adjust] [medication] [dose]
   - [Consider adding / Switch to] [medication] if inadequate response

2. Acute Therapy
   - [Triptan] [dose] PRN, limit to [X] days/week
   - Counsel on medication overuse headache risk

3. Lifestyle Modifications
   - Sleep hygiene: regular sleep schedule 7-8 hours
   - Hydration: at least 64 oz water daily
   - Exercise: 150 minutes moderate activity weekly
   - Headache diary: continue tracking

4. Follow-up
   - Return in [X] weeks/months
   - Call if worsening or concerning new symptoms

5. Referrals/Studies
   - [MRI brain if not done / Neurology referral / Botox evaluation]
```

#### Parkinson's Disease Plan (.parkinson)

```
Assessment:
Parkinson's disease (G20)
- Hoehn & Yahr stage: [X]
- Disease duration: [X] years
- Motor symptoms: [tremor / rigidity / bradykinesia / gait disturbance]
- Motor fluctuations: [none / wearing off / dyskinesias]
- Non-motor symptoms: [list: sleep, mood, cognition, autonomic]

Plan:
1. Dopaminergic Therapy
   - [Continue/Adjust] [carbidopa-levodopa] [dose] [frequency]
   - [Continue/Add/Adjust] [dopamine agonist] [dose]
   - [Consider] COMT/MAO-B inhibitor for wearing off

2. Non-Motor Management
   - Sleep: [melatonin / sleep hygiene / REM sleep behavior precautions]
   - Mood: [Continue/Consider] [antidepressant]
   - Cognition: MoCA score [X], [stable / declining]
   - Constipation: [fiber / MiraLAX / stool softener]

3. Rehabilitation
   - Physical therapy: LSVT BIG / balance training
   - Occupational therapy: fine motor, ADL optimization
   - Speech therapy: LSVT LOUD if dysarthria

4. Advanced Therapies Discussion
   - [Not candidate at this time / Discuss DBS / Discuss Duopa]

5. Follow-up
   - Return in [X] months
   - Call if falls, hallucinations, or significant motor decline
```

---

## Technical Implementation

### Data Model

```typescript
interface DotPhrase {
  id: string;
  abbreviation: string;        // e.g., ".neuroexam"
  title: string;               // e.g., "Complete Normal Neurological Exam"
  content: string;             // The expanded text
  category: PhraseCategory;
  ownershipLevel: 'system' | 'organization' | 'specialty' | 'provider';
  ownerId: string;             // Provider ID, org ID, etc.
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
  lastUsed: Date;
  showInQuickMenu: boolean;
  requireConfirmation: boolean;
}

interface PhraseCategory {
  id: string;
  name: string;                // e.g., "Physical Exam"
  icon: string;                // e.g., "📋"
  sortOrder: number;
}

interface PhraseUsageLog {
  id: string;
  phraseId: string;
  providerId: string;
  patientId: string;           // For audit, not stored with phrase
  insertedAt: Date;
  fieldContext: string;        // e.g., "hpi", "physical_exam"
}
```

### Storage

| Scope | Storage Location |
|-------|------------------|
| System phrases | Application database |
| Organization phrases | Organization database |
| Provider phrases | localStorage (MVP) → User database (Phase 2) |
| Usage history | localStorage (MVP) → Analytics database (Phase 2) |

### Expansion Algorithm

```
1. On text input in a supported field:
   a. Check if input matches phrase trigger pattern (e.g., starts with ".")
   b. If partial match, show autocomplete dropdown
   c. If exact match + trigger (space/tab/enter), expand phrase

2. Phrase resolution order:
   a. Check provider custom phrases
   b. Check specialty phrases
   c. Check organization phrases
   d. Check system phrases
   e. If multiple matches, show disambiguation dropdown

3. On expansion:
   a. Replace trigger text with phrase content
   b. Log usage for analytics
   c. Update lastUsed and usageCount
```

---

## User Experience

### Settings Panel

```
┌─────────────────────────────────────────────────────────────────┐
│  Dot Phrases Settings                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  EXPANSION BEHAVIOR                                             │
│  Expand phrases when I press:                                   │
│  [✓] Space                                                      │
│  [✓] Tab                                                        │
│  [✓] Enter                                                      │
│                                                                 │
│  AUTO-COMPLETE                                                  │
│  [✓] Show suggestions while typing                              │
│  Show after typing [ 2 ▼] characters                            │
│                                                                 │
│  QUICK PHRASES BUTTON                                           │
│  [✓] Show ⚡ button on text fields                              │
│                                                                 │
│  KEYBOARD SHORTCUT                                              │
│  Open phrase search: [ Cmd+. ]                                  │
│                                                                 │
│                                        [Save] [Reset to Default]│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Import/Export

**MVP:** Manual phrase management
**Phase 2:** Import/export functionality

```
┌─────────────────────────────────────────────────────────────────┐
│  Import/Export Phrases (Phase 2)                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  EXPORT                                                         │
│  [Export My Phrases] → Downloads JSON/CSV file                  │
│                                                                 │
│  IMPORT                                                         │
│  [Choose File] → Upload phrases from another system             │
│  Supported formats: JSON, CSV, Epic Smart Phrases XML           │
│                                                                 │
│  SHARE                                                          │
│  [Share with Colleague] → Send phrase(s) to another provider    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Neurology-Specific Phrase Library

### Movement Disorders

| Phrase | Description |
|--------|-------------|
| `.parkinsonexam` | Parkinson's focused motor exam |
| `.updrs` | UPDRS motor section template |
| `.tremor` | Tremor characterization template |
| `.dystonia` | Dystonia examination template |

### Headache

| Phrase | Description |
|--------|-------------|
| `.hpiha` | Headache HPI template |
| `.migraine` | Chronic migraine assessment/plan |
| `.tension` | Tension headache assessment/plan |
| `.cluster` | Cluster headache assessment/plan |
| `.moh` | Medication overuse headache plan |

### Epilepsy

| Phrase | Description |
|--------|-------------|
| `.hpiseiz` | Seizure HPI template |
| `.seizwit` | Witness account template |
| `.aedplan` | AED management plan |
| `.seizfree` | Seizure-free counseling |

### MS/Demyelinating

| Phrase | Description |
|--------|-------------|
| `.msexam` | MS-focused neurological exam |
| `.msrelapse` | MS relapse assessment |
| `.msplan` | DMT management plan |
| `.edss` | EDSS scoring template |

### Neuromuscular

| Phrase | Description |
|--------|-------------|
| `.emgplan` | EMG/NCS ordering template |
| `.myasthenia` | MG assessment/plan |
| `.neuropathy` | Neuropathy workup plan |
| `.als` | ALS assessment template |

### Stroke/Vascular

| Phrase | Description |
|--------|-------------|
| `.strokeprev` | Secondary stroke prevention |
| `.tia` | TIA workup plan |
| `.nihss` | NIHSS documentation template |
| `.carotid` | Carotid stenosis management |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Phrase usage per provider/day | >20 |
| Custom phrases created | >10 per provider |
| Time saved per note | >2 minutes |
| Provider adoption | >90% |
| Satisfaction score | >4.3/5.0 |

---

## Future Enhancements (Phase 2+)

### Dynamic Variables

Insert dynamic content into phrases:

```
.greeting → "Good [morning/afternoon/evening], [patient first name]."

.hpiheadache → "Patient is a [age]-year-old [sex] presenting for..."
```

### Smart Suggestions

AI-powered phrase suggestions based on context:
- Suggest relevant phrases based on diagnosis
- Learn from provider preferences
- Recommend phrases based on note section

### EHR Integration

- Import existing Epic Smart Phrases
- Sync across EHR systems
- Organization-wide phrase deployment

### Voice-Activated Phrases

- "Insert neuro exam" → expands .neuroexam
- Voice command integration with AI Scribe

---

## Changelog

**v1.0 (January 20, 2026)**
- Initial document creation
- MVP feature specifications
- Pre-built neurology phrase library
- Technical data model
- Provider settings interface

---

*Document maintained by Sevaro Product Team*
