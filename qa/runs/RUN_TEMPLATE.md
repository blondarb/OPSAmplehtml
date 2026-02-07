# Test Run Log

**Run ID:** RUN-YYYY-MM-DD-NNN
**Date:** YYYY-MM-DD
**Branch:** `branch-name`
**Preview URL:** https://ops-amplehtml.vercel.app
**Tester:** (name or "Claude Code for Chrome")
**Runbook version:** 2.1
**Test cases version:** 2.1

---

## Mission Brief

> What changed in this release. Only list the delta — do not repeat the full runbook.

**Feature/Fix:**
- (one-line description of each change)

**Focus test cases:**
- (list specific test case IDs to focus on)

**Risk areas:**
- (areas that might break due to this change)

---

## Smoke Suite (Required)

| ID | Title | Result | Notes |
|----|-------|--------|-------|
| S1 | App loads (Desktop) | PASS / FAIL | |
| S2 | App loads (Mobile) | PASS / FAIL | |
| S3 | Login | PASS / FAIL | |
| S4 | Tabs render | PASS / FAIL | |
| S5 | Patient portal | PASS / FAIL | |
| S6 | Mobile app | PASS / FAIL | |
| S7 | Build passes | PASS / FAIL | |

---

## Focus Cases

| ID | Title | Result | Notes | Data Verification |
|----|-------|--------|-------|-------------------|
| | | PASS / FAIL | | |
| | | PASS / FAIL | | |
| | | PASS / FAIL | | |

---

## Regression Spot-Checks

> Pick 3-5 from the runbook outside the focus area. Rotate each release.

| ID | Title | Result | Notes |
|----|-------|--------|-------|
| | | PASS / FAIL | |
| | | PASS / FAIL | |
| | | PASS / FAIL | |

---

## Mobile Testing

| ID | Title | Result | Device | Notes |
|----|-------|--------|--------|-------|
| M1 | Auto-redirect | PASS / FAIL | | |
| O6 | Safari/iOS transcription | PASS / FAIL | iPhone model | |
| P2 | Switch to Desktop | PASS / FAIL | | |

---

## Chart Prep State Management (P0 - Test Every AI Release)

> Required for any changes to VoiceDrawer, ClinicalNote, or localStorage handling.

| ID | Title | Result | Notes | Data Verification |
|----|-------|--------|-------|-------------------|
| CP1 | Home button auto-save | PASS / FAIL | | localStorage saved? |
| CP2 | Patient switch auto-save | PASS / FAIL | | Clean state on Patient B? |
| CP4 | Return to patient | PASS / FAIL | | LeftSidebar shows summary? |
| CP10 | No cross-contamination | PASS / FAIL | | No Patient A data on B? |

## Chart Prep Recording States (P1)

> Test if Voice drawer or recording behavior changed.

| ID | Title | Result | Notes |
|----|-------|--------|-------|
| CR1 | Minimized bar appears | PASS / FAIL / N/A | |
| CR2 | Minimized bar controls | PASS / FAIL / N/A | |
| CR5 | Processing indicator | PASS / FAIL / N/A | |

---

## AI Data Flow Verification

> Only required for AI-related changes. Check applicable items.

| # | Verification | Result | Notes |
|---|--------------|--------|-------|
| 1 | Chart Prep sections | PASS / FAIL / N/A | |
| 2 | Chart Prep → Note | PASS / FAIL / N/A | |
| 3 | Visit AI extraction | PASS / FAIL / N/A | |
| 4 | Historian structured output | PASS / FAIL / N/A | |
| 5 | Historian → Note fields | PASS / FAIL / N/A | |
| 6 | AI no hallucination | PASS / FAIL / N/A | |
| 7 | Transcription cleanup | PASS / FAIL / N/A | |
| 8 | Scale autofill | PASS / FAIL / N/A | |

---

## Patient Historian Data Flow

> Only required for Historian changes. Test with real interview.

| ID | Title | Patient Said | Imported Correctly? | Notes |
|----|-------|--------------|---------------------|-------|
| I3 | Medication mention | "(what patient said)" | YES / NO | |
| I4 | Allergy mention | "(what patient said)" | YES / NO | |
| I5 | PMH mention | "(what patient said)" | YES / NO | |
| I11 | Import to HPI | | YES / NO | |
| I12 | Import medications | | YES / NO | |
| I13 | Import allergies | | YES / NO | |

---

## Bugs Found

| Bug ID | Severity | Test Case | Summary | Status |
|--------|----------|-----------|---------|--------|
| | P0/P1/P2 | | | Open/Fixed |

---

## Screenshot Evidence

> Attach or link to screenshots for key flows, especially failures.

- [ ] Mobile app screenshot (S6)
- [ ] Transcription success screenshot (O6)
- [ ] AI data import screenshot (I14)

---

## Verdict

- [ ] **GO** — Ship to production
- [ ] **NO-GO** — Blocked by: (list bug IDs)

**Sign-off:**
- Tested by: _______________
- Date: _______________

**Notes:**
