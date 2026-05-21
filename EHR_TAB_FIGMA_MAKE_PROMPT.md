# Figma Make Prompt — Sevaro EHR Chart View (4-Tab Documentation)

This is a single comprehensive prompt for Figma Make to recreate the `/ehr` chart view at `app.neuroplans.app/ehr`. It covers the four documentation tabs (History · Imaging/results · Physical exams · Recommendation), the shared chrome (top header + left rail + patient sidebar + tab nav + right action bar), and all design tokens.

It is sourced 1:1 from the production `OPSAmplehtml` repo (Next.js 15, Tailwind v3) so tokens, copy, and component structure are accurate.

**How to use:** paste the entire prompt below into Figma Make as one message. If Figma Make truncates, paste in two halves at the natural break (`### PART 2 — TABS`).

---

## THE PROMPT

```
Build a high-fidelity, interactive prototype of a clinical EHR documentation page for an outpatient neurology AI app called "Sevaro Ambulatory" (production app: app.neuroplans.app/ehr). It is a single-page interface that lets a neurologist document a patient encounter through four tabs: History, Imaging/results, Physical exams, and Recommendation.

Target viewport: 1440 × 900 desktop. Use a 12-col grid with 24px gutters where helpful. Build everything as components and reuse via instances.

═══════════════════════════════════════════════════════════
DESIGN TOKENS (use these exact values; create as Figma variables)
═══════════════════════════════════════════════════════════

Font family: "Nunito Sans" (fallback: Inter). All text uses this family.

Color tokens:
  surface/widget              #ffffff
  surface/primary             #0c0f14   (near-black, used for "Sign & complete" button + dark pills)
  surface/2x-light            #f1f1f1   (toggle backgrounds, neutral chips)
  surface/x-light             #dedede   (separators, soft fills)
  surface/page-bg             #f9f9f9   (whole-page background)
  text/heading                #0c0f14
  text/body                   #0c0f14
  text/caption                #696a70
  text/on-primary             #f1f1f1   (text on dark buttons)
  text/input-label            #696a70
  border/x-light              #dedede
  border/input                #cacaca
  border/4x-light             #f9f9f9
  semantic/error              #ef4444   (Required badges, "PHI" off, error text)
  semantic/error-dark         #a91c1c
  semantic/success            #22c55e
  semantic/warning            #f59e0b   ("What's New" star)
  semantic/info               #3b82f6
  brand/teal                  #3d9a87   (logo bg, primary AI button, selected pre-made template)
  brand/teal-dark             #2c7466
  brand/teal-light            #e8f3f0   (selected diagnosis chip bg)
  status/violet-bg            #ede9fe   (Non-Emergent pill bg)
  status/violet-text          #5b21b6
  status/blue-bg              #dbeafe   (MD2 timer, Non-Emergent dropdown)
  status/blue-text            #1e478a
  status/green-bg             #d1fae5
  accent/video-purple         #7c3aed   (Video call button)
  accent/phone-green          #10b981   (Phone call button)
  accent/avatar-amber         #fbbf24   (default user avatar)
  accent/avatar-violet        #a78bfa   (Marshall avatar)
  accent/avatar-pink          #f472b6   (Medical history dot)

Radii: pill=80, lg=12, md=8, sm=6, xs=4
Shadows: elevation-1 = 0px 1px 4px rgba(12,15,20,0.08)

Type ramp (Nunito Sans):
  heading/xl     32 / 40 Bold
  heading/lg     24 / 32 Bold
  heading/md     18 / 26 Bold
  heading/sm     14 / 20 Bold
  body/lg        16 / 24 Regular
  body/md        14 / 20 Regular
  body/md-medium 14 / 20 SemiBold
  body/sm        12 / 16 Regular
  caption        12 / 16 Regular
  button/md      14 / 20 SemiBold
  button/sm      12 / 16 SemiBold
  label          12 / 16 SemiBold
  tab            14 / 20 SemiBold (inactive)
  tab-active     14 / 20 Bold     (active)

═══════════════════════════════════════════════════════════
LAYOUT — overall structure
═══════════════════════════════════════════════════════════

Page is a 1440 × 900 frame, surface/page-bg, vertical auto-layout, no padding, no gap.
- Row 1: TopHeader (full width, height 56)
- Row 2: Body (fills remaining height) — horizontal auto-layout, no padding, no gap
   - Column A: LeftRail (width 48, fills height, surface/page-bg)
   - Column B: PatientSidebar (width 296, fills height, surface/page-bg)
   - Column C: MainColumn (flex-grow 1, vertical auto-layout)
       - Row C1: TabNavBar (full width, height 60)
       - Row C2: TabContent (fills remaining height, padding 28 32, gap 16)

═══════════════════════════════════════════════════════════
TopHeader (height 56, surface/widget, 1px bottom border/x-light)
═══════════════════════════════════════════════════════════

Horizontal auto-layout, no padding on the outer frame, gap 0.
- Cell 1: Logo box, 48 × 56, brand/teal background. Centered Sevaro brain-mark icon (white), 22px. Use a stylized brain glyph; if not available, use a simple white rounded square with a brain emoji or "S" letterform.
- Cell 2: Header content (flex-grow), padding 10px 20px 10px 16px, gap 12, align center.

Header content children, in order:
1. Search bar — pill (radius 80), 280 × 36, surface/widget, 1px border/x-light, padding 8 14, gap 8, align center.
   - Magnifier icon 14×14 (text/caption color)
   - Placeholder text: "Search for patient name or MRN" (body/sm, text/caption)

2. Status pill group (3 pills, 12px gap):
   - "Acute Care" — surface/widget bg, 1px border/x-light, text/heading. Trailing badge "0" (10px circle, surface/x-light bg, text/heading, button/sm).
   - "Rounding" — surface/primary bg, text/on-primary, BOLD. Trailing badge "9" (semantic/error bg #ef4444, white text, button/sm).
   - "EEG" — surface/widget, 1px border/x-light, text/heading. Trailing badge "0" (surface/x-light bg).
   All pills: padding 4 10, radius 4, gap 6, align center.

3. Time pill — status/blue-bg, padding 6 10, radius 6, gap 8.
   - "MD2" in button/sm Bold, color status/blue-text
   - "08:19:22  ▾" in body/md-medium, color status/blue-text

4. Spacer (flex-grow)

5. Right-side cluster (gap 14, align center):
   - Star icon (semantic/warning #f59e0b), 16×16
   - "What's New" link, body/md-medium SemiBold, text/heading, underlined
   - Toggle group: small toggle (off state — surface/x-light track, white knob with shadow, 36×20) + label "PHI" in label style, text/caption
   - Lock icon, 18×18, text/heading
   - Bell icon, 18×18, text/heading, with small red notification dot on top-right
   - Moon icon (theme toggle), 20×20, text/heading
   - User avatar circle 28×28, accent/avatar-amber bg, with a tiny green online dot (accent/phone-green) bottom-right; chevron ▾ next to it

═══════════════════════════════════════════════════════════
LeftRail (width 48, fills height, surface/page-bg)
═══════════════════════════════════════════════════════════

Vertical auto-layout, padding 18 0, gap 18, align center.
Stack of 6 monochrome icons (each 22 × 22, text/caption at 65% opacity):
  1. Patient list (lines icon)
  2. Documents (doc icon)
  3. Calendar (cal icon)
  4. Favorites/star
  5. History/clock
  6. Library/book

Active rail item (none in default state) would have a 4px brand/teal pill on the left.

═══════════════════════════════════════════════════════════
PatientSidebar (width 296, surface/page-bg, padding 14, gap 14)
═══════════════════════════════════════════════════════════

Vertical auto-layout. Five stacked cards, each surface/widget bg, 1px border/x-light, radius 12.

Card 1 — Provider/queue card:
  Top row (padding 14 14 12, gap 10, align center):
    - Avatar circle 32×32, accent/avatar-violet (#a78bfa). Inside: "M" in white Bold.
    - Column: "Marshall" body/md-medium Bold text/heading; "TNK | PST" caption text/caption.
    - Spacer
    - "↗" link icon, text/caption
  Divider row (1px border/x-light top), padding 14 14 10, gap 8, align center:
    - Pink dot 20×20 (accent/avatar-pink #f472b6)
    - "Medical history" body/sm SemiBold text/heading
    - Spacer
    - "↗" caption icon

Card 2 — Patient card (padding 14, gap 12):
  Row 1 (gap 10, align center):
    - Avatar circle 36×36, surface/x-light bg, with grayed initials
    - Column: "Test Test" body/md SemiBold text/heading; "50, M  # 123123" body/sm text/caption
    - Spacer
    - 14×14 edit icon, text/caption
  Pill: "Non-Emergent  |  ▾" — status/blue-bg (#dbeafe), padding 4 10, radius 6, button/sm SemiBold, status/blue-text
  Row of two call buttons (gap 10):
    - Video button: pill (radius 24), accent/video-purple (#7c3aed) bg, padding 8 14, gap 6. Camera glyph (white) + "Video" white Bold button/sm.
    - Phone button: 36×36 circle, accent/phone-green (#10b981) bg, white phone glyph centered.
  Text rows (body/sm text/heading):
    - "Pacs viewer  |  VizAI  |  Epic  |"
    - "GlobalProtect"

Card 3 — Hospitalist card (padding 14, gap 10):
  Title: "Hospitalist" body/md Bold
  Row (gap 10, align center):
    - Dashed circle 28×28, no fill, 1px dashed border/input
    - "Add Hospitalist" body/sm text/caption

Card 4 — Timeline card (padding 14, gap 14):
  Header row: "Timeline" body/md Bold; spacer; "—" collapse button caption text/caption
  Four timeline rows, each (gap 12, align center):
    - Status circle 24×24 (first row: amber #fbbf24; rows 2-4: surface/x-light)
    - Column: label body/sm SemiBold text/heading; value caption text/caption
  Items in order:
    1. "Initial call" / "N/A"
    2. "Time on video" / "N/A"
    3. "Assessment time" / "N/A"
    4. "Final recommendation time" / "N/A"

Card 5 — Recent consults (padding 14, horizontal, gap 10, align center):
  - "Recent consults" body/md Bold
  - Spacer
  - 28×28 circle, surface/2x-light, with "+" inside

═══════════════════════════════════════════════════════════
TabNavBar (full width, height 60, surface/widget, 1px bottom border/x-light)
═══════════════════════════════════════════════════════════

Horizontal auto-layout, padding 12 24 12 32, gap 0, align center.

Left cluster (gap 28):
  Four tab labels (use a Tab component with `active: boolean` variant):
    - "History"
    - "Imaging/results"
    - "Physical exams"
    - "Recommendation"
  Active state: tab-active style (Bold), text/heading, with a 2×N pixel underline directly below (text/heading color, full text width).
  Inactive state: tab style (SemiBold), text/caption, no underline.

Spacer (flex-grow)

Right cluster (gap 12, align center):
  - Three-dot menu "• • •" body/md Bold text/heading
  - Share icon (28×28 circle, no fill, 1px border/x-light)
  - Mic icon (28×28 circle, no fill, 1px border/x-light)
  - AI sparkle icon (28×28 circle, brand/teal bg, white sparkle inside) — primary AI button
  - Clip/document icon (28×28 circle, no fill, 1px border/x-light)
  - "Pend" outline button: pill radius 24, padding 8 18, 1px border text/heading, text body/md SemiBold text/heading
  - "Sign & complete" filled button: pill radius 24, padding 8 18, surface/primary bg, text body/md Bold text/on-primary

═══════════════════════════════════════════════════════════
PART 2 — TABS
═══════════════════════════════════════════════════════════

Each tab body lives inside the TabContent frame: vertical auto-layout, padding 28 32, gap 16, surface/page-bg. Section cards are full-width, surface/widget, 1px border/x-light, radius 8, padding 16 18, gap 14 (vertical auto-layout).

A "Required" badge sits in the top-right of section headers when the field is required: padding 2 8, radius 4, semantic/error bg, label style Bold, white text "Required".

Reusable building blocks (build as components):
  - Chip: padding 6 12, radius 4, surface/widget bg, 1px border/input, body/sm text/heading. Variants: default, selected (brand/teal-light bg with brand/teal-dark text and a leading brand/teal dot 8×8).
  - YesNoToggle: rounded segmented, gap 0, padding 2, surface/2x-light bg, radius 6. Two children (Yes / No), each padding 6 24, body/sm SemiBold. Active child: surface/widget bg with elevation-1.
  - InputField: vertical, surface/widget, 1px border/input, radius 6, padding 10 12, gap 4. Label (caption text/caption) on top; value (body/md text/heading) below.
  - SectionHeader: horizontal, gap 6, align center. Title (body/md Bold). Optional subtitle "(Optional)"/"(Min 25 words)" (body/sm text/caption). Optional info "ⓘ" 14×14 text/caption. Spacer + Required badge if required.
  - Sparkle/Generate button: outline pill, padding 8 16 with leading sparkle dot, body/md SemiBold text/heading.

──────────────────────────────────────────────────
TAB 1 — History  (default tab; active state shown)
──────────────────────────────────────────────────

Section 1 — "Reason for consult" (Required)
  Wrap of chips (8px row gap, 8px column gap, wrap to multiple rows). Use the full chip list:
    Altered mental status · Amnesia · Blurry vision · Chronic pain · Confirmed stroke on neuroimaging · Difficulty swallowing · Dizziness/Vertigo · Double vision · Headache · Hemorrhagic Stroke · Hyper/Lower blood injury · Memory problem · Movement problem · Multiple Sclerosis Exacerbation · Hypertensive Crisis Exacerbation · Neuropathy · Numbness · Parkinson Disease · Prognosis after cardiac arrest · Seizure · Stroke-like symptoms · Syncope · TIA · Tremor · Vision loss · Weakness · Other

Section 2 — "History of presenting illness" (Min. 25 words) (Required)
  Multi-line textarea (min height 110), surface/widget bg, 1px border/input, radius 6, padding 14. Placeholder "Describe symptoms and history…" body/sm text/caption.

Section 3 — "Review of system" (Required)
  Chips (single row): Reviewed · Unable to obtain due to · Other

Section 4 — "Allergies" (Required)
  Chips: NKDA · Reviewed in EHR · Unknown · Other

Section 5 — "Is medical, surgical, family and social history available?" (Required)
  Chips: Yes · No, due to patient mentation · NA due to phone consult

──────────────────────────────────────────────────
TAB 2 — Imaging/results
──────────────────────────────────────────────────

Each section is a one-row card: [Title (body/md Bold)] + "(Optional)" caption + spacer + control.

Rows in order:
  1. "Was CTH done?"            → YesNoToggle
  2. "Was CTA head & neck done?" → YesNoToggle
  3. "MRI brain"                 → YesNoToggle
  4. "TTE"                       → YesNoToggle
  5. "Other imaging findings"    → YesNoToggle
  6. "Lab results"               → Chips: Lipid profile panel · HbA1c · Other lab results
  7. "Other results"             → YesNoToggle

──────────────────────────────────────────────────
TAB 3 — Physical exams
──────────────────────────────────────────────────

Section 1 — "Initial assessment" (Optional) ⓘ
  Two side-by-side input groups (gap 12):
    Date input: leading calendar icon 16×16, label "Select date" caption, value "01/16/2026" body/md.
    Time input: label "Military Time (PST)" caption; value row "HH : MM" body/md text/caption + small "Now" pill button (radius 12, surface/2x-light bg, padding 4 10, button/sm SemiBold).

Section 2 — "Neuro exam" (collapsible, default collapsed)
  Card height 48, horizontal: chevron "›" + "Neuro exam" body/md Bold.

Section 3 — "Vital signs" card
  Title row: "Vital signs" body/md Bold.
  Grid of 4 InputFields, 2 columns × 2 rows, gap 12 (each input ~360 wide, label only — no value):
    - "Glucose (mg/dL) (Optional)"
    - "BP (mm/Hg) (Optional)"
    - "Oxygen saturation (%) (Optional)"
    - "Pulse (bpm) (Optional)"
  Below grid: "Fever symptoms" body/md-medium SemiBold + "(Optional)" caption + Chips (Febrile, Afebrile).

──────────────────────────────────────────────────
TAB 4 — Recommendation  (most complex)
──────────────────────────────────────────────────

Block A — Diagnosis selector + Generate
  Combo input (full width, surface/widget, 1px border/input, radius 6, padding 10 12, gap 8, align center):
    - Caption "Differential diagnosis*" text/caption
    - Selected chip (brand/teal-light bg, padding 4 10, radius 14, gap 6): brand/teal dot 8×8 + "Headache/migraine" body/sm SemiBold brand/teal-dark + "×" close, brand/teal-dark.
    - Spacer + chevron "▾" text/caption
  Below combo: "Generate assessment" outline pill button (radius 24, 1px border text/heading, padding 8 16, gap 8, leading dark sparkle dot 14×14, label body/md SemiBold text/heading).

Block B — Assessment card (Required)
  Header: "Assessment" body/md Bold + "(Min 5 words)*" body/sm text/caption + spacer + Required badge.
  Textarea (min height 96), placeholder "Enter a detailed assessment" body/sm text/caption.

Block C — Recommendations card (Required)
  Header: "Recommendations*" body/md Bold + spacer + Required badge.

  Sub-row 1: Mode toggle. Segmented (gap 0, padding 4, surface/2x-light bg, radius 8), two children:
    - "Pre-made template" (active) — brand/teal bg, white Bold, padding 6 14, radius 6
    - "Free text recommendations" (inactive) — transparent, text/heading SemiBold, padding 6 14
  Sub-row 2: Plan title row (horizontal, gap 12, align center):
    - "Recommendation plan for Headache/migraine" body/md Bold text/heading
    - Spacer
    - "Customize" filled pill (surface/primary bg, padding 6 14, radius 16, button/sm Bold text/on-primary)
    - "Use standard" outline pill (1px border text/heading, padding 6 14, radius 16, button/sm SemiBold text/heading)

  Sub-section: "Laboratory testing" body/md Bold
    Tier "Initial:" body/md-medium Bold:
      • CBC
      • CMP
      • hCG (if female of childbearing age)
    Tier "LUMBAR PUNCTURE:" body/md-medium Bold:
      • Always measure opening pressure
      • Tube 1: Cell count and differential
      • Tube 2: CSF glucose and protein
      • Tube 3: CSF meningitis panel
      • Tube 4: Cell count and differential
      • Other CSF studies: Lyme, VDRL, CSF gram stain and cultures, AFB culture and stain, Fungal culture and stain, Crypto antigen
    "Add more laboratory testing (Optional)" — empty input row (surface/widget, 1px border/input, radius 6, padding 8 12, body/sm text/caption).
    (Bullets: 4×4 dot, text/caption color, 12px left indent for the row, 8px gap.)

  Sub-section: "Diagnostic Studies" body/md Bold
    Tier "Initial:": ECG · CT head without contrast · MRI brain without contrast
    Tier "Advanced:": MRI brain with and without contrast · MR Venogram (MRV) · CT angiogram (CTA) · CT venogram (CTV)
    "Add more diagnostic studies (Optional)" empty input row.

  Sub-section: "Treatments NON-pregnant patients" body/md Bold
    Subhead "Additional Medications" body/md-medium Bold (no items in default state — placeholder for build-out).

═══════════════════════════════════════════════════════════
INTERACTIONS (wire these up with prototype connections / state)
═══════════════════════════════════════════════════════════

1. Tab switch — clicking History / Imaging/results / Physical exams / Recommendation in TabNavBar swaps the TabContent area to the corresponding tab and updates the active underline. Use a single Page-like state.

2. Chip selection — clicking any chip toggles its selected variant (brand/teal-light bg, brand/teal dot, brand/teal-dark text). Multi-select for "Reason for consult", single-select for the others.

3. Yes/No toggles — clicking either side activates that side (surface/widget bg, elevation-1) and deactivates the other.

4. Recommendation mode toggle — switching to "Free text recommendations" replaces the plan body with a single large textarea ("Enter free-text recommendations…").

5. Generate assessment — pressing the button shows a 1-second simulated loading state on the Assessment textarea (subtle pulse), then fills it with mock text:
   "53M presenting with new-onset right-sided throbbing headache for 4 hours, photophobia and nausea. No focal neurologic deficits. History of migraine without aura. Suspected migraine without aura — proceed with abortive therapy and consider preventive optimization."

6. Sign & complete — opens a confirmation dialog "Sign and complete this consult?" with Cancel / Sign primary action.

7. AI sparkle button (teal) — opens a right-side drawer (560px wide) with a chat-style assistant (header "Sevaro AI", scrollable message list, sticky input). Drawer is overlay, not push.

═══════════════════════════════════════════════════════════
SAMPLE PATIENT (use throughout for realism)
═══════════════════════════════════════════════════════════

Provider/queue card:
  Marshall (PA) — TNK | PST queues, 1 unread medical-history note.

Patient: "Test Test", 50yo Male, MRN #123123, status Non-Emergent, on a video consult.
Pacs viewer | VizAI | Epic | GlobalProtect — these are inline links shown together.
Timeline: all four steps "N/A" (consult not yet started).

═══════════════════════════════════════════════════════════
QUALITY BAR
═══════════════════════════════════════════════════════════

- Pixel-snap everything to 4px grid.
- Use the variables you created — never hardcode hex.
- Build chips, YesNoToggle, InputField, SectionHeader, RequiredBadge, and PrimaryButton/OutlineButton as Figma components with variants. Reuse instances throughout.
- The four tabs share the same TopHeader, LeftRail, PatientSidebar, and TabNavBar — only the TabContent frame swaps. Implement this with a single page and a frame-swap interaction, not duplicate pages.
- All section cards are 8px radius, 1px border/x-light, surface/widget. Cards inside the page are full-width.
- Don't add features not described above (no avatars in chips, no generic toolbar buttons, no breadcrumbs).
- Keep the Sevaro brand restrained: brand/teal is for the logo box, the AI sparkle button, the active mode toggle, and selected diagnosis chips — nothing else.

When done: present the Recommendation tab as the default visible state (most fully populated), and link the four tab labels so the prototype is clickable.
```

---

## Notes for Pasting

- **One shot:** copy from the first ``` to the last ``` and paste into Figma Make.
- **If truncated:** split at `═══════════════════════════════════════════════════════════
PART 2 — TABS` — paste Part 1, let it generate, then paste Part 2 with a "Continue building the same prototype with these tabs:" preface.
- **Tweaks:** if Make produces something off, follow up with a targeted "Fix the X by doing Y" message rather than re-pasting the whole prompt.

## Source of Truth

Tokens: `tailwind.config.js` in this repo.
Layout & content: `src/components/ClinicalNote.tsx`, `EhrPageWrapper.tsx`, and the four section files (`PatientHistorySummary.tsx`, `ImagingResultsTab.tsx`, `ExamScalesSection.tsx`, `SmartRecommendationsSection.tsx`).
Visual reference: `screenshots/Screenshot 2026-01-16 *.png` — the four tab states.
