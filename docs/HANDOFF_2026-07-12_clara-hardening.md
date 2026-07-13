# Clara Triage Operator — Handoff, July 12, 2026

## Audience
Next dev session (Claude) picking up Clara work, and Steve for the CEO demo.

## Current State
- **Build/Deploy**: harness `OPSAmplehtml` `main` deployed clean (Amplify builds through 30x SUCCEED). Working tree clean, all committed + pushed.
- **Relay**: `nova-sonic-relay` on ECS `fastfill-cluster/nova-sonic-relay-svc` (us-east-1), task def **rev 3**, image digest `638d2afd`, `TRANSCRIBE_MEDICAL_ENABLED=true`, stable + live.
- **Live URL**: https://app.neuroplans.app/rnd/clara (password-gated).
- **Production twin**: `sevaro-voice-agent` — **PR #39 OPEN, awaits Steve merge** (the full Gate-0 safety pass; PR #38 already merged).

## Work Completed (all shipped + verified unless noted)

### Voice / relay
| Item | Detail | Commit |
|------|--------|--------|
| Duplicate transcripts | ROOT CAUSE = Nova emits assistant text twice (SPECULATIVE+FINAL); relay stage-filter fix, prod-deployed + verified via `frame-probe.mjs` | 6948f6e + relay redeploy |
| iOS crackle | Instrumented worklet (underrun/prime counters); **verdict = iOS-beta artifact** (Mac + Android clean); accepted, not a bug | f4f96ec |
| Conversational re-asking bug | Clara asked LKW/blood-thinner on a 2-day GBS + re-asked LKW; gated those to acute-stroke-in-window only; stated onset = LKW answered. Verified with 7 creative voice scenarios (`voice-steelman.mjs`) — could not break it | ea6cb77 |
| MRN read-back | Conditional (only when unsure, not every time) + confirm name spelling when unusual | 6d1c76c, b7bfcb2 |
| AWS Transcribe Medical | Parallel higher-accuracy ASR of caller audio, flag-gated, fail-safe; **ACTIVATED + live-verified** (IAM grant + rev 3 + digest 638d2afd). Captured "MRN 830592" cleanly where Nova drops digits. v1 = capture+log to metadata; NOT yet used as authoritative value | 34e1a6f |

### Classifier safety (Gate 0 + rulebook) — driven by 2 adversarial red-team rounds (147 cases)
| Item | Commit |
|------|--------|
| Gate 0 airway/apnea/unrousable + seizure clusters (S0 fix) | b8a9167 |
| Subacute-stroke deferral (LKW >24h → rulebook, Sam's finding) | 81006a9 |
| GBS/MG/acute-cord STAT-1 recognition (F2) | 7d2e6a5 |
| G3–G5 differential clarifiers (neuromuscular, vertigo, onset/trajectory) | e9fd73e |
| A0 bias guard — tier by findings not caller framing (round-2 S0s: cauda equina, post-tPA) | e2607a7 |
| Pediatric out-of-scope redirect + baclofen-withdrawal→emergent (Steve tier calls) | b0df041 |
| STAT-2-vs-plain-non-emergent discriminator; EEG callback = auto-notify | c3eab7b, 4edf50a |
| Rounding group/census vs specific-patient branch; identifiers never block | f90f005, e02f989 |

Production SSOT sync of all the above → sevaro-voice-agent PR #39 (94/94 gate tests).

## Decisions (Steve, this session)
- **STAT-1 definition**: KEEP the current broad list (ICH/meningitis/MG-crisis/GBS/acute-cord/MS-relapse/first-seizure). Sam's narrow "GBS+MG+cord only" NOT adopted.
- **Tier calls**: pediatric = out of scope (redirect to peds neuro, never escalate); baclofen withdrawal = emergent; hepatic encephalopathy = keep STAT 1 (§D).
- **Routing map v2**: all STATs → MD2; emergent → MD1; non-STAT sites → MD2. (Diagrams delivered in-chat for Sam + Marion.)
- **Announcement wording** ("on-call neurologist" for non-emergent too): leave as-is for now.

## What Was NOT Done (deferred)
- **Phase 3** (read MRN back only when Nova & Transcribe disagree) — deferred to protect the CEO demo; a live-behavior change gated on a subtle comparison (see Risks). Fully specced in the next-session prompt.
- **Use Transcribe Medical value as the authoritative identifier** — currently logged in metadata for measurement only. Needs a digit-normalization step.
- **Twilio phone line for Clara** — NOT built (see Twilio note).
- 3 red-team clinical-tier findings → Steve resolved them (above); none left open.

## Known Risks / Watch Items
1. **Transcribe Medical formats numbers as quantities** — smoke test showed it renders `24590` as `"24,590"` (thousands comma) and misheard FIN→PIN. Any captured identifier needs comma/space-strip. Phase 3's disagreement check MUST normalize BOTH transcripts to bare digits before comparing, or it will false-fire read-backs on formatting differences alone.
2. **STAT-1 vs STAT-2 model variance** — GBS-in-ER once logged STAT 2 with a STAT-1 rationale; direct tests return STAT 1. Temp-0.4 variance on borderline cases; watch, not a rule bug.
3. **Transcribe Medical costs ~$0.075/min per call** while the flag is on — fine for pilot, note for scale.
4. **Clara mismatch with Sam's operational STAT-1 def** (broad vs narrow) — Steve to reconcile with Sam if desired.

## Twilio — the factual answer (Steve asked)
- The Twilio **SMS code exists** (`src/lib/follow-up/twilioClient.ts`, `/api/follow-up/send-sms` + `twilio-sms` webhook) — built for the **Follow-Up Agent** (post-visit patient check-in), which texts a **patient's phone number entered in the demo UI**, NOT a hospital.
- **No Twilio credentials are provisioned** in this environment — no `sevaro/twilio` secret in Secrets Manager (us-east-1/us-east-2), no `TWILIO_*` Amplify env vars. So the SMS path is currently **inactive**, and **there is no live Twilio phone number wired here**.
- The "hospital dials a Sevaro one-call number" idea = the **production Clara vision**, which is unbuilt (Clara is browser-only today). Steve to confirm with the dev team whether a Twilio number/account lives elsewhere (different account or the dev team's Twilio console) — not visible in this sandbox account.
- **Can Clara run for validation AND be wired to Twilio at once?** Yes — additive, not exclusive. The browser `/rnd/clara` validation surface and a Twilio Voice → relay path are two entry points to the SAME Nova relay + classifier. Twilio Media Streams pipes caller audio over a WebSocket into the relay (which is already a WS audio server; needs μ-law↔PCM + Twilio stream-protocol adaptation). "Push cases" = wiring classification+identifiers → Synapse write + on-call paging (the external dispatch layer, the known next tier).

## Files to Review First
- `src/app/api/ai/clara/session/route.ts` — CLARA_VOICE_INSTRUCTIONS (all conversational behavior)
- `src/lib/clara/claraRulebook.ts` — classifier rulebook (Gate 0 deferrals live in redFlagGate.ts + classify route)
- `src/lib/clara/redFlagGate.ts` — Gate 0 deterministic floor
- `services/nova-sonic-relay/src/transcribeMedicalSession.ts` + `server.ts` — Transcribe Medical wiring
- `services/nova-sonic-relay/scripts/voice-steelman.mjs (run from that dir)` — the voice test harness (logs nova + medical transcripts)
- `qa/STEEL-MAN-2026-07-12.md` — red-team report

## Prompt for Next Session
```
Repo: ~/dev/repos/OPSAmplehtml (AWS: --profile sevaro-sandbox; relay in us-east-1). Read docs/HANDOFF_2026-07-12_clara-hardening.md and .claude/progress.json first.
FIRST: confirm whether Steve merged sevaro-voice-agent PR #39 (the Gate-0 safety pass) — if not, remind him; never auto-merge.
MAIN TASK — Phase 3: make Clara read the MRN back ONLY when Nova's transcript and the Transcribe Medical transcript DISAGREE. Transcribe Medical is LIVE in the relay (flag on, task def rev 3, us-east-1) emitting medicalTranscript frames now logged in clara_test_sessions.metadata. Build client-side in useClaraVoiceSession if feasible (no relay redeploy): extract the MRN digit-string from BOTH transcripts for the same caller turn, NORMALIZE both to bare digits (Nova = spoken-words→digits; Transcribe = strip thousands-commas/spaces/PIN-MRN prefix — it renders 24590 as "24,590"), compare; on mismatch inject a systemText nudge to Nova to read it back (provider.injectSystemText exists), on match stay silent. SMOKE-TEST with discrepant cases (fast/mumbled/alphanumeric) via services/nova-sonic-relay/scripts/voice-steelman.mjs (run from that dir) (run from services/nova-sonic-relay dir for ws) — a false read-back is worse than none.
COMPANION: use the Transcribe value as the authoritative captured identifier (same digit-normalization).
CONSTRAINT: NEVER change a triage threshold/tier without Steve's clinical sign-off. Everything else this session is shipped+verified.
```
