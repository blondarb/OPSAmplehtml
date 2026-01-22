# Sevaro Outpatient Clinical Note App - Figma Make Prompts

## Overview
These prompts are designed to help you create a clickable wireframe prototype in Figma Make based on the existing hospital Synapse interface, adapted for outpatient neurology use per the MVP PRD v1.2.

---

## Reference Images to Upload
Upload these screenshots to Figma Make as reference images:
1. **Screenshot 083857** - History Tab (chips, HPI, ROS, allergies)
2. **Screenshot 083954** - Imaging/Results Tab (Yes/No toggles - to be redesigned)
3. **Screenshot 084025** - Physical Exam Tab (date, vitals, neuro exam checkbox)
4. **Screenshot 084043** - Recommendation Tab (diagnosis dropdown, AI button)
5. **Screenshot 084336** - Neuro Exam Output (structured exam text)
6. **Screenshot 084435** - Plan Builder (diagnosis-specific recommendations)

---

## PROMPT 1: Main Layout Shell

```
Create a clinical documentation web app with a three-panel layout:

LEFT SIDEBAR (240px width, light gray background):
- At top: Patient info card showing avatar, name "Test Test", demographics "50, M #123123"
- Urgency badge "Non-Emergent" in teal/cyan
- Video call and phone buttons (teal colored)
- Links section: "PACS viewer | VizAI | Epic"
- "Prior Visits" collapsible section with list of visit dates
- Timeline section showing: Initial call, Time on video, Assessment time, Final recommendation time (all showing "N/A")
- "Recent consults" section at bottom

CENTER PANEL (flex-grow, white background):
- Tab navigation at top with 4 tabs: History, Imaging/Results, Physical Exams, Recommendation
- Active tab has teal underline indicator
- Main content area below tabs (scrollable)
- Each section has "Required" badge in red on right side for mandatory fields

RIGHT ACTION BAR:
- Floating action buttons: more options (...), thumbs up, microphone, add, copy
- "Pend" button (outlined)
- "Sign & complete" button (teal filled)

TOP NAVIGATION BAR:
- Sevaro brain logo on far left
- Search bar with placeholder "Search for patient name or MRN"
- Queue filters: "Acute Care 0", "Rounding 0" (active/highlighted), "EEG 0"
- Timer showing "MD2 08:20:22"
- Right side: "What's New" link, PHI indicator, notifications, dark mode toggle, user avatar

Use a clean medical UI aesthetic with teal (#0D9488) as primary color, white cards, subtle shadows, and Inter or similar sans-serif font.
```

---

## PROMPT 2: History Tab (Outpatient Adapted)

```
Create the History tab content for an outpatient neurology clinical note:

REASON FOR VISIT section:
- Label "Reason for visit" with red "Required" badge
- Row of selectable chips/tags: "Altered mental status", "Amnesia", "Blurry vision", "Chronic pain", "Confirmed stroke on neuroimaging", "Difficulty swallowing", "Dizziness/Vertigo", "Double vision", "Headache", "Hemorrhagic Stroke", "Hypoxic/Anoxic brain injury", "Memory problem", "Movement problem", "Multiple Sclerosis Exacerbation", "Myasthenia Gravis Exacerbation", "Neuropathy", "Numbness", "Parkinson Disease", "Prognosis after cardiac arrest", "Seizure", "Stroke like symptoms", "Syncope", "TIA", "Tremor", "Vision loss", "Weakness", "Other"
- Chips should be toggleable (teal when selected, gray outline when not)

HISTORY OF PRESENTING ILLNESS section:
- Large text area with placeholder "Min. 25 words"
- Red "Required" badge

CLINICAL SCALES section (NEW for outpatient):
- Collapsible sections for each scale category:
  - Headache Scales: MIDAS, HIT-6
  - Cognitive Scales: MoCA, Mini-Cog  
  - Movement Scales: UPDRS (selected items)
  - Mental Health: PHQ-9, GAD-7
- Each scale shows score input field and interpretation dropdown

REVIEW OF SYSTEMS section:
- Checkbox options: "Reviewed", "Unable to obtain due to:", "Other"
- Free text area when "Other" selected

ALLERGIES section:
- Options: "NKDA", "Reviewed in EHR", "Unknown", "Other"
- Free text area for custom entry

MEDICAL/SURGICAL/FAMILY/SOCIAL HISTORY section:
- Options: "Yes", "No, due to patient limitation", "N/A due to phone consult"

Style: Use white cards with subtle borders, consistent spacing (16-24px), teal accent color for interactive elements.
```

---

## PROMPT 3: Imaging/Results Tab (Redesigned - NO Yes/No Toggles)

```
Create the Imaging/Results tab with EXPANDABLE study entries (not Yes/No toggles):

IMAGING STUDIES section:
Create accordion-style expandable cards for each study type:

1. CT Head card:
   - Collapsed: Shows "CT Head" with expand arrow, "Add" button
   - Expanded: 
     - Date field (date picker)
     - Findings text area (multi-line)
     - Link to PACS field (URL input)
     - Interpretation dropdown: "Normal", "Abnormal - acute", "Abnormal - chronic", "Pending"

2. CTA Head & Neck card (same structure)
3. MRI Brain card (same structure)  
4. MRI Spine card (same structure)
5. CT Angiogram card (same structure)

CARDIAC STUDIES section:
- TTE (Echocardiogram) card
- EKG card
- Holter/Event Monitor card

NEURODIAGNOSTIC STUDIES section:
- EEG card with additional fields: Duration, Type (Routine/LTM/Ambulatory)
- EMG/NCS card
- Lumbar Puncture card with CSF results fields

LABORATORY RESULTS section:
- Expandable cards for: CBC, CMP, TSH, Vitamin levels, Drug levels
- Each shows: Date, Key values, Interpretation

EXTERNAL RECORDS section:
- Collapsible section for: "Prior clinic notes", "Outside hospital records", "Imaging CDs"
- Each has upload/link attachment option

Style notes:
- Use chevron icons for expand/collapse
- Collapsed cards show summary if data entered (e.g., "MRI Brain - 01/15/2026 - Normal")
- Teal "Add Study" button at bottom of each category
- Cards have subtle shadow when expanded
```

---

## PROMPT 4: Physical Exam Tab (Enhanced for Billing)

```
Create the Physical Exam tab with billing-compliant neurological examination:

INITIAL ASSESSMENT section:
- Date picker field (default today)
- Time fields: HH : MM with "Now" button

VITAL SIGNS card:
- Grid of input fields: Blood Pressure, Heart Rate, Temperature, Respiratory Rate, O2 Saturation, Weight
- "Fever symptoms" toggle: Febrile / Afebrile

GENERAL EXAM section:
- Appearance dropdown: "Well-appearing", "Ill-appearing", "No acute distress"
- HEENT quick buttons
- Cardiovascular quick note
- Pulmonary quick note

NEUROLOGICAL EXAMINATION section (comprehensive accordion):
Create expandable sub-sections:

1. Mental Status:
   - Level of consciousness: Alert, Drowsy, Obtunded, Comatose
   - Orientation checkboxes: Person, Place, Time, Situation
   - Attention: "Intact", "Impaired"
   - Speech: "Fluent", "Non-fluent", "Mute"
   - Language: "Intact", "Receptive deficit", "Expressive deficit"
   - Fund of knowledge: dropdown

2. Cranial Nerves:
   - Tabular format with columns: Nerve, Finding, Notes
   - CN II-XII with normal/abnormal toggles
   - Visual fields, pupil reactivity, EOM, facial sensation/strength, etc.

3. Motor Examination:
   - Strength grid: 5x4 table (R/L for Upper/Lower extremities)
   - Strength scale: 0-5
   - Tone: Normal, Increased, Decreased
   - Bulk: Normal, Atrophy, Fasciculations

4. Sensory Examination:
   - Light touch, Pinprick, Vibration, Proprioception
   - By region: Face, Arms, Legs, Trunk

5. Reflexes:
   - Grid: Biceps, Triceps, Brachioradialis, Patellar, Achilles
   - Babinski: Present/Absent

6. Coordination:
   - Finger-to-nose, Heel-to-shin, Rapid alternating movements
   - Each: Intact / Impaired with side selector

7. Gait:
   - Station, Casual gait, Tandem, Romberg
   - Not evaluated option

GENERAL NOTES section:
- Large free text area for additional observations
- "Normal neurological exam" quick-fill button

Style: Medical form aesthetic, clear section headers, subtle gray backgrounds for groupings
```

---

## PROMPT 5: Recommendation Tab with Plan Builder

```
Create the Recommendation tab with integrated Plan Builder:

DIAGNOSIS SEARCH section:
- Search input with placeholder "Search ICD-10 diagnosis..."
- Autocomplete dropdown showing: ICD code, diagnosis name, category
- Example results: "G40.909 - Epilepsy, unspecified", "G43.909 - Migraine, unspecified"
- Multiple diagnoses can be added as pills/tags
- Each diagnosis pill has X to remove and gear icon to open Plan Builder

PLAN BUILDER PANEL (slides in from right or modal):
- Header shows selected diagnosis: "Headache/Migraine" 
- Tabs within: "Customize" | "Use standard"
- Assessment text area with "Generate assessment" AI button (sparkle icon)

RECOMMENDATION SECTIONS (collapsible):
1. Laboratory Testing
   - Checkboxes: CBC, CMP, TSH, etc.
   - "Add more laboratory testing" link

2. Diagnostic Studies
   - Checkboxes: CT head without contrast, MRI brain without contrast, etc.
   - "Add more diagnostic studies" link

3. Imaging
   - Pre-populated options based on diagnosis
   - Checkboxes with expand for ordering details

4. Lumbar Puncture
   - Checkbox to include
   - Sub-options: Opening pressure, CSF studies

5. Treatments/Medications (NON-pregnant patients):
   - Common medications listed with checkbox
   - Dosing dropdown when selected
   - "Add custom medication" option

6. Referrals:
   - Checkboxes: Neurology follow-up, PT/OT, Speech therapy
   - Timeframe dropdown: 1 week, 2 weeks, 1 month

7. Patient Education:
   - Checkbox list of relevant instructions
   - Custom instructions text area

FREE-TEXT RECOMMENDATIONS area:
- Large text area
- "Pro-note template" and "Free-text recommendations" toggle buttons

FINAL RECOMMENDATION TIME:
- Date picker and time fields

OUTPUT PREVIEW panel (collapsible):
- Shows formatted plain-text note preview
- "Copy to clipboard" button
- "Copy for EHR" button (formats for plain text)

Style: Use teal checkmarks, clear hierarchy, scrollable sections
```

---

## PROMPT 6: Prior Visits Sidebar (Left Panel Enhancement)

```
Create an enhanced left sidebar for viewing prior visit history:

PRIOR VISITS section header:
- Collapsible with chevron
- "AI Summary" toggle switch

VISIT LIST:
- Stack of visit cards, most recent first
- Each card shows:
  - Date: "Jan 10, 2026"
  - Visit type badge: "Follow-up" / "New Patient" / "Urgent"
  - Chief complaint preview (truncated): "Headache, memory concerns..."
  - Provider name in small text

SELECTED VISIT DETAIL (expands inline or panel):
When a visit is clicked:
- Full date and provider
- Chief complaint
- Key diagnoses as pills
- Assessment summary (AI-generated, highlighted box)
- Medications list
- "View full note" link

AI SUMMARY PANEL (when toggled on):
- Header: "AI Visit Summary" with sparkle icon
- Bullet points summarizing:
  - Visit trends over time
  - Medication changes
  - Outstanding studies
  - Key concerns across visits
- "Regenerate" button

Style: Compact cards, good density, subtle hover states, teal accent for AI features
```

---

## PROMPT 7: Complete Flow Prototype Links

```
Create prototype links connecting the screens:

Navigation flows:
1. Tab navigation: History <-> Imaging/Results <-> Physical Exams <-> Recommendation
2. Clicking diagnosis in Recommendation opens Plan Builder overlay
3. Clicking visit in sidebar shows Prior Visit detail
4. "Generate assessment" button shows loading state then populates text
5. "Sign & complete" shows confirmation modal
6. "Copy for EHR" shows success toast notification

Interactive states to define:
- Tabs: Default, Hover, Active (with teal underline)
- Chips: Unselected (gray outline), Selected (teal fill)
- Buttons: Default, Hover, Pressed, Disabled
- Cards: Default, Hover (subtle lift), Expanded
- Input fields: Empty, Focused (teal border), Filled, Error (red border)

Prototype settings:
- Device: Desktop (1440px width)
- Transition: Smart animate, 300ms ease
- Starting screen: History tab
```

---

## Tips for Figma Make Success

1. **Upload all 6 screenshots first** as reference images so Figma Make understands the existing design language

2. **Start with Prompt 1** (Main Layout Shell) to establish the overall structure

3. **Work through prompts sequentially** - each builds on the previous

4. **Use consistent naming**: 
   - Frames: "History Tab", "Imaging Tab", etc.
   - Components: "Chip/Selected", "Chip/Default", "Card/Study/Collapsed", etc.

5. **Component variations**: Ask Figma Make to create component variants for different states

6. **Test the prototype flow** after connecting all screens

7. **Iterate on specific sections** by selecting a frame and asking for refinements

---

## Quick Reference: Design Tokens

```
Colors:
- Primary: #0D9488 (teal)
- Background: #FFFFFF
- Surface: #F9FAFB
- Text Primary: #111827
- Text Secondary: #6B7280
- Border: #E5E7EB
- Error: #EF4444
- Success: #10B981

Typography:
- Headings: Inter Semi-bold
- Body: Inter Regular
- Small: Inter Medium (for labels)

Spacing:
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px

Border Radius:
- sm: 4px
- md: 8px
- lg: 12px
- full: 9999px (for pills/chips)
```

---

*Generated for Sevaro Outpatient MVP based on PRD v1.2 and existing Synapse hospital interface screenshots*
