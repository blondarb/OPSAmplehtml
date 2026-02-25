# Demo Referral Library Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Try a Demo" button to the triage page that lets users browse, preview, and load prebuilt PDF referral scenarios into the triage pipeline.

**Architecture:** Real PDF files served from `public/samples/triage/`. A TypeScript manifest (`demoScenarios.ts`) holds scenario metadata and pre-extracted text for instant preview. Two new components: `DemoScenarioLoader` (categorized dropdown picker) and `DemoPreviewModal` (full-text preview modal). Files load into the existing FileUploadZone → Extract & Triage pipeline.

**Tech Stack:** Next.js, React, TypeScript, inline styles (matching existing triage components)

**Design doc:** `docs/plans/2026-02-24-demo-referral-library-design.md`

---

### Task 1: Copy PDF Files to public/

Copy all 36 demo PDFs from Desktop into the project's `public/samples/triage/` directory with the structure defined in the design doc.

**Files:**
- Create: `public/samples/triage/outpatient/` (10 PDFs)
- Create: `public/samples/triage/cross-specialty/` (12 PDFs)
- Create: `public/samples/triage/packets/donnelly-frank/` (5 PDFs)
- Create: `public/samples/triage/packets/jimenez-marta/` (4 PDFs)
- Create: `public/samples/triage/packets/nakamura-eleanor/` (5 PDFs)
- Create: `public/samples/triage/packets/reyes-carlos/` (4 PDFs)

**Step 1: Create directory structure**

```bash
mkdir -p public/samples/triage/{outpatient,cross-specialty,packets/{donnelly-frank,jimenez-marta,nakamura-eleanor,reyes-carlos}}
```

**Step 2: Copy outpatient referrals (rename to cleaner filenames)**

```bash
cp ~/Desktop/neurology_referral_notes/01_Jennings_Harold_PrimaryCare_Referral.pdf public/samples/triage/outpatient/01_Jennings_Harold.pdf
cp ~/Desktop/neurology_referral_notes/02_Gutierrez_Maria_PrimaryCare_Referral.pdf public/samples/triage/outpatient/02_Gutierrez_Maria.pdf
cp ~/Desktop/neurology_referral_notes/03_Patterson_Thomas_PrimaryCare_Referral.pdf public/samples/triage/outpatient/03_Patterson_Thomas.pdf
cp ~/Desktop/neurology_referral_notes/04_Williams_Deshawn_UrgentCare_Referral.pdf public/samples/triage/outpatient/04_Williams_Deshawn.pdf
cp ~/Desktop/neurology_referral_notes/05_Hargrove_Linda_PrimaryCare_Referral.pdf public/samples/triage/outpatient/05_Hargrove_Linda.pdf
cp ~/Desktop/neurology_referral_notes/06_Caldwell_Dorothy_PrimaryCare_Referral.pdf public/samples/triage/outpatient/06_Caldwell_Dorothy.pdf
cp ~/Desktop/neurology_referral_notes/07_Kowalski_Brittany_PrimaryCare_Referral.pdf public/samples/triage/outpatient/07_Kowalski_Brittany.pdf
cp ~/Desktop/neurology_referral_notes/08_Sandoval_Richard_PrimaryCare_Referral.pdf public/samples/triage/outpatient/08_Sandoval_Richard.pdf
cp ~/Desktop/neurology_referral_notes/09_Washington_Eugene_PrimaryCare_Referral.pdf public/samples/triage/outpatient/09_Washington_Eugene.pdf
cp ~/Desktop/neurology_referral_notes/10_Delgado_Rosa_PrimaryCare_Referral.pdf public/samples/triage/outpatient/10_Delgado_Rosa.pdf
```

**Step 3: Copy cross-specialty referrals (rename to cleaner filenames)**

```bash
cp ~/Desktop/batch2/standalone/01_Thornton_James_Orthopedics_Referral.pdf public/samples/triage/cross-specialty/01_Thornton_James.pdf
cp ~/Desktop/batch2/standalone/02_Vasquez_Isabel_Psychiatry_Referral.pdf public/samples/triage/cross-specialty/02_Vasquez_Isabel.pdf
cp ~/Desktop/batch2/standalone/03_McAllister_Robert_Cardiology_Referral.pdf public/samples/triage/cross-specialty/03_McAllister_Robert.pdf
cp ~/Desktop/batch2/standalone/04_Patel_Anita_ENT_Referral.pdf public/samples/triage/cross-specialty/04_Patel_Anita.pdf
cp ~/Desktop/batch2/standalone/05_Kowalczyk_Stefan_OccMed_Referral.pdf public/samples/triage/cross-specialty/05_Kowalczyk_Stefan.pdf
cp ~/Desktop/batch2/standalone/06_Barnes_Christine_PainMgmt_Referral.pdf public/samples/triage/cross-specialty/06_Barnes_Christine.pdf
cp ~/Desktop/batch2/standalone/07_Reynolds_Danielle_OBGYN_Referral.pdf public/samples/triage/cross-specialty/07_Reynolds_Danielle.pdf
cp ~/Desktop/batch2/standalone/08_Fletcher_George_UrgentCare_Referral.pdf public/samples/triage/cross-specialty/08_Fletcher_George.pdf
cp ~/Desktop/batch2/standalone/09_Kim_Jennifer_SportsMed_Referral.pdf public/samples/triage/cross-specialty/09_Kim_Jennifer.pdf
cp ~/Desktop/batch2/standalone/10_Okafor_Emmanuel_Rheumatology_Referral.pdf public/samples/triage/cross-specialty/10_Okafor_Emmanuel.pdf
cp ~/Desktop/batch2/standalone/11_Petrov_Nina_Ophthalmology_Referral.pdf public/samples/triage/cross-specialty/11_Petrov_Nina.pdf
cp ~/Desktop/batch2/standalone/12_Wei_Liang_EmergencyDept_SAH.pdf public/samples/triage/cross-specialty/12_Wei_Liang.pdf
```

**Step 4: Copy patient packets (keep original filenames)**

```bash
cp ~/Desktop/batch2/patient_packets/Donnelly_Frank/*.pdf public/samples/triage/packets/donnelly-frank/
cp ~/Desktop/batch2/patient_packets/Jimenez_Marta/*.pdf public/samples/triage/packets/jimenez-marta/
cp ~/Desktop/batch2/patient_packets/Nakamura_Eleanor/*.pdf public/samples/triage/packets/nakamura-eleanor/
cp ~/Desktop/batch2/patient_packets/Reyes_Carlos/*.pdf public/samples/triage/packets/reyes-carlos/
```

**Step 5: Verify file count**

```bash
find public/samples/triage -name "*.pdf" | wc -l
# Expected: 36
```

**Step 6: Commit**

```bash
git add public/samples/triage/
git commit -m "feat: add 36 demo referral PDFs for triage demo library"
```

---

### Task 2: Build Demo Scenario Data Manifest

Create the TypeScript data file with all 26 scenario entries, each containing metadata and pre-extracted PDF text for preview.

**Files:**
- Create: `src/lib/triage/demoScenarios.ts`
- Modify: `src/lib/triage/types.ts` (add DemoScenario types)

**Step 1: Add types to `src/lib/triage/types.ts`**

Add after the existing `SampleNote` interface (~line 140):

```typescript
// Demo Scenario types
export type DemoCategory = 'outpatient' | 'cross_specialty' | 'packet'

export interface DemoScenarioFile {
  filename: string
  path: string           // relative path from public/, e.g. '/samples/triage/outpatient/01_Jennings_Harold.pdf'
  docType: string        // e.g. 'PCP Referral', 'MRI Brain Report'
  previewText: string    // pre-extracted full text from PDF
}

export interface DemoScenario {
  id: string
  patientName: string
  age: number
  sex: 'M' | 'F'
  category: DemoCategory
  referringSpecialty: string
  briefDescription: string
  clinicalHighlight: string
  expectedTier: TriageTier
  files: DemoScenarioFile[]
  demoPoints: string[]
}
```

**Step 2: Create `src/lib/triage/demoScenarios.ts`**

This file will contain the `DEMO_SCENARIOS` array with all 26 entries. Each entry includes the full pre-extracted PDF text in the `previewText` field.

To generate the preview text, extract from each PDF:
```bash
pdftotext public/samples/triage/outpatient/01_Jennings_Harold.pdf -
```

The file structure:
```typescript
import { DemoScenario } from './types'

export const DEMO_SCENARIOS: DemoScenario[] = [
  // ── Outpatient Referrals (10) ──
  {
    id: 'outpatient-01-jennings',
    patientName: 'Jennings, Harold',
    age: 74,
    sex: 'M',
    category: 'outpatient',
    referringSpecialty: 'Family NP',
    briefDescription: 'Routine chronic disease follow-up with incidental finding of resting tremor and bradykinesia.',
    clinicalHighlight: 'Early Parkinsonism (left hand resting tremor, stooped gait, constipation)',
    expectedTier: 'routine_priority',
    demoPoints: ['Neuro finding buried in routine visit', 'Movement disorders referral'],
    files: [{
      filename: '01_Jennings_Harold.pdf',
      path: '/samples/triage/outpatient/01_Jennings_Harold.pdf',
      docType: 'PCP Referral',
      previewText: `[FULL EXTRACTED TEXT HERE]`,
    }],
  },
  // ... all 26 scenarios
]

// Helper: group by category
export const DEMO_CATEGORIES = [
  { key: 'outpatient' as const, label: 'Outpatient Referrals', count: 10 },
  { key: 'cross_specialty' as const, label: 'Cross-Specialty', count: 12 },
  { key: 'packet' as const, label: 'Diagnostic Packets', count: 4 },
]

export function getDemosByCategory(category: DemoScenario['category']): DemoScenario[] {
  return DEMO_SCENARIOS.filter(s => s.category === category)
}
```

Each of the 26 entries follows this pattern. Packet entries have multiple items in `files[]`.

**Step 3: Commit**

```bash
git add src/lib/triage/demoScenarios.ts src/lib/triage/types.ts
git commit -m "feat: add demo scenario manifest with pre-extracted text for 26 scenarios"
```

---

### Task 3: Build DemoPreviewModal Component

Full-screen modal that shows the pre-extracted text of a selected scenario's PDF files.

**Files:**
- Create: `src/components/triage/DemoPreviewModal.tsx`

**Implementation:**

```typescript
'use client'

import { DemoScenario, TIER_DISPLAY } from '@/lib/triage/types'

interface Props {
  scenario: DemoScenario
  onClose: () => void
  onLoad: (scenario: DemoScenario) => void
  loading?: boolean
}
```

**Key features:**
- Dark modal overlay matching triage page (#0f172a background)
- Header: patient name, age/sex, referring specialty, tier badge (from TIER_DISPLAY config)
- Demo points as small colored tags
- Scrollable content area:
  - Single-file: full pre-extracted text displayed in a styled container
  - Packet (multiple files): stacked sections with file name/docType headers, separated by dividers
- Sticky footer: "Load into Triage" (amber button) + "Close" (ghost button)
- Close on Escape key and backdrop click
- `loading` prop shows spinner on the Load button while PDFs are being fetched

**Step 1: Write the component** with the structure above.

**Step 2: Commit**

```bash
git add src/components/triage/DemoPreviewModal.tsx
git commit -m "feat: add DemoPreviewModal for full-text scenario preview"
```

---

### Task 4: Build DemoScenarioLoader Component

Dropdown picker that replaces the "Load Sample" button position (alongside it).

**Files:**
- Create: `src/components/triage/DemoScenarioLoader.tsx`

**Implementation:**

```typescript
'use client'

import { useState, useRef, useEffect } from 'react'
import { DemoScenario, DemoCategory, TIER_DISPLAY } from '@/lib/triage/types'
import { DEMO_SCENARIOS, DEMO_CATEGORIES, getDemosByCategory } from '@/lib/triage/demoScenarios'
import DemoPreviewModal from './DemoPreviewModal'

interface Props {
  onLoadFiles: (files: File[]) => void
}
```

**Key features:**
- "Try a Demo" button with amber/orange accent (#EA580C background)
- Dropdown panel (480px wide, max 500px tall, scrollable)
- Three category tabs at top with counts
- Scenario rows showing: tier badge, patient name (age, sex), referring specialty, brief description
- Packet rows show a file count chip
- Click outside closes dropdown
- Clicking a row opens DemoPreviewModal
- "Load into Triage" in modal triggers:
  1. Fetch each PDF from `public/` path as blob
  2. Convert blobs to `File` objects
  3. Call `onLoadFiles(files)`
  4. Close modal and dropdown

**PDF fetch logic:**
```typescript
async function loadScenarioFiles(scenario: DemoScenario): Promise<File[]> {
  const files: File[] = []
  for (const f of scenario.files) {
    const res = await fetch(f.path)
    const blob = await res.blob()
    files.push(new File([blob], f.filename, { type: 'application/pdf' }))
  }
  return files
}
```

**Step 1: Write the component** with the structure above.

**Step 2: Commit**

```bash
git add src/components/triage/DemoScenarioLoader.tsx
git commit -m "feat: add DemoScenarioLoader with categorized picker and PDF loading"
```

---

### Task 5: Integrate into TriageInputPanel

Wire the new DemoScenarioLoader into the existing input panel.

**Files:**
- Modify: `src/components/triage/TriageInputPanel.tsx`

**Changes:**

1. Import `DemoScenarioLoader`
2. Add an `onLoadDemoFiles` prop (or reuse `onSubmitFiles` path)
3. In the header row, add `DemoScenarioLoader` next to `SampleNoteLoader`
4. When `onLoadFiles` fires from the demo loader:
   - Switch to upload mode (`setActiveMode('upload')`)
   - Set the uploaded files into state
   - The files appear in FileUploadZone ready for user to click "Extract & Triage"

**The header row changes from:**
```tsx
<SampleNoteLoader onSelect={(noteText) => setText(noteText)} />
```

**To:**
```tsx
<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
  <SampleNoteLoader onSelect={(noteText) => setText(noteText)} />
  <DemoScenarioLoader onLoadFiles={handleLoadDemoFiles} />
</div>
```

**New handler in TriageInputPanel:**
```typescript
function handleLoadDemoFiles(files: File[]) {
  setUploadedFiles(files)
  setActiveMode('upload')
}
```

**Important:** The `FileUploadZone` currently manages its own internal `files` state. We need to either:
- a) Lift file state to the parent (TriageInputPanel already has `uploadedFiles`), or
- b) Add an `initialFiles` or `externalFiles` prop to FileUploadZone

Option (a) is cleaner. Check if `FileUploadZone` needs a controlled mode or if we can pass initial files.

Looking at the current code: `FileUploadZone` has internal `files` state and calls `onFilesChange` to sync with parent. The parent (`TriageInputPanel`) stores `uploadedFiles` but only receives updates from the zone — it doesn't push files down.

**Fix:** Add an `externalFiles` prop to `FileUploadZone` that, when set, replaces the internal state. This allows the demo loader to inject files.

**Step 1: Modify `FileUploadZone`** — add `externalFiles?: File[]` prop with a `useEffect` that syncs internal state when it changes.

**Step 2: Modify `TriageInputPanel`** — add DemoScenarioLoader, wire up handler, pass `uploadedFiles` to FileUploadZone as `externalFiles`.

**Step 3: Verify** the flow works: Try a Demo → pick scenario → preview → Load → files appear in upload zone.

**Step 4: Commit**

```bash
git add src/components/triage/TriageInputPanel.tsx src/components/triage/FileUploadZone.tsx
git commit -m "feat: integrate demo scenario loader into triage input panel"
```

---

### Task 6: Visual Polish & Edge Cases

**Files:**
- Modify: `src/components/triage/DemoScenarioLoader.tsx`
- Modify: `src/components/triage/DemoPreviewModal.tsx`

**Items to address:**

1. **Responsive**: Demo dropdown should be full-width on mobile (< 640px)
2. **Loading state**: Show spinner while PDFs are fetching in the modal
3. **Error handling**: If a PDF fails to fetch, show error message in modal
4. **Keyboard**: Escape closes modal, tab trapping in modal
5. **Z-index**: Dropdown at z-50, modal at z-60 (above dropdown)
6. **Scroll lock**: Body scroll locked when modal is open

**Step 1: Add responsive styles and edge case handling.**

**Step 2: Test on mobile viewport (375px).**

**Step 3: Commit**

```bash
git add src/components/triage/DemoScenarioLoader.tsx src/components/triage/DemoPreviewModal.tsx
git commit -m "fix: responsive design and edge cases for demo scenario UI"
```

---

### Task 7: Final Verification

**Step 1:** Run `npm run build` to verify no TypeScript errors.

**Step 2:** Run `npm run dev` and test locally:
- Click "Try a Demo" — dropdown opens with three tabs
- Browse scenarios in each category
- Click a scenario — modal opens with full text preview
- Click "Load into Triage" — modal closes, files appear in upload zone
- Click "Extract & Triage" — batch pipeline processes the files
- Verify single-file and multi-file (packet) scenarios both work
- Test the SAH emergent case (Wei, Liang) — should trigger emergent alert
- Test Jimenez (hepatic encephalopathy) — should get low tier / non-neuro indication

**Step 3: Commit any fixes.**

**Step 4: Final commit if all clean.**

```bash
git add -A
git commit -m "feat: complete demo referral library for triage page"
```
