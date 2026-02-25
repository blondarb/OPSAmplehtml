# Demo Referral Library — Design Document

**Date:** 2026-02-24
**Status:** Approved (revised)

## Problem

The triage page has a "Load Sample" dropdown with 11 short text snippets, but no way to demo with realistic PDF referral notes. Demonstrators must have PDFs on their local machine to use the upload feature. We need a built-in library of demo PDFs that showcases single-file triage, batch processing, multi-document patient packets, and cross-specialty referral handling.

## Decisions

| Decision | Choice |
|----------|--------|
| Placement | "Try a Demo" button alongside existing "Load Sample" button |
| Organization | Three category tabs: Outpatient (10), Cross-Specialty (12), Packets (4) |
| Preview | Full modal with pre-extracted PDF text content |
| File storage | Real PDFs in `public/samples/triage/` |
| Packet loading | "Load into Triage" loads all docs in a packet (or single file for standalone) |
| Existing samples | Keep SampleNoteLoader for quick text-based demos |

## Scenario Inventory

### Outpatient Referrals (10 scenarios, 1 file each)
PCP/NP referral notes with embedded neuro findings.

| # | Patient | Age/Sex | Specialty | Neuro Finding | Expected Tier |
|---|---------|---------|-----------|---------------|---------------|
| 01 | Jennings, Harold | 74M | Family NP | Early Parkinsonism (resting tremor, bradykinesia) | Routine-priority |
| 02 | Gutierrez, Maria | 37F | Internal Med | Chronic migraine transformation / medication overuse | Routine-priority |
| 03 | Patterson, Thomas | 63M | Family Med | Diabetic peripheral neuropathy (progressive) | Routine |
| 04 | Williams, Deshawn | 30M | Urgent Care PA | First witnessed GTC seizure | Urgent |
| 05 | Hargrove, Linda | 67F | Family NP | Progressive L5 radiculopathy with foot drop | Urgent |
| 06 | Caldwell, Dorothy | 85F | Geriatrician | Progressive dementia (MoCA 18/30) | Routine-priority |
| 07 | Kowalski, Brittany | 32F | Family Med | Suspected MS (optic neuritis + UMN signs) | Urgent |
| 08 | Sandoval, Richard | 70M | Family DO | Essential tremor (action tremor, family hx) | Routine |
| 09 | Washington, Eugene | 72M | Internal Med | TIA while off anticoagulation (AFib) | Urgent |
| 10 | Delgado, Rosa | 55F | Family NP | Cervical myelopathy + bilateral CTS | Urgent |

### Cross-Specialty Referrals (12 scenarios, 1 file each)
Other specialists recognizing neuro issues — from ortho, psych, cardiology, ENT, etc.

| # | Patient | Age/Sex | Specialty | Neuro Finding | Expected Tier |
|---|---------|---------|-----------|---------------|---------------|
| 01 | Thornton, James | 68M | Orthopedics | Cervical myelopathy (incidental on shoulder MRI) | Urgent |
| 02 | Vasquez, Isabel | 34F | Psychiatry | Suspected PNES / functional neuro disorder | Semi-urgent |
| 03 | McAllister, Robert | 67M | Cardiology | Cardiac-negative syncope | Semi-urgent |
| 04 | Patel, Anita | 60F | ENT | Central vertigo concern (facial weakness, dysmetria) | Urgent |
| 05 | Kowalczyk, Stefan | 51M | Occ Med | Toxic neuropathy (solvent exposure) | Routine-priority |
| 06 | Barnes, Christine | 56F | Pain Mgmt | CRPS spreading + new contralateral symptoms | Semi-urgent |
| 07 | Reynolds, Danielle | 32F | OB/GYN | Postpartum neuro symptoms (UMN signs) | Urgent |
| 08 | Fletcher, George | 73M | Urgent Care PA | NPH (Hakim triad + ventriculomegaly on CT) | Urgent |
| 09 | Kim, Jennifer | 24F | Sports Med | Prolonged post-concussion syndrome | Routine-priority |
| 10 | Okafor, Emmanuel | 49M | Rheumatology | CNS lupus (white matter lesions, cognitive changes) | Urgent |
| 11 | Petrov, Nina | 41F | Ophthalmology | IIH / papilledema (bilateral, BMI 34) | Urgent |
| 12 | Wei, Liang | 51M | Emergency Dept | SAH with 7mm AComm aneurysm | Emergent |

### Diagnostic Packets (4 scenarios, 4-5 files each)
Multi-document patient cases with imaging, labs, and clinical notes.

| Patient | Age/Sex | Diagnosis | Files | Expected Tier |
|---------|---------|-----------|-------|---------------|
| Donnelly, Frank | 75M | Acute ischemic stroke / TIA | 5 (Cardio note, MRI, Carotid duplex, Echo, Hypercoag labs) | Urgent |
| Jimenez, Marta | 67F | Hepatic encephalopathy (not primary neuro) | 4 (ED note, CT head, Labs, EEG) | Non-urgent / redirect |
| Nakamura, Eleanor | 31F | Multiple sclerosis (full workup) | 5 (PCP referral, MRI brain, MRI spine, VEP, CSF) | Urgent |
| Reyes, Carlos | 37M | First unprovoked seizure | 4 (ED note, CT head, Labs, EEG) | Urgent |

## File Structure

```
public/samples/triage/
├── outpatient/
│   ├── 01_Jennings_Harold.pdf
│   ├── 02_Gutierrez_Maria.pdf
│   └── ... (10 files)
├── cross-specialty/
│   ├── 01_Thornton_James.pdf
│   ├── 02_Vasquez_Isabel.pdf
│   └── ... (12 files)
└── packets/
    ├── donnelly-frank/
    │   ├── 01_Cardiology_Note.pdf
    │   ├── 02_MRI_Brain_DWI_Report.pdf
    │   ├── 03_Carotid_Duplex_Report.pdf
    │   ├── 04_Echocardiogram_Report.pdf
    │   └── 05_Hypercoagulability_Labs.pdf
    ├── jimenez-marta/
    │   ├── 01_ED_Note.pdf
    │   ├── 02_CT_Head_Report.pdf
    │   ├── 03_Comprehensive_Labs.pdf
    │   └── 04_EEG_Report.pdf
    ├── nakamura-eleanor/
    │   ├── 01_PCP_Referral.pdf
    │   ├── 02_MRI_Brain_Report.pdf
    │   ├── 03_MRI_Cervical_Thoracic_Spine_Report.pdf
    │   ├── 04_VEP_Report.pdf
    │   └── 05_CSF_LP_Results.pdf
    └── reyes-carlos/
        ├── 01_ED_Note.pdf
        ├── 02_CT_Head_Report.pdf
        ├── 03_Lab_Results.pdf
        └── 04_EEG_Report.pdf
```

Total: 36 PDF files, ~180KB

## Data Model

New file: `src/lib/triage/demoScenarios.ts`

```typescript
interface DemoScenarioFile {
  filename: string
  path: string           // relative to public/, e.g. '/samples/triage/outpatient/01_Jennings_Harold.pdf'
  docType: string        // e.g. 'PCP Referral', 'MRI Brain Report', 'EEG Report'
  previewText: string    // pre-extracted full text from PDF
}

interface DemoScenario {
  id: string
  patientName: string
  age: number
  sex: 'M' | 'F'
  category: 'outpatient' | 'cross_specialty' | 'packet'
  referringSpecialty: string
  briefDescription: string       // 1-2 sentences
  clinicalHighlight: string      // the key neuro finding
  expectedTier: TriageTier
  files: DemoScenarioFile[]
  demoPoints: string[]           // e.g. ["Multi-note fusion", "Non-neuro redirect"]
}
```

Preview text is pre-extracted from PDFs at development time (via pdftotext). No runtime PDF parsing needed for preview.

## Component Architecture

### DemoScenarioLoader (new)
`src/components/triage/DemoScenarioLoader.tsx`

- "Try a Demo" button with amber accent, positioned next to existing "Load Sample"
- Opens a dropdown panel (~480px wide, max 500px tall)
- Three category tabs: "Outpatient (10)", "Cross-Specialty (12)", "Packets (4)"
- Each row: tier badge | patient name (age, sex) | referring specialty | brief description
- Packet rows show file count chip (e.g., "5 files")
- Clicking a row opens the preview modal

### DemoPreviewModal (new)
`src/components/triage/DemoPreviewModal.tsx`

- Centered overlay modal, ~700px wide, max 80vh tall
- Dark theme matching triage page (#0f172a)
- Header: patient name, age/sex, referring specialty, expected tier badge
- Demo points shown as small tags
- Scrollable content showing full pre-extracted text of each file
  - Single-file scenarios: full text displayed directly
  - Packets: stacked sections with file name headers, all expanded by default
- Sticky footer: "Load into Triage" (amber button) + "Close" (ghost button)

### TriageInputPanel (modified)
- Add DemoScenarioLoader alongside SampleNoteLoader in the header row
- When "Load into Triage" fires: fetch PDFs from public/, create File objects, switch to Upload mode, populate file list
- User clicks "Extract & Triage" to run (not auto-submitted)

## Loading Flow

1. User clicks "Try a Demo" → browses categorized scenarios
2. Clicks a scenario → full modal preview with pre-extracted text
3. Clicks "Load into Triage" → modal closes
4. PDFs fetched from public/ as blobs, converted to File objects
5. Input mode switches to "Upload", files appear in FileUploadZone
6. User clicks "Extract & Triage" to run the pipeline

## Scope Exclusions

- No runtime PDF text extraction for previews (pre-extracted in data file)
- No PDF viewer/renderer in browser
- No changes to triage AI logic
- No Supabase storage — all static files in public/
- Existing SampleNoteLoader preserved as-is
