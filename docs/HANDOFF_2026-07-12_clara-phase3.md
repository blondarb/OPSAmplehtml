# Clara Triage Operator — Phase 3 Handoff, July 12, 2026 (PM session)

## Audience
Next dev session (Claude) picking up Clara work; Steve for context on what changed in live behavior today.

## Current State
- **Build/Deploy**: `main` @ `6d4b9b3` deployed — Amplify build **318 SUCCEED**. Phase 3 is LIVE on https://app.neuroplans.app/rnd/clara.
- **Branch**: `main`, clean tree, all committed + pushed.
- **Relay**: untouched this session (still task def rev 3, `TRANSCRIBE_MEDICAL_ENABLED=true`, us-east-1). Phase 3 is entirely client-side + harness — no relay redeploy needed, by design.
- **Production twin**: sevaro-voice-agent **PR #39 MERGED** (squash `3159eaa` → `rnd/ai-operator`, ancestor-verified, Buildkite green). The full 7/12 safety pass is now in prod: Gate-0 airway/cluster + F2 STAT-1 recognition + G3–G5 clarifiers + A0 bias guard.

## Work Completed

### Phase 3 — MRN read-back ONLY on Nova↔Transcribe disagreement (SHIPPED, live-verified)
Two independent ASRs disagreeing on the digits is the uncertainty signal for Clara's conditional read-back; agreement stays silent. False read-back > missed read-back drove every design choice.

| File | Change |
|------|--------|
| `src/lib/clara/mrnCrosscheck.ts` | NEW. Pure, erasable-TS module shared by the browser hook AND the node harness (node ≥23.6 type-stripping — one implementation, no drift). One symmetric extractor for both transcripts (spoken-words→digits incl. teens/tens/hundred/thousand groups; thousands-comma/hyphen strip for Transcribe's "24,590"; 'oh'=0 only inside digit runs; letters break adjacency; 3–12 digit candidates). Keyword anchoring (mrn/fin/pin[Transcribe FIN-mishear]/medical record/…) with token-distance tracking — when both sides anchor, only each side's CLOSEST-anchored candidates compare, so an agreeing DOB/phone can't mask an MRN disagreement. Episode tracker: opens on Clara's identifier ask or self-opens on an anchored candidate (20 s retro-ingest); **never wiped by Clara's identifier echoes**; TTL 60 s. Joined-finals extraction heals numbers split across consecutive ASR finals. **Mismatch verdicts withheld until 3.5 s settle** (fragment race would false-fire), then fire on the next event (assistant turns evaluate too). Match latches instantly. One nudge per episode, 2 per session. |
| `src/hooks/useClaraVoiceSession.ts` | Feeds user/assistant/medical finals to the tracker; on nudge → `provider.injectSystemText`; `capturedIdentifier` state; logs `metadata.identifierCrosscheck {captured, events}` at end-of-call. |
| `src/components/clara/ClaraVoiceTestView.tsx` | Muted results line: `MRN cross-check ✓ <value>` (verified) or `MRN (unverified, <source>)`. |
| `services/nova-sonic-relay/scripts/voice-steelman.mjs` | Faithful Phase-3 client emulation (default ON; `--no-phase3`; `--force-mismatch` = one synthetic nudge, last digit rotated, organic sending suppressed). End-of-run verdict/capture summary. |
| `src/lib/clara/__tests__/mrnCrosscheck.test.ts` | 36 tests: H1/H2 live renderings, 442-vs-4421 dropped digit, split-final healing, order independence, retro-ingest, settle race, echo-no-wipe regression, DOB-masking, session cap, one-sided silence. |

### Companion: Transcribe value = authoritative captured identifier
`CapturedIdentifier`: agreement → verified; otherwise Transcribe-preferred over Nova (Steve's call — Transcribe is consistently cleaner on digit strings). Surfaced in hook state, results UI, and session metadata.

### Live smoke (4/4, voice-steelman vs deployed Clara) — 3 hardenings came FROM these runs
1. **fast** (300 wpm digits): ORGANIC mismatch — Nova heard `781234`, Transcribe `7331924` → nudge → Clara read back digit-by-digit. The motivating failure, reproduced and corrected live.
2. **quantity MRN**: genuine mismatch `24509` vs `24590` (Nova dropped the "-ty" off "ninety") — correct verdict. Exposed **Nova hallucinating a third number** (read back "830592", present in neither transcript) when the nudge handed it two similar values → nudge now pre-spells the TRANSCRIBE value digit-by-digit and names it the read-back target.
3. **alnum FIN** ("alpha bravo 24,590"): formatting + split-final MATCH → silence, captured `24590 (agreement, verified)`. First run of this scenario exposed that Clara's identifier ECHO ("I've got Robert Chan, FIN…") wiped the pending comparison → episodes are no longer wiped by assistant identifier mentions.
4. **--force-mismatch**: Clara recited the pre-spelled digits exactly — hallucination fix verified.

### sevaro-voice-agent PR #39 merged
Steve's explicit go mid-session. Squash → `rnd/ai-operator`, ancestor-verified, branch deleted.

## What Was NOT Done
- **Browser-client live e2e**: the harness emulates the exact client code path (same module, same systemText frame), but no real human call has exercised Phase 3 through `/rnd/clara` yet. Steve's next live call is the final check.
- **Twilio phone line** — unchanged, still unbuilt (see morning handoff).
- **Per-hospital coverage config** — still the biggest open design item (chip pending).

## Known Risks / Watch Items
1. **Nudge cap = 2/session, settle = 3.5 s, pairing window = 12 s** — all in `DEFAULT_CROSSCHECK_CONFIG`, chosen from today's live timing; revisit if real calls show late Transcribe finals (>12 s) or callers who restate MRNs more than twice.
2. **Genuine-mismatch read-back adds one conversational beat** (verdict waits for settle, fires on Clara's next turn). Deliberate — the alternative is fragment false-fires.
3. **Nova ASR error rate on digits was 3-for-4 runs today** (781234, 24509, 254590 vs one clean run). Transcribe was right every time — supports Transcribe-as-authoritative, and means the read-back will fire regularly on fast/mumbled MRNs in real use.
4. **Executor-subagent wedge**: the Sonnet executor burned a 64k-token message producing zero files and a stray `pnpm-workspace.yaml`; killed, built in main session. If it recurs on other tasks, suspect the executor harness rather than the task.
5. Mid-session, another session pushed `950af5e` (triage bake-off doc) to this repo — no conflict, but two sessions were in one tree today; keep the isolated-worktree rule in mind.

## Required Next Steps
1. **Steve: one real voice call on `/rnd/clara`** — rattle off an MRN fast or mumbled. Expect: read-back ONLY if the two transcripts disagreed; results panel shows the muted "MRN cross-check" line; `clara_test_sessions.metadata.identifierCrosscheck` populated.
2. If the live call behaves: consider porting the cross-check pattern to the production twin when Clara gets its Twilio path (the module is transport-agnostic — it only needs the two transcript streams).
3. Optional hygiene: check in a `gen-phase3-wavs.sh` + expected-verdict runner so the 4-scenario smoke is one command (queued in IMPROVEMENT_QUEUE).

## Files to Review First
- `src/lib/clara/mrnCrosscheck.ts` — all decision rules, heavily commented
- `src/lib/clara/__tests__/mrnCrosscheck.test.ts` — the behavioral contract
- `src/hooks/useClaraVoiceSession.ts` — integration points (search "Phase 3")
- `docs/HANDOFF_2026-07-12_clara-hardening.md` — the morning session (Gate-0/red-team context)

## Prompt for Next Session
```
Repo: ~/dev/repos/OPSAmplehtml (AWS: --profile sevaro-sandbox; relay us-east-1, untouched).
Read docs/HANDOFF_2026-07-12_clara-phase3.md and .claude/progress.json first.
STATE: Phase 3 (MRN read-back only on Nova↔Transcribe disagreement) is LIVE (main 6d4b9b3, Amplify 318);
voice-agent PR #39 MERGED. Pending: Steve's real browser call on /rnd/clara = final e2e; ask for the result
(expect read-back only on disagreement + metadata.identifierCrosscheck populated).
NEXT CANDIDATES (Steve picks): per-hospital coverage config (biggest open design), Twilio Media Streams
phone line for Clara, or port the cross-check to sevaro-voice-agent alongside the Twilio build.
CONSTRAINT: never change a triage threshold/tier without Steve's clinical sign-off.
Smoke harness: services/nova-sonic-relay/scripts/voice-steelman.mjs (run from that dir; CLARA_PW = Amplify
CLARA_TEST_PASSWORD; --force-mismatch for deterministic read-back test).
```
