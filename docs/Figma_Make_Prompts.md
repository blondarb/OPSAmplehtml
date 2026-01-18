# Sevaro Outpatient Clinical Note App - Figma Make Prompts

## Overview
These prompts are designed to help you create a clickable wireframe prototype in Figma Make based on the existing hospital Synapse interface, adapted for outpatient neurology use per the MVP PRD v1.2.

**IMPORTANT:** Each prompt below references a specific uploaded image. When using Figma Make, paste the prompt AND point to (or select) the referenced image so it uses that as the visual guide.

---

## Reference Images Uploaded
1. **Screenshot 083857** - History Tab (chips, HPI, ROS, allergies)
2. **Screenshot 083954** - Imaging/Results Tab (Yes/No toggles - to be redesigned)
3. **Screenshot 084025** - Physical Exam Tab (date, vitals, neuro exam checkbox)
4. **Screenshot 084043** - Recommendation Tab (diagnosis dropdown, AI button)
5. **Screenshot 084336** - Neuro Exam Output (structured exam text format)
6. **Screenshot 084435** - Plan Builder (diagnosis-specific recommendations)

---

## PROMPT 1: Main Layout Shell

**📷 REFERENCE IMAGE: Screenshot 083857 (History Tab)**

```
Look at the uploaded image "Screenshot 083857" showing a clinical documentation interface. Recreate this exact layout structure:

LEFT SIDEBAR (match the gray sidebar on the left):
- Patient info card at top: avatar, name "Test Test", demographics "50, M #123123"
- Teal "Non-Emergent" badge
- Teal "Video" and phone call buttons
- Links: "PACS viewer | VizAI | Epic"
- "Prior Visits" section (replaces Timeline - NOT needed for outpatient)
- NO Timeline section - remove this for outpatient workflow

CENTER PANEL (match the white content area):
- Tab navigation: History, Imaging/results, Physical exams, Recommendation
- Active tab has teal underline
- Content area with form sections
- Red "Required" badges on right side of mandatory fields

TOP NAV BAR (match the header):
- Sevaro brain logo (teal)
- Search bar: "Search for patient name or MRN"
- Queue pills: "Acute Care 0", "Rounding 0", "EEG 0", "Outpatient 1" (Outpatient is ACTIVE/highlighted)
- Timer: "MD2 08:20:22"
- Right side: "What's New", PHI badge, notifications, dark mode toggle, user avatar

RIGHT ACTION BAR:
- Floating buttons: more (...), thumbs up, microphone, plus, copy
- "Pend" outlined button
- "Sign & complete" teal filled button

Match the exact colors, spacing, and visual style from the reference image.
```

---

## PROMPT 2: History Tab Content

**📷 REFERENCE IMAGE: Screenshot 083857 (History Tab)**

```
Look at the uploaded image "Screenshot 083857" showing the History tab. Recreate the content area with these sections:

REASON FOR CONSULT section (match the chip/tag layout):
- Rows of selectable chips exactly as shown: "Altered mental status", "Amnesia", "Blurry vision", "Chronic pain", "Confirmed stroke on neuroimaging", "Difficulty swallowing", "Dizziness/Vertigo", "Double vision", "Headache", "Hemorrhagic Stroke", etc.
- Gray outline for unselected, teal fill for selected
- Red "Required" badge on right

HISTORY OF PRESENTING ILLNESS:
- Large text area with teal placeholder "Min. 25 words"
- Red "Required" badge

ADD NEW SECTION for outpatient - CLINICAL SCALES:
- Collapsible accordion sections:
  - "Headache Scales" containing: MIDAS score input, HIT-6 score input
  - "Cognitive Scales" containing: MoCA score, Mini-Cog score
  - "Movement Scales" containing: UPDRS items
  - "Mental Health" containing: PHQ-9 score, GAD-7 score
- Each with score field and interpretation dropdown

REVIEW OF SYSTEMS (match the checkbox layout):
- Options: "Reviewed", "Unable to obtain due to:", "Other"

ALLERGIES:
- Options: "NKDA", "Reviewed in EHR", "Unknown", "Other"

MEDICAL/SURGICAL/FAMILY/SOCIAL HISTORY:
- Options: "Yes", "No, due to patient limitation", "N/A due to phone consult"

Match the card styling, spacing, and typography from the reference.
```

---

## PROMPT 3: Imaging/Results Tab (REDESIGNED)

**📷 REFERENCE IMAGE: Screenshot 083954 (Imaging/Results Tab) - USE AS LAYOUT REFERENCE ONLY**

```
Look at the uploaded image "Screenshot 083954" for the general layout and positioning, but REDESIGN the content. Replace the Yes/No toggles with expandable accordion cards:

Keep the same overall layout structure but change the content to:

IMAGING STUDIES section:
Create accordion cards (collapsed by default) for:
- "CT Head" - chevron to expand, shows: Date picker, Findings textarea, PACS link field, Interpretation dropdown
- "CTA Head & Neck" - same expandable structure
- "MRI Brain" - same expandable structure
- "MRI Spine" - same expandable structure

When expanded, each card shows:
- Date field with calendar picker
- Findings: multi-line text area
- Link to PACS: URL input field
- Interpretation: dropdown with "Normal", "Abnormal - acute", "Abnormal - chronic", "Pending"

CARDIAC STUDIES section:
- "TTE" expandable card
- "EKG" expandable card
- "Holter/Event Monitor" expandable card

LAB RESULTS section (keep the chips from original):
- "Lipid profile panel", "HbA1c", "Other lab results" as clickable chips
- Each expands to show date + values

OTHER RESULTS:
- Expandable card instead of Yes/No

Style: Use chevron icons, subtle shadows on expanded cards, teal "Add Study" buttons
```

---

## PROMPT 4: Physical Exam Tab

**📷 REFERENCE IMAGES: Screenshot 084025 (Physical Exam Tab) + Screenshot 084336 (Neuro Exam Output)**

```
Look at uploaded images "Screenshot 084025" for the tab layout and "Screenshot 084336" for the neurological exam structure. Create the Physical Exam tab:

INITIAL ASSESSMENT section (match 084025):
- Date picker showing "01/16/2026"
- Time fields: HH : MM with "Now" button
- Match the exact styling from the reference

NEURO EXAM checkbox (from 084025):
- Replace the simple checkbox with an expandable comprehensive exam section

VITAL SIGNS (match the layout from 084025):
- Glucose (mg/dL), BP (mm/Hg), Oxygen saturation (%), Pulse (bpm)
- Fever symptoms: "Febrile" / "Afebrile" toggle buttons

NEUROLOGICAL EXAMINATION (use structure from 084336):
Create expandable accordion sections matching the output format shown:

1. "General Appearance" - dropdown: "In no apparent distress", etc.

2. "Mental Status" accordion:
   - Awake/Alert toggle
   - Oriented checkboxes: Name, Date, Location, Birthdate, Situation
   - "Following commands" checkbox

3. "Cranial Nerves" accordion:
   - Visual fields, Eye motility, Facial sensation, Facial motor, Tongue
   - Each with normal/abnormal options and notes field

4. "Motor" accordion:
   - "Antigravity in arms and legs" checkbox
   - "Moving spontaneously and to command" checkbox
   - "No drift in upper extremities" checkbox

5. "Sensation" accordion:
   - "No sensory loss to light touch in face, arms or legs B/L" checkbox

6. "Coordination" accordion:
   - Finger to nose: Intact/Impaired
   - Heel to shin: Intact/Impaired

7. "Gait" accordion:
   - Options: Evaluated / Not evaluated
   - Station, Casual gait, Tandem fields

Add "Normal neurological exam" quick-fill button at top of neuro section.
```

---

## PROMPT 5: Recommendation Tab

**📷 REFERENCE IMAGE: Screenshot 084043 (Recommendation Tab)**

```
Look at the uploaded image "Screenshot 084043" showing the Recommendation tab. Recreate this layout:

DIFFERENTIAL DIAGNOSIS section (match the dropdown):
- Search/dropdown field with red "Required" badge
- Change to: ICD-10 searchable input with autocomplete
- Shows results like: "G40.909 - Epilepsy, unspecified"
- Selected diagnoses appear as removable pills/tags

GENERATE ASSESSMENT button (match the teal button with sparkle icon):
- Keep exact styling: teal background, sparkle/AI icon, "Generate assessment" text

ASSESSMENT text area (add this - shown in 084435):
- Multi-line text area
- Pre-populated with AI-generated assessment when button clicked
- Red "Required" badge

RECOMMENDATIONS section (match the layout):
- "Pro-note template" and "Free-text recommendations" toggle chips
- Large text area for recommendations
- Red "Required" badge

FINAL RECOMMENDATION TIME (match the date/time fields):
- Date picker and HH:MM time fields
- "Now" button

Add OUTPUT PREVIEW panel:
- Collapsible section showing plain-text formatted note
- "Copy for EHR" button (copies plain text)
- "Copy to clipboard" button
```

---

## PROMPT 6: Plan Builder Overlay

**📷 REFERENCE IMAGE: Screenshot 084435 (Plan Builder)**

```
Look at the uploaded image "Screenshot 084435" showing the Plan Builder interface. Create this as a slide-in panel or modal:

HEADER:
- Shows selected diagnosis: "Headache/Migraine"
- "Customize" | "Use standard" toggle tabs (match the teal styling)

ASSESSMENT section:
- "Generate assessment" button with sparkle icon
- Text area showing AI-generated assessment text
- Red "Required" badge

RECOMMENDATIONS section with collapsible categories:

1. "Laboratory testing" accordion:
   - Checkboxes: Initial, CBC, CMP, TSH (match the layout shown)
   - "Add more laboratory testing (Optional)" link

2. "Lumbar Puncture" accordion:
   - "LUMBAR PUNCTURE" checkbox
   - Sub-items when expanded: Opening pressure, CSF studies list

3. "Diagnostic Studies" accordion:
   - Checkboxes: CT head without contrast, MRI brain without contrast, etc.
   - "Add more diagnostic studies (Optional)" link

4. "Treatments NON/pregnant patients" accordion:
   - Medication checkboxes with dosing options

Match the exact indentation, checkbox styling, and typography from the reference image.
```

---

## PROMPT 7: Prior Visits Sidebar (Outpatient Optimized)

**📷 REFERENCE IMAGE: Screenshot 083857 (use the left sidebar as base)**

```
Look at the left sidebar in "Screenshot 083857". For the OUTPATIENT version, REMOVE the Timeline section entirely (it's not relevant for outpatient workflow). Instead, create a "Prior Visits" section:

PRIOR VISITS header:
- Collapsible with chevron icon
- Add "AI Summary" toggle switch on right

VISIT CARDS (stack vertically):
- Each card shows:
  - Date: "Jan 10, 2026"
  - Visit type badge: "Follow-up" (blue) / "New Patient" (green) / "Urgent" (red)
  - Chief complaint preview: "Headache, memory concerns..."
  - Provider name in small gray text
- Cards have subtle hover state (lift shadow)

SELECTED VISIT EXPANSION:
When a visit card is clicked, expand inline to show:
- Full date and provider
- Chief complaint (full text)
- Diagnoses as small pills
- Assessment summary in highlighted box
- Medications list
- "View full note" link

AI SUMMARY PANEL (when toggle is ON):
- Header: "AI Visit Summary" with sparkle icon
- Bullet points:
  - Visit trends over time
  - Medication changes
  - Outstanding studies
  - Key concerns
- "Regenerate" button

Keep the same width and styling as the existing sidebar from the reference.
```

---

## PROMPT 8: Connect Prototype Flows

```
Connect all the screens created above with these interactions:

TAB NAVIGATION:
- Clicking "History" tab → shows History Tab content
- Clicking "Imaging/results" tab → shows Imaging/Results Tab content
- Clicking "Physical exams" tab → shows Physical Exam Tab content
- Clicking "Recommendation" tab → shows Recommendation Tab content
- Active tab gets teal underline, others are gray

PLAN BUILDER FLOW:
- Clicking gear icon on diagnosis pill → slides in Plan Builder panel from right
- Clicking outside Plan Builder → closes it
- Clicking "Use standard" → populates checkboxes with defaults

AI INTERACTIONS:
- "Generate assessment" button → shows loading spinner → populates text area
- AI Summary toggle → shows/hides AI summary panel in sidebar

PRIOR VISITS:
- Clicking visit card → expands to show details
- Clicking again → collapses

ACTIONS:
- "Sign & complete" → shows confirmation modal
- "Copy for EHR" → shows success toast "Copied to clipboard"
- "Pend" → shows "Note saved" toast

Set transitions to Smart Animate, 300ms ease-out.
Starting screen: History Tab
```

---

## Tips for Best Results

1. **Reference the specific image** in each prompt - say "Look at Screenshot 083857" explicitly

2. **Run prompts in order** (1 through 8) - each builds on previous

3. **If Figma Make misses something**, follow up with: "In the [section name], make it match the reference image more closely"

4. **For the redesigned Imaging tab**, emphasize: "Keep the layout from the reference but replace Yes/No with expandable cards"

5. **Component naming** - ask Figma Make to name frames clearly: "History Tab", "Imaging Tab", etc.

---

## Design Tokens Reference

```
Colors (from screenshots):
- Primary Teal: #0D9488
- Background: #FFFFFF
- Sidebar: #F9FAFB
- Text Dark: #111827
- Text Gray: #6B7280
- Border: #E5E7EB
- Required Red: #EF4444
- Success Green: #10B981

Typography:
- Font: Inter (or system sans-serif)
- Headings: Semi-bold
- Body: Regular, 14px
- Labels: Medium, 12px

Spacing:
- Section gap: 24px
- Field gap: 16px
- Chip gap: 8px

Border Radius:
- Cards: 8px
- Buttons: 6px
- Chips: 9999px (full round)
```

---

*Generated for Sevaro Outpatient MVP - Use with uploaded screenshots in Figma Make*
