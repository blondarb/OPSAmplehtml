# Wearable Narrative Enhancements — March 5, 2026

## Overview

Three enhancements to the wearable dashboard's AI clinical narrative pipeline:

1. **Longitudinal Summary Banner** — wire up the existing 30-day trend synthesis UI
2. **Narrative Regenerate** — add refresh buttons to existing narrative panels
3. **Auto-Generate on Poll** — detect new assessments without narratives and generate automatically

All three build on the existing `analyze-assessment` API route and Supabase Edge Function. No new backend endpoints or database changes needed.

## Feature 1: Longitudinal Summary Banner

### What exists
- `LongitudinalSummaryBanner` component renders a narrative of type `longitudinal`
- `PatientTimeline` already filters narratives for `longitudinal` type and renders the banner between Activity and Motor tracks
- The Edge Function `analyze-assessment` handles `type: 'longitudinal'` (no `assessment_id` required)

### What to build
- Add a "Generate 30-Day Summary" pill button in the `PatientTimeline` header area (next to the patient info pills)
- Style: indigo/purple accent pill to match the banner's gradient theme
- On click: call `onGenerateNarrative('longitudinal', '')`
- Show loading spinner on the button while generating
- After generation, the page data refresh picks up the new longitudinal narrative and the banner renders automatically

### Component changes
- `PatientTimeline` — add button + loading state, accept `onGenerateNarrative` (already passed)
- No changes to `LongitudinalSummaryBanner` — it already renders correctly when data exists

## Feature 2: Narrative Regenerate Button

### What to build
- Add a small refresh icon (🔄 or SVG) to `ClinicalNarrativePanel` header row, next to "AI Clinical Narrative" label
- Add the same refresh icon to `LongitudinalSummaryBanner` header row
- Both components need a new `onRegenerate` callback prop
- On click: call `onRegenerate()` which maps to `onGenerateNarrative(type, assessmentId)`
- Show spinner on the icon while regenerating, disable click
- The Edge Function overwrites the existing narrative in the DB (current behavior)
- After regeneration, page data refresh shows the updated narrative

### Component changes
- `ClinicalNarrativePanel` — add `onRegenerate?: () => Promise<void>` prop, render refresh button
- `LongitudinalSummaryBanner` — add `onRegenerate?: () => Promise<void>` prop, render refresh button
- `MotorTrack` — pass `onRegenerate` to `ClinicalNarrativePanel` instances (tremor + tapping)
- `CognitiveTrack` — pass `onRegenerate` to `ClinicalNarrativePanel` instance (fluency)
- `PatientTimeline` — pass `onRegenerate` to `LongitudinalSummaryBanner`

## Feature 3: Auto-Generate on Poll

### Trigger points
- After initial data load (in `useEffect` init)
- After each 15-minute polling refresh (in `silentRefresh`)
- After patient switch (in `handlePatientChange`)

### Detection logic
For each assessment in `tappingAssessments`, `assessments` (tremor), `fluencyAssessments`:
1. Check if `narratives` contains an entry with matching `assessment_id`
2. If no matching narrative exists, queue it for auto-generation

### Execution
- Process queued assessments sequentially (one at a time) to avoid API rate issues
- Use a ref (`autoGeneratingRef`) to prevent duplicate runs if poll fires while generation is in progress
- Call `handleGenerateNarrative(type, assessmentId)` for each missing narrative
- After all auto-generations complete, the final data refresh picks up all new narratives

### UI feedback
- Show a subtle indicator (small text below the patient switcher): "Auto-generating interpretations... (2/3)"
- Disappears when all narratives are generated
- No toast or modal — this is background work

### Component changes
- `wearable/page.tsx` — add auto-generation logic after data fetch, ref guard, progress indicator

## Files to modify

| File | Changes |
|------|---------|
| `src/components/wearable/PatientTimeline.tsx` | Add "Generate 30-Day Summary" button with loading state |
| `src/components/wearable/ClinicalNarrativePanel.tsx` | Add `onRegenerate` prop + refresh button |
| `src/components/wearable/LongitudinalSummaryBanner.tsx` | Add `onRegenerate` prop + refresh button |
| `src/components/wearable/MotorTrack.tsx` | Pass `onRegenerate` to narrative panels |
| `src/components/wearable/CognitiveTrack.tsx` | Pass `onRegenerate` to narrative panel |
| `src/app/wearable/page.tsx` | Auto-generation logic + progress indicator |

## No changes needed
- `/api/wearable/analyze-assessment/route.ts` — already supports all types
- Edge Function — already handles longitudinal + overwrites existing narratives
- Database schema — no new tables or columns
- `types.ts` — existing types sufficient
