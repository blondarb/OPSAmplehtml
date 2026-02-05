# PRD: SDNE Integration

**Document Version:** 1.0.0
**Last Updated:** February 5, 2026
**Status:** Implemented (Phase 1)
**Related Project:** SDNE (Standardized Digital Neurologic Exam)

---

## 1. Overview

### 1.1 What is SDNE?

SDNE (Standardized Digital Neurologic Exam) is a VR-based neurologic screening system that runs on Samsung XR headsets with Galaxy Watch integration. It performs a 15-minute Core-15 exam covering:

- **Cognition** - Orientation, digit span, word recall
- **Oculomotor** - Saccades, smooth pursuit, vergence
- **Facial** - Facial activation and symmetry
- **Motor** - Rest tremor, postural tremor, finger tapping
- **Coordination** - Finger-to-nose, rapid alternating movements
- **Language** - Semantic fluency
- **Gait** - Timed Up and Go (TUG)

### 1.2 Integration Purpose

Display SDNE exam results within Sevaro Clinical's Physical Exams tab, enabling neurologists to:

- View objective, quantitative neurologic screening data
- Drill down from domain-level summaries to task-level metrics
- Track longitudinal changes across visits
- Review AI-detected clinical patterns

### 1.3 Reference Documentation

The full SDNE specification lives in a separate repository:

| Document | Path |
|----------|------|
| **SDNE EHR Integration PRD** | `/Users/stevearbogast/dev/repos/SDNE/docs/PRD_EHR_Integration.md` |
| SDNE Core-15 Specification | `/Users/stevearbogast/dev/repos/SDNE/docs/SDNE_Core15_Screening_Specification.md` |
| SDNE Reference Spec v2.2 | `/Users/stevearbogast/dev/repos/SDNE/docs/SDNE_Reference_Spec_v2_2.md` |

---

## 2. Feature Summary

### 2.1 Components Implemented

| Component | Description |
|-----------|-------------|
| `SDNEExamResultsPanel` | Accordion panel in Physical Exams tab |
| `SDNEDomainSummary` | 8-domain heatmap grid (clickable) |
| `SDNEDomainDetail` | Task-level detail view with metrics |
| `SDNEFlagChip` | Color-coded status badges (GREEN/YELLOW/RED) |
| `SDNEInterpretation` | AI-generated clinical interpretation |

### 2.2 User Interaction Flow

1. **View Panel** - SDNE accordion appears in Physical Exams tab
2. **Expand Panel** - Click to see domain summary grid
3. **Domain Drill-Down** - Click any domain to see task details
4. **Task Expansion** - Click task to see metrics and clinical observations
5. **Historical Comparison** - Select prior exam dates (if available)

### 2.3 Flag Color System

| Flag | Meaning | Use Case |
|------|---------|----------|
| 🟢 GREEN | Normal | Within normal limits |
| 🟡 YELLOW | Borderline | Mild abnormality, monitor |
| 🔴 RED | Abnormal | Significant finding, investigate |
| ⚫ GRAY | Invalid/Skipped | Data quality issue or task not performed |

---

## 3. File Structure

```
src/
├── components/sdne/
│   ├── index.ts                    # Component exports
│   ├── SDNEExamResultsPanel.tsx    # Main accordion panel
│   ├── SDNEDomainSummary.tsx       # 8-domain heatmap
│   ├── SDNEDomainDetail.tsx        # Task detail view
│   ├── SDNEFlagChip.tsx            # Status badge
│   └── SDNEInterpretation.tsx      # Clinical text
├── lib/
│   ├── sdneTypes.ts                # TypeScript interfaces
│   └── sdneSampleData.ts           # Demo data profiles
```

---

## 4. Sample Patient Profiles

| Patient | MRN | Diagnosis | SDNE Profile |
|---------|-----|-----------|--------------|
| Maria Santos | 2024-00142 | Migraine | Normal (all GREEN) |
| Robert Chen | 2024-00089 | MS | Oculomotor/Coordination abnormal |
| James Morrison | 2024-00315 | Parkinson's | Motor RED, Gait/Facial YELLOW |
| Eleanor Wright | 2024-00201 | Essential Tremor | Motor YELLOW only |
| David Kim | 2024-00178 | Stroke | Asymmetric motor findings |

---

## 5. Integration Point

The SDNE panel is rendered in `CenterPanel.tsx` within the Physical Exams tab:

```tsx
{/* Digital Neurologic Exam Section */}
<div style={{ marginTop: '24px' }}>
  <h3>Digital Neurologic Exam</h3>
  <p>SDNE Core-15 VR screening results</p>
  <SDNEExamResultsPanel
    patientMrn={patient?.mrn}
    chiefComplaints={chiefComplaints}
    consultCategories={consultCategories}
  />
</div>
```

---

## 6. Future Roadmap

### Phase 2
- [ ] Real API integration (replace sample data with live SDNE backend)
- [ ] "Import to Note" functionality
- [ ] WebSocket for in-progress exam status

### Phase 3
- [ ] Video playback of tasks
- [ ] Historical comparison view
- [ ] FHIR DiagnosticReport mapping

---

## 7. Related Commits

| Date | Commit | Description |
|------|--------|-------------|
| Feb 3, 2026 | `764197f` | Initial SDNE panel integration |
| Feb 5, 2026 | `b8c685b` | Fix hydration error (fixed dates) |
| Feb 5, 2026 | `bfc2eaa` | Add domain deep-dive functionality |

---

## 8. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | Feb 5, 2026 | Claude | Initial PRD |
