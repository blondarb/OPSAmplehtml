# Sevaro Outpatient Clinical Note - MVP PRD v1.3

**Document Version:** 1.3
**Last Updated:** January 18, 2026
**Status:** Implementation Complete - Demo Ready
**Repository:** [blondarb/OPSAmplehtml](https://github.com/blondarb/OPSAmplehtml)

---

## Executive Summary

Sevaro Outpatient Clinical Note is an AI-powered clinical documentation application designed specifically for outpatient neurology workflows. This PRD documents the MVP features implemented in the interactive demo prototype, focusing on streamlining clinical documentation, reducing cognitive load, and demonstrating AI-assisted workflows.

---

## Table of Contents

1. [Product Overview](#product-overview)
2. [Target Users](#target-users)
3. [Core MVP Features](#core-mvp-features)
4. [AI-Powered Features](#ai-powered-features)
5. [User Experience Enhancements](#user-experience-enhancements)
6. [Customization & Personalization](#customization--personalization)
7. [Technical Implementation](#technical-implementation)
8. [Feature Details](#feature-details)
9. [Future Roadmap](#future-roadmap)

---

## Product Overview

### Problem Statement
Outpatient neurologists spend significant time on clinical documentation, often after patient hours. Current EHR systems lack specialty-specific workflows and AI assistance, leading to documentation fatigue and reduced time for patient care.

### Solution
Sevaro Outpatient provides a purpose-built clinical documentation interface with:
- Neurology-specific form templates and clinical scales
- AI-assisted documentation generation
- Streamlined workflows optimized for outpatient visits
- Customizable interface that adapts to individual clinician preferences

### Demo URL
The interactive prototype is hosted at: `https://blondarb.github.io/OPSAmplehtml/`

---

## Target Users

| User Type | Primary Needs |
|-----------|--------------|
| Outpatient Neurologists | Fast documentation, AI assistance, specialty-specific scales |
| Nurse Practitioners | Streamlined workflows, quick phrase insertion, voice dictation |
| Medical Assistants | Patient intake, vital signs entry, scale administration |
| Clinical Administrators | Workflow optimization, training demonstrations |

---

## Core MVP Features

### 1. Multi-Tab Clinical Documentation

**What:** Four-tab interface organizing clinical note sections
- **History** - Chief complaint, HPI, ROS, allergies, clinical scales
- **Imaging/Results** - Expandable cards for CT, MRI, cardiac studies, labs
- **Physical Exams** - Vitals, comprehensive neurological exam with checkboxes
- **Recommendation** - ICD-10 diagnosis search, assessment, plan builder

**Why MVP Critical:**
- Mirrors clinician mental model of note structure
- Reduces cognitive load by organizing information logically
- Enables focused data entry without overwhelming the user

### 2. Patient Context Sidebar

**What:** Left sidebar displaying:
- Patient demographics (name, age, sex, MRN)
- AI-generated patient summary with key clinical highlights
- MIDAS score history with trend visualization
- Prior visits with expandable details
- Quick access links (PACS, VizAI, Epic)

**Why MVP Critical:**
- Provides immediate context without navigation
- Score history shows treatment efficacy at a glance
- Reduces clicks to access critical patient information

### 3. Clinical Scales Integration

**What:** Built-in tracking for neurology-specific scales:
- MIDAS (Migraine Disability Assessment)
- HIT-6 (Headache Impact Test)
- PHQ-9 (Depression screening)
- Score history with trend visualization
- Click-to-view detailed score breakdowns

**Why MVP Critical:**
- Standardized outcome measures are essential for neurology
- Tracking trends demonstrates treatment response
- Automated scoring reduces calculation errors

---

## AI-Powered Features

### 4. Global AI Tools Launcher

**What:** Floating star button accessing five AI workflows:
1. **Chart Prep** - AI-generated pre-visit summary
2. **Document Interaction** - Real-time transcription and documentation
3. **Ask AI** - Clinical question answering with patient context
4. **Patient Summary** - Generate patient-friendly visit summaries
5. **Handout Generator** - Create condition-specific patient education

**Why MVP Critical:**
- Single access point for all AI capabilities
- Demonstrates breadth of AI assistance possibilities
- Each workflow addresses specific documentation pain points

### 5. AI Listening Indicator

**What:** Animated indicator showing when AI is actively monitoring conversation (in Chart Prep and Document Interaction modes)
- Pulsing microphone icon with sound wave animation
- "AI Listening" status text
- Visual feedback that the system is engaged

**Why MVP Critical:**
- Builds trust by showing AI state clearly
- Prevents confusion about when dictation is active
- Professional, polished interaction design

### 6. AI Confidence Indicators

**What:** Visual badges on AI-generated content showing confidence levels:
- **High** (green) - AI has strong confidence in accuracy
- **Medium** (yellow) - Review recommended
- **Low** (red) - Requires verification

**Why MVP Critical:**
- Transparency about AI capabilities and limitations
- Guides clinician attention to areas needing review
- Supports responsible AI use in clinical settings

### 7. AI Text Actions

**What:** Sparkle menu on every text field offering:
- **Ask AI** - Get clinical insights about the content
- **Improve** - Enhance text clarity and completeness
- **Summarize** - Generate concise summaries

**Why MVP Critical:**
- AI assistance available in context, where needed
- Reduces context switching to separate AI tools
- Demonstrates inline AI augmentation capabilities

### 8. Drug Interaction Alerts

**What:** Contextual alert banners showing potential drug interactions:
- Warning level (yellow) for moderate interactions
- Severe level (red) for critical interactions
- Dismissible with audit trail
- Actionable information with affected medications

**Why MVP Critical:**
- Patient safety is paramount
- Demonstrates clinical decision support capabilities
- Shows how AI can proactively surface relevant information

---

## User Experience Enhancements

### 9. Dark Mode

**What:** System-wide dark theme toggle
- Accessible via moon/sun icon in header
- Smooth CSS variable-based transitions
- Preserves all UI functionality and readability
- Preference saved to localStorage

**Why MVP Critical:**
- Reduces eye strain during long documentation sessions
- Essential for clinicians working in dimly lit environments
- Modern expectation for professional applications
- Demonstrates attention to clinician well-being

### 10. Voice Dictation with Waveform Animation

**What:** Microphone button on all text fields with:
- Click-to-record functionality
- Animated waveform visualization during recording
- Visual "Recording..." indicator
- Simulated transcription on completion

**Why MVP Critical:**
- Voice input is faster than typing for narrative content
- Waveform provides clear recording state feedback
- Hands-free documentation enables multitasking
- Essential accessibility feature

### 11. Quick Phrases

**What:** Lightning bolt button offering contextual phrase shortcuts:
- Different phrases for different sections (HPI vs. imaging)
- One-click insertion at cursor position
- Expandable dropdown menu
- Examples: ".deny" → "Patient denies any recent changes in symptoms."

**Why MVP Critical:**
- Dramatically speeds up common documentation patterns
- Reduces repetitive typing
- Ensures consistent language across notes
- Customizable to individual practice patterns

### 12. Notification Badge

**What:** Red badge with count on notification bell icon
- Shows number of pending items (e.g., "2")
- Indicates unread alerts or messages
- Visual prominence without being intrusive

**Why MVP Critical:**
- Keeps clinicians aware of pending items
- Supports task prioritization
- Standard UX pattern for notifications

### 13. Live Clock Display

**What:** Real-time clock showing current time in PST/PDT
- Updates every second
- Displays timezone indicator
- Located in user info area

**Why MVP Critical:**
- Time awareness is crucial for documentation timestamps
- Supports accurate time-of-service recording
- Professional utility feature

---

## Customization & Personalization

### 14. Draggable Tab Reordering

**What:** Drag-and-drop tab repositioning
- Grab any tab and drag to new position
- Visual feedback during drag operation
- Order saved to localStorage automatically
- Persists across browser sessions

**Why MVP Critical:**
- Clinicians have different workflow preferences
- Some may prefer Recommendation tab first for follow-ups
- Personalization increases adoption and satisfaction
- Reduces friction in daily workflow

### 15. Vertical Scroll View

**What:** Toggle between tabbed and continuous scroll views
- "Scroll View" button in tab navigation area
- Shows all sections vertically with section headers
- Section dividers with icons for visual organization
- Preference saved to localStorage

**Why MVP Critical:**
- Some clinicians prefer seeing entire note at once
- Better for reviewing/editing completed notes
- Supports different cognitive styles and preferences
- Essential for comprehensive note review before signing

### 16. Guided Tour

**What:** Interactive walkthrough of key features
- "Tour" button in header launches guided experience
- 10-step tour highlighting major features
- Progress dots and navigation controls
- Dismissible at any point

**Why MVP Critical:**
- Reduces training burden for new users
- Self-service onboarding capability
- Demonstrates features that might be overlooked
- Professional polish for demos and evaluations

---

## Technical Implementation

### Architecture
- **Single-page application** - One HTML file with embedded CSS and JavaScript
- **No build process** - Runs directly in browser
- **GitHub Pages hosting** - Simple deployment and sharing
- **localStorage persistence** - User preferences survive sessions

### Browser Compatibility
- Chrome (recommended)
- Safari
- Firefox
- Edge

### Performance
- Fast initial load (single file)
- Smooth animations (CSS-based)
- Responsive interactions
- No external dependencies

---

## Feature Details

### Feature Implementation Status

| Feature | Status | Priority |
|---------|--------|----------|
| Multi-tab documentation | Complete | P0 |
| Patient context sidebar | Complete | P0 |
| Clinical scales (MIDAS, HIT-6, PHQ-9) | Complete | P0 |
| Global AI Tools launcher | Complete | P0 |
| AI listening indicator | Complete | P1 |
| AI confidence indicators | Complete | P1 |
| AI text actions (ask/improve/summarize) | Complete | P1 |
| Drug interaction alerts | Complete | P1 |
| Dark mode | Complete | P1 |
| Voice dictation with waveform | Complete | P1 |
| Quick phrases | Complete | P1 |
| Notification badge | Complete | P2 |
| Live clock | Complete | P2 |
| Draggable tab reordering | Complete | P1 |
| Vertical scroll view | Complete | P1 |
| Guided tour | Complete | P2 |

### localStorage Keys

| Key | Purpose |
|-----|---------|
| `sevaro-tab-order` | Saved tab order array |
| `sevaro-vertical-view` | Boolean for view preference |

---

## Future Roadmap

### Near-term Enhancements (Not in current MVP)
- Smart ICD-10 suggestions based on HPI content
- Patient photo display in sidebar
- Auto-save with recovery
- Print/export full note functionality
- Additional clinical scales

### Integration Opportunities
- EHR integration (Epic, Cerner)
- PACS viewer embedding
- Real voice recognition API
- Actual AI model integration

### Analytics & Insights
- Documentation time tracking
- Feature usage metrics
- Workflow optimization suggestions

---

## Appendix

### Design Tokens

```css
/* Colors */
--primary: #0D9488 (Teal)
--primary-light: #14B8A6
--primary-dark: #0F766E
--bg-white: #FFFFFF
--bg-gray: #F9FAFB
--text-primary: #111827
--text-secondary: #6B7280
--border: #E5E7EB
--error: #EF4444
--success: #10B981
--warning: #F59E0B

/* Typography */
Font: Inter, system sans-serif
Headings: 600 weight
Body: 400 weight, 14px
Labels: 500 weight, 12px

/* Spacing */
Section gap: 24px
Field gap: 16px
Border radius: 8px (cards), 6px (buttons)
```

### Changelog

**v1.3 (January 18, 2026)**
- Added dark mode toggle with localStorage persistence
- Added notification badge with count indicator
- Added AI confidence indicators to generated content
- Added voice waveform animation during dictation
- Added quick phrases dropdown for all text fields
- Added drug interaction alert demo
- Added guided tour with 10 interactive steps
- Added draggable tab reordering with localStorage
- Added vertical scroll view toggle
- Updated UI: removed "What's New" text, TNK badge, Non-Emergent badge
- Added live PST/PDT clock display

**v1.2**
- Global AI Tools launcher with 5 workflows
- AI listening indicators
- Prior visits sidebar with AI summary
- Clinical scales integration

**v1.1**
- Initial tab structure
- Basic form layouts
- ICD-10 diagnosis search

---

*Document maintained by Sevaro Product Team*
*For questions: product@sevaro.health*
