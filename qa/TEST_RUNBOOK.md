# Test Runbook - Sevaro Clinical

> runbook_version: 1.0
> Last updated: 2026-01-30

## Purpose

Stable baseline test plan for Sevaro Clinical. Each release uses a **mission brief** (see `runs/`) that lists only the delta — new/changed features to focus on. The runbook itself changes only when flows are added or removed.

---

## Tooling

| Role | Tool | Notes |
|------|------|-------|
| **Planner** | Claude Code (VS Code) | Draft mission brief, triage failures, update test cases |
| **Executor** | Claude Code for Chrome | Walk through UI flows, capture screenshots, log results |
| **CI gate** | `npm run build` | Must pass before any deploy |

**Workflow:** Planner writes a mission brief in `qa/runs/`. Executor opens the preview URL and runs the brief's focus areas plus the smoke suite. Results go into the run log.

---

## Smoke Suite (every release)

Run these first. Any failure blocks release.

| # | Flow | Steps | Pass criteria |
|---|------|-------|---------------|
| S1 | App loads | Open `/` | Redirects to `/login` or `/dashboard` |
| S2 | Login | Email + password | Lands on `/dashboard`, patient card visible |
| S3 | Tabs render | Click History, Imaging, Exams, Recommendation | Each tab renders without error |
| S4 | Patient portal | Open `/patient` | Three tabs (Intake, Messages, Historian) render |
| S5 | Build passes | `npm run build` | Exit code 0, no TS errors |

---

## Regression Flows

### A. Clinical Notes (Physician)

| ID | Flow | Key checks |
|----|------|------------|
| A1 | HPI text entry | Type text, field persists across tab switches |
| A2 | Reason for consult | Select category, sub-options appear, differential auto-populates |
| A3 | Differential diagnosis | Search picker, add/remove ICD-10, custom entry |
| A4 | Generate Note | Click Generate Note, modal opens, note preview renders |
| A5 | Dot phrases | Type `.exam` in text field, expansion triggers |
| A6 | Clinical scales | Select headache diagnosis, MIDAS/HIT-6 suggested |
| A7 | Imaging tab | Expand MRI card, fill findings, PACS link clickable |
| A8 | Autosave isolation | Switch patient, verify no cross-patient data bleed |

### B. AI Features

| ID | Flow | Key checks |
|----|------|------------|
| B1 | Ask AI | Open AI drawer, submit question, response renders |
| B2 | Field AI actions | Click star on HPI, Improve/Expand/Summarize return text |
| B3 | Voice dictation | Open Voice drawer, mic permission prompt appears |
| B4 | Chart Prep | Dictate (or mock), AI summary generates with sections |
| B5 | Generate Assessment | Add diagnoses, click Generate Assessment, text populates |

### C. AI Historian

| ID | Flow | Key checks |
|----|------|------------|
| C1 | Patient picker | `/patient` > Historian tab > real patients listed from DB |
| C2 | Add new patient | Fill form, submit, patient appears in list |
| C3 | Patient context | Select patient > `/patient/historian?patient_id=` > context card shows name + type |
| C4 | Demo scenario | Collapse "demo scenarios", select one, navigates with `?scenario=` |
| C5 | Voice interview | Start interview, mic prompt, AI greeting plays |
| C6 | Session save | End interview, session saved with `patient_id` FK |
| C7 | Physician panel | Dashboard left sidebar shows session with real patient name |
| C8 | Import to note | Click "Import to Note", fields populate |
| C9 | Safety escalation | Trigger safety keyword, escalation overlay with 911/988 |

### D. Patient Portal

| ID | Flow | Key checks |
|----|------|------------|
| D1 | Intake form | Fill all fields, submit, success message |
| D2 | Messages | Send message, success toast |
| D3 | Historian tab | Patient list loads, add patient works, demo collapsible |

### E. Mobile-First Checks

| ID | Viewport | Key checks |
|----|----------|------------|
| E1 | 375px (iPhone SE) | Hamburger menu, sidebar slides in, drawers full-screen |
| E2 | 768px (iPad) | Reduced padding, sidebar visible, no overflow |
| E3 | Touch targets | All buttons >= 44px tap area |
| E4 | Portal mobile | `/patient` usable on phone-width viewport |

### F. Cross-Cutting

| ID | Check | Key checks |
|----|-------|------------|
| F1 | Dark mode | Toggle, all form fields readable, no white-on-white |
| F2 | Auth guard | Visit `/dashboard` logged out, redirects to `/login` |
| F3 | Portal no-auth | `/patient` accessible without login |
| F4 | Error states | Bad API key > graceful error, not white screen |

---

## Role-Based Test Matrix

| Flow area | Physician (authed) | Patient (no auth) | Notes |
|-----------|-------------------|-------------------|-------|
| Dashboard | Full access | Redirect to login | |
| Clinical notes | CRUD | No access | |
| AI drawers | Full access | No access | |
| Patient portal | N/A | Full access | `/patient` |
| Historian interview | View sessions | Start interviews | Different views |
| Import to note | Can import | N/A | Physician only |

---

## Environment Checklist

Before running tests, confirm:

- [ ] Preview deployment URL is live
- [ ] Supabase project has latest migration applied
- [ ] `OPENAI_API_KEY` is set (or `app_settings` populated)
- [ ] At least one demo patient exists (seed data ran)
- [ ] Browser mic permission available (for historian tests)
