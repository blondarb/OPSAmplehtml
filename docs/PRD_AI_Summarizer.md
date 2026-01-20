# AI Summarizer - Product Requirements Document

**Document Version:** 1.0
**Last Updated:** January 20, 2026
**Status:** Draft
**Author:** Product Team

---

## Executive Summary

The AI Summarizer is Sevaro's intelligent data synthesis feature that transforms lengthy patient histories, previous notes, lab results, and imaging reports into concise, actionable summaries. This feature enables providers to quickly understand a patient's clinical picture without reading through years of documentation.

---

## Problem Statement

### Current Pain Points

| Pain Point | Impact |
|------------|--------|
| **Information Overload** | Patients may have 50+ prior visits, hundreds of lab results |
| **Time Constraints** | Providers have 15-20 minutes per visit, can't read everything |
| **Scattered Data** | Critical information buried across multiple note types |
| **Context Switching** | Jumping between systems to piece together patient story |
| **Missed Information** | Important details overlooked due to volume |

### Provider Needs

- "Give me the 2-minute version of this patient's history"
- "What's changed since their last visit?"
- "Summarize their medication trials and responses"
- "What do I need to know before walking into this room?"

---

## Solution Overview

AI Summarizer provides intelligent, context-aware summaries of patient data:

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI SUMMARIZER CAPABILITIES                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📋 CHART PREP          Comprehensive pre-visit summary         │
│                         Key diagnoses, recent changes, alerts   │
│                                                                 │
│  📝 NOTE SUMMARY        Condense any prior visit note           │
│                         Extract key findings and decisions      │
│                                                                 │
│  🔬 LAB TRENDS          Summarize lab patterns over time        │
│                         Flag abnormals and significant changes  │
│                                                                 │
│  🖼️ IMAGING DIGEST      Key findings from imaging reports       │
│                         Compare to prior studies                │
│                                                                 │
│  💊 MED HISTORY         Treatment trials and responses          │
│                         What worked, what didn't, why stopped   │
│                                                                 │
│  📊 TIMELINE VIEW       Chronological event summary             │
│                         Hospitalizations, procedures, changes   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Feature Specifications

### 1. Chart Prep Summary

**Purpose:** Pre-visit preparation with comprehensive patient overview

**Trigger Points:**
- Manual: Click "Chart Prep" in AI Tools launcher
- Automatic: Generate when provider opens patient chart (configurable)
- Scheduled: Pre-generate for next day's appointments

**Output Structure:**

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 Chart Prep: Test Test, 50M                        [Refresh] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🎯 VISIT PURPOSE                                               │
│  Follow-up: Chronic migraine management                         │
│  Last seen: 3 months ago                                        │
│                                                                 │
│  ⚠️ ALERTS                                                      │
│  • Drug interaction: topiramate + [new med from pharmacy fill]  │
│  • Overdue: MoCA screening (last 18 months ago)                 │
│  • Lab needed: CBC for topiramate monitoring                    │
│                                                                 │
│  📊 KEY METRICS                                                 │
│  • MIDAS: 42 → 28 → 18 (improving trend)                        │
│  • Headache days/month: 18 → 12 → 8                             │
│  • PHQ-9: 12 (moderate, stable)                                 │
│                                                                 │
│  💊 CURRENT TREATMENT                                           │
│  • Topiramate 100mg BID (since 6mo, tolerating well)            │
│  • Sumatriptan 100mg PRN (using 4-5x/month)                     │
│  • Magnesium 400mg daily                                        │
│                                                                 │
│  📝 LAST VISIT SUMMARY (Oct 2025)                               │
│  Migraine frequency improved from 12 to 8 days/month on         │
│  topiramate. Discussed adding CGRP if plateau. Continue         │
│  current regimen. Patient interested in Botox if needed.        │
│                                                                 │
│  🔮 SUGGESTED FOCUS                                             │
│  • Assess if topiramate efficacy maintained                     │
│  • Discuss CGRP options given continued frequency               │
│  • Complete overdue MoCA screening                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Data Sources:**
- Problem list (active diagnoses)
- Medication list (current + recent changes)
- Last 3-5 visit notes
- Recent labs and imaging
- Clinical scale scores
- Scheduled visit reason

### 2. Visit Note Summarizer

**Purpose:** Condense any prior visit note into key points

**Input:** Any clinical note (progress note, consult, H&P, discharge summary)

**Output Structure:**

```
┌─────────────────────────────────────────────────────────────────┐
│  📝 Note Summary                                    [Copy] [×]  │
│  Progress Note - October 15, 2025                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CHIEF COMPLAINT                                                │
│  Migraine follow-up, improved on topiramate                     │
│                                                                 │
│  KEY FINDINGS                                                   │
│  • Headache frequency: 12 → 8 days/month                        │
│  • Medication tolerability: Good, mild word-finding issues      │
│  • Functional status: Returned to full work schedule            │
│  • MIDAS score: 28 (moderate disability, improved from 42)      │
│                                                                 │
│  ASSESSMENT                                                     │
│  Chronic migraine, improving on topiramate                      │
│                                                                 │
│  PLAN CHANGES                                                   │
│  • Continue topiramate 100mg BID                                │
│  • Added: Magnesium 400mg daily                                 │
│  • If plateau: Consider adding CGRP inhibitor                   │
│  • Follow-up: 3 months                                          │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  [View Full Note]  [Summarize Another]                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Customization:**
- Summary length: Brief (3-5 bullets) | Standard | Detailed
- Focus area: All | Assessment only | Plan only | Meds only
- Include quotes: Toggle to include key patient statements

### 3. Lab Trend Analyzer

**Purpose:** Summarize laboratory patterns over time

**Output:**

```
┌─────────────────────────────────────────────────────────────────┐
│  🔬 Lab Trends Summary                             [12 months]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ⚠️ ATTENTION NEEDED                                            │
│  • Sodium: Trending down (140 → 137 → 134) - monitor            │
│  • Bicarb: Low (18) - consider topiramate effect                │
│                                                                 │
│  ✅ STABLE/NORMAL                                               │
│  • CBC: All values within normal limits, stable                 │
│  • LFTs: Normal throughout monitoring period                    │
│  • Renal function: Stable, eGFR >90                             │
│                                                                 │
│  📈 IMPROVING                                                   │
│  • Vitamin D: 22 → 38 (now normal with supplementation)         │
│                                                                 │
│  📊 MONITORING FOR                                              │
│  • Topiramate: Bicarb, kidney stones risk                       │
│  • Baseline: TSH annual (normal 2.1, last checked 8mo ago)      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4. Imaging Summary

**Purpose:** Extract key findings from imaging reports

**Output:**

```
┌─────────────────────────────────────────────────────────────────┐
│  🖼️ Imaging Summary                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  MRI BRAIN W/WO CONTRAST (Jan 2025)                             │
│  ─────────────────────────────────────────────────────────────  │
│  Key Findings:                                                  │
│  • No acute intracranial abnormality                            │
│  • 2 nonspecific T2 hyperintensities (unchanged from 2023)      │
│  • No mass, hemorrhage, or hydrocephalus                        │
│                                                                 │
│  Impression: Normal study, stable from prior                    │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  CT HEAD W/O CONTRAST (Mar 2023)                                │
│  ─────────────────────────────────────────────────────────────  │
│  Key Findings:                                                  │
│  • No acute findings                                            │
│  • Ordered for: New-onset headache evaluation                   │
│                                                                 │
│  COMPARISON NOTE                                                │
│  MRI (2025) vs CT (2023): No interval changes, nonspecific      │
│  white matter findings stable.                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5. Medication History Summary

**Purpose:** Track medication trials, responses, and reasons for discontinuation

**Output:**

```
┌─────────────────────────────────────────────────────────────────┐
│  💊 Medication History: Migraine Preventives                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✅ CURRENT                                                     │
│  • Topiramate 100mg BID                                         │
│    Started: Jul 2025 | Response: Good (50% reduction)           │
│    Side effects: Mild word-finding, tolerable                   │
│                                                                 │
│  ❌ DISCONTINUED                                                │
│  ─────────────────────────────────────────────────────────────  │
│  • Propranolol 40mg BID (Jan-Apr 2025)                          │
│    Response: Partial (30% reduction)                            │
│    Stopped: Fatigue, bradycardia                                │
│                                                                 │
│  • Amitriptyline 25mg QHS (Aug-Dec 2024)                        │
│    Response: Minimal                                            │
│    Stopped: Weight gain, morning grogginess                     │
│                                                                 │
│  • Valproate 500mg BID (Mar-Jul 2024)                           │
│    Response: Good initially                                     │
│    Stopped: Weight gain, planning pregnancy                     │
│                                                                 │
│  🔮 NOT YET TRIED                                               │
│  • CGRP inhibitors (erenumab, fremanezumab, galcanezumab)       │
│  • OnabotulinumtoxinA (Botox)                                   │
│  • Venlafaxine, candesartan                                     │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  💡 AI INSIGHT                                                  │
│  Patient has tried 4 oral preventives with varying success.     │
│  Consider CGRP inhibitor as next step given good topiramate     │
│  response but continued breakthrough headaches.                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6. Timeline Summary

**Purpose:** Chronological overview of significant clinical events

**Output:**

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Clinical Timeline: Last 2 Years                   [Filter]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  2026                                                           │
│  ────                                                           │
│  Jan    Today's visit - Migraine follow-up                      │
│                                                                 │
│  2025                                                           │
│  ────                                                           │
│  Oct    Neurology f/u - MIDAS improved to 28                    │
│  Jul    Started topiramate 50mg, titrated to 100mg BID          │
│  Jul    Neurology f/u - Propranolol failed, switch planned      │
│  Apr    Stopped propranolol (fatigue, bradycardia)              │
│  Jan    MRI brain - Normal                                      │
│  Jan    Started propranolol 40mg BID                            │
│                                                                 │
│  2024                                                           │
│  ────                                                           │
│  Dec    Stopped amitriptyline (weight gain)                     │
│  Aug    Started amitriptyline 25mg                              │
│  Jul    Stopped valproate (weight, pregnancy planning)          │
│  Jun    ⚠️ ED visit - Status migrainosus, IV fluids/Reglan      │
│  Mar    Started valproate 500mg BID                             │
│  Feb    Initial neurology consult - Chronic migraine dx         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Access Points

| Location | Trigger | Summary Type |
|----------|---------|--------------|
| **AI Tools Launcher** | Click ⭐ → "Chart Prep" | Full chart prep summary |
| **Prior Visit Card** | Click "Summarize" on any visit | Single note summary |
| **Labs Section** | Click "Summarize Trends" | Lab trend analysis |
| **Imaging Section** | Click "Summarize" | Imaging digest |
| **Medication List** | Click "Med History" | Medication trial summary |
| **Sidebar Timeline** | Click "View Timeline" | Chronological summary |
| **Text Selection** | Select text → "Summarize" | Selection summary |
| **Keyboard Shortcut** | `Cmd+Shift+S` | Context-aware summary |

---

## Technical Architecture

### Summarization Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUMMARIZATION PIPELINE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. DATA COLLECTION                                             │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ • Query relevant data based on summary type          │     │
│     │ • Apply date range filters                           │     │
│     │ • Include related context (diagnoses, meds, etc.)    │     │
│     └─────────────────────────────────────────────────────┘     │
│                              │                                  │
│                              ▼                                  │
│  2. PRE-PROCESSING                                              │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ • Structure unstructured data                        │     │
│     │ • Extract key entities (meds, diagnoses, dates)      │     │
│     │ • Normalize terminology                              │     │
│     └─────────────────────────────────────────────────────┘     │
│                              │                                  │
│                              ▼                                  │
│  3. AI SUMMARIZATION                                            │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ • Apply specialty-specific prompt template           │     │
│     │ • Generate structured summary                        │     │
│     │ • Extract insights and recommendations               │     │
│     └─────────────────────────────────────────────────────┘     │
│                              │                                  │
│                              ▼                                  │
│  4. POST-PROCESSING                                             │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ • Validate medical accuracy                          │     │
│     │ • Apply confidence scoring                           │     │
│     │ • Format for display                                 │     │
│     └─────────────────────────────────────────────────────┘     │
│                              │                                  │
│                              ▼                                  │
│  5. DELIVERY                                                    │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ • Display in UI with source links                    │     │
│     │ • Cache for session                                  │     │
│     │ • Enable export/copy                                 │     │
│     └─────────────────────────────────────────────────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Prompt Engineering Approach

**Core Principles:**

1. **Specialty Context**
   - Include neurology-specific terminology
   - Prioritize relevant clinical information
   - Understand common conditions and treatments

2. **Structured Output**
   - Consistent formatting across summaries
   - Clear section headers
   - Actionable bullet points

3. **Source Traceability**
   - Link summaries back to source data
   - Include dates and document types
   - Enable verification

**Example Prompt Template (Chart Prep):**

```
You are a clinical summarization assistant for neurology.

Generate a pre-visit summary for the following patient data.

PATIENT CONTEXT:
- Name: {patient_name}
- Age/Sex: {age}{sex}
- Primary diagnoses: {diagnoses}
- Current medications: {medications}
- Visit reason: {visit_reason}

RECENT VISIT NOTES:
{last_3_notes}

RECENT LABS:
{recent_labs}

CLINICAL SCORES:
{scale_scores}

OUTPUT FORMAT:
1. VISIT PURPOSE (1 sentence)
2. ALERTS (urgent items, overdue screenings, interactions)
3. KEY METRICS (relevant scores with trends)
4. CURRENT TREATMENT (medications with duration and response)
5. LAST VISIT SUMMARY (3-4 sentences)
6. SUGGESTED FOCUS (2-3 items for this visit)

Guidelines:
- Be concise but comprehensive
- Highlight changes and trends
- Flag anything requiring attention
- Use neurology-specific terminology appropriately
- Do not make up information not present in the data
```

### Data Sources Integration

| Data Type | Source | Update Frequency |
|-----------|--------|------------------|
| Visit Notes | EHR Notes Module | Real-time |
| Lab Results | Lab Interface | Real-time |
| Imaging Reports | PACS Integration | Real-time |
| Medications | Pharmacy/eRx | Real-time |
| Problem List | EHR Problem List | Real-time |
| Clinical Scales | Sevaro Scales Module | Real-time |
| Vitals | EHR Vitals | Real-time |

---

## User Experience

### Summary Panel UI

```
┌─────────────────────────────────────────────────────────────────┐
│  AI Summary                                    ✕ Close          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Type: [Chart Prep ▼]   Range: [Last 12 months ▼]   [Refresh]  │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  [Summary content displays here]                                │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  🟢 High Confidence                              Generated: Now │
│                                                                 │
│  [Copy Summary]  [Insert into Note]  [View Sources]             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Actions on Summaries

| Action | Description |
|--------|-------------|
| **Copy Summary** | Copy formatted text to clipboard |
| **Insert into Note** | Add to current note section |
| **View Sources** | Show linked source documents |
| **Edit/Refine** | Modify summary parameters and regenerate |
| **Save to Patient** | Store summary in patient record |
| **Export** | Download as PDF or text |

### Confidence Indicators

| Level | Badge | Meaning |
|-------|-------|---------|
| High | 🟢 Green | Sufficient data, high-quality sources |
| Medium | 🟡 Yellow | Some gaps in data or ambiguous information |
| Low | 🔴 Red | Limited data, recommend reviewing sources |

---

## Configuration Options

### Provider Settings

```
┌─────────────────────────────────────────────────────────────────┐
│  AI Summarizer Settings                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  DEFAULT SUMMARY LENGTH                                         │
│  ○ Brief (3-5 key points)                                       │
│  ● Standard (comprehensive sections)                            │
│  ○ Detailed (full analysis)                                     │
│                                                                 │
│  AUTO-GENERATE CHART PREP                                       │
│  [✓] Generate when opening patient chart                        │
│  [✓] Pre-generate for scheduled appointments                    │
│                                                                 │
│  DEFAULT TIME RANGE                                             │
│  [Last 12 months          ▼]                                    │
│                                                                 │
│  INCLUDE IN CHART PREP                                          │
│  [✓] Alerts and warnings                                        │
│  [✓] Clinical scale trends                                      │
│  [✓] Medication history                                         │
│  [✓] Lab trends                                                 │
│  [✓] Imaging summary                                            │
│  [ ] Full visit note excerpts                                   │
│                                                                 │
│  SPECIALTY FOCUS                                                │
│  [Neurology - General     ▼]                                    │
│  Options: Headache, Movement Disorders, MS, Epilepsy, etc.      │
│                                                                 │
│                                        [Save] [Reset to Default]│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Specialty-Specific Templates

| Specialty | Prioritized Content |
|-----------|---------------------|
| **Headache** | MIDAS/HIT-6 trends, preventive trials, acute med usage |
| **Movement Disorders** | UPDRS scores, DBS settings, motor complications |
| **MS** | EDSS progression, MRI activity, DMT history, relapses |
| **Epilepsy** | Seizure frequency, AED levels, EEG findings |
| **Neuromuscular** | Strength changes, EMG results, respiratory function |
| **Cognitive** | MoCA/MMSE trends, functional status, caregiver input |

---

## Integration with Other Features

### AI Scribe Connection

When AI Scribe is active:
- Chart Prep summary can auto-display before visit
- Scribe can reference summary for context
- Summary insights inform AI recommendations

### AI Researcher Connection

Summaries can trigger research queries:
- "What are options for this patient's refractory migraines?"
- Patient context from summary sent to Vera Health
- Evidence-based recommendations returned

### Plan Builder Connection

Summary insights inform plan suggestions:
- Overdue screenings → add to plan
- Medication suggestions → pre-populate options
- Follow-up intervals → smart scheduling

---

## Performance Requirements

| Metric | Target |
|--------|--------|
| Chart Prep generation | <5 seconds |
| Single note summary | <3 seconds |
| Lab trend analysis | <3 seconds |
| Pre-generation for schedule | Complete 30min before clinic |
| Accuracy (validated sample) | >95% factual accuracy |

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Insufficient data | Display partial summary with "Limited data" notice |
| AI timeout | Show cached summary if available, offer retry |
| Conflicting information | Flag discrepancies for provider review |
| Missing time range | Default to last 12 months, allow adjustment |
| Source unavailable | Exclude from summary, note limitation |

---

## Privacy & Compliance

### Data Handling

- Summaries generated in-session, not stored by AI
- Source data references maintained for audit
- No PHI transmitted to external systems beyond approved integrations
- Audit log of summary generation and access

### Provider Responsibility

- Summaries are aids, not replacements for chart review
- Provider must verify critical information
- Document reliance on AI summary in workflow

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Chart prep usage | >80% of visits |
| Time saved per visit | >3 minutes |
| Provider satisfaction | >4.2/5.0 |
| Accuracy rating | >4.5/5.0 |
| "Insert into note" rate | >40% |

---

## Future Enhancements

### Phase 2

- Voice-activated summary requests ("Summarize their headache history")
- Comparison summaries (this visit vs. last visit)
- Patient-facing summaries (simplified language)
- Multi-patient summaries for panel management

### Phase 3

- Predictive insights ("Based on trajectory, consider...")
- Population health summaries
- Research cohort identification
- Quality measure gap detection

---

## Changelog

**v1.0 (January 20, 2026)**
- Initial document creation
- Core summary types defined
- Technical architecture specified
- Provider settings outlined

---

*Document maintained by Sevaro Product Team*
