# Chart Prep QA Checklist

> Quick reference for Chart Prep testing. Use this for rapid verification before releases.
> Version: 1.0 | Last updated: 2026-02-07

---

## Before Every Release with Chart Prep Changes

### Core Flow (must pass)

- [ ] Record → Transcribe → Generate Summary → Shows in drawer
- [ ] "Add All to Note" → Content appears in HPI with markers
- [ ] Summary shows Alerts (red), Focus (yellow), Key Points

### State Management (P0 - must pass)

- [ ] **CP1** Home button stops & saves active recording
- [ ] **CP2** Patient switch stops & saves active recording
- [ ] **CP4** Return to patient → LeftSidebar shows Chart Prep
- [ ] **CP3** Close drawer → Reopen → Data still there
- [ ] **CP10** No Patient A data appears on Patient B

### Recording States (P1)

- [ ] **CR1** Minimized bar appears when clicking outside
- [ ] **CR2** Minimized bar shows Pause/Resume/Stop/Expand
- [ ] **CR3** TopNav shows recording indicator when minimized
- [ ] **CR4** Expand button opens full drawer with recording active
- [ ] **CR5** Processing indicator (teal) appears after stop

---

## localStorage Verification

Open DevTools → Application → Local Storage → Preview URL domain

**Check for key:** `chart-prep-{visitId}`

**Expected structure:**
```json
{
  "prepNotes": [
    { "text": "...", "timestamp": "...", "category": "hpi" }
  ],
  "chartPrepSections": {
    "summary": "...",
    "alerts": ["..."],
    "suggestedHPI": "...",
    "keyPoints": ["..."],
    "suggestedFocus": ["..."]
  },
  "insertedSections": [],
  "timestamp": 1707350400000,
  "pendingAIProcessing": false
}
```

**Verification steps:**
- [ ] Key exists after Chart Prep processing completes
- [ ] `prepNotes` array contains dictated content
- [ ] `chartPrepSections` has `summary`, `alerts`, `suggestedHPI`
- [ ] `timestamp` is recent (within last session)
- [ ] Key is cleared after Sign & Complete

---

## Browser Scenarios

### Expected Behaviors

| Scenario | Expected Result |
|----------|-----------------|
| Refresh during recording | Recording stops (expected - cannot survive refresh) |
| Refresh after processing | Data restored from localStorage |
| Clear localStorage | Fresh start, no stale data |
| Multiple tabs same patient | Each tab has independent state |

### Edge Cases

- [ ] **Very short recording** (<2 seconds) → May fail transcription, shows error gracefully
- [ ] **Long recording** (>5 minutes) → Should process, may take longer
- [ ] **Network interruption during processing** → Error message, data still in localStorage for retry
- [ ] **Rapid patient switching** → No cross-contamination, each patient has correct data

---

## Visual Indicators Reference

### Recording State (Red theme)

- **Floating bar**: Red background, white timer, pulsing red dot
- **TopNav**: Small red dot indicator with time
- **Drawer**: Red accent on active tab, waveform animation

### Processing State (Teal theme)

- **Floating bar**: Teal background, spinner icon, "Processing..." text
- **Drawer**: Teal spinner, "Generating summary..." message

### LeftSidebar Panel

- **Header**: "Chart Prep" with purple accent
- **Alerts**: Red background, exclamation icon
- **Summary**: Gray background, collapsed by default
- **View button**: Opens VoiceDrawer to Chart Prep tab

---

## Common Failure Points

### If Chart Prep data doesn't appear in LeftSidebar:

1. Check `chartPrepOutput` state in React DevTools
2. Check localStorage for `chart-prep-{visitId}` key
3. Verify `chartPrepSections` has content (not null)
4. Check console for errors during `onChartPrepOutput` callback

### If recording stops unexpectedly:

1. Check browser mic permission (not revoked)
2. Check console for MediaRecorder errors
3. Verify `streamRef` tracks are still active
4. Check if `isSwitchingPatientRef` was triggered

### If processing never completes:

1. Check Network tab for `/api/ai/chart-prep` request
2. Check response for errors (500, 429, timeout)
3. Verify OpenAI API key is valid
4. Check console for unhandled promise rejections

---

## Quick Test Script

Run this sequence for a complete Chart Prep verification:

1. **Login** → Dashboard
2. **Select Patient A** → Open Voice drawer
3. **Record** → "Patient presents with headaches for 3 weeks"
4. **Stop** → Wait for transcription
5. **Generate Summary** → Wait for AI processing
6. **Verify LeftSidebar** → Chart Prep panel appears
7. **Click Home** → Verify processing saved
8. **Select Patient B** → Verify NO Patient A data
9. **Return to Patient A** → Verify data restored
10. **Add All to Note** → Verify HPI updated
11. **Sign & Complete** → Verify localStorage cleared

---

## Related Test Cases

| Priority | Test IDs | Description |
|----------|----------|-------------|
| P0 (every release) | CP1, CP2, CP4, CP10 | Core state management |
| P1 (AI changes) | CP3, CP5-CP7, CR1-CR5 | Recording states, background processing |
| P2 (quarterly) | CP8, CP9 | Edge cases, cleanup |

See `TEST_CASES.yaml` for full test case details.
