# Release Checklist - Sevaro Clinical

> Use this for every deploy to production. Preview deploys need only Pre-Deploy.

---

## Pre-Deploy

### Build & Code
- [ ] **Build passes**: `npm run build` exits 0, no TS errors
- [ ] **Branch pushed**: Feature branch pushed, Vercel preview created
- [ ] **Migration reviewed**: Any new `supabase/migrations/` file reviewed and applied to staging
- [ ] **No secrets in code**: No `.env` values, API keys, or credentials committed
- [ ] **No console errors**: Browser console clean on dashboard and portal pages
- [ ] **PR created**: Feature branch has PR with summary of changes

### Smoke Suite (S1-S7)
- [ ] **S1**: Desktop app loads (redirects to /dashboard or /login)
- [ ] **S2**: Mobile app loads (redirects to /mobile on phone)
- [ ] **S3**: Login works (demo credentials authenticate)
- [ ] **S4**: All tabs render (History, Imaging, Exams, Recommendation)
- [ ] **S5**: Patient portal loads (/patient accessible)
- [ ] **S6**: Mobile app works (/mobile shows patient list, FAB)
- [ ] **S7**: Build passes (npm run build)

### Mobile Testing (Required)
- [ ] **M1**: Auto-redirect on mobile device works
- [ ] **O6**: iPhone Safari transcription succeeds
- [ ] **P2**: Switch to Desktop View works

### Spot Checks
- [ ] **Dark mode**: F1 verified on preview
- [ ] **One AI feature**: B1 or B4 works correctly
- [ ] **Focus area tested**: Mission brief focus cases executed

---

## Deploy

- [ ] **Merge PR** to `main` (triggers Vercel production deploy)
- [ ] **Supabase migration applied** to production (if applicable)
- [ ] **Vercel deploy completes** without error (check Vercel dashboard)

---

## Post-Deploy (production URL: ops-amplehtml.vercel.app)

### Core Functionality
- [ ] **Desktop app loads**: Production URL returns login or dashboard
- [ ] **Login works**: Demo credentials authenticate successfully
- [ ] **Dashboard renders**: Patient card, tabs, sidebar all present
- [ ] **Mobile redirects**: `/` on phone goes to `/mobile`

### Patient-Facing
- [ ] **Patient portal loads**: `/patient` accessible without auth
- [ ] **Historian tab**: Patient list visible, demo scenarios expand

### AI Features (spot check 2-3)
- [ ] **Voice transcription**: Record and transcribe works
- [ ] **Ask AI**: Question returns contextual response
- [ ] **Chart Prep or Generate Note**: AI processes correctly

### New Feature Verification
- [ ] **Specific feature shipped in this release works**: (describe)

---

## Rollback Plan

If post-deploy checks fail:
1. **Revert via Vercel**: Redeploy previous commit from Vercel dashboard
2. **If migration was applied**: Assess if rollback SQL is needed (never drop columns in panic)
3. **Document issue**: Create bug report in `qa/runs/` using BUG_TEMPLATE.md
4. **Notify team**: Alert stakeholders of rollback

---

## Quick Reference: What to Test by Change Type

| Change Type | Required Tests |
|-------------|----------------|
| **Hotfix** | S1-S7 only |
| **Minor feature** | S1-S7 + mission brief focus |
| **Mobile changes** | S1-S7 + M1, O6, P2, E5 |
| **AI/Historian changes** | S1-S7 + AI verification checklist + I1-I14 subset |
| **Full release** | Full regression per runbook |

---

## Sign-Off

| Phase | Who | Date | Status |
|-------|-----|------|--------|
| Pre-deploy | | | ⬜ |
| Deploy | | | ⬜ |
| Post-deploy | | | ⬜ |

**Release Notes (brief):**
-
-
-
