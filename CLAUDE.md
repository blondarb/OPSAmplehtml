# Sevaro Clinical - AI-Powered Clinical Documentation

Neurology outpatient web app: clinical notes, AI assistance, voice dictation, dot phrases, clinical scales, patient management.

## Deploy Workflow

**Push-to-deploy is enabled.** After making code changes:
1. Run local dev server (`preview_start`) and verify (no console errors, feature works)
2. Commit and push to `main` — Amplify auto-deploys
3. Do NOT wait for user approval — test locally first, then ship it

**AWS Amplify is the sole deploy target.** Do not add Vercel (or other host) build
config to this repo. A stray `vercel.json` was removed on 2026-05-29 after a Vercel GitHub
integration started posting deploy checks on PRs, contradicting the Amplify-only setup.
Note: removing `vercel.json` stops Vercel from reading repo build config but does **not**
disconnect the Vercel↔GitHub integration — that must be removed in the Vercel/GitHub
dashboard (Vercel project settings → Git, or the GitHub Vercel app's repo access). If you
still see a "Vercel" status check on PRs, the integration is still connected.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 15.1.x with App Router, TypeScript |
| Styling | Tailwind CSS v3 + Inline Styles |
| Database | AWS RDS (PostgreSQL) via node-postgres |
| Auth | AWS Cognito OAuth + PKCE via Hosted UI at `auth.neuroplans.app` |
| AI | AWS Bedrock (Claude Sonnet 4.6) + OpenAI Whisper + Realtime API (WebRTC) |
| SMS/Voice | Twilio (SDK v5) for live patient follow-up demos |
| Deployment | AWS Amplify (push-to-deploy from main) |

## Key Patterns

- **Database:** All queries use `from()` / `wearableFrom()` from `@/lib/db-query` (node-postgres pools to RDS). Auth via `@/lib/cognito/server`.
- **Middleware:** `src/middleware.ts` — session refresh, simplified pass-through (avoids edge function issues).
- **AI Models:** gpt-5-mini (Q&A, chart prep, field actions), gpt-5.2 (visit extraction, assessment, briefings), Bedrock Sonnet 4.6 (triage, localizer), Realtime API (historian).
- **Auth:** Cognito pool `us-east-2_9y6XyJnXC`, client `6rahc3cs4846f05gf7fbucqi4d`. httpOnly cookies (id_token 1h, refresh_token 30d, 50-min proactive refresh).
- **Smart Recommendations:** 127 clinical plans synced from `blondarb/neuro-plans` via `npm run sync-plans`. ICD-10 scored matching links diagnoses to plans.

## Key Routes

| Route | Purpose |
|-------|--------|
| `/` | Homepage — 6-card demo platform |
| `/physician` | Clinical Cockpit (schedule + time-phased briefing) |
| `/dashboard` | Operations Dashboard (5-zone command center) |
| `/ehr` | Patient chart workspace |
| `/wearable` | Wearable monitoring dashboard |
| `/triage` | AI-assisted referral triage |
| `/consult` | Neuro Intake with AI Historian |
| `/follow-up` | Patient Follow-Up Agent (SMS + voice) |
| `/sdne` | SDNE XR assessment integration iframe |

## Commands

```bash
# Local dev
npm run dev

# Type check
npx tsc --noEmit

# Build
npm run build
```

## Known Gotchas

- **Amplify route rules: `next.config` cannot route anything in `public/`.** Amplify
  `WEB_COMPUTE` splits the deploy into a **static CDN origin** (everything in `public/`)
  and a **compute origin** (the Next server), and they cannot see each other. Two
  consequences, both measured against a real branch deployment on 2026-08-05:
  (1) a `redirects()` entry whose *source* is a `public/` asset **never fires** — that
  request is answered by the CDN and never reaches the Next routing layer; (2) a
  `rewrites()` entry whose *target* is a `public/` asset **404s** — the extensionless
  source does reach the compute, but the compute bundle has no copy of `public/`.
  Diagnostic: `curl -I` the path. A `public/` asset comes back with an S3-style `etag`
  and **none** of the `next.config` security headers; a compute-served route carries
  `x-powered-by: Next.js` and the full CSP set. If the security headers are missing,
  no `next.config` route rule can ever apply to that path. Moving the file (e.g. to
  `public/triage-demo/index.html`) does not help — only the literal `/…/index.html`
  path works; the bare directory URL still 404s at the compute.
  **The fix is Amplify Console custom rules** (`aws amplify update-app --custom-rules`,
  or App settings → Rewrites and redirects), which run at the CDN layer above both
  origins. `/triage-demo` is wired this way: a `301` from
  `/concepts/triage-nurse/outpatient-triage-nurse-demo.html` plus a `200` rewrite from
  `/triage-demo` to that file. A `200` rewrite does **not** re-enter the rule chain, so
  that pair does not loop (verified — exactly one hop, final 200). Note `customRules` is
  **app-level, not per-branch**: editing it changes production immediately and applies to
  every branch at once. The mirrored rules in `next.config.ts` exist only so local dev
  matches; they are not load-bearing.
- **This app has no PR previews.** `enableAutoBranchCreation` is `false` and no PR-preview
  config exists, so opening a PR produces no Amplify preview URL — only `main` and
  manually-connected branches ever build. To QA a branch before merge you must connect it
  yourself (`aws amplify create-branch … --stage DEVELOPMENT --framework "Next.js - SSR"`,
  then `start-job --job-type RELEASE`), and delete it afterwards. New branches inherit only
  the two app-level env vars, **not** `main`'s branch-level set — including `RDS_DATABASE`,
  so a connected branch does not automatically point at `ops_amplehtml`.

- **Bind-parameter type inference in `CASE` arms.** A parameter that appears *only* inside a
  `CASE ... THEN $n END` has no type context: Postgres defaults it to `text` and rejects the
  assignment to a `timestamptz` column, so the statement fails at parse time on every
  attempt. This silently broke the emergency-alert delivery path — the failure-*recording*
  path was itself unwritable, so rows could never be marked failed and the worker looped
  until lease expiry. Zero emergency-alert critical-UI notifications had ever been
  delivered. Cast explicitly (`$8::timestamptz`). Note the sibling `terminal_failed_at ...
  THEN $4` needs no cast: `$4` is already pinned by `updated_at = $4` elsewhere in the same
  statement, because Postgres resolves a bind parameter's type from *any* type-determining
  usage across the statement, not per occurrence. Mocked unit tests cannot catch this — the
  suite mocks the pg Pool, so nothing ever reaches a real parser. Verify with `PREPARE`
  against the live schema.
- **`text` -> `uuid` never casts implicitly.** `triage_emergency_actions.owner_user_id` is
  unconstrained text; `notifications.recipient_user_id` is uuid. Use a *guarded* cast
  (regex-match, else NULL), not a bare `::uuid` — a bare cast merely trades a parse failure
  for a runtime 22P02 on the same emergency path.
- `@/lib/db-query` `from()` auto-stringifies plain objects but passes arrays through raw — JSONB array columns (e.g. `transcript`, `red_flags`) must be `JSON.stringify()`'d at the call site before insert.
- **DB target = `ops_amplehtml` (57 tables), set via `RDS_DATABASE`.** The shared `sevaro/rds/credentials` secret's `database` field is a stale default (`github_showcase`, a *different* app's 21-table DB missing `neurology_consults`/`notifications`/`historian_sessions`/`scale_results`/`consult_reports`). `getRdsCredentials()` now honors `RDS_DATABASE` in **all** environments so the app stays on `ops_amplehtml`. Prod (Amplify `main`) sets `RDS_DATABASE=ops_amplehtml`; historically it only stayed correct because the SSR Lambda has no compute role, so the Secrets Manager fetch *fails* and the env-var fallback wins — meaning **if a compute role is ever attached to this Amplify app, the secret fetch would start succeeding and (pre-fix) flip prod to `github_showcase`.** The override defuses that. Do NOT repoint the shared secret to fix this — it's consumed by many apps (SDNE, SevaroMonitor, neurocrit-care-v2, evidence-engine, …); they all override the DB field, but it's a cross-app blast radius.
- Amplify SSR env vars require `next.config` inline block for runtime access (not just `process.env`).
- Triage route uses 202+poll pattern — do not attempt SSE streaming (reverted in PR #111 due to ~28s Amplify gateway timeout).
- `/consult` Historian uses WebRTC Realtime API — requires HTTPS and browser mic permission.
- **ASR vocabulary biasing** (`src/lib/asr/clinical-lexicon.ts`) is on by default for all voice surfaces (Realtime `prompt` + Deepgram `keyterm`). Hot-revert with `ASR_VOCAB_BIASING=false` if a transcription endpoint rejects the biasing field. Whisper's prompt is capped ~224 tokens, so the lexicon is budget-trimmed (session-specific patient/provider/med terms are hoisted first).
- **RDS connections validate TLS** against the vendored AWS RDS CA bundle (`src/lib/rds-ca-bundle.ts`, the full `global-bundle.pem` embedded as a string so it survives Amplify SSR Lambda bundling — loose `.pem` files get dropped). Both pools in `src/lib/db.ts` use `ssl: { ca: RDS_CA_BUNDLE, rejectUnauthorized: true }` (replacing the old `rejectUnauthorized: false`). **Emergency escape hatch:** set `RDS_SSL_INSECURE=true` to fall back to no-validation without a code revert (e.g. if AWS rotates the root CA before the bundle is refreshed). NOTE: Amplify env vars **REPLACE** the whole map on update — adding `RDS_SSL_INSECURE` means re-supplying the **full** existing env map, not just the one var. Refresh the bundle by re-downloading `https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem` and replacing the template literal.

## QA

Test artifacts live in `qa/`. The rules of engagement — stable-baseline-plus-mission-brief,
the S1-S5 smoke suite, the planner/executor split, the 375px requirement — are in the
`qa-rules` skill (`.claude/skills/qa-rules/SKILL.md`).
