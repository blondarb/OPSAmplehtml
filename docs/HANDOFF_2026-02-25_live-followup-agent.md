# Sevaro Clinical Handoff — February 25, 2026

## Audience
Next Claude Code session tasked with implementing the Live Follow-Up Agent (Twilio + OpenAI Realtime integration).

## Current State
- **Build/Deploy status**: Main branch compiles clean. No new code written — this was a design/planning session only.
- **Branch**: `main` (no feature branch created yet)
- **Live URL**: https://ops-amplehtml.vercel.app/
- **Uncommitted changes**: CLAUDE.md updates, playbook updates, and the new design doc are all unstaged. They should be committed before starting implementation.

## Work Completed

### Live Follow-Up Agent — Design & Architecture
- Researched voice AI platforms (Vapi, Bland.ai, Retell AI) and evaluated against Twilio direct integration
- Decision: **Twilio + OpenAI Realtime API** — no wrapper platform. Cheapest, most flexible, organization already uses Twilio.
- Wrote full design document covering user experience, data flows (SMS + voice), architecture, security, and phased implementation
- Updated playbook with Phase 1.5 roadmap entry
- Updated CLAUDE.md with design doc reference, Twilio env vars, new Supabase table

| File | Change |
|------|--------|
| `docs/plans/2026-02-25-live-followup-agent-design.md` | **NEW** — Full design doc (architecture, data flows, components, phasing) |
| `playbooks/04_post_visit_agent.md` | Added Phase 1.5 section, resolved voice provider open question |
| `CLAUDE.md` | Added design doc reference, Twilio env vars, `followup_phone_sessions` table, recent changes entry |

## What Was NOT Done
- No implementation code written — this was design only
- No Twilio account created yet (user will need a free trial or org account)
- No feature branch created
- No implementation plan (step-by-step task list) written yet — design doc has a phased outline but not granular tasks

## Known Risks / Watch Items
1. **Vercel WebSocket limitation**: Vercel serverless functions don't support long-lived WebSockets. The voice bridge (Twilio Media Streams ↔ OpenAI Realtime) needs a separate lightweight server on Railway, Fly.io, or Render (~$5/month). SMS works fine on Vercel.
2. **Twilio 10DLC registration**: For production SMS, Twilio requires A2P 10DLC registration (anti-spam compliance). For demo/trial usage this isn't needed, but will be for production.
3. **Schema mismatches in existing follow-up code**: The exploration found column naming inconsistencies (`severity` vs `tier`, `conversation_status` vs `status`, missing `current_module` column). These should be fixed before or during implementation.
4. **Existing follow-up conversation engine needs refactoring**: The `/api/follow-up/message` route currently handles everything inline. The core logic (prompt building, OpenAI call, escalation checking) should be extracted into a shared function so both the in-browser chat and Twilio SMS webhook can call it.

## Required Next Steps

### Before coding — setup
1. **Commit the design doc and doc updates** from this session (CLAUDE.md, playbook, design doc)
2. **Create a Twilio free trial account** at twilio.com (provides $15 in credits, no CC needed)
3. **Provision a US phone number** in Twilio (~$1.15/month)
4. **Set environment variables** in `.env.local`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

### Phase A — SMS (first implementation session)
5. **Create Supabase migration** for `followup_phone_sessions` table (schema in design doc Section 4.2)
6. **Install Twilio SDK**: `npm install twilio`
7. **Build `src/lib/follow-up/twilioClient.ts`** — send SMS helper, webhook signature validation
8. **Build `POST /api/follow-up/send-sms`** — triggers initial outbound SMS, creates session + phone mapping
9. **Build `POST /api/follow-up/twilio-sms`** — webhook receives inbound SMS replies, reuses existing conversation engine, responds via TwiML
10. **Refactor `/api/follow-up/message/route.ts`** — extract core logic into shared function callable from both browser chat and Twilio webhook
11. **Build `LiveDemoPanel.tsx`** — phone input + scenario selector + send button
12. **Add Supabase real-time subscription** to `ClinicianDashboard` for server-side session updates
13. **Configure Twilio webhook URL** to point to your Vercel deployment
14. **Test end-to-end**: enter phone number → receive SMS → reply → see dashboard update

### Phase B — Voice (second implementation session)
15. **Set up voice bridge server** (Railway or Fly.io) — Node.js WebSocket that bridges Twilio Media Streams ↔ OpenAI Realtime API
16. **Build `POST /api/follow-up/twilio-voice`** — webhook returns TwiML connecting inbound calls to the voice bridge
17. **Implement cross-channel context** — inject SMS history into voice session system prompt
18. **Configure Twilio voice webhook URL**
19. **Test end-to-end**: text first, then call back, verify context carries over

### Phase C — Polish (half session)
20. **STOP/opt-out handling** in SMS webhook
21. **Rate limiting** (1 active session per phone, 5 per 24 hours)
22. **Phone number cleanup** — Supabase cron or scheduled function to delete expired rows
23. **Error states** — handle Twilio delivery failures, OpenAI timeouts gracefully
24. **Status webhook** (`/api/follow-up/twilio-status`) for delivery receipts

## Files to Review First
1. **`docs/plans/2026-02-25-live-followup-agent-design.md`** — The full design doc. Read this first. It has all architecture decisions, data flows, and component specs.
2. **`playbooks/04_post_visit_agent.md`** — The product playbook. Sections 4-6 have the conversation script, escalation rules, and system prompt spec.
3. **`src/app/api/follow-up/message/route.ts`** — The existing conversation engine. This is the code you'll refactor and reuse.
4. **`src/lib/follow-up/systemPrompt.ts`** — The AI system prompt. Reused as-is for SMS; adapted slightly for voice.
5. **`src/lib/follow-up/escalationRules.ts`** — Regex safety net for escalation detection. Reused as-is.
6. **`src/lib/follow-up/demoScenarios.ts`** — 6 demo patient scenarios. Used by the LiveDemoPanel dropdown.
7. **`src/lib/follow-up/types.ts`** — All TypeScript interfaces for the follow-up system.
8. **`src/app/follow-up/conversation/page.tsx`** — The existing conversation page where the LiveDemoPanel will be added.
