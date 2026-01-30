# Release Checklist - Sevaro Clinical

> Use this for every deploy to production. Preview deploys need only Pre-Deploy.

---

## Pre-Deploy

- [ ] **Build passes**: `npm run build` exits 0, no TS errors
- [ ] **Branch pushed**: Feature branch pushed, Vercel preview created
- [ ] **Migration reviewed**: Any new `supabase/migrations/` file reviewed and applied to staging
- [ ] **Smoke suite passes**: S1-S5 from TEST_RUNBOOK.md green on preview URL
- [ ] **Focus area tested**: Mission brief focus cases executed (see run log)
- [ ] **Mobile spot-check**: At least E1 (375px) verified on preview
- [ ] **Dark mode spot-check**: F1 verified on preview
- [ ] **No secrets in code**: No `.env` values, API keys, or credentials committed
- [ ] **No console errors**: Browser console clean on dashboard and portal pages
- [ ] **PR created**: Feature branch has PR with summary of changes

## Deploy

- [ ] **Merge PR** to `main` (triggers Vercel production deploy)
- [ ] **Supabase migration applied** to production (if applicable)
- [ ] **Vercel deploy completes** without error (check Vercel dashboard)

## Post-Deploy (production URL)

- [ ] **App loads**: Production URL returns login page
- [ ] **Login works**: Demo credentials authenticate successfully
- [ ] **Dashboard renders**: Patient card, tabs, sidebar all present
- [ ] **Patient portal loads**: `/patient` accessible without auth
- [ ] **New feature works**: Verify the specific feature shipped in this release
- [ ] **No regression**: Quick pass through tabs, AI drawer opens, Voice drawer opens
- [ ] **Mobile**: Quick check at 375px — no layout break

## Rollback Plan

If post-deploy checks fail:
1. Revert merge on GitHub (or redeploy previous commit via Vercel)
2. If migration was applied: assess if rollback SQL is needed (never drop columns in panic)
3. Document issue in `qa/runs/` with bug template

---

## Sign-Off

| Check | Who | Date | Status |
|-------|-----|------|--------|
| Pre-deploy | | | |
| Deploy | | | |
| Post-deploy | | | |
