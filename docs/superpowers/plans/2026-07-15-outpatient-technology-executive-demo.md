# Outpatient Technology Executive Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished 10-slide executive PowerPoint with synthetic MSI-captured demo assets, live launch points for Historian and SDNE, stable fallbacks for every demo, and a one-page run sheet.

**Architecture:** Capture each demo as an independent media unit, review the unit for PHI/secrets and playback quality, then compose the deck around the approved patient-journey narrative. Keep the PowerPoint, stills, clips, and run sheet in one portable delivery folder so all launch links survive transfer to the MSI.

**Tech Stack:** Chrome Remote Desktop, Windows capture tools already installed on the MSI, macOS screenshot verification, JavaScript ES modules, `@oai/artifact-tool`, bundled Codex Grid layouts, Poppler/LibreOffice rendering, PowerPoint playback verification.

---

## File structure

- Create: `outputs/outpatient-technology-executive-demo/outpatient-technology-executive-demo.pptx` — final deck.
- Create: `outputs/outpatient-technology-executive-demo/assets/` — final approved stills and clips.
- Create: `outputs/outpatient-technology-executive-demo/demo-run-sheet.md` — live links, fallback filenames, transitions, and recovery steps.
- Create: `outputs/outpatient-technology-executive-demo/source-provenance.md` — source-to-slide mapping.
- Create outside the repository: `/var/folders/yy/94_lsm8n7nq2t3jg1z72dr3m0000gn/T/codex-presentations/019f672f-6f48-73c1-89c8-8bd8cbf0b82c/outpatient-executive-demo/tmp/` — builder source, previews, layout output, and QA artifacts.
- Modify: `HANDOFF.md` — final session-log entry after the deck and assets are verified.

### Task 1: Prepare the MSI and portable output folder

**Files:**
- Create: `outputs/outpatient-technology-executive-demo/assets/`

- [ ] **Step 1: Complete Chrome Remote Desktop sign-in**

Approve the Microsoft Authenticator request, connect to the MSI host, and verify that the desktop—not a lock screen—is visible.

- [ ] **Step 2: Inspect installed capture tools without installing software**

Check Windows Snipping Tool, Xbox Game Bar, and any already-installed recorder. Choose the first tool that captures a defined app or region at 16:9 with usable system or microphone audio.

- [ ] **Step 3: Normalize the display**

Set the MSI display to 1920×1080, 100% or 125% scaling, consistent browser zoom, Do Not Disturb, and a clean desktop. Close email, chat, credentials, and unrelated tabs.

- [ ] **Step 4: Create the output folders**

Run from the repository root:

```bash
mkdir -p outputs/outpatient-technology-executive-demo/assets
```

Expected: the directory exists and `git status --short` lists it only after files are added.

### Task 2: Capture Triage, Historian, SDNE, Scribe, and Clara assets

**Files:**
- Create: `outputs/outpatient-technology-executive-demo/assets/triage-input.png`
- Create: `outputs/outpatient-technology-executive-demo/assets/triage-output.png`
- Create: `outputs/outpatient-technology-executive-demo/assets/triage-fallback.mp4`
- Create: `outputs/outpatient-technology-executive-demo/assets/historian-opening.png`
- Create: `outputs/outpatient-technology-executive-demo/assets/historian-result.png`
- Create: `outputs/outpatient-technology-executive-demo/assets/historian-fallback.mp4`
- Create: `outputs/outpatient-technology-executive-demo/assets/sdne-headset.png`
- Create: `outputs/outpatient-technology-executive-demo/assets/sdne-result.png`
- Create: `outputs/outpatient-technology-executive-demo/assets/sdne-fallback.mp4`
- Create: `outputs/outpatient-technology-executive-demo/assets/scribe-input.png`
- Create: `outputs/outpatient-technology-executive-demo/assets/scribe-output.png`
- Create: `outputs/outpatient-technology-executive-demo/assets/scribe-fallback.mp4`
- Create: `outputs/outpatient-technology-executive-demo/assets/clara-opening.png`
- Create: `outputs/outpatient-technology-executive-demo/assets/clara-decision.png`
- Create: `outputs/outpatient-technology-executive-demo/assets/clara-fallback.mp4`

- [ ] **Step 1: Capture Triage**

Use a built-in synthetic referral. Record 30–45 seconds from referral input through the stable output, then capture clean input and output stills.

- [ ] **Step 2: Capture Historian**

Use the public synthetic scenario route. Record a 60–90 second exchange with audio and capture the opening and structured-result states. Do not enter real patient information.

- [ ] **Step 3: Capture SDNE**

Record 60–90 seconds showing the headset workflow and returned exam finding. Capture one headset or workflow still and one result still. If the headset feed cannot be recorded cleanly, use a still sequence as the fallback and retain the live launch point.

- [ ] **Step 4: Capture Scribe**

Use a synthetic case. Record 30–45 seconds showing source-labeled clinician preparation or documentation, then capture input and output stills. Do not claim an unverified end-to-end consult-report handoff.

- [ ] **Step 5: Capture Clara**

Use `/rnd/clara` with a synthetic preset. Record 45–60 seconds with audio through the decision card, then capture opening and decision-card stills. Keep the browser-only POC limitation visible in the slide copy.

- [ ] **Step 6: Transfer assets into the portable folder**

Use an existing synced location, Chrome Remote Desktop file transfer, or another already-configured path. Do not upload assets to a new external service. Rename files exactly as listed above.

### Task 3: Review and normalize captured media

**Files:**
- Modify: `outputs/outpatient-technology-executive-demo/assets/*`

- [ ] **Step 1: Inspect every still at original resolution**

Confirm no PHI, secrets, notifications, unrelated tabs, cursor artifacts, or clipped content. Reject and recapture any unsafe still.

- [ ] **Step 2: Inspect video metadata**

Run:

```bash
for f in outputs/outpatient-technology-executive-demo/assets/*.mp4; do
  ffprobe -v error -show_entries format=filename,duration -show_entries stream=codec_name,width,height -of default=noprint_wrappers=1 "$f"
done
```

Expected: each clip opens, reports a video codec and 16:9 dimensions, and remains within its assigned duration.

- [ ] **Step 3: Verify audio where required**

Historian and Clara must contain intelligible audio. SDNE audio is optional. Triage and Scribe may be silent.

- [ ] **Step 4: Create poster frames if a clip lacks a clean opening frame**

Run, replacing the filename for each affected clip:

```bash
ffmpeg -y -ss 1 -i outputs/outpatient-technology-executive-demo/assets/historian-fallback.mp4 -frames:v 1 outputs/outpatient-technology-executive-demo/assets/historian-opening.png
```

Expected: a clean PNG suitable for the slide launch panel.

### Task 4: Build the 10-slide PowerPoint

**Files:**
- Create outside the repository: `/var/folders/yy/94_lsm8n7nq2t3jg1z72dr3m0000gn/T/codex-presentations/019f672f-6f48-73c1-89c8-8bd8cbf0b82c/outpatient-executive-demo/tmp/outpatient-executive-demo.mjs`
- Create: `outputs/outpatient-technology-executive-demo/outpatient-technology-executive-demo.pptx`

- [ ] **Step 1: Load the presentation runtime and Codex Grid references**

Read the artifact-tool quick start, API docs, Codex Grid `ARTIFACT.md`, design tokens, template registry, layout-library preview, and only the selected layout modules.

- [ ] **Step 2: Initialize the artifact-tool workspace**

Run:

```bash
node "$SKILL_DIR/container_tools/setup_artifact_tool_workspace.mjs" --workspace "$TMP_DIR"
```

Expected: `$TMP_DIR/node_modules/@oai/artifact-tool` resolves from the builder module.

- [ ] **Step 3: Compose the deck in plain JavaScript**

Implement the approved 10-slide narrative from `docs/superpowers/specs/2026-07-15-outpatient-technology-executive-demo-design.md`. Use large executive typography, one composition per slide, teal for Historian, blue for SDNE, violet for Clara, and neutral controlled-demo slides.

- [ ] **Step 4: Add demo launch points**

Historian and SDNE slides must include a visible live launch control plus a fallback control. Triage, Scribe, and Clara use controlled fallback controls. Link to portable relative media filenames where reliable; otherwise insert poster frames and provide adjacent media files documented in the run sheet.

- [ ] **Step 5: Export the final PowerPoint**

Write exactly:

```text
outputs/outpatient-technology-executive-demo/outpatient-technology-executive-demo.pptx
```

Expected: the file exists and opens in PowerPoint.

### Task 5: Create the run sheet and provenance note

**Files:**
- Create: `outputs/outpatient-technology-executive-demo/demo-run-sheet.md`
- Create: `outputs/outpatient-technology-executive-demo/source-provenance.md`

- [ ] **Step 1: Write the run sheet**

Include the 30-minute timing, exact live URLs, fallback filenames, the sentence used to transition into and out of each demo, and a one-line recovery action for network, audio, headset, or login failure.

- [ ] **Step 2: Write the source/provenance note**

Map each slide to OPSAmplehtml files, the Drive outpatient project home or strategy materials, or captured synthetic demo evidence. Label proposed pilot metrics as proposed, not achieved.

### Task 6: Render and verify the complete deliverable

**Files:**
- Modify: `outputs/outpatient-technology-executive-demo/outpatient-technology-executive-demo.pptx`
- Modify outside the repository: `/var/folders/yy/94_lsm8n7nq2t3jg1z72dr3m0000gn/T/codex-presentations/019f672f-6f48-73c1-89c8-8bd8cbf0b82c/outpatient-executive-demo/tmp/preview/`, `/var/folders/yy/94_lsm8n7nq2t3jg1z72dr3m0000gn/T/codex-presentations/019f672f-6f48-73c1-89c8-8bd8cbf0b82c/outpatient-executive-demo/tmp/qa/`

- [ ] **Step 1: Run structural slide checks**

Run:

```bash
python3 "$SKILL_DIR/container_tools/slides_test.py" outputs/outpatient-technology-executive-demo/outpatient-technology-executive-demo.pptx
```

Expected: no out-of-bounds objects.

- [ ] **Step 2: Render every slide**

Run:

```bash
python3 "$SKILL_DIR/container_tools/render_slides.py" outputs/outpatient-technology-executive-demo/outpatient-technology-executive-demo.pptx
```

Expected: ten rendered slide PNGs.

- [ ] **Step 3: Inspect every rendered slide individually**

Fix clipping, title wrapping, low contrast, unresolved placeholders, broken images, and unintended overlap. Do not rely only on the contact sheet.

- [ ] **Step 4: Verify playback on the MSI**

Copy the portable folder to the MSI, open the deck in PowerPoint, and test every live and fallback launch point. Confirm the deck remains usable if every live demo is replaced by its fallback.

- [ ] **Step 5: Rehearse the full run-of-show**

Time the content at 27 minutes or less so at least three minutes remain for executive discussion.

### Task 7: Update the shared handoff and commit the deliverables

**Files:**
- Modify: `HANDOFF.md`
- Add: `outputs/outpatient-technology-executive-demo/`

- [ ] **Step 1: Add a session-log entry to the top of `HANDOFF.md`**

Use the required format and record the deck, captured assets, verified limitations, remaining rehearsal needs, and any MSI-specific playback caveats.

- [ ] **Step 2: Review the final diff**

Run:

```bash
git status --short
git diff --check
```

Expected: only the deck deliverables, run sheet, provenance note, and intentional HANDOFF update are included; unrelated existing changes remain untouched.

- [ ] **Step 3: Commit the completed presentation package**

Run:

```bash
git add HANDOFF.md outputs/outpatient-technology-executive-demo
git commit -m "docs: add outpatient technology executive demo"
```

Expected: one commit containing the verified presentation package and handoff update.
