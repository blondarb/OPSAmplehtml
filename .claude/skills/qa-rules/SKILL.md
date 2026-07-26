---
name: qa-rules
description: Rules of engagement for QA on this repo — how a release is tested, what the stable baseline is, and the planner/executor split between Claude Code and Claude for Chrome. Use when planning a QA run, writing a mission brief, filing a bug, or preparing a release checklist.
---

# QA rules of engagement

Test artifacts live in `qa/`. Read the file, not a summary of it:

| File | Purpose |
|------|---------|
| `qa/TEST_RUNBOOK.md` | Stable baseline test plan (smoke + regression + mobile + role-based) |
| `qa/TEST_CASES.yaml` | Structured cases with IDs, preconditions, steps, expected results |
| `qa/BUG_TEMPLATE.md` | Bug report template (repro, expected/actual, env, logs) |
| `qa/RELEASE_CHECKLIST.md` | Pre-deploy and post-deploy checks |
| `qa/runs/RUN_TEMPLATE.md` | Per-release run log — copy, fill, save as `RUN-YYYY-MM-DD-NNN.md` |

## The conventions that aren't obvious from the files

**The runbook is stable; the delta is not.** Each release gets a short mission brief in
`qa/runs/` listing only what changed. Do not regenerate the full plan per run — that is how
runbooks drift into being rewritten instead of executed.

**Every deploy runs the S1–S5 smoke suite**, plus whatever the mission brief calls out.

**Planner and executor are different tools.** Claude Code plans the run; Claude for Chrome
executes against the live UI. Keep the split — the planner has repo context the browser
session does not, and the executor sees rendering the planner cannot.

**Mobile-first.** Every run includes at least one 375px check (E1). Not optional, not
"if there's time" — the product is used on phones.

**Versioned.** `runbook_version` and `test_cases_version` live in the file headers. Bump
them when flows or cases change, so a run log can be traced to what it actually ran.
