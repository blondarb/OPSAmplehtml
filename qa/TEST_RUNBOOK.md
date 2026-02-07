# Test Runbook - Sevaro Clinical

> runbook_version: 2.2
> Last updated: 2026-02-07

## Purpose

Comprehensive test plan for Sevaro Clinical covering desktop, mobile, and patient portal. Each release uses a **mission brief** (see `runs/`) that lists only the delta — new/changed features to focus on. The runbook itself changes only when flows are added or removed.

---

## Tooling

| Role | Tool | Notes |
|------|------|-------|
| **Planner** | Claude Code (VS Code) | Draft mission brief, triage failures, update test cases |
| **Executor** | Claude Code for Chrome | Walk through UI flows, capture screenshots, log results |
| **CI gate** | `npm run build` | Must pass before any deploy |
| **Device testing** | Real iPhone/Android | Required for mobile voice transcription tests |

**Workflow:** Planner writes a mission brief in `qa/runs/`. Executor opens the preview URL and runs the brief's focus areas plus the smoke suite. Results go into the run log.

---

## Smoke Suite (every release)

Run these first. Any failure blocks release.

| # | Flow | Steps | Pass criteria |
|---|------|-------|---------------|
| S1 | App loads (Desktop) | Open `/` on desktop browser | Redirects to `/dashboard` |
| S2 | App loads (Mobile) | Open `/` on mobile browser (iPhone/Android) | Redirects to `/mobile` |
| S3 | Login | Email + password on `/login` | Lands on `/dashboard`, patient card visible |
| S4 | Tabs render | Click History, Imaging, Exams, Recommendation | Each tab renders without error |
| S5 | Patient portal | Open `/patient` | Three tabs (Intake, Messages, Historian) render |
| S6 | Mobile app | Open `/mobile` on phone | Patient list renders, FAB visible |
| S7 | Build passes | `npm run build` | Exit code 0, no TS errors |

---

## Desktop Physician Flows

### A. Clinical Notes

| ID | Flow | Key checks |
|----|------|------------|
| A1 | HPI text entry | Type text, field persists across tab switches |
| A2 | Reason for consult | Select category, sub-options appear, differential auto-populates |
| A3 | Differential diagnosis | Search picker, add/remove ICD-10, custom entry, removed diagnoses don't reappear |
| A4 | Generate Note | Click Generate Note, modal opens, note preview renders |
| A5 | Dot phrases | Type `.exam` in text field, expansion triggers |
| A6 | Clinical scales | Select headache diagnosis, MIDAS/HIT-6 suggested |
| A7 | Imaging tab | Expand MRI card, fill findings, PACS link clickable |
| A8 | Autosave isolation | Switch patient, verify no cross-patient data bleed |
| A9 | Medications | Add medication from formulary, displays in list, persists |
| A10 | Allergies | Add allergy with severity, appears in header banner |

### B. AI Features (Desktop)

| ID | Flow | Key checks | Data verification |
|----|------|------------|-------------------|
| B1 | Ask AI | Open AI drawer, submit question, response renders | Response is contextual to patient data |
| B2 | Field AI actions | Click star on HPI, Improve/Expand/Summarize return text | Text modifies field appropriately |
| B3 | Voice dictation | Open Voice drawer, mic permission prompt appears | Microphone activates |
| B4 | Chart Prep | Dictate pre-visit info, AI summary generates | Summary contains Alerts (red), Focus (yellow), structured sections |
| B5 | Chart Prep to HPI | Click "Add All to Note" | Content appears in correct note fields |
| B6 | Generate Assessment | Add diagnoses, click Generate Assessment | Assessment text populates with ICD-10 context |
| B7 | Patient Summary | Generate patient-friendly summary | Output is understandable, no jargon |
| B8 | Note Review | Generate note, AI review shows suggestions | Suggestions have severity badges, "Go to section" works |

### C. AI Historian (Physician View)

| ID | Flow | Key checks | Data verification |
|----|------|------------|-------------------|
| C1 | Session list | Dashboard left sidebar shows historian sessions | Real patient names (not "Demo Patient") |
| C2 | Session details | Expand session card | Transcript, Summary, Structured Data tabs work |
| C3 | Red flags | Session with red flags | Red flag banner visible with severity |
| C4 | Import HPI | Click Import to Note > HPI | HPI field populates with session data |
| C5 | Import Medications | Click Import to Note | Medications from interview appear in medication list |
| C6 | Import Allergies | Click Import to Note | Allergies from interview appear in allergy section |
| C7 | Import All | Import entire structured output | All fields populate correctly: HPI, meds, allergies, PMH, ROS |

### CP. Chart Prep State Management (P0 - Test Every Release)

**Critical:** These tests verify Chart Prep data durability and state management across navigation. Test after any changes to VoiceDrawer, ClinicalNote patient handling, or localStorage.

| ID | Flow | Key checks | Data verification |
|----|------|------------|-------------------|
| CP1 | Home button auto-save | Start recording → Click Home | Recording stops, processing starts, data saved |
| CP2 | Patient switch auto-save | Recording on Patient A → Click Patient B | Patient A data saved, Patient B has clean state |
| CP3 | Drawer close/reopen | Complete Chart Prep → Close drawer → Reopen | Data still visible, "Add All to Note" available |
| CP4 | Return to patient | Chart Prep on A → Switch to B → Return to A | LeftSidebar shows Chart Prep summary |
| CP5 | Background processing | Minimize during recording → Stop via bar | Processing completes, results saved, drawer auto-expands |
| CP6 | LeftSidebar display | Complete processing | Alerts (red) and Summary sections visible in sidebar |
| CP7 | View button | Click "View" in LeftSidebar Chart Prep panel | VoiceDrawer opens to Chart Prep tab with data |
| CP10 | No cross-contamination | Chart Prep on A → Switch to B | Patient B never sees Patient A's Chart Prep data |

**localStorage verification:**
- Check localStorage for `chart-prep-{visitId}` key
- Verify `chartPrepSections` object has `summary`, `alerts`, `suggestedHPI` fields
- Verify LeftSidebar renders content matching localStorage data

### CR. Chart Prep Recording States (P1)

| ID | Flow | Key checks |
|----|------|------------|
| CR1 | Click outside while recording | Floating red bar appears at bottom-right with timer |
| CR2 | Minimized bar buttons | Pause shows blue pause icon, Resume works, Stop triggers processing |
| CR3 | TopNav indicator | Red dot with timer appears in top nav when drawer closed but recording |
| CR4 | Expand button | Full drawer opens, recording continues uninterrupted |
| CR5 | Processing state | Bar turns teal, shows spinner and "Processing..." text |

### VA. Visit AI Recording (P1)

| ID | Flow | Key checks | Data verification |
|----|------|------------|-------------------|
| VA1 | Start recording | Click large mic → waveform animates | Recording state active |
| VA3 | Stop processing | Stop → "Processing..." → structured output | 5 sections extracted |
| VA4 | Section accuracy | Review extracted content | Content matches spoken input |
| VA7 | Generate Note | Click Generate Note → Visit AI merged | All sections in preview |
| VA9 | Safari format | iPhone Safari audio processes | m4a format transcribed |

### FD. Field Dictation (P1)

| ID | Flow | Key checks |
|----|------|------------|
| FD1 | Mic button | Click red mic → recording starts |
| FD2 | Cursor insert | Text inserted at cursor position |
| FD4 | Multi-field | Dictate HPI → Dictate Assessment → both work |

### FA. Field AI Actions (P1)

| ID | Flow | Key checks | Data verification |
|----|------|------------|-------------------|
| FA1 | Improve | Polishes grammar, preserves meaning | Text improved, meaning same |
| FA2 | Expand | Adds clinical context | Longer, no fabricated data |
| FA4 | No hallucination | Doesn't add specifics not implied | Anti-hallucination check |

### NG. Note Generation (P0)

| ID | Flow | Key checks |
|----|------|------------|
| NG1 | Open modal | Purple button → modal opens |
| NG3 | Length selection | Concise/Standard/Detailed output differs |
| NG6 | Review suggestions | AI suggestions panel with type badges |
| NG8 | Copy | Full note copied to clipboard |
| NG9 | Sign & Complete | Note saved, visit signed |

### NM. Note Merge Engine (P0)

| ID | Flow | Key checks | Data verification |
|----|------|------------|-------------------|
| NM1 | Manual priority | Manual content preserved over AI | Manual not overwritten |
| NM2 | Markers | Chart Prep markers prevent duplication | One set of markers only |
| NM4 | Combined | Chart Prep + Visit AI + Manual all present | All sources visible |

---

## Mobile App Flows

### M. Mobile Patient List

| ID | Flow | Key checks |
|----|------|------------|
| M1 | Auto-redirect | Visit `/` on mobile | Auto-redirects to `/mobile` |
| M2 | Patient list | View patient cards | Compact cards with status badges (Sched, Active, NEW, F/U) |
| M3 | Search | Type patient name or MRN | Results filter in real-time |
| M4 | Filter pills | Tap Scheduled/Active filters | List updates correctly |
| M5 | Swipe gestures | Swipe right on patient card | Check-in action triggers |
| M6 | FAB | Tap red microphone FAB | Navigates to `/mobile/voice` |

### N. Mobile Chart View

| ID | Flow | Key checks |
|----|------|------------|
| N1 | Chart access | Tap patient card | Navigates to `/mobile/chart/[id]` |
| N2 | AI Summary | View AI summary card | Shows referral context, key considerations |
| N3 | Section pills | Tap HPI, Exam, Assessment, Plan pills | Scrolls to correct section |
| N4 | Section expand | Tap section card | Expands with editable content |
| N5 | Voice record | Tap mic on section | Opens voice recorder for that section |
| N6 | Transcription | Record and stop | Text appears in section field |

### O. Mobile Voice Recorder

| ID | Flow | Key checks | Data verification |
|----|------|------------|-------------------|
| O1 | Navigate | Tap FAB or section mic | Voice recorder page opens |
| O2 | Permission | Tap Start Recording | Mic permission prompt appears |
| O3 | Recording | Grant permission, speak | Audio level visualization animates |
| O4 | Pause/Resume | Tap pause, then resume | Recording continues, timer correct |
| O5 | Transcription | Tap Stop | Transcription processes and displays |
| O6 | Safari/iOS | Test on iPhone Safari | Transcription succeeds (not "failed to transcribe") |
| O7 | Error retry | If transcription fails | Retry button appears, retry works |
| O8 | AI cleanup | Dictate with verbal corrections | Corrections applied (e.g., "left hand, no wait, right hand" → "right hand") |

### P. Mobile Settings

| ID | Flow | Key checks |
|----|------|------------|
| P1 | Settings page | Navigate to settings | Toggle switches work |
| P2 | Switch to Desktop | Tap "Switch to Desktop View" | Redirects to `/dashboard`, cookie saved |
| P3 | View persistence | Return to `/` on mobile | Continues to desktop (cookie respected) |
| P4 | Reset preference | Clear cookies, visit `/` on mobile | Auto-redirects to `/mobile` again |

### Q. Mobile FAB Menu

| ID | Flow | Key checks |
|----|------|------------|
| Q1 | FAB visible | Open chart view | Teal FAB visible bottom-right |
| Q2 | FAB expand | Tap FAB | Menu expands with 3 options |
| Q3 | Save Draft | Tap Save Draft | Note saves, success feedback, menu closes |
| Q4 | Prepare Note | Tap Prepare Note | MobileNotePreview sheet opens |
| Q5 | Sign & Complete | Tap Sign & Complete | Confirmation, patient marked complete |
| Q6 | FAB collapse | Tap outside menu | Menu collapses |
| Q7 | Haptic feedback | Tap FAB | Vibration felt (real device only) |

### R. Mobile Chart Prep AI

| ID | Flow | Key checks | Data verification |
|----|------|------------|-------------------|
| R1 | Open Chart Prep | Tap mic on section in chart-prep mode | Voice recorder opens |
| R2 | Record dictation | Speak for 10-15 seconds | Audio levels animate |
| R3 | Process Chart Prep | Stop recording | Processing spinner, then AI summary appears |
| R4 | View results | Results panel displays | Alerts (red), Focus (yellow), Key Points (gray) |
| R5 | Add single item | Tap Add on specific item | Item added to target section |
| R6 | Add all items | Tap Add All to Note | All items added with markers |
| R7 | Marker replacement | Re-run Chart Prep | Previous content replaced, not duplicated |

### S. Mobile Note Preview

| ID | Flow | Key checks |
|----|------|------------|
| S1 | Open preview | Tap Prepare Note from FAB | MobileNotePreview sheet opens |
| S2 | Note type toggle | Tap New Consult / Follow-up | Toggle updates visually |
| S3 | Note length toggle | Tap Concise / Standard | Toggle updates visually |
| S4 | Generate note | Tap Generate with AI | Loading state, then formatted note appears |
| S5 | Copy note | Tap Copy button | Clipboard updated, "Copied!" feedback |
| S6 | Sign from preview | Tap Sign & Complete | Note signed, sheet closes |
| S7 | Manual fallback | API fails | Fallback formatting still displays note |

### T. Mobile Smart Recommendations

| ID | Flow | Key checks |
|----|------|------------|
| T1 | Diagnosis pills | Add diagnosis in Assessment | Pill appears with "Tap for Treatment Recommendations" |
| T2 | Open sheet | Tap diagnosis pill | MobileRecommendationsSheet slides up |
| T3 | Plan loads | Sheet opens | Loading spinner, then sections display |
| T4 | Section expand | Tap section header | Section expands with subsections |
| T5 | Select items | Tap checkboxes | Items selected, count updates |
| T6 | Priority badges | View items | STAT (red), URGENT (amber) visible |
| T7 | Add to Plan | Tap Add button | Items added, haptic feedback, sheet closes |
| T8 | No plan fallback | Open for diagnosis without plan | Graceful "No treatment plan available" message |

---

## Patient Portal Flows

### D. Patient Intake & Messages

| ID | Flow | Key checks |
|----|------|------------|
| D1 | Intake form | Fill all fields, submit | Success message, form resets |
| D2 | Messages | Send message | Success toast |
| D3 | No auth required | Visit `/patient` logged out | Portal accessible |

### H. AI Historian (Patient Interview)

| ID | Flow | Key checks | Data verification |
|----|------|------------|-------------------|
| H1 | Patient picker | Historian tab shows patient list | Cards show name, referral reason, MRN |
| H2 | Add new patient | Fill form, submit | Patient appears in list |
| H3 | Start interview | Select patient, click Start | WebRTC connects, AI greeting plays |
| H4 | Voice capture | Speak responses | Transcript shows patient responses |
| H5 | Interview flow | Answer AI questions | AI asks appropriate follow-ups |
| H6 | Session complete | End interview | Success screen with duration/stats |
| H7 | Session saved | Check database | Session has `patient_id` FK, structured output |
| H8 | Demo scenarios | Select demo scenario | Interview loads with mock context |

### I. AI Historian Data Flow

**Critical: Verify patient-reported data flows to physician note correctly**

| ID | Flow | Key checks | Data verification |
|----|------|------------|-------------------|
| I1 | Chief complaint | Patient states chief complaint | Appears in structured output `chiefComplaint` |
| I2 | HPI extraction | Patient describes symptoms (OLDCARTS) | HPI text contains onset, location, duration, character, etc. |
| I3 | Medication mention | Patient says "I take lisinopril 10mg daily" | Medication appears in structured `medications` array |
| I4 | Allergy mention | Patient says "I'm allergic to penicillin" | Allergy appears in structured `allergies` array |
| I5 | PMH mention | Patient says "I have diabetes and hypertension" | Conditions appear in `pastMedicalHistory` |
| I6 | Family history | Patient mentions family conditions | Appears in `familyHistory` |
| I7 | Social history | Patient describes smoking, alcohol, occupation | Appears in `socialHistory` |
| I8 | ROS positive | Patient mentions headaches, nausea | Appears in `reviewOfSystems` with affected systems |
| I9 | Red flag detection | Patient mentions concerning symptom | Red flag array populated with severity |
| I10 | Safety trigger | Patient mentions self-harm | Safety escalation overlay appears |
| I11 | Import to HPI | Physician clicks Import | HPI field contains interview summary |
| I12 | Import meds | Physician clicks Import | Patient-stated meds in medication list |
| I13 | Import allergies | Physician clicks Import | Patient-stated allergies in allergy section |
| I14 | Import full | Import all structured data | All fields populated, no data loss |

---

## Cross-Cutting Tests

### E. Responsive/Mobile Layout

| ID | Viewport | Key checks |
|----|----------|------------|
| E1 | 375px (iPhone SE) | Hamburger menu, sidebar slides in, drawers full-screen |
| E2 | 768px (iPad) | Reduced padding, sidebar visible, no overflow |
| E3 | Touch targets | All buttons >= 44px tap area |
| E4 | Portal mobile | `/patient` usable on phone-width viewport |
| E5 | Mobile app 375px | `/mobile` optimized layout, no horizontal scroll |

### F. Cross-Platform

| ID | Check | Key checks |
|----|-------|------------|
| F1 | Dark mode | Toggle, all form fields readable, no white-on-white |
| F2 | Auth guard | Visit `/dashboard` logged out, redirects to `/login` |
| F3 | Portal no-auth | `/patient` accessible without login |
| F4 | Error states | Bad API key → graceful error, not white screen |
| F5 | Mobile Safari | Voice transcription works on iPhone Safari |
| F6 | Chrome desktop | All features work in Chrome |
| F7 | Firefox desktop | Core features work in Firefox |

---

## Role-Based Test Matrix

| Flow area | Physician (authed) | Patient (no auth) | Mobile (authed) |
|-----------|-------------------|-------------------|-----------------|
| Dashboard | Full access | Redirect to login | Via /mobile |
| Clinical notes | CRUD | No access | View/dictate |
| AI drawers | Full access | No access | Voice only |
| Patient portal | N/A | Full access | Accessible |
| Historian interview | View sessions | Start interviews | N/A |
| Import to note | Can import | N/A | N/A |
| Voice transcription | Full | Limited | Full |

---

## AI Data Verification Checklist

**Run these after any changes to AI prompts, API routes, or data flow:**

| # | Verification | How to check |
|---|--------------|--------------|
| 1 | Chart Prep sections | Summary has: Alerts (red), Focus (yellow), Key Points, Timeline |
| 2 | Chart Prep → Note | "Add All to Note" populates HPI, not random fields |
| 3 | Visit AI extraction | Recorded visit produces HPI, Exam, Assessment, Plan sections |
| 4 | Historian structured output | JSON contains all 8 sections: chiefComplaint, hpi, medications, allergies, pmh, familyHistory, socialHistory, ros |
| 5 | Historian → Note fields | Import maps: hpi→HPI, medications→medication list, allergies→allergy list |
| 6 | AI no hallucination | Field AI actions (Improve/Expand) don't add fabricated clinical data |
| 7 | Transcription cleanup | Verbal corrections applied, filler words removed |
| 8 | Scale autofill | AI extracts only from provided data, shows confidence levels |

---

## Environment Checklist

Before running tests, confirm:

- [ ] Preview deployment URL is live
- [ ] Supabase project has latest migration applied
- [ ] `OPENAI_API_KEY` is set (or `app_settings` populated)
- [ ] At least one demo patient exists (seed data ran)
- [ ] Browser mic permission available (for voice tests)
- [ ] Real mobile device available (for Safari transcription tests)
- [ ] Cookies cleared for view preference tests

---

## Quick Reference: Test Coverage by Release Type

| Release Type | Required Tests |
|--------------|----------------|
| Hotfix | S1-S7, affected flow only |
| Minor feature | S1-S7 + Mission brief focus + 3 regression spot-checks |
| Major feature | Full regression (A, B, C, CP, CR, M, N, O, H, I) + all smoke |
| Mobile changes | S1-S7 + M1-M6, N1-N6, O1-O8, P1-P4, Q1-Q7, R1-R7, S1-S7, T1-T8, E5 |
| AI changes | S1-S7 + B1-B8, C1-C7, CP1-CP10, CR1-CR5, VA1-VA10, FA1-FA5, NG1-NG10, NM1-NM5, I1-I14 + AI verification checklist |
| Historian changes | S1-S7 + C1-C7, H1-H8, I1-I14 |
| Chart Prep changes | S1-S7 + B4-B5, CP1-CP10, CR1-CR5 |
| Visit AI changes | S1-S7 + VA1-VA10, NG1-NG10, NM1-NM5 |
| Note Generation changes | S1-S7 + NG1-NG10, NM1-NM5, FA1-FA5 |
| Documentation workflows | S1-S7 + CP1-CP10, VA1-VA10, FD1-FD5, FA1-FA5, DP1-DP5, NG1-NG10, NM1-NM5 |
