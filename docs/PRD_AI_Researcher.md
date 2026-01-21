# AI Researcher - Product Requirements Document

**Document Version:** 1.0
**Last Updated:** January 20, 2026
**Status:** Draft
**Author:** Product Team
**Integration Partner:** Vera Health

---

## Executive Summary

The AI Researcher is Sevaro's clinical decision support feature that enables providers to ask clinical questions and receive evidence-based answers with citations. This feature is powered by **Vera Health**, an AI-powered clinical decision support platform that searches 60M+ peer-reviewed papers and guidelines.

Sevaro integrates with Vera Health via their API - we send patient context and clinical questions, and receive evidence-based recommendations with source citations.

---

## Vera Health Overview

### What is Vera Health?

[Vera Health](https://www.verahealth.ai/home) is an AI-powered Clinical Decision Support (CDS) platform providing healthcare professionals with immediate, evidence-based medical knowledge at the point of care.

### Key Capabilities

| Capability | Description |
|------------|-------------|
| **Evidence Search** | Searches 60M+ peer-reviewed papers, guidelines, and care pathways |
| **Source Citations** | Every answer linked to original sources for verification |
| **Evidence Grading** | Applies transparent evidence-grading logic similar to guideline methodologists |
| **HIPAA Compliant** | Safe for clinical use with patient context |
| **CME Credits** | +0.5 CME credits per clinical query |
| **Voice-Enabled** | Voice agent for hands-free queries (won 1st place at OpenAI Competition Dec 2024) |

### Performance & Accuracy

| Benchmark | Vera Health Score | Notes |
|-----------|-------------------|-------|
| **USMLE** | 97.5% | Surpasses OpenAI, Google, Anthropic |
| **NEJM Q&A** | 84.9% | Top-performing |
| **MedXpertQA** | 62.2% | Leading benchmark |

### Institutional Adoption

Used by clinicians at:
- Mayo Clinic
- University of Pennsylvania
- Yale
- 10,000+ healthcare professionals across the US

### Technical Infrastructure

- **Backend:** ZeroEntropy Retrieval API
- **Real-time:** Instant search and retrieval
- **Compliance:** HIPAA compliant, BAA available

---

## Integration Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEVARO → VERA HEALTH                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PROVIDER ACTION                                                │
│  ───────────────                                                │
│  Clicks "Ask AI" or types clinical question                     │
│                              │                                  │
│                              ▼                                  │
│  SEVARO PACKAGES REQUEST                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ {                                                        │   │
│  │   "query": "What is first-line treatment for...",        │   │
│  │   "patient_context": {                                   │   │
│  │     "age": 50, "sex": "male",                            │   │
│  │     "diagnoses": ["G43.909"],                            │   │
│  │     "medications": ["topiramate 50mg BID"],              │   │
│  │     "allergies": ["sulfa"]                               │   │
│  │   },                                                     │   │
│  │   "specialty": "neurology"                               │   │
│  │ }                                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────┐                          │
│                    │  VERA HEALTH    │                          │
│                    │  API            │                          │
│                    └─────────────────┘                          │
│                              │                                  │
│                              ▼                                  │
│  VERA RETURNS RESPONSE                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ {                                                        │   │
│  │   "answer": "Based on AAN guidelines...",                │   │
│  │   "citations": [                                         │   │
│  │     { "source": "Neurology 2021;96(3):e364",            │   │
│  │       "title": "AAN Guideline: Migraine Treatment",      │   │
│  │       "doi": "10.1212/WNL.0000000000011050" }            │   │
│  │   ],                                                     │   │
│  │   "evidence_grade": "A",                                 │   │
│  │   "cme_credit": 0.5                                      │   │
│  │ }                                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  SEVARO DISPLAYS TO PROVIDER                                    │
│  - Answer with formatting                                       │
│  - Clickable citations                                          │
│  - Evidence grade badge                                         │
│  - Option to insert into note                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### API Endpoints Used

| Endpoint | Purpose | When Used |
|----------|---------|-----------|
| `/query` | Clinical Q&A | "Ask AI" feature |
| `/plan` | Treatment plans | Plan Builder |
| `/guidelines` | Guideline lookup | "What do guidelines say..." |
| `/search` | Literature search | Deep research |

---

## Sevaro UI/UX

### Access Points

The AI Researcher can be accessed from multiple locations in Sevaro:

| Location | Trigger | Context Sent |
|----------|---------|--------------|
| **Global AI Launcher** | Click ⭐ → "Ask AI" | Full patient context |
| **Text Field Sparkle** | Click ✨ → "Ask AI" | Field content + patient context |
| **Keyboard Shortcut** | `Cmd+Shift+A` | Current patient context |
| **Voice Command** | "Hey Vera..." | Voice query + patient context |

### UI Mockup: Ask AI Panel

```
┌─────────────────────────────────────────────────────────────────┐
│  Ask AI                                               ✕ Close   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Patient Context (auto-populated)              [Edit Context]   │
│  ─────────────────────────────────────────────────────────────  │
│  Test Test, 50M | Chronic migraine (G43.909)                    │
│  Current meds: topiramate 50mg BID | Allergies: sulfa           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ What are the next treatment options for chronic          │   │
│  │ migraine after failing topiramate?                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                        [🎤 Voice] [Ask Vera →]  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🟢 Answer (Evidence Grade: A)                     +0.5 CME     │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Based on AAN guidelines, for patients with chronic migraine    │
│  who have inadequate response to oral preventives like          │
│  topiramate, the following options are recommended:             │
│                                                                 │
│  **First-line after oral failure:**                             │
│  1. CGRP monoclonal antibodies (erenumab, fremanezumab,         │
│     galcanezumab) - Evidence Grade A [1]                        │
│  2. OnabotulinumtoxinA (Botox) for chronic migraine             │
│     ≥15 days/month - Evidence Grade A [2]                       │
│                                                                 │
│  **Consider if CGRP contraindicated:**                          │
│  3. Combination therapy (e.g., add amitriptyline)               │
│  4. Greater occipital nerve block                               │
│                                                                 │
│  Given patient's sulfa allergy, all above options are safe.     │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  📚 Sources:                                                    │
│  [1] AAN Guideline: Acute and Preventive Treatment of Migraine  │
│      Neurology 2021;96(3):e364-e390                             │
│      [View Full Text] [Copy Citation]                           │
│                                                                 │
│  [2] PREEMPT Trial: OnabotulinumtoxinA for Chronic Migraine     │
│      Cephalalgia 2010;30(7):793-803                             │
│      [View Full Text] [Copy Citation]                           │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  [Insert into Note]  [Copy Answer]  [Ask Follow-up]             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Evidence Grade Badges

| Grade | Badge | Meaning |
|-------|-------|---------|
| A | 🟢 Green | Strong evidence from RCTs/meta-analyses |
| B | 🟡 Yellow | Moderate evidence |
| C | 🟠 Orange | Limited evidence / expert opinion |
| D | 🔴 Red | Conflicting or insufficient evidence |

### Actions on Results

| Action | Description |
|--------|-------------|
| **Insert into Note** | Adds answer text to current note section |
| **Copy Answer** | Copies to clipboard |
| **Copy Citation** | Copies formatted citation |
| **View Full Text** | Opens source in new tab |
| **Ask Follow-up** | Pre-fills follow-up question |
| **Save to Library** | Saves Q&A for future reference |

---

## Common Use Cases

### 1. Clinical Question During Visit

**Scenario:** Provider unsure about medication dosing

```
Provider: "What is the maximum dose of topiramate for migraine?"

Vera Response:
- Maximum: 200mg/day (100mg BID)
- Start: 25mg/day, titrate weekly
- Citation: AAN Guidelines 2021
```

### 2. Treatment Decision Support

**Scenario:** Patient failed multiple treatments

```
Provider: "Patient failed topiramate, propranolol, and amitriptyline
for chronic migraine. What's next?"

Vera Response:
- CGRP inhibitors (erenumab, etc.) - Grade A
- OnabotulinumtoxinA - Grade A
- Patient context considered: no contraindications
```

### 3. Guideline Lookup

**Scenario:** Need to verify guideline recommendations

```
Provider: "What do AAN guidelines say about MRI for new-onset
headache?"

Vera Response:
- Neuroimaging recommended for: [criteria listed]
- Not routinely recommended for: [criteria listed]
- Source: AAN Practice Guideline Summary
```

### 4. Drug Interaction Check

**Scenario:** Checking safety of combination

```
Provider: "Is it safe to combine topiramate with sumatriptan?"

Vera Response:
- Generally safe combination
- Monitor for: [specific concerns]
- No major interactions per [source]
```

---

## Integration with Other Features

### AI Scribe Connection

When AI Scribe captures a clinical question during the visit, it can:
1. Auto-trigger Vera lookup
2. Present answer to provider
3. Offer to add to note

### Plan Builder Connection

Vera Health powers the smart recommendations in Plan Builder:
- Diagnosis entered → Vera suggests evidence-based plan
- Recommendations include citations
- Provider selects/modifies before adding to note

### Recommendation Reconciliation

When both AI Scribe and Vera generate recommendations:
- System detects duplicates/conflicts
- Vera recommendations show evidence grade
- Provider reviews unified list

---

## Data Requirements

### Patient Context Sent to Vera

| Field | Required | Purpose |
|-------|----------|---------|
| Age | Yes | Dose adjustments, contraindications |
| Sex | Yes | Gender-specific recommendations |
| Diagnoses (ICD-10) | Yes | Context for question |
| Current Medications | Yes | Drug interactions, what's been tried |
| Allergies | Yes | Safety screening |
| Relevant History | No | Additional context |
| Specialty | Yes | Specialty-specific guidance |

### Data NOT Sent to Vera

| Field | Reason |
|-------|--------|
| Patient name | Not needed, privacy |
| MRN | Not needed, privacy |
| SSN | Not needed, privacy |
| Address | Not needed, privacy |
| Full note text | Send only relevant excerpts |

---

## CME Credit Tracking

### How It Works

1. Each qualifying query earns +0.5 CME credit
2. Vera tracks credits by provider
3. Sevaro displays cumulative credits in dashboard
4. Provider can export CME certificate

### CME Dashboard Widget

```
┌─────────────────────────────────────────┐
│  CME Credits (via Vera Health)          │
├─────────────────────────────────────────┤
│                                         │
│  This Month:     4.5 credits            │
│  Year to Date:   28.0 credits           │
│                                         │
│  [View Details] [Export Certificate]    │
│                                         │
└─────────────────────────────────────────┘
```

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Vera API timeout | Show "Searching..." for 5s, then offer retry |
| No results found | "No specific guidance found. Try rephrasing." |
| Low confidence answer | Display warning badge, suggest verification |
| Rate limit hit | Queue request, notify provider of delay |
| API unavailable | Show cached common answers, note freshness |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Queries per provider/day | >3 |
| Answer satisfaction | >4.0/5.0 |
| Insert-to-note rate | >30% |
| CME credits earned/month | >5 per provider |
| Time to answer | <3 seconds |

---

## References

- [Vera Health - Evidence-Based Clinical Answers](https://www.verahealth.ai/home)
- [Y Combinator - Vera Health](https://www.ycombinator.com/companies/vera-health)
- [ZeroEntropy Case Study](https://www.zeroentropy.dev/articles/how-vera-health-achieved-state-of-the-art-clinical-accuracy-using-zeroentropy)

---

## Changelog

**v1.0 (January 20, 2026)**
- Initial document creation
- Vera Health overview and capabilities
- Integration architecture
- UI/UX specifications
- CME credit tracking

---

*Document maintained by Sevaro Product Team*
