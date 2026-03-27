# Handoff: OAuth SSO Migration — 2026-03-27

## Summary

Migrated OPSAmple (`app.neuroplans.app`) from direct Cognito SDK authentication to OAuth + PKCE via Cognito Hosted UI SSO at `auth.neuroplans.app`. This is the same auth pattern used by all other neuroplans.app subdomains (Evidence Engine, Neuro Plans, Cardio Plans, GitHub Showcase, Workouts, Spine Surgery).

## What Changed

### New Files
- `src/app/api/auth/login/route.ts` — Redirects to Cognito Hosted UI with state param
- `src/app/api/auth/callback/route.ts` — Exchanges authorization code for tokens, sets httpOnly cookies
- `src/app/api/auth/logout/route.ts` — Clears cookies, redirects to Cognito logout
- `src/app/api/auth/refresh/route.ts` — Refreshes tokens using refresh_token cookie
- `src/app/api/auth/me/route.ts` — Returns authenticated user from id_token cookie

### Modified Files
- `src/lib/cognito/server.ts` — Changed cookie name from `cognito-id-token` to `id_token`, removed audience verification
- `src/lib/cognito/client.ts` — Replaced entire Cognito SDK with OAuth cookie-based helpers
- `src/contexts/AuthContext.tsx` — Simplified to OAuth-based auth (removed signIn/signUp/etc, added 50-min proactive refresh)
- `src/middleware.ts` — Changed cookie name from `cognito-id-token` to `id_token`
- `src/app/login/page.tsx` — Replaced email/password form with "Sign In with Sevaro SSO" button
- `src/app/signup/page.tsx` — Simplified to redirect to SSO (signup handled by Hosted UI)
- `package.json` — Removed `amazon-cognito-identity-js` dependency
- `CLAUDE.md` — Updated auth config, env vars, recent changes

### Deleted Files
- `src/app/api/auth/session/route.ts` — Replaced by OAuth callback route

## Key Decisions
- Kept the same `getUser()` export interface in `server.ts` so 80+ API routes work unchanged
- Kept the same `useAuth()` hook interface (user, userProfile, loading, signOut) so PlatformShell, ClinicalNote, FeedbackWidget, triage pages, etc. all work unchanged
- Used client secret (confidential client) for token exchange, matching spine-surgery pattern
- Legacy cookie names cleared in callback and logout routes for clean transition

## Configuration
- **Cognito Pool:** `us-east-2_9y6XyJnXC` (Evidence Engine / shared SSO)
- **Client ID:** `6rahc3cs4846f05gf7fbucqi4d`
- **Client Secret:** Stored in Amplify env var `COGNITO_CLIENT_SECRET`
- **Auth Domain:** `auth.neuroplans.app`
- **Amplify App:** `d3ietjwgco4g2t` (branch: main)

## Next Steps
- Verify SSO login works on `app.neuroplans.app` after Amplify deploy
- Verify all cards (Dashboard, EHR, Triage, Wearable, etc.) are accessible after login
- Consider decommissioning deprecated Cognito Shared pool (`us-east-2_Owfb1zpgM`)
