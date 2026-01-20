# Neurology Clinical Scales - Combined Reference & Implementation PRD

**Document Version:** 1.0
**Last Updated:** January 20, 2026
**Status:** Draft
**Author:** Product Team

---

## Executive Summary

This document serves as both a clinical reference guide and technical implementation specification for neurological assessment scales in the Sevaro platform. It covers scales for outpatient neurology (MVP) and inpatient neurology (future module), providing clinical context, scoring methodology, and technical requirements for each.

---

## Table of Contents

1. [Overview](#overview)
2. [Outpatient Scales (MVP)](#outpatient-scales-mvp)
3. [Outpatient Scales (Future)](#outpatient-scales-future)
4. [Inpatient Scales (Future Module)](#inpatient-scales-future-module)
5. [Technical Implementation Specifications](#technical-implementation-specifications)
6. [UI/UX Requirements](#uiux-requirements)
7. [Data Model](#data-model)
8. [Appendix](#appendix)

---

## Overview

### Purpose of Clinical Scales

Clinical scales in neurology serve to:
- **Quantify** subjective symptoms and functional status
- **Track** disease progression or treatment response over time
- **Standardize** communication between providers
- **Support** clinical decision-making and treatment planning
- **Document** medical necessity for treatments and referrals
- **Enable** quality metrics and outcomes research

### Scale Categories

| Category | Use Case | Examples |
|----------|----------|----------|
| **Headache/Migraine** | Disability assessment, treatment response | MIDAS, HIT-6 |
| **Mood/Psychiatric** | Comorbidity screening, symptom tracking | PHQ-9, GAD-7 |
| **Cognitive** | Dementia screening, baseline assessment | MoCA, MMSE |
| **Movement Disorders** | Parkinson's staging, symptom tracking | UPDRS, H&Y |
| **Multiple Sclerosis** | Disability quantification | EDSS |
| **Sleep** | Sleep disorder assessment | Epworth, PSQI |
| **Pain/Function** | Disability documentation | ODI, NDI |
| **Stroke (Inpatient)** | Acute assessment, prognosis | NIHSS, GCS, mRS |
| **ICU/Critical Care** | Consciousness, sedation | GCS, FOUR, RASS |

---

## Outpatient Scales (MVP)

These scales are prioritized for the initial outpatient module release.

---

### 1. MIDAS (Migraine Disability Assessment Scale)

#### Clinical Reference

| Attribute | Details |
|-----------|---------|
| **Full Name** | Migraine Disability Assessment Scale |
| **Purpose** | Quantifies headache-related disability over past 3 months |
| **Target Population** | Patients with migraine or chronic headache |
| **Administration** | Patient self-report |
| **Time to Complete** | 2-3 minutes |
| **Validated** | Yes - extensively validated |

#### Questions (5 items)

1. On how many days in the last 3 months did you miss work or school because of your headaches?
2. How many days in the last 3 months was your productivity at work or school reduced by half or more because of your headaches?
3. On how many days in the last 3 months did you not do household work because of your headaches?
4. How many days in the last 3 months was your productivity in household work reduced by half or more because of your headaches?
5. On how many days in the last 3 months did you miss family, social, or leisure activities because of your headaches?

#### Scoring

| Score Range | Grade | Interpretation | Clinical Action |
|-------------|-------|----------------|-----------------|
| 0-5 | I | Little or no disability | Reassurance, acute treatment PRN |
| 6-10 | II | Mild disability | Consider preventive if frequent |
| 11-20 | III | Moderate disability | Preventive therapy indicated |
| 21+ | IV | Severe disability | Aggressive preventive therapy, specialist referral |

**Calculation:** Sum of all 5 questions (each answer is number of days, 0-90 range per question)

#### Clinical Notes
- Also captures headache frequency (days/month) as supplementary questions A & B
- Score >20 often used as threshold for CGRP inhibitor insurance authorization
- Track trend over time to demonstrate treatment efficacy

#### Implementation Priority: **P0 - MVP**

---

### 2. HIT-6 (Headache Impact Test)

#### Clinical Reference

| Attribute | Details |
|-----------|---------|
| **Full Name** | Headache Impact Test - 6 item |
| **Purpose** | Measures impact of headaches on daily life |
| **Target Population** | All headache types |
| **Administration** | Patient self-report |
| **Time to Complete** | 1-2 minutes |
| **Validated** | Yes |

#### Questions (6 items)

Each question scored: Never (6), Rarely (8), Sometimes (10), Very Often (11), Always (13)

1. When you have headaches, how often is the pain severe?
2. How often do headaches limit your ability to do usual daily activities?
3. When you have a headache, how often do you wish you could lie down?
4. In the past 4 weeks, how often have you felt too tired to do work or daily activities because of your headaches?
5. In the past 4 weeks, how often have you felt fed up or irritated because of your headaches?
6. In the past 4 weeks, how often did headaches limit your ability to concentrate?

#### Scoring

| Score Range | Interpretation | Clinical Action |
|-------------|----------------|-----------------|
| 36-49 | Little to no impact | Monitor |
| 50-55 | Some impact | Consider intervention |
| 56-59 | Substantial impact | Treatment modification needed |
| 60-78 | Severe impact | Aggressive treatment, specialist referral |

**Calculation:** Sum of all 6 responses (range 36-78)

#### Clinical Notes
- More sensitive to change than MIDAS for short-term monitoring
- Good for tracking response to acute treatments
- Complementary to MIDAS (impact vs. disability)

#### Implementation Priority: **P0 - MVP**

---

### 3. PHQ-9 (Patient Health Questionnaire-9)

#### Clinical Reference

| Attribute | Details |
|-----------|---------|
| **Full Name** | Patient Health Questionnaire - 9 item |
| **Purpose** | Depression screening and severity |
| **Target Population** | All patients (high comorbidity with neurological conditions) |
| **Administration** | Patient self-report |
| **Time to Complete** | 2-3 minutes |
| **Validated** | Yes - gold standard for primary care depression screening |

#### Questions (9 items)

Over the last 2 weeks, how often have you been bothered by:

1. Little interest or pleasure in doing things
2. Feeling down, depressed, or hopeless
3. Trouble falling/staying asleep, or sleeping too much
4. Feeling tired or having little energy
5. Poor appetite or overeating
6. Feeling bad about yourself
7. Trouble concentrating
8. Moving or speaking slowly / being fidgety or restless
9. Thoughts of self-harm or suicide

Each scored: Not at all (0), Several days (1), More than half the days (2), Nearly every day (3)

#### Scoring

| Score Range | Severity | Clinical Action |
|-------------|----------|-----------------|
| 0-4 | Minimal | No action needed |
| 5-9 | Mild | Watchful waiting, repeat screening |
| 10-14 | Moderate | Treatment plan, consider referral |
| 15-19 | Moderately Severe | Active treatment, medication and/or therapy |
| 20-27 | Severe | Immediate intervention, psychiatry referral |

**Calculation:** Sum of all 9 responses (range 0-27)

#### Clinical Notes
- **Question 9 (suicidality) requires special handling** - any positive response should trigger alert
- Depression common in migraine, epilepsy, MS, Parkinson's, stroke
- Some medications (topiramate, levetiracetam) can worsen depression
- Required for many value-based care metrics

#### Implementation Priority: **P0 - MVP**

---

### 4. GAD-7 (Generalized Anxiety Disorder-7)

#### Clinical Reference

| Attribute | Details |
|-----------|---------|
| **Full Name** | Generalized Anxiety Disorder 7-item scale |
| **Purpose** | Anxiety screening and severity |
| **Target Population** | All patients |
| **Administration** | Patient self-report |
| **Time to Complete** | 1-2 minutes |
| **Validated** | Yes |

#### Questions (7 items)

Over the last 2 weeks, how often have you been bothered by:

1. Feeling nervous, anxious, or on edge
2. Not being able to stop or control worrying
3. Worrying too much about different things
4. Trouble relaxing
5. Being so restless that it's hard to sit still
6. Becoming easily annoyed or irritable
7. Feeling afraid as if something awful might happen

Each scored: Not at all (0), Several days (1), More than half the days (2), Nearly every day (3)

#### Scoring

| Score Range | Severity | Clinical Action |
|-------------|----------|-----------------|
| 0-4 | Minimal | No action needed |
| 5-9 | Mild | Monitor, lifestyle modifications |
| 10-14 | Moderate | Consider treatment |
| 15-21 | Severe | Active treatment, referral |

**Calculation:** Sum of all 7 responses (range 0-21)

#### Clinical Notes
- High comorbidity with chronic pain, headache, epilepsy
- Anxiety can lower seizure threshold
- Often paired with PHQ-9 for comprehensive mood screening

#### Implementation Priority: **P1 - Post-MVP**

---

### 5. Epworth Sleepiness Scale (ESS)

#### Clinical Reference

| Attribute | Details |
|-----------|---------|
| **Full Name** | Epworth Sleepiness Scale |
| **Purpose** | Measures daytime sleepiness |
| **Target Population** | Sleep disorders, epilepsy, medication side effects |
| **Administration** | Patient self-report |
| **Time to Complete** | 2 minutes |
| **Validated** | Yes |

#### Questions (8 situations)

How likely are you to doze off in these situations?

1. Sitting and reading
2. Watching TV
3. Sitting inactive in a public place
4. As a passenger in a car for an hour
5. Lying down to rest in the afternoon
6. Sitting and talking to someone
7. Sitting quietly after lunch (no alcohol)
8. In a car, while stopped in traffic

Each scored: Would never doze (0), Slight chance (1), Moderate chance (2), High chance (3)

#### Scoring

| Score Range | Interpretation | Clinical Action |
|-------------|----------------|-----------------|
| 0-5 | Lower normal | No concern |
| 6-10 | Higher normal | Monitor |
| 11-12 | Mild sleepiness | Evaluate causes |
| 13-15 | Moderate sleepiness | Sleep study consideration |
| 16-24 | Severe sleepiness | Sleep study indicated, driving safety |

**Calculation:** Sum of all 8 responses (range 0-24)

#### Clinical Notes
- Required before prescribing stimulants
- Important for epilepsy patients (sleep deprivation triggers seizures)
- Screen for obstructive sleep apnea (common in headache patients)
- Driving safety implications at higher scores

#### Implementation Priority: **P1 - Post-MVP**

---

### 6. Montreal Cognitive Assessment (MoCA)

#### Clinical Reference

| Attribute | Details |
|-----------|---------|
| **Full Name** | Montreal Cognitive Assessment |
| **Purpose** | Cognitive screening for mild cognitive impairment |
| **Target Population** | Dementia screening, post-stroke, Parkinson's |
| **Administration** | Clinician-administered |
| **Time to Complete** | 10-12 minutes |
| **Validated** | Yes |
| **Licensing** | Requires free certification at mocatest.org |

#### Domains Tested (8 domains, 30 points total)

| Domain | Points | Tasks |
|--------|--------|-------|
| Visuospatial/Executive | 5 | Trail-making, cube copy, clock drawing |
| Naming | 3 | Animal naming (lion, rhino, camel) |
| Attention | 6 | Digit span, vigilance, serial 7s |
| Language | 3 | Sentence repetition, fluency |
| Abstraction | 2 | Similarities |
| Delayed Recall | 5 | 5-word recall |
| Orientation | 6 | Date, place |

**Education adjustment:** Add 1 point if ≤12 years education

#### Scoring

| Score Range | Interpretation | Clinical Action |
|-------------|----------------|-----------------|
| 26-30 | Normal | No concern |
| 18-25 | Mild Cognitive Impairment | Further evaluation, repeat in 6-12 months |
| 10-17 | Moderate Impairment | Dementia workup |
| <10 | Severe Impairment | Advanced dementia likely |

#### Clinical Notes
- More sensitive than MMSE for mild impairment
- Multiple versions available to reduce practice effects
- Document which version used
- Important baseline before starting cognitively-impairing medications

#### Implementation Priority: **P1 - Post-MVP**

---

### 7. Oswestry Disability Index (ODI)

#### Clinical Reference

| Attribute | Details |
|-----------|---------|
| **Full Name** | Oswestry Disability Index |
| **Purpose** | Low back pain disability assessment |
| **Target Population** | Spine patients, radiculopathy |
| **Administration** | Patient self-report |
| **Time to Complete** | 3-5 minutes |
| **Validated** | Yes - gold standard for spine |

#### Sections (10 sections, 6 options each)

1. Pain intensity
2. Personal care
3. Lifting
4. Walking
5. Sitting
6. Standing
7. Sleeping
8. Sex life (optional)
9. Social life
10. Traveling

Each section scored 0-5 based on selected option

#### Scoring

**Calculation:** (Total points / 50) × 100 = percentage

| Score Range | Interpretation |
|-------------|----------------|
| 0-20% | Minimal disability |
| 21-40% | Moderate disability |
| 41-60% | Severe disability |
| 61-80% | Crippled |
| 81-100% | Bed-bound or exaggerating |

#### Clinical Notes
- Required for spine surgery authorization
- Track pre/post intervention
- >20% change considered clinically meaningful

#### Implementation Priority: **P2 - Future**

---

### 8. Neck Disability Index (NDI)

#### Clinical Reference

| Attribute | Details |
|-----------|---------|
| **Full Name** | Neck Disability Index |
| **Purpose** | Cervical spine disability assessment |
| **Target Population** | Neck pain, cervical radiculopathy, cervicogenic headache |
| **Administration** | Patient self-report |
| **Time to Complete** | 3-5 minutes |
| **Validated** | Yes |

#### Sections (10 sections)

1. Pain intensity
2. Personal care
3. Lifting
4. Reading
5. Headaches
6. Concentration
7. Work
8. Driving
9. Sleeping
10. Recreation

Each section scored 0-5

#### Scoring

**Calculation:** (Total points / 50) × 100 = percentage

| Score Range | Interpretation |
|-------------|----------------|
| 0-4 | No disability |
| 5-14 | Mild disability |
| 15-24 | Moderate disability |
| 25-34 | Severe disability |
| 35-50 | Complete disability |

#### Clinical Notes
- Important for cervicogenic headache patients
- Track response to physical therapy, injections
- Complementary to headache scales for neck-related headaches

#### Implementation Priority: **P2 - Future**

---

## Outpatient Scales (Future)

### Movement Disorders

#### UPDRS (Unified Parkinson's Disease Rating Scale)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Comprehensive Parkinson's assessment |
| **Sections** | 4 parts: Mentation, ADLs, Motor exam, Complications |
| **Administration** | Clinician + patient report |
| **Time** | 20-30 minutes |
| **Priority** | P2 |

#### Hoehn & Yahr Scale

| Stage | Description |
|-------|-------------|
| 1 | Unilateral involvement only |
| 1.5 | Unilateral and axial involvement |
| 2 | Bilateral without balance impairment |
| 2.5 | Mild bilateral with recovery on pull test |
| 3 | Mild-moderate bilateral, postural instability |
| 4 | Severe disability, able to walk/stand unassisted |
| 5 | Wheelchair bound or bedridden |

**Priority:** P2

### Multiple Sclerosis

#### EDSS (Expanded Disability Status Scale)

| Attribute | Details |
|-----------|---------|
| **Purpose** | MS disability quantification |
| **Range** | 0-10 in 0.5 increments |
| **Administration** | Clinician assessment |
| **Key Thresholds** | 4.0 (walking limited), 6.0 (requires assistance), 7.0 (wheelchair) |
| **Priority** | P2 |

### Epilepsy

#### QOLIE-31 (Quality of Life in Epilepsy)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Epilepsy-specific quality of life |
| **Domains** | Seizure worry, emotional well-being, energy, cognition, medication effects, social function |
| **Priority** | P2 |

#### Liverpool Seizure Severity Scale

| Attribute | Details |
|-----------|---------|
| **Purpose** | Quantifies seizure severity |
| **Use** | Treatment response monitoring |
| **Priority** | P3 |

---

## Inpatient Scales (Future Module)

These scales are essential for the future inpatient neurology module.

---

### 1. NIH Stroke Scale (NIHSS)

#### Clinical Reference

| Attribute | Details |
|-----------|---------|
| **Full Name** | National Institutes of Health Stroke Scale |
| **Purpose** | Quantifies stroke severity, guides treatment |
| **Target Population** | Acute stroke patients |
| **Administration** | Clinician-administered |
| **Time to Complete** | 5-8 minutes |
| **Certification** | Required - available free online |

#### Scale Components (11 categories, 15 items)

| Item | Category | Score Range |
|------|----------|-------------|
| 1a | Level of consciousness | 0-3 |
| 1b | LOC questions | 0-2 |
| 1c | LOC commands | 0-2 |
| 2 | Best gaze | 0-2 |
| 3 | Visual fields | 0-3 |
| 4 | Facial palsy | 0-3 |
| 5a | Motor arm - left | 0-4 |
| 5b | Motor arm - right | 0-4 |
| 6a | Motor leg - left | 0-4 |
| 6b | Motor leg - right | 0-4 |
| 7 | Limb ataxia | 0-2 |
| 8 | Sensory | 0-2 |
| 9 | Best language | 0-3 |
| 10 | Dysarthria | 0-2 |
| 11 | Extinction/inattention | 0-2 |

#### Scoring Interpretation

| Score Range | Severity | Clinical Implications |
|-------------|----------|----------------------|
| 0 | No stroke symptoms | Consider stroke mimic |
| 1-4 | Minor stroke | May not benefit from intervention |
| 5-15 | Moderate stroke | tPA candidate if within window |
| 16-20 | Moderate-severe | Thrombectomy consideration |
| 21-42 | Severe stroke | High mortality/morbidity risk |

#### Clinical Notes
- **tPA threshold:** Generally score ≥4 for treatment consideration
- **Thrombectomy:** Often score ≥6 with large vessel occlusion
- Serial NIHSS tracks improvement/deterioration
- Must document time of assessment

#### Implementation Priority: **P0 for Inpatient Module**

---

### 2. Glasgow Coma Scale (GCS)

#### Clinical Reference

| Attribute | Details |
|-----------|---------|
| **Full Name** | Glasgow Coma Scale |
| **Purpose** | Consciousness assessment |
| **Target Population** | Trauma, stroke, altered mental status |
| **Administration** | Clinician assessment |
| **Time to Complete** | 1 minute |

#### Components

| Component | Response | Score |
|-----------|----------|-------|
| **Eye Opening (E)** | Spontaneous | 4 |
| | To voice | 3 |
| | To pain | 2 |
| | None | 1 |
| **Verbal (V)** | Oriented | 5 |
| | Confused | 4 |
| | Inappropriate words | 3 |
| | Incomprehensible | 2 |
| | None | 1 |
| **Motor (M)** | Obeys commands | 6 |
| | Localizes pain | 5 |
| | Withdraws from pain | 4 |
| | Flexion (decorticate) | 3 |
| | Extension (decerebrate) | 2 |
| | None | 1 |

#### Scoring

**Total Score:** E + V + M (range 3-15)

| Score Range | Severity | Clinical Action |
|-------------|----------|-----------------|
| 13-15 | Mild | Monitor |
| 9-12 | Moderate | Close observation, consider ICU |
| 3-8 | Severe | Intubation consideration, ICU |

**Report format:** GCS 11 (E3V4M4) - always include component breakdown

#### Clinical Notes
- Document best response
- Note if patient intubated (V score = 1T)
- GCS ≤8 generally indicates need for airway protection
- Trend is more important than single value

#### Implementation Priority: **P0 for Inpatient Module**

---

### 3. Modified Rankin Scale (mRS)

#### Clinical Reference

| Attribute | Details |
|-----------|---------|
| **Full Name** | Modified Rankin Scale |
| **Purpose** | Global disability/functional outcome |
| **Target Population** | Stroke outcome measurement |
| **Administration** | Clinician assessment or structured interview |
| **Time to Complete** | 2-5 minutes |

#### Scale

| Score | Description |
|-------|-------------|
| 0 | No symptoms at all |
| 1 | No significant disability despite symptoms |
| 2 | Slight disability - unable to do all previous activities but independent |
| 3 | Moderate disability - requires some help but walks without assistance |
| 4 | Moderately severe - unable to walk without assistance, unable to attend to bodily needs without assistance |
| 5 | Severe disability - bedridden, incontinent, requires constant nursing |
| 6 | Dead |

#### Clinical Notes
- Primary outcome measure in stroke trials
- Document at admission, discharge, 90 days
- mRS 0-2 generally considered "good outcome"
- Use structured interview for consistency

#### Implementation Priority: **P0 for Inpatient Module**

---

### 4. FOUR Score (Full Outline of UnResponsiveness)

#### Clinical Reference

| Attribute | Details |
|-----------|---------|
| **Full Name** | Full Outline of UnResponsiveness |
| **Purpose** | Coma assessment (alternative to GCS) |
| **Target Population** | ICU patients, intubated patients |
| **Administration** | Clinician assessment |
| **Advantage** | Works for intubated patients, includes brainstem reflexes |

#### Components (4 categories, each 0-4)

| Component | Score | Finding |
|-----------|-------|---------|
| **Eye Response** | 4 | Eyelids open, tracking or blinking to command |
| | 3 | Eyelids open but not tracking |
| | 2 | Eyelids closed, open to loud voice |
| | 1 | Eyelids closed, open to pain |
| | 0 | Eyelids remain closed with pain |
| **Motor Response** | 4 | Thumbs up, fist, or peace sign |
| | 3 | Localizing to pain |
| | 2 | Flexion response to pain |
| | 1 | Extension response to pain |
| | 0 | No response or myoclonus status |
| **Brainstem Reflexes** | 4 | Pupil and corneal reflexes present |
| | 3 | One pupil wide and fixed |
| | 2 | Pupil OR corneal reflexes absent |
| | 1 | Pupil AND corneal reflexes absent |
| | 0 | Absent pupil, corneal, and cough reflex |
| **Respiration** | 4 | Not intubated, regular breathing |
| | 3 | Not intubated, Cheyne-Stokes |
| | 2 | Not intubated, irregular breathing |
| | 1 | Breathes above ventilator rate |
| | 0 | Breathes at ventilator rate or apnea |

#### Scoring

**Total Score:** Sum of all 4 components (range 0-16)

- FOUR score 0 = may indicate brain death (requires further testing)
- Provides more granularity than GCS at lower consciousness levels

#### Implementation Priority: **P1 for Inpatient Module**

---

### 5. Hunt and Hess Scale (Subarachnoid Hemorrhage)

#### Scale

| Grade | Description | Surgical Risk |
|-------|-------------|---------------|
| 1 | Asymptomatic or mild headache, slight nuchal rigidity | Low |
| 2 | Moderate-severe headache, nuchal rigidity, cranial nerve palsy | Low |
| 3 | Drowsy, confused, mild focal deficit | Moderate |
| 4 | Stupor, moderate-severe hemiparesis, early decerebrate | High |
| 5 | Deep coma, decerebrate rigidity, moribund | Very high |

#### Clinical Notes
- Graded at admission and serially
- Guides timing of aneurysm treatment
- Grade 1-3 typically early surgery
- Grade 4-5 may delay intervention

#### Implementation Priority: **P1 for Inpatient Module**

---

### 6. ICH Score (Intracerebral Hemorrhage)

#### Components

| Factor | Criteria | Points |
|--------|----------|--------|
| GCS 3-4 | Yes | 2 |
| GCS 5-12 | Yes | 1 |
| GCS 13-15 | Yes | 0 |
| ICH Volume ≥30mL | Yes | 1 |
| IVH Present | Yes | 1 |
| Infratentorial origin | Yes | 1 |
| Age ≥80 | Yes | 1 |

#### 30-Day Mortality by Score

| ICH Score | Mortality |
|-----------|-----------|
| 0 | 0% |
| 1 | 13% |
| 2 | 26% |
| 3 | 72% |
| 4 | 97% |
| 5 | 100% |

#### Implementation Priority: **P1 for Inpatient Module**

---

### 7. CAM (Confusion Assessment Method)

#### Diagnostic Algorithm

Delirium diagnosis requires:
1. **Feature 1:** Acute onset and fluctuating course (REQUIRED)
2. **Feature 2:** Inattention (REQUIRED)
3. **Feature 3:** Disorganized thinking (need 3 OR 4)
4. **Feature 4:** Altered level of consciousness (need 3 OR 4)

#### Clinical Notes
- CAM-ICU version for intubated/non-verbal patients
- Screen at least daily in hospitalized patients
- Delirium associated with worse outcomes, longer stays

#### Implementation Priority: **P1 for Inpatient Module**

---

### 8. RASS (Richmond Agitation-Sedation Scale)

#### Scale

| Score | Term | Description |
|-------|------|-------------|
| +4 | Combative | Violent, immediate danger to staff |
| +3 | Very agitated | Pulls/removes tubes, aggressive |
| +2 | Agitated | Frequent non-purposeful movement |
| +1 | Restless | Anxious, apprehensive, not aggressive |
| 0 | Alert and calm | |
| -1 | Drowsy | Not fully alert, sustained awakening to voice |
| -2 | Light sedation | Briefly awakens to voice, eye contact |
| -3 | Moderate sedation | Movement or eye opening to voice, no eye contact |
| -4 | Deep sedation | No response to voice, movement to physical stimulation |
| -5 | Unarousable | No response to voice or physical stimulation |

#### Clinical Notes
- Target RASS 0 to -2 for most ICU patients
- Document with sedation medication adjustments
- Required for CAM-ICU assessment

#### Implementation Priority: **P1 for Inpatient Module**

---

## Technical Implementation Specifications

### General Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Scale Administration                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Patient   │  │  Clinician  │  │   Tablet/Kiosk      │  │
│  │  Self-Entry │  │  Administered│  │   (Waiting Room)    │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          ▼                                   │
│              ┌─────────────────────┐                         │
│              │   Scoring Engine    │                         │
│              │  - Auto-calculate   │                         │
│              │  - Interpretation   │                         │
│              │  - Alerts           │                         │
│              └──────────┬──────────┘                         │
│                         ▼                                    │
│              ┌─────────────────────┐                         │
│              │   Data Storage      │                         │
│              │  - Score history    │                         │
│              │  - Trend data       │                         │
│              │  - Raw responses    │                         │
│              └──────────┬──────────┘                         │
│                         ▼                                    │
│              ┌─────────────────────┐                         │
│              │   Visualization     │                         │
│              │  - Trend graphs     │                         │
│              │  - Comparison       │                         │
│              │  - Alerts           │                         │
│              └─────────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

### Scale Configuration Object

Each scale should be defined with the following structure:

```javascript
{
  id: "midas",
  name: "MIDAS",
  fullName: "Migraine Disability Assessment Scale",
  version: "1.0",
  category: "headache",
  administration: "patient", // "patient" | "clinician" | "both"
  timeframe: "3 months",
  estimatedTime: "2-3 minutes",

  questions: [
    {
      id: "q1",
      text: "On how many days in the last 3 months did you miss work or school because of your headaches?",
      type: "numeric", // "numeric" | "likert" | "select" | "multi-select"
      min: 0,
      max: 90,
      unit: "days",
      required: true
    }
    // ... additional questions
  ],

  scoring: {
    method: "sum", // "sum" | "average" | "weighted" | "custom"
    ranges: [
      { min: 0, max: 5, grade: "I", interpretation: "Little or no disability", severity: "minimal" },
      { min: 6, max: 10, grade: "II", interpretation: "Mild disability", severity: "mild" },
      { min: 11, max: 20, grade: "III", interpretation: "Moderate disability", severity: "moderate" },
      { min: 21, max: 270, grade: "IV", interpretation: "Severe disability", severity: "severe" }
    ]
  },

  alerts: [
    {
      condition: "score >= 21",
      type: "warning",
      message: "Severe disability - consider aggressive preventive therapy"
    }
  ],

  clinicalNotes: "Score >20 often used as threshold for CGRP inhibitor insurance authorization"
}
```

### Scoring Engine Requirements

| Requirement | Description |
|-------------|-------------|
| **Auto-calculation** | Calculate score immediately upon completion |
| **Partial scoring** | Handle incomplete scales appropriately |
| **Interpretation** | Map score to severity/grade automatically |
| **Validation** | Validate responses within acceptable ranges |
| **Alerts** | Trigger alerts for critical thresholds (e.g., PHQ-9 Q9 positive) |
| **Audit trail** | Log who administered, when, any edits |

### Critical Alerts

| Scale | Trigger | Alert Level | Action |
|-------|---------|-------------|--------|
| PHQ-9 | Q9 > 0 (suicidality) | Critical | Immediate notification, safety protocol |
| NIHSS | Score increase ≥4 | Urgent | Notify physician, stroke alert |
| GCS | Drop ≥2 points | Urgent | Notify physician immediately |
| MIDAS | Score ≥21 | Informational | Flag for treatment escalation |

---

## UI/UX Requirements

### Patient Self-Administration Interface

**Design Principles:**
- Large touch targets (minimum 44x44px)
- Clear, simple language
- Progress indicator
- One question per screen (mobile) or grouped sections (desktop)
- Accessible (WCAG 2.1 AA)

**Flow:**
1. Scale introduction (purpose, time estimate)
2. Questions with clear response options
3. Review screen before submission
4. Confirmation with score (if appropriate to share)

### Clinician Administration Interface

**Design Principles:**
- Efficient data entry (keyboard shortcuts)
- All questions visible (scrollable form)
- Auto-advance on selection
- Quick score visibility
- Easy access to scoring reference

**Features:**
- Timer (for timed assessments like MoCA)
- Reference images (for visual items)
- Score breakdown visible during entry
- Previous scores displayed for comparison

### Score History & Trending

**Visualization Requirements:**

| Element | Description |
|---------|-------------|
| **Trend Graph** | Line chart showing scores over time |
| **Score Cards** | Individual assessments with date, score, interpretation |
| **Comparison** | Side-by-side comparison of two assessments |
| **Threshold Lines** | Visual indicators of severity boundaries |
| **Change Indicators** | Arrows/badges showing improvement/worsening |

**Example Display:**
```
MIDAS Score History
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         [Graph: Trend over time]

Jan 20, 2026  │  18  │  Moderate  │  ↓ Improved
Oct 15, 2025  │  24  │  Severe    │
Jul 10, 2025  │  32  │  Severe    │  Baseline
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Modal/Drawer for Scale Details

When user clicks on a score, show:
- Full question responses
- Score calculation breakdown
- Historical comparison
- Clinical interpretation
- Option to print/export

---

## Data Model

### Scale Result Schema

```
ScaleResult {
  id: UUID
  patient_id: UUID
  scale_id: string (e.g., "midas")
  scale_version: string

  administered_at: timestamp
  administered_by: UUID (clinician) | null (patient self)
  administration_method: "in_person" | "patient_portal" | "tablet" | "phone"

  encounter_id: UUID (link to visit)

  responses: [
    {
      question_id: string
      value: number | string | array
      skipped: boolean
      time_spent_seconds: number (optional)
    }
  ]

  total_score: number
  subscores: { [key: string]: number } (optional)
  interpretation: string
  severity: string
  grade: string (optional)

  alerts_triggered: [
    {
      alert_id: string
      message: string
      acknowledged_by: UUID
      acknowledged_at: timestamp
    }
  ]

  notes: string (clinician notes)

  created_at: timestamp
  updated_at: timestamp
  created_by: UUID
}
```

### Scale Definition Schema

```
ScaleDefinition {
  id: string
  name: string
  full_name: string
  version: string
  category: string

  is_active: boolean
  requires_certification: boolean
  certification_url: string

  administration_type: "patient" | "clinician" | "both"
  estimated_minutes: number
  timeframe_description: string

  questions: JSON
  scoring_logic: JSON
  interpretation_ranges: JSON
  alerts: JSON

  clinical_notes: string
  references: [string]

  created_at: timestamp
  updated_at: timestamp
}
```

---

## Appendix

### Scale Selection by Condition

| Condition | Recommended Scales |
|-----------|-------------------|
| **Migraine** | MIDAS, HIT-6, PHQ-9, GAD-7 |
| **Tension Headache** | HIT-6, PHQ-9, NDI |
| **Epilepsy** | QOLIE-31, PHQ-9, ESS, Liverpool |
| **Parkinson's Disease** | UPDRS, H&Y, MoCA, PHQ-9 |
| **Multiple Sclerosis** | EDSS, PHQ-9, MoCA, Fatigue Scale |
| **Dementia** | MoCA, MMSE, PHQ-9, ADL scales |
| **Stroke (Acute)** | NIHSS, GCS, mRS |
| **Stroke (Recovery)** | mRS, MoCA, PHQ-9 |
| **Sleep Disorders** | ESS, PSQI, PHQ-9 |
| **Spine/Radiculopathy** | ODI, NDI, Pain scales |

### Frequency Recommendations

| Scale | Recommended Frequency |
|-------|----------------------|
| MIDAS | Every 3 months (aligns with timeframe) |
| HIT-6 | Monthly during active treatment |
| PHQ-9 | Baseline + every 3-6 months |
| MoCA | Baseline + annually (or if concerns) |
| NIHSS | Admission, Q4-6h acute, daily thereafter |
| GCS | Q1h (critical), Q4h (stable) |

### References

1. Stewart WF, et al. Development and testing of the Migraine Disability Assessment (MIDAS) Questionnaire. Neurology. 2001.
2. Kosinski M, et al. A six-item short-form survey for measuring headache impact: the HIT-6. Qual Life Res. 2003.
3. Kroenke K, Spitzer RL, Williams JB. The PHQ-9: validity of a brief depression severity measure. J Gen Intern Med. 2001.
4. Nasreddine ZS, et al. The Montreal Cognitive Assessment, MoCA: a brief screening tool for mild cognitive impairment. J Am Geriatr Soc. 2005.
5. Brott T, et al. Measurements of acute cerebral infarction: a clinical examination scale. Stroke. 1989.
6. Teasdale G, Jennett B. Assessment of coma and impaired consciousness. Lancet. 1974.

---

## Changelog

**v1.0 (January 20, 2026)**
- Initial document creation
- Outpatient scales: MIDAS, HIT-6, PHQ-9, GAD-7, ESS, MoCA, ODI, NDI
- Inpatient scales: NIHSS, GCS, mRS, FOUR, Hunt & Hess, ICH, CAM, RASS
- Technical implementation specifications
- UI/UX requirements
- Data model schemas

---

*Document maintained by Sevaro Product Team*
