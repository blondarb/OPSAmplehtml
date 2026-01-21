# Figma Make Prompts - Sevaro Outpatient Clinical Note

Use these detailed prompts with Figma Make to recreate the Sevaro clinical documentation interface. Execute them in order for best results.

---

## Design System Setup

### Prompt 1: Color System
```
Create a design system with the following color tokens:

Primary colors:
- primary: #0D9488 (teal)
- primary-light: #14B8A6
- primary-dark: #0F766E

Background colors:
- bg-white: #FFFFFF
- bg-gray: #F9FAFB
- bg-dark: #F3F4F6

Text colors:
- text-primary: #111827
- text-secondary: #6B7280
- text-muted: #9CA3AF

Semantic colors:
- error: #EF4444
- success: #10B981
- warning: #F59E0B

Border color: #E5E7EB
```

### Prompt 2: Typography System
```
Create a typography system using Inter font family with these styles:

- H1: Inter, 18px, Semi-bold (600), line-height 1.5
- H2: Inter, 16px, Semi-bold (600), line-height 1.5
- H3: Inter, 15px, Semi-bold (600), line-height 1.5
- H4: Inter, 14px, Semi-bold (600), line-height 1.5
- H5: Inter, 13px, Semi-bold (600), line-height 1.5
- Body: Inter, 14px, Regular (400), line-height 1.5
- Body Small: Inter, 13px, Regular (400), line-height 1.5
- Caption: Inter, 12px, Regular (400), line-height 1.5
- Micro: Inter, 11px, Medium (500), line-height 1.5
- Badge: Inter, 10px, Medium (500), line-height 1.5
```

---

## Page Layout (1440x900 desktop)

### Prompt 3: Main Layout Structure
```
Create a desktop application layout (1440x900) with:

1. Top navigation bar:
   - Full width, 60px height
   - White background (#FFFFFF)
   - 1px bottom border (#E5E7EB)
   - Padding: 12px 20px
   - Flexbox row, space-between alignment

2. Main content area below nav:
   - Full remaining height
   - Flexbox row layout with 3 columns:
     - Left sidebar: 260px fixed width
     - Center panel: flex-grow (fills remaining space)
     - Right action bar: 60px fixed width

Background color for page: #F9FAFB
```

---

## Top Navigation Bar

### Prompt 4: Navigation - Left Section
```
Create the left section of a navigation bar containing:

1. Logo area:
   - 32x32px teal (#0D9488) icon placeholder
   - 8px gap between icon and text

2. Search bar:
   - 280px width, 40px height
   - Light gray background (#F9FAFB)
   - 1px border (#E5E7EB), 8px border-radius
   - Search icon (gray #9CA3AF) on left, 8px margin-right
   - Placeholder text: "Search patients..." in 14px

3. Queue filter pills (3 pills with 8px gap):
   - Each pill: padding 6px 12px, border-radius 20px
   - Default: white bg, 1px gray border, gray text (#6B7280)
   - Active state: dark (#111827) background, white text
   - Pills labeled: "In-Queue", "Completed", "All"
   - "In-Queue" should be active
```

### Prompt 5: Navigation - Right Section
```
Create the right section of a navigation bar containing (16px gap between items):

1. Timer badge:
   - Teal background (#0D9488), white text
   - Padding 6px 12px, border-radius 6px
   - Clock icon + "12:34" text, 13px font, medium weight

2. Icon buttons (36x36px each, 8px border-radius):
   - Bell icon with red notification badge (16px circle with "2")
   - Moon icon for dark mode toggle
   - Each icon is gray (#6B7280), hover shows light gray bg

3. "PRDs" button:
   - Gray border, white background
   - Document icon + "PRDs" text
   - Padding 8px 12px, border-radius 6px

4. "Tour" button:
   - Same style as PRDs button
   - Question mark circle icon + "Tour" text

5. Star button (AI Tools):
   - Teal (#0D9488) background, white star icon
   - 36x36px, 8px border-radius

6. User avatar:
   - 36px circle, teal background
   - White initials "SA" centered
   - 14px font, semi-bold
```

---

## Left Sidebar (260px width)

### Prompt 6: Patient Card Section
```
Create a patient information card for a sidebar:

1. Container:
   - White background, 16px padding
   - 1px bottom border (#E5E7EB)

2. Patient header row:
   - 40px circular avatar (light gray #F3F4F6 background, person icon)
   - Patient name: "Test Test" - 15px, semi-bold
   - Details: "50, M #123123" - 13px, gray (#6B7280)
   - Edit icon (pencil) on far right
   - 12px gap between avatar and text

3. Action buttons row (8px gap, margin-top 12px):
   - "Video" button: teal bg (#0D9488), white text, video camera icon
   - Phone button: lighter teal (#14B8A6), white, phone icon
   - Both: padding 8px 16px, 8px border-radius, 13px font

4. Below patient card, add quick links section:
   - Padding 12px 16px
   - Teal links: "PACS viewer | VizAI | Epic"
   - 13px font, separated by gray pipes
```

### Prompt 7: Prior Visits Section
```
Create a "Prior Visits" collapsible section for sidebar:

1. Section header:
   - "Prior Visits" title (13px, semi-bold)
   - "AI Summary" toggle on right (small switch, active state)
   - Padding 12px 16px

2. Visit cards (stacked, 8px gap):

   Card 1 (expanded state):
   - Background: white with 1px teal border
   - Padding 12px, 8px border-radius
   - Header row: "Jan 10, 2026" (bold) + blue "Follow-up" badge
   - "Headache, memory concerns" - 12px gray text
   - "Dr. Smith" - 11px muted text
   - AI Summary box below (gradient bg: #F0FDFA to #ECFDF5):
     - Star icon + "AI Summary" header (12px, teal)
     - Summary text: 12px gray

   Card 2 (collapsed state):
   - Background: #F9FAFB
   - Same structure without expanded AI summary
   - Green "New Patient" badge instead of blue
```

### Prompt 8: Score History Section
```
Create a "Score History" section for the sidebar:

1. Header:
   - Bar chart icon + "Score History" title
   - Chevron down icon for expand/collapse
   - Padding 12px 16px

2. Score cards (3 cards stacked):

   MIDAS Score Card:
   - Title: "MIDAS" (13px, semi-bold)
   - Trend indicator: green "Improving" with up-arrow icon
   - History list (4 items):
     - "Jan 16, 2026" | "18" with "Moderate" badge (gray, 10px)
     - "Jan 10, 2026" | "24" with "Moderate" badge
     - "Dec 15, 2025" | "42" with "Severe" badge (red-ish)
     - "Nov 1, 2025" | "56" with "Severe" badge
   - Each row: date on left (12px), value + interpretation on right

   HIT-6 Score Card:
   - "Stable" trend with horizontal line icon
   - 3 history items with "Substantial" or "Severe" interpretations

   PHQ-9 Score Card:
   - "Improving" trend
   - 2 history items with "Mild" and "Moderate" interpretations
```

---

## Center Panel (Main Content Area)

### Prompt 9: Tab Navigation Bar
```
Create a horizontal tab navigation:

1. Container:
   - White background
   - 1px bottom border (#E5E7EB)
   - Padding: 0 24px on left, 16px on right
   - Flexbox row, space-between

2. Tab buttons (4 tabs):
   - Padding: 16px 20px each
   - Font: 14px, medium weight
   - Default: gray text (#6B7280)
   - Active: teal text (#0D9488) with 2px teal bottom border
   - Tabs: "History" (active), "Imaging/results", "Physical exams", "Recommendation"

3. View toggle button on right:
   - Gray background (#F9FAFB), 1px gray border
   - Hamburger lines icon + "Scroll View" text
   - Padding 6px 12px, 6px border-radius
   - 12px font, medium weight
```

### Prompt 10: History Tab - Chief Complaint Section
```
Create a form section card for "Reason for visit":

1. Card container:
   - White background (#FFFFFF)
   - 12px border-radius
   - 20px padding
   - Subtle shadow: 0 1px 3px rgba(0,0,0,0.05)
   - Margin-bottom: 16px

2. Section header:
   - "Reason for visit" title (14px, semi-bold)
   - Red "Required" badge on right
     - Badge: #EF4444 background, white text
     - Padding 3px 8px, 4px border-radius, 11px font

3. Chips container (flexbox wrap, 8px gap):
   Create 20 selectable chips:
   - Default state: white bg, 1px gray border, gray text
   - Hover: teal border, teal text
   - Selected: teal bg (#0D9488), white text
   - Padding: 8px 14px, border-radius 20px, 13px font

   Chips: "Altered mental status", "Amnesia", "Blurry vision", "Chronic pain", "Dizziness/Vertigo", "Double vision", "Headache" (selected), "Memory problem", "Movement problem", "Neuropathy", "Numbness", "Parkinson Disease", "Seizure", "Stroke like symptoms", "Syncope", "TIA", "Tremor", "Vision loss", "Weakness", "Other"
```

### Prompt 11: History Tab - HPI Textarea Section
```
Create a form section for "History of presenting illness":

1. Card container (same style as previous):
   - White background, 12px radius, 20px padding, subtle shadow

2. Header:
   - "History of presenting illness" (14px, semi-bold)
   - Red "Required" badge

3. Textarea with AI features:
   - Full width, min-height 120px
   - Padding: 12px (plus extra 80px on right for icons)
   - 1px gray border, 8px border-radius
   - Placeholder: "Min. 25 words" in teal color
   - Focus state: teal border with teal glow shadow

   Pre-filled text: "50-year-old male presents for follow-up of chronic daily headaches. Patient reports headaches have improved from daily to approximately 3-4 per week since starting topiramate..."

4. AI action icons (positioned top-right of textarea, 8px gap):
   - Lightning bolt icon (quick phrases)
   - Microphone icon (dictation)
   - Sparkle icon with gradient teal background (AI actions)
   - Each: 24px square button, gray icons, light border
```

### Prompt 12: Clinical Scales Accordion Section
```
Create an accordion section for "Clinical Scales":

1. Card container with "Clinical Scales" title + gray "Optional" badge

2. Three collapsible accordions:

   Accordion 1 - "Headache Scales" (expanded):
   - Header: 8px green filled dot + "Headache Scales" text + chevron down
   - Border: 1px gray, 8px radius
   - Header padding: 14px 16px
   - Expanded content (gray bg #F9FAFB):

     Scale rows (2 items):
     - Row 1: "MIDAS Score" label | 80px number input (value: 18) | dropdown "Moderate disability"
     - Row 2: "HIT-6 Score" label | 80px number input (value: 58) | dropdown "Substantial impact"
     - Each row: flexbox, 16px gap, 12px vertical padding, bottom border

   Accordion 2 - "Cognitive Scales" (collapsed):
   - 8px empty gray dot + "Cognitive Scales" + chevron right

   Accordion 3 - "Mental Health Screens" (collapsed):
   - 8px empty gray dot + "Mental Health Screens" + chevron right
```

### Prompt 13: Review of Systems & Allergies Sections
```
Create two form sections for radio button groups:

1. "Review of systems" section:
   - Red "Required" badge
   - 3 radio options in a row (16px gap):
     - "Reviewed" (selected)
     - "Unable to obtain due to:"
     - "Other"
   - Radio buttons use teal accent color

2. "Allergies" section:
   - Red "Required" badge
   - 4 radio options:
     - "NKDA" (selected)
     - "Reviewed in EHR"
     - "Unknown"
     - "Other"
```

---

## Right Action Bar (60px width)

### Prompt 14: Right Action Bar
```
Create a vertical action bar:

1. Container:
   - 60px width, full height
   - White background
   - 1px left border (#E5E7EB)
   - Padding: 16px 8px
   - Flexbox column, center align, 8px gap

2. Icon buttons (top section, 6 buttons):
   - Each: 40x40px, 8px border-radius
   - Default: white bg, 1px gray border, gray icon
   - Hover: light gray bg, teal border, teal icon
   - Icons: Printer, Share, Bookmark, History/clock, Settings gear, Question mark

3. Star button (teal primary):
   - 40x40px, teal background, white star icon
   - This opens the AI drawer

4. Spacer (flex-grow to push bottom buttons down)

5. Bottom buttons (vertical text):
   - "Pend" button: white bg, gray border, "PEND" text rotated 90deg
   - "Sign & Close" button: teal bg, white text, rotated 90deg
   - Both: 8px border-radius, padding 10px 12px
```

---

## Imaging/Results Tab

### Prompt 15: Study Cards
```
Create expandable study cards for the Imaging tab:

1. Tab content area:
   - Gray background (#F9FAFB)
   - 24px padding

2. Create 4 study cards (collapsed style):

   Card structure:
   - White background, 1px gray border, 8px radius
   - Margin-bottom: 8px

   Card header (clickable):
   - Padding: 14px 16px
   - Left: icon + title
   - Right: summary text (12px, muted) + chevron down

   Cards:
   - CT icon + "CT Studies" | "2 studies"
   - Brain/MRI icon + "MRI Studies" | "3 studies"
   - Heart icon + "Cardiac" | "1 study"
   - Flask icon + "Labs" | "Recent results"

3. Expanded card content (show for one card):
   - Gray background (#F9FAFB)
   - 1px top border
   - 16px padding
   - Contains textarea for findings + AI action buttons
```

---

## Recommendation Tab

### Prompt 16: Diagnosis Search Section
```
Create a diagnosis search interface:

1. Search input with dropdown:
   - Full width input, 48px height
   - Search icon on left (14px from edge)
   - Placeholder: "Search diagnoses by name or ICD-10 code..."
   - 1px gray border, 8px radius
   - Focus: teal border

2. Dropdown menu (shown state):
   - White background
   - 1px border, 8px radius
   - Box shadow: 0 4px 12px rgba(0,0,0,0.1)
   - Max-height: 250px, scrollable
   - Z-index: 100

3. Dropdown options (show 4):
   - Padding: 12px 16px each
   - Hover: gray background
   - Format: [ICD Code in teal bold] [Diagnosis name] | [Category in muted text]
   - Examples:
     - "G43.909 | Migraine, unspecified | Primary"
     - "G43.909 | Chronic migraine without aura | Primary"
     - "R51.9 | Headache, unspecified | Symptom"

4. Selected diagnoses (pill display):
   - Flexbox row, wrap, 8px gap
   - Each pill: gray bg, 1px border, 20px border-radius
   - Content: diagnosis text + small teal "Plan" button + gray X remove button
   - Padding: 8px 12px
```

### Prompt 17: Assessment & Plan Output
```
Create the assessment output section:

1. "Generate Assessment" button:
   - Teal background, white text
   - Sparkle icon + "Generate Assessment" text
   - Padding: 12px 20px, 8px border-radius
   - Font: 14px, medium weight

2. Output preview box (code-like display):
   - Dark background (#1F2937)
   - 8px border-radius
   - 16px padding
   - Margin-top: 16px

3. Preview header:
   - "Generated Output" title (white, 13px)
   - "Copy" button (teal bg, white text, small)
   - Flexbox row, space-between

4. Preview content:
   - Monospace font (Monaco/Menlo)
   - Light gray text (#E5E7EB)
   - 12px font size
   - Line-height: 1.6
   - Pre-formatted clinical note text
```

---

## AI Tools Drawer (Right Slide Panel)

### Prompt 18: AI Drawer Structure
```
Create a slide-in drawer panel from the right:

1. Overlay:
   - Full screen, semi-transparent black (rgba(0,0,0,0.5))
   - Z-index: 1000

2. Drawer panel:
   - 420px width, full height
   - White background
   - Shadow: -4px 0 20px rgba(0,0,0,0.1)
   - Positioned on right edge

3. Drawer header:
   - Gradient background: #F0FDFA to #ECFDF5 (or dark teal #064E3B to #065F46)
   - 16px padding
   - Close X button on right (white)
   - Star icon + "AI Tools" title (white text)

4. Tab navigation inside drawer:
   - 5 tabs: "Chart Prep", "Document", "Ask AI", "Summary", "Handout"
   - Horizontal scroll if needed
   - Active tab: teal underline

5. Content area:
   - Scrollable
   - 16px padding
```

### Prompt 19: AI Drawer - Ask AI Tab Content
```
Create the "Ask AI" tab content for the drawer:

1. Sub-tabs:
   - "Ask Questions" (active) | "Search Guidelines"
   - Small pills, teal active state

2. Input section:
   - Text input: "Ask a clinical question..."
   - Send button (teal, arrow icon)

3. AI Response card:
   - Light teal background (#F0FDFA)
   - Border-left: 3px solid teal
   - Padding: 16px

   Content example:
   - "Based on current guidelines, CGRP inhibitors are recommended for patients with..."
   - Confidence badge: "High confidence" (green)
   - Source links in teal

4. Suggested questions (3 chips):
   - "CGRP mechanism of action?"
   - "Botox dosing protocol?"
   - "Migraine preventive options?"
```

---

## Modals

### Prompt 20: Plan Builder Modal
```
Create a slide-in modal for Plan Builder:

1. Modal structure:
   - 500px width, full height
   - Slides from right (same as AI drawer)
   - White background

2. Modal header:
   - "Plan Builder" title (16px, semi-bold)
   - Close X button
   - 1px bottom border
   - Padding: 16px 20px

3. Content sections:
   - Diagnosis displayed at top (pill format)
   - Medication section with + Add button
   - Follow-up scheduling options
   - Referral options
   - Lab orders section

4. Footer:
   - "Cancel" button (gray outline)
   - "Save Plan" button (teal filled)
   - Right-aligned, 16px padding
```

### Prompt 21: Score Detail Modal
```
Create a centered modal for score details:

1. Overlay: semi-transparent black

2. Modal box:
   - 480px width, auto height
   - White background
   - 12px border-radius
   - Box shadow: 0 20px 50px rgba(0,0,0,0.15)
   - Centered on screen

3. Header:
   - "MIDAS Score Details" title
   - Date subtitle: "Jan 16, 2026"
   - Close X button
   - Padding: 20px

4. Content:
   - Large score display: "18" (32px, bold, teal)
   - "Moderate Disability" interpretation
   - Breakdown table showing individual question scores
   - Historical trend mini-chart

5. Footer:
   - "Close" button
```

---

## Interactive States & Components

### Prompt 22: Button States
```
Create a button component library:

1. Primary button:
   - Default: teal bg (#0D9488), white text
   - Hover: darker teal (#0F766E)
   - Padding: 10px 16px, 8px radius

2. Secondary button:
   - Default: white bg, 1px gray border, gray text
   - Hover: light gray bg, teal border, teal text

3. Tertiary/Ghost button:
   - Default: transparent, teal text
   - Hover: light teal bg (#F0FDFA)

4. Danger button:
   - Default: red bg (#EF4444), white text
   - Hover: darker red

5. Icon button:
   - 40x40px or 36x36px
   - Default: white bg, gray border, gray icon
   - Hover: light gray bg, teal border/icon
```

### Prompt 23: Form Input States
```
Create form input components:

1. Text input:
   - Height: 42px
   - Padding: 10px 12px
   - 1px gray border (#E5E7EB), 8px radius
   - Placeholder: gray text (#9CA3AF)
   - Focus: teal border + teal glow (0 0 0 3px rgba(13,148,136,0.1))

2. Textarea:
   - Same border styling
   - Min-height: 120px
   - Resize: vertical

3. Select dropdown:
   - Same styling as input
   - Chevron down on right

4. Number input:
   - 80px width variant for scores
   - Center-aligned text
```

### Prompt 24: Badge & Pill Components
```
Create badge and pill components:

1. Status badges (small, pill-shaped):
   - Teal: bg #CCFBF1, text #0F766E
   - Blue: bg #DBEAFE, text #1D4ED8
   - Green: bg #D1FAE5, text #059669
   - Red: bg #FEE2E2, text #DC2626
   - Padding: 4px 10px, radius 12px, 12px font

2. Required/Optional badges:
   - Required: red bg (#EF4444), white text
   - Optional: gray bg (#F3F4F6), gray text (#6B7280)
   - Padding: 3px 8px, radius 4px, 11px font

3. Selectable chips:
   - Default: white bg, gray border/text
   - Hover: teal border/text
   - Selected: teal bg, white text
   - Padding: 8px 14px, radius 20px
```

---

## Drug Interaction Alert

### Prompt 25: Alert Components
```
Create a drug interaction alert banner:

1. Warning alert:
   - Background: gradient yellow (#FEF3C7 to #FDE68A)
   - Left border: 4px solid #F59E0B
   - Padding: 12px 16px
   - Border-radius: 8px

2. Content:
   - Warning triangle icon (amber)
   - Title: "Potential Interaction" (14px, semi-bold)
   - Description text (13px)
   - Dismiss X button on right

3. Critical alert variant:
   - Background: gradient red (#FEE2E2 to #FECACA)
   - Left border: 4px solid #EF4444
   - Red warning icon
```

---

## Guided Tour Overlay

### Prompt 26: Tour Tooltip Component
```
Create a guided tour tooltip:

1. Highlight effect:
   - Target element gets teal glow shadow
   - Rest of page dimmed (overlay)

2. Tooltip box:
   - White background
   - 12px border-radius
   - Box shadow: 0 4px 20px rgba(0,0,0,0.15)
   - Max-width: 320px
   - Padding: 20px

3. Tooltip content:
   - Step indicator: "Step 3 of 10" (12px, muted)
   - Title: "AI Tools" (16px, semi-bold)
   - Description: "Access AI-powered features..." (14px)
   - Progress dots (10 dots, current filled teal)

4. Navigation buttons:
   - "Skip" link (gray text)
   - "Previous" button (outline)
   - "Next" button (teal filled)
```

---

## Complete Page Assembly

### Prompt 27: Full Page Composition
```
Assemble the complete Sevaro Clinical Note interface:

Frame: 1440x900 desktop

Layout:
1. Top: Navigation bar (60px height, full width)
2. Below nav, three columns:
   - Left: Patient sidebar (260px) with patient card, prior visits, score history
   - Center: Tab content area with History tab showing chief complaint chips, HPI textarea, clinical scales accordions, ROS and allergies sections
   - Right: Action bar (60px) with icon buttons and Sign/Pend buttons

Background: #F9FAFB (light gray)

Key visual elements:
- Teal (#0D9488) as primary accent throughout
- White cards with subtle shadows
- Inter font family
- Consistent 8px spacing grid
- Rounded corners (6-12px) on all elements
- Clean, clinical aesthetic suitable for healthcare
```

---

## Export Notes

When exporting from Figma:
1. Export as a complete design file (.fig)
2. Include all components and variants
3. Ensure color styles and text styles are properly defined
4. Name layers descriptively for developer handoff
5. Create a component library page for reusable elements

The design should feel:
- Professional and clinical
- Clean with ample white space
- Easy to scan with clear visual hierarchy
- Calming teal accents (healthcare appropriate)
- Functional with clear interactive states
