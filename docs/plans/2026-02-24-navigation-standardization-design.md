# Navigation Standardization — Design Document

**Date:** 2026-02-24
**Product:** Sevaro Ambulatory
**Scope:** Standardize navigation across all feature pages, separate Patient Messaging, repurpose Command Center, enhance Post-Visit Check-In

## Problem

The platform has four inconsistent navigation patterns:

1. **PlatformShell** — used only on the homepage
2. **Colored header with ← Home on left** — SDNE, Follow-Up, Wearable
3. **Dark header with Home button on right** — Patient Portal, Historian
4. **No back navigation at all** — Triage, Physician Workspace, Dashboard

Back link placement flips between left and right. Three pages have no way to return home. Patient Messaging is buried as a tab inside the Patient Portal instead of standing alone. The Dashboard is an exact duplicate of the Physician Workspace. The Post-Visit Check-In drops users into a conversation with no context about what's happening.

## Solution: Hybrid Two-Tier Navigation

Every feature page gets a standardized two-tier header.

### Tier 1 — PlatformShell (identical on every page)

- Dark slate bar (`#0F172A`), sticky at top, `z-50`
- Left: "Sevaro Ambulatory" brand → links to `/`
- Center: Home · About (hidden on mobile)
- Right: Auth state (Sign In button or user avatar/dropdown)

### Tier 2 — Feature Sub-Header (unique per page)

- Accent-colored background matching the feature's identity
- Left: `← Home` link → always navigates to `/`
- Center: Feature icon + page title + optional "Demo" badge
- Right: `→ Next Step` link → navigates to the next card in the journey track

### Journey-Aware Navigation

Each page knows its position in the journey and links to the next step:

| Page | Route | Track Position | ← Home | → Next Step |
|------|-------|---------------|---------|-------------|
| AI-Powered Triage | `/triage` | Clinician 1/3 | `/` | Physician Workspace → `/physician` |
| Physician Workspace | `/physician` | Clinician 2/3 | `/` | Digital Neuro Exam → `/sdne` |
| Digital Neurological Exam | `/sdne` | Clinician 3/3 | `/` | _(end of track)_ |
| Patient Intake | `/patient` | Patient 1/4 | `/` | AI Health Interview → `/patient/historian` |
| AI Health Interview | `/patient/historian` | Patient 2/4 | `/` | Patient Messaging → `/patient/messages` |
| Patient Messaging | `/patient/messages` | Patient 3/4 | `/` | Post-Visit Check-In → `/follow-up/conversation` |
| Post-Visit Check-In | `/follow-up/conversation` | Patient 4/4 | `/` | _(end of track)_ |
| AI Follow-Up Agent | `/follow-up` | Ongoing 1/3 | `/` | Wearable Monitoring → `/wearable` |
| Wearable Monitoring | `/wearable` | Ongoing 2/3 | `/` | Command Center → `/dashboard` |
| Clinician Command Center | `/dashboard` | Ongoing 3/3 | `/` | _(end of track)_ |

### Special Case: Physician Workspace

The Physician Workspace (`/physician`) has its own internal TopNav (patient search, queue tabs, timer). PlatformShell wraps above it, but the colored sub-header is **not** added. Instead, a `← Home` link is integrated into the existing TopNav's left side.

## Feature Accent Colors

| Page | Color Name | Hex |
|------|-----------|-----|
| Triage | Amber | `#F59E0B` |
| Physician Workspace | Teal | `#0D9488` |
| SDNE | Blue | `#1E40AF` |
| Patient Intake | Purple | `#8B5CF6` |
| AI Historian | Teal | `#0D9488` |
| Patient Messaging | Purple | `#8B5CF6` |
| Post-Visit Check-In | Green | `#16A34A` |
| Follow-Up Agent | Green | `#16A34A` |
| Wearable | Cyan | `#0EA5E9` |
| Command Center | Indigo | `#4F46E5` |

## Page-Specific Changes

### 1. New Page: `/patient/messages`

Extract the Messages tab content from PatientPortal into a standalone page.

- Own route at `/patient/messages`
- Hybrid header: PlatformShell + purple sub-header
- Next step → Post-Visit Check-In (`/follow-up/conversation`)
- Homepage card updated: route changes from `/patient?tab=messages` to `/patient/messages`

### 2. Repurposed: `/dashboard` → Overview Dashboard

Replace the duplicate EHR (ClinicalNote component) with a new overview dashboard.

- High-level summary: triage queue count, pending follow-ups, wearable alerts, recent patients
- Summary cards linking to each feature area
- Indigo accent color (`#4F46E5`)
- Hybrid header with PlatformShell + indigo sub-header

### 3. Enhanced: `/follow-up/conversation` → Landing Overview

Add a landing state before the conversation starts.

- Brief explainer: what a post-visit check-in is, who it's for, what the AI will do
- "Start Check-In" button launches the actual conversation
- Pattern matches AI Historian's scenario selection screen
- Existing conversation UI preserved — landing is just the new entry state

### 4. Updated: `/triage` → Add Navigation

Currently has zero navigation. Add:

- PlatformShell on top
- Amber sub-header with ← Home and → Physician Workspace

### 5. Updated: `/physician` → Add Home Link

Currently no way back to homepage. Add:

- PlatformShell above existing TopNav
- `← Home` link integrated into TopNav's left side (before the search bar)

### 6. Updated: All Existing Pages

Pages that already have custom headers (SDNE, Follow-Up, Wearable, Patient Portal, Historian) get:

- PlatformShell added above their existing header
- Existing custom header becomes the Tier 2 sub-header
- Back links standardized to `← Home` on the left
- `→ Next Step` added on the right where applicable

## Homepage Journey Data Updates

```
clinicianTrack: unchanged (3 cards)
patientTrack:
  - Card 3 route: '/patient?tab=messages' → '/patient/messages'
  - All other cards unchanged
ongoingCareTrack:
  - Card 3 description updated to reflect overview dashboard (not EHR)
  - All routes unchanged
```

## Shared Component: `FeatureSubHeader`

Create a reusable component for the Tier 2 sub-header:

```
Props:
  - title: string
  - icon: LucideIcon
  - accentColor: string (hex)
  - showDemo?: boolean (default true)
  - homeLink?: string (default '/')
  - nextStep?: { label: string, route: string }
```

Renders: colored bar with ← Home | icon + title + badge | → Next Step

## Scope Exclusions

- No changes to the mobile app (`/mobile/*`)
- No changes to login/signup pages (already have PlatformShell)
- No changes to the `/about` page (still a placeholder)
- No role-based content changes (Phase 2 of auth work)
- The overview dashboard (`/dashboard`) content design is separate — this doc covers the navigation shell and route changes only
