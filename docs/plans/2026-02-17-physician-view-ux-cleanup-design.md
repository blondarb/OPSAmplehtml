# Physician View UX Cleanup — Design

**Date:** 2026-02-17
**Approach:** Targeted cleanup (Approach A)

## Problem

The physician EHR documentation view has several UX issues for demo purposes:
1. Generate Note, Pend, and Sign & Complete buttons are visually too large for a dense clinical toolbar
2. Left sidebar icons (7 of 10) don't navigate anywhere — confusing for demo viewers
3. Top-nav queue tabs (Acute Care, Rounding, EEG) are clickable but non-functional in this outpatient demo
4. No "pin" feature needed — confirmed as transcription error for "pend"; auto-save + Pend covers persistence

## Changes

### 1. Compact Action Buttons (CenterPanel.tsx)

Reduce all three buttons from `padding: 8px 14-16px / fontSize: 13px` to `padding: 4px 10px / fontSize: 11px`. Shrink Generate Note icon from 14px to 12px. Keep all existing behavior, colors, and states unchanged.

### 2. Dim Inactive Sidebar Icons (ClinicalNote.tsx — IconSidebar)

The 7 non-functional icons (Calendar, Patients, Schedule, Workflows, Documents, Calls, Help):
- Set `opacity: 0.3`
- Change tooltip to include "— not active in demo"
- Don't update `activeIcon` on click (no highlight)
- Set `cursor: default`

Functional icons (Home, Notes, Settings) remain unchanged.

### 3. Toast for Non-Outpatient Queue Tabs (TopNav.tsx)

When Acute Care, Rounding, or EEG is clicked:
- Show toast: "This is the outpatient module demo. Acute Care, Rounding, and EEG modules are already active in production."
- Auto-dismiss after 4 seconds
- Don't switch `activeQueue` away from outpatient
- Implement as `useState`-driven div positioned fixed near top-center

### 4. No Pin Feature

Confirmed unnecessary. Auto-save (localStorage, 2s debounce) handles drafts. Pend saves to database. No changes needed.

## Files to Modify

- `src/components/CenterPanel.tsx` — button sizing
- `src/components/ClinicalNote.tsx` — IconSidebar inactive icons
- `src/components/TopNav.tsx` — queue tab toast
