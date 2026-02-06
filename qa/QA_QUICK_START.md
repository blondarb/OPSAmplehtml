# QA Quick Start Guide

> For testers running Sevaro Clinical QA. Complete reference in TEST_RUNBOOK.md.

---

## What You Need

1. **Desktop browser** (Chrome preferred)
2. **iPhone or Android** for mobile testing
3. **Microphone** for voice tests
4. **Demo credentials** (ask team for login)
5. **Production URL**: https://ops-amplehtml.vercel.app

---

## 5-Minute Smoke Test

Run this before any release. All must pass.

| # | Test | How | Pass If |
|---|------|-----|---------|
| 1 | Desktop loads | Visit `/` on laptop | Redirects to `/dashboard` or `/login` |
| 2 | Mobile loads | Visit `/` on phone | Redirects to `/mobile` |
| 3 | Login | Enter credentials on `/login` | Lands on dashboard, see patient card |
| 4 | Tabs work | Click History, Imaging, Exams, Recommendation | Each tab renders |
| 5 | Patient portal | Visit `/patient` | Three tabs show, no login needed |
| 6 | Mobile app | Visit `/mobile` on phone | Patient list, red FAB button |
| 7 | Build | Run `npm run build` | No errors |

---

## Testing the Mobile App

### Quick Mobile Test (5 min)
1. **On your iPhone/Android**, visit `ops-amplehtml.vercel.app`
2. Should auto-redirect to `/mobile`
3. See patient list with compact cards
4. Tap red microphone button (FAB)
5. Grant mic permission when asked
6. Speak a test phrase
7. **Transcription should appear** (not "failed to transcribe")

### Mobile Voice Test on iPhone Safari
This is critical - Safari has different audio handling.

1. Visit `/mobile/voice` on iPhone Safari
2. Tap Start Recording
3. Say "Testing one two three"
4. Tap Stop
5. Wait for processing
6. **PASS**: Transcribed text appears
7. **FAIL**: "Failed to transcribe" error

---

## Testing the Patient AI Historian

### As a Patient (simulating patient interview)

1. Visit `/patient` (no login needed)
2. Click "AI Historian" tab
3. Click "Add New Patient" and fill form, or select demo scenario
4. Click "Start Voice Interview"
5. Answer the AI's questions naturally:
   - Say your symptoms: "I've been having headaches for 3 weeks"
   - Say medications: "I take lisinopril 10mg daily"
   - Say allergies: "I'm allergic to penicillin"
6. End interview when AI completes

### As a Physician (checking data import)

1. Log in to `/dashboard`
2. Look in left sidebar for "AI Historian" section
3. Find the session you just completed
4. Expand it and check:
   - **Summary tab**: Should summarize the interview
   - **Structured Data tab**: Should have medications, allergies, PMH
5. Click "Import to Note"
6. Check that:
   - HPI field has interview summary
   - Medication list has "lisinopril"
   - Allergy section has "penicillin"

**PASS if**: What patient said appears in physician's note fields
**FAIL if**: Data missing or in wrong fields

---

## Testing AI Features

### Ask AI
1. Click teal star icon in action bar
2. Type "What are common migraine triggers?"
3. Click Submit
4. **PASS**: Relevant clinical answer appears

### Voice Dictation (Chart Prep)
1. Click red mic icon in action bar
2. Click "Chart Prep" tab
3. Start recording
4. Dictate: "Patient referred for new onset headaches starting 3 weeks ago"
5. Stop recording
6. Click "Generate Summary"
7. **PASS**: Summary has sections (Alerts, Focus, Key Points)

### AI Verbal Corrections
1. Record: "Pain in the left hand, no wait, the right hand"
2. **PASS**: Transcription says "right hand" (correction applied)
3. **FAIL**: Shows "left hand, no wait, the right hand" literally

---

## Quick Reference: Test Case IDs

| Area | Critical Tests |
|------|----------------|
| Smoke | S1, S2, S3, S4, S5, S6, S7 |
| Mobile Voice | O1-O8 (esp. O6 for iPhone) |
| Historian Patient | H1-H8 |
| Historian Data | I1-I14 |
| AI Features | B1-B8 |
| Cross-platform | F1-F7 |

---

## Reporting Bugs

Use this format:

```
**Bug ID**: BUG-YYYY-MM-DD-NNN
**Severity**: P0 (blocker) / P1 (major) / P2 (minor)
**Test Case**: (e.g., O6)
**Summary**: (one line)

**Steps to Reproduce**:
1.
2.
3.

**Expected**:
**Actual**:
**Device/Browser**:
**Screenshot**: (attach)
```

---

## When to Escalate

**Stop and escalate if:**
- Login completely broken (S3 fail)
- White screen errors on any page
- iPhone transcription fails (O6 fail) - this was recently fixed
- Patient data appears in wrong patient's chart (A8 fail)
- AI returns completely irrelevant content

**OK to note and continue:**
- Minor styling issues
- Slow performance (not broken)
- Features that work but look slightly off
