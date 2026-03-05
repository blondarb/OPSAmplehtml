# Wearable Narrative Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add longitudinal summary generation, narrative regeneration buttons, and auto-generation of narratives for new assessments on the wearable dashboard.

**Architecture:** All three features use the existing `handleGenerateNarrative()` → `/api/wearable/analyze-assessment` → Supabase Edge Function pipeline. No new API routes or database changes. Feature 1 adds a button + wires existing component. Feature 2 adds a callback prop to two existing panels. Feature 3 adds detection logic in the page-level data fetch cycle.

**Tech Stack:** Next.js 15 (App Router), React, TypeScript, Supabase

---

### Task 1: Add Regenerate Button to ClinicalNarrativePanel

**Files:**
- Modify: `src/components/wearable/ClinicalNarrativePanel.tsx`

**Step 1: Add `onRegenerate` prop and regenerating state**

Add to the `Props` interface:

```typescript
interface Props {
  narrative: ClinicalNarrative
  accentColor?: string
  onRegenerate?: () => Promise<void>
}
```

Add state inside the component:

```typescript
const [regenerating, setRegenerate] = useState(false)
```

**Step 2: Add refresh button to the header row**

In the header `div` (the one with `onClick={() => setExpanded(!expanded)}`), add a refresh button next to the `▼` arrow. The button should:
- Be a small SVG refresh icon (16x16) styled with `color: #64748b`, hover to `accentColor`
- On click: call `e.stopPropagation()` (prevent expand toggle), set regenerating true, await `onRegenerate()`, set regenerating false
- While regenerating: show a spinner SVG instead, disable click
- Only render when `onRegenerate` is provided

Place it between the model version tag and the `▼` arrow:

```tsx
{onRegenerate && (
  <button
    onClick={async (e) => {
      e.stopPropagation()
      if (regenerating) return
      setRegenerate(true)
      try { await onRegenerate() } finally { setRegenerate(false) }
    }}
    disabled={regenerating}
    title="Regenerate interpretation"
    style={{
      background: 'none',
      border: 'none',
      padding: '2px',
      cursor: regenerating ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
    }}
  >
    {regenerating ? (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    ) : (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
      </svg>
    )}
  </button>
)}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Clean build with no type errors.

**Step 4: Commit**

```
feat: add regenerate button to ClinicalNarrativePanel
```

---

### Task 2: Add Regenerate Button to LongitudinalSummaryBanner

**Files:**
- Modify: `src/components/wearable/LongitudinalSummaryBanner.tsx`

**Step 1: Add `onRegenerate` prop and state**

Update the `Props` interface:

```typescript
interface Props {
  narrative: ClinicalNarrative
  onRegenerate?: () => Promise<void>
}
```

Add state: `const [regenerating, setRegenerate] = useState(false)`

**Step 2: Add refresh button to header row**

Same pattern as Task 1 — place it between the trajectory badge and the `▼` arrow. Use `#a78bfa` as the accent color (matching the banner's purple theme).

**Step 3: Verify build**

Run: `npm run build`
Expected: Clean build.

**Step 4: Commit**

```
feat: add regenerate button to LongitudinalSummaryBanner
```

---

### Task 3: Wire Regenerate Callbacks in MotorTrack and CognitiveTrack

**Files:**
- Modify: `src/components/wearable/MotorTrack.tsx`
- Modify: `src/components/wearable/CognitiveTrack.tsx`

**Step 1: Pass `onRegenerate` to ClinicalNarrativePanel in MotorTrack**

Find the two places where `<ClinicalNarrativePanel>` is rendered (lines ~385 and ~501). Add the `onRegenerate` prop:

For the tremor narrative (~line 385):
```tsx
<ClinicalNarrativePanel
  narrative={latestTremorNarrative}
  accentColor="#A855F7"
  onRegenerate={onGenerateNarrative ? () => onGenerateNarrative('tremor', latestAssessment!.id) : undefined}
/>
```

For the tapping narrative (~line 501):
```tsx
<ClinicalNarrativePanel
  narrative={latestTappingNarrative}
  accentColor="#3B82F6"
  onRegenerate={onGenerateNarrative ? () => onGenerateNarrative('tapping', latestTapping!.id) : undefined}
/>
```

**Step 2: Pass `onRegenerate` to ClinicalNarrativePanel in CognitiveTrack**

Find where `<ClinicalNarrativePanel>` is rendered (~line 289). Add:

```tsx
<ClinicalNarrativePanel
  narrative={latestFluencyNarrative}
  accentColor="#22C55E"
  onRegenerate={onGenerateNarrative ? () => onGenerateNarrative('fluency', latestFluency!.id) : undefined}
/>
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Clean build.

**Step 4: Commit**

```
feat: wire regenerate callbacks to narrative panels in Motor/CognitiveTrack
```

---

### Task 4: Add "Generate 30-Day Summary" Button to PatientTimeline

**Files:**
- Modify: `src/components/wearable/PatientTimeline.tsx`

**Step 1: Add longitudinal generation state and button**

Add state at the top of the component:

```typescript
const [generatingLongitudinal, setGeneratingLongitudinal] = useState(false)
```

Check if a longitudinal narrative already exists:

```typescript
const hasLongitudinalNarrative = narratives?.some(n => n.narrative_type === 'longitudinal') ?? false
```

**Step 2: Add the button in the header area**

In the "Info Pills" `div` (the `flexWrap: 'wrap'` container with device name, diagnosis, medications), add the button as the last element:

```tsx
{onGenerateNarrative && (
  <button
    onClick={async () => {
      setGeneratingLongitudinal(true)
      try { await onGenerateNarrative('longitudinal', '') }
      finally { setGeneratingLongitudinal(false) }
    }}
    disabled={generatingLongitudinal}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 12px',
      background: generatingLongitudinal ? '#334155' : 'rgba(99, 102, 241, 0.15)',
      border: '1px solid rgba(99, 102, 241, 0.3)',
      borderRadius: '9999px',
      fontSize: '12px',
      color: generatingLongitudinal ? '#94a3b8' : '#a78bfa',
      fontWeight: 600,
      cursor: generatingLongitudinal ? 'not-allowed' : 'pointer',
    }}
  >
    {generatingLongitudinal ? (
      <>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        Generating...
      </>
    ) : (
      <>{hasLongitudinalNarrative ? '↻ Regenerate' : '📊 Generate'} 30-Day Summary</>
    )}
  </button>
)}
```

**Step 3: Wire `onRegenerate` to the LongitudinalSummaryBanner**

Update the existing banner render (~line 239) to pass the regenerate callback:

```tsx
{narratives?.filter(n => n.narrative_type === 'longitudinal').slice(0, 1).map(n => (
  <LongitudinalSummaryBanner
    key={n.id}
    narrative={n}
    onRegenerate={onGenerateNarrative ? () => onGenerateNarrative('longitudinal', '') : undefined}
  />
))}
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Clean build.

**Step 5: Commit**

```
feat: add 30-Day Summary generation button to PatientTimeline
```

---

### Task 5: Add Auto-Generation Logic to Wearable Page

**Files:**
- Modify: `src/app/wearable/page.tsx`

**Step 1: Add auto-generation state and ref**

Add imports and state at the top of the component:

```typescript
import { useState, useEffect, useRef, useCallback } from 'react'
```

Add state/refs:

```typescript
const [autoGenProgress, setAutoGenProgress] = useState<{ current: number; total: number } | null>(null)
const autoGeneratingRef = useRef(false)
```

**Step 2: Create the auto-generation function**

Add this function inside the component, after `handleGenerateNarrative`:

```typescript
const autoGenerateNarratives = useCallback(async (freshData: WearableDemoData) => {
  if (autoGeneratingRef.current) return
  if (!freshData.patient?.id) return

  const existingIds = new Set(
    (freshData.narratives || []).map(n => n.assessment_id).filter(Boolean)
  )

  // Collect assessments that lack narratives
  type PendingItem = { type: string; id: string }
  const pending: PendingItem[] = []

  for (const a of freshData.assessments || []) {
    if (!existingIds.has(a.id)) pending.push({ type: 'tremor', id: a.id })
  }
  for (const a of freshData.tappingAssessments || []) {
    if (!existingIds.has(a.id)) pending.push({ type: 'tapping', id: a.id })
  }
  for (const a of freshData.fluencyAssessments || []) {
    if (!existingIds.has(a.id)) pending.push({ type: 'fluency', id: a.id })
  }

  if (pending.length === 0) return

  autoGeneratingRef.current = true
  try {
    for (let i = 0; i < pending.length; i++) {
      setAutoGenProgress({ current: i + 1, total: pending.length })
      try {
        await handleGenerateNarrative(pending[i].type, pending[i].id)
      } catch {
        // Silent fail per item — don't block the rest
      }
    }
  } finally {
    setAutoGenProgress(null)
    autoGeneratingRef.current = false
  }
}, [])
```

Note: `handleGenerateNarrative` already refreshes data after each call, so subsequent iterations pick up updated narratives.

**Step 3: Trigger auto-generation after data loads**

In the initial data load `useEffect` (after `setData(dJson)` / `setData(json)`), add:

```typescript
// After setData(dJson) and setLastUpdated(new Date())
autoGenerateNarratives(dJson)
```

In the `silentRefresh` function (inside the polling `useEffect`), add:

```typescript
// After setData(json) and setLastUpdated(new Date())
autoGenerateNarratives(json)
```

In `handlePatientChange`, add:

```typescript
// After setData(json) and setLastUpdated(new Date())
autoGenerateNarratives(json)
```

**Step 4: Render the auto-generation progress indicator**

Add below the patient switcher `div` (after the `{patients.length > 1 && (...)}` block):

```tsx
{autoGenProgress && (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    background: 'rgba(99, 102, 241, 0.08)',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    borderRadius: '8px',
  }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2" style={{ animation: 'wearable-spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
    <span style={{ color: '#a78bfa', fontSize: '0.8rem', fontWeight: 500 }}>
      Auto-generating interpretations... ({autoGenProgress.current}/{autoGenProgress.total})
    </span>
  </div>
)}
```

**Step 5: Verify build**

Run: `npm run build`
Expected: Clean build.

**Step 6: Commit**

```
feat: auto-generate narratives for assessments without interpretations
```

---

### Task 6: Manual Verification + Final Commit

**Step 1: Run the dev server**

Run: `npm run dev`

**Step 2: Verify Feature 1 — Longitudinal Summary**

Navigate to `/wearable`. In the Patient Timeline header, click the "Generate 30-Day Summary" pill button. Confirm:
- Button shows spinner while generating
- After generation, the LongitudinalSummaryBanner appears between Activity and Motor tracks
- Button label changes to "Regenerate 30-Day Summary"

**Step 3: Verify Feature 2 — Regenerate buttons**

Click the refresh icon on any existing ClinicalNarrativePanel. Confirm:
- Spinner shows during regeneration
- Narrative content updates after completion
- Same for LongitudinalSummaryBanner refresh icon

**Step 4: Verify Feature 3 — Auto-generation**

Switch to a patient with assessments that don't have narratives (or use the demo patient). Confirm:
- The "Auto-generating interpretations..." indicator appears
- Progress counts up (1/N, 2/N...)
- After completion, narrative panels appear under each assessment card
- Indicator disappears

**Step 5: Update docs**

Update `CLAUDE.md` Recent Changes section and `docs/CHANGELOG.md` with a summary of the three features.

**Step 6: Final commit**

```
docs: update changelog for wearable narrative enhancements
```
