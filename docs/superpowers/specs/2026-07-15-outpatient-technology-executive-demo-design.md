# Outpatient Technology Executive Demo — Presentation Design

**Date:** 2026-07-15  
**Audience:** Sevaro executives and administrators  
**Length:** 30 minutes, including discussion  
**Primary deliverable:** PowerPoint deck with demo launch points, captured screenshots, and stable fallback clips  
**Data rule:** Synthetic, non-PHI content only

## Communication job

By the end, executives and administrators should support a focused demo-hardening and validation plan because the technology is most valuable as a connected outpatient operating model, not as five isolated AI experiments.

The presentation should make three points:

1. The operational problem is fragmentation across referral review, patient intake, examination, and documentation.
2. Sevaro has working or testable components that can reduce those handoff failures when presented as one connected workflow.
3. The next responsible step is a hardened executive demo plus a governed validation pilot, not broader clinical-performance claims.

## Narrative

The deck follows one synthetic outpatient neurology referral through four connected steps:

1. Triage structures the referral and identifies urgency, red flags, and routing.
2. The AI Historian gathers missing context before the visit.
3. SDNE adds objective digital-exam findings.
4. The Scribe turns the accumulated evidence into clinician-ready preparation and documentation.

Clara appears after that journey as an adjacent physician-to-physician OneCall capability. It must not be presented as a current step in the outpatient workflow.

## 30-minute run-of-show

| Time | Segment | Presentation mode |
|---|---|---|
| 0–4 min | Executive problem and synthetic patient setup | Slides |
| 4–7 min | Triage | Controlled output or short clip |
| 7–13 min | AI Historian | Live demo driven by Steve; recorded fallback available |
| 13–19 min | SDNE | Live demo driven by Steve; recorded fallback available |
| 19–22 min | Scribe / clinician preparation | Controlled output or short clip |
| 22–24 min | Clara operator | Controlled clip |
| 24–27 min | Operating value, validation plan, and decision | Slides |
| 27–30 min | Executive discussion | Discussion |

## Slide sequence

### Slide 1 — Outpatient neurology can become one connected operating system

Minimal opening slide. Subtitle: “A connected path from referral to clinician readiness.”

### Slide 2 — The real cost today is fragmentation between referral, intake, exam, and documentation

Show the current-state handoffs and their operational consequences: repeated review, missing context, duplicate questions, and clinician preparation burden. Do not invent financial or time-savings figures.

### Slide 3 — One synthetic referral will show how the handoffs disappear

Introduce one fictional outpatient neurology case. The same synthetic case carries through Triage, Historian, SDNE, and Scribe so the audience follows one cumulative story.

### Slide 4 — Triage turns an unstructured referral into an actionable care path

Show a stable, precomputed triage output or a short recorded clip. Highlight urgency, red flags, routing, and the bounded context passed forward. Do not imply anonymous live triage or clinical reliance.

### Slide 5 — The Historian collects missing context before the clinician enters the room

Steve drives the first live demonstration. Keep the live conversation short and purposeful, then show the structured result. The slide contains a still frame and a clearly visible launch point for the live surface. A 60–90 second recording with usable audio is the fallback.

### Slide 6 — SDNE adds objective exam data to the pre-visit picture

Steve drives the second live demonstration. Use the headset as the memorable physical moment, then show the resulting finding or exam output. The slide contains a still frame and live-demo launch point. A 60–90 second recording is the fallback.

### Slide 7 — The Scribe turns the accumulated evidence into clinician-ready documentation

Use a stable screenshot sequence or short clip. Show source-labeled clinician preparation or documentation. Clearly label any consult-report-to-desktop-scribe handoff that is not yet proven end to end.

### Slide 8 — Clara applies the same orchestration pattern to inbound neurologic calls

Use a controlled 45–60 second clip with audio. Present Clara as a browser-based physician-to-physician operator POC with synthetic scenarios. State that the production phone/Twilio path and real Synapse paging/dispatch integration are not yet built.

### Slide 9 — The next phase is measurement, not broader claims

Present proposed pilot measures, not achieved results:

- staff minutes per referral;
- receipt-to-routing time;
- override and under-/over-triage rates;
- Historian completion rate;
- duplicate questions avoided;
- clinician preparation time;
- SDNE completion and technical reliability.

The validation lane requires synthetic release gates first, then a governed partner pilot with independent labels and a formal institutional QI-versus-research/IRB determination.

### Slide 10 — Approve one demo-hardening sprint and one governed pilot

Close with three decisions:

1. Name the validation partners and accountable owners.
2. Approve a short sprint to harden the integrated demo and its fallbacks.
3. Select the first operational workflow to measure.

## Demo asset plan

| Capability | Primary presentation | Fallback asset | Capture target |
|---|---|---|---|
| Triage | Controlled | 30–45 second clip plus two stills | Referral input, triage output, routing/red flags |
| Historian | Live, driven by Steve | 60–90 second clip with audio plus opening/result stills | Brief exchange and structured summary |
| SDNE | Live, driven by Steve | 60–90 second clip plus headset/result stills | Headset workflow and returned exam finding |
| Scribe | Controlled | 30–45 second clip plus two stills | Source-labeled clinician preparation/documentation |
| Clara | Controlled | 45–60 second clip with audio plus decision-card still | Physician-to-physician call and resulting tier/routing |

All recordings should be 16:9, preferably 1920×1080, with notifications hidden. Audio should be captured only when it improves understanding. Synthetic names and made-up information must be used throughout.

## MSI capture workflow

Use the MSI Windows machine through Chrome Remote Desktop because it is the intended demo environment. Before recording:

1. Confirm the MSI display is set to 1920×1080 and browser zoom is consistent.
2. Hide notifications, email, chat, saved credentials, and unrelated tabs.
3. Open only synthetic demo surfaces.
4. Capture one clean still and one short fallback clip per capability.
5. Capture system audio or microphone audio only for Historian and Clara unless SDNE audio materially improves the demonstration.
6. Review every frame for PHI, secrets, personal notifications, or unstable UI before including it.

The recording tool will be chosen after inspecting what is installed on the MSI. Prefer a built-in Windows recorder when it can capture the target window and audio cleanly; otherwise use an already-installed recording tool. Do not install new software without Steve's approval.

## Deck behavior

- Historian and SDNE slides must each provide a clear live-demo launch point and a fallback launch point.
- Controlled demos must not depend on network latency during the presentation.
- The deck must still make sense if every demo is replaced by its fallback.
- The final PowerPoint and all linked media must live in one portable folder so links do not break when copied to the MSI.
- If reliable in-slide media embedding is supported by the presentation toolchain, embed the clips. Otherwise, use poster frames linked to adjacent media files in the same folder.

## Visual direction

Use a clean executive style with one composition per slide, restrained use of color, and large type. Historian uses teal accents, SDNE uses blue, Clara uses violet, and controlled workflow slides remain neutral. Avoid dashboard-like card grids in the finished deck except where a single workflow comparison materially improves clarity.

Because no presentation template was explicitly supplied, use the bundled Codex Grid layout system as the composition reference. Do not copy the outpatient command-center dashboard styling directly into the deck.

## Acceptance criteria

The presentation is ready when:

- the 10-slide narrative is complete and readable without the demonstrations;
- Historian and SDNE have tested live launch points and tested fallback clips;
- Triage, Scribe, and Clara have stable controlled assets;
- every visual uses synthetic, non-PHI data and contains no secrets or notifications;
- no slide makes unsupported ROI, clinical-performance, or integration claims;
- all linked media opens from the portable delivery folder on the MSI;
- the deck renders without clipping, unintended overlap, broken links, or unreadable text;
- a full timed rehearsal completes in 27 minutes or less, leaving at least 3 minutes for discussion.

## Deliverables

1. Final PowerPoint deck.
2. Portable media folder containing all fallback clips and stills.
3. One-page demo run sheet with live URLs, fallback filenames, transitions, and recovery steps.
4. Source/provenance note identifying which repo and Drive materials support each claim.

