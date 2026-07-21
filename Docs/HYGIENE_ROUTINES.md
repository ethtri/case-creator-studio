# Hygiene Routines

Lightweight routines for keeping the repo reviewable, verifiable, and safe for multi-agent work.

## Per PR

- Start from a GitHub issue with evidence, one outcome, explicit non-goals,
  observable acceptance criteria, dependencies, verification, and rollback.
- Work from a dedicated worktree: `../wt-<short-task-slug>` on `agent/<short-task-slug>`.
- Start from current `main`; sync from `main` again before final verification if shared-foundation PRs merged.
- Confirm `git status --short --branch` is clean or contains only intended files before staging.
- Check open PR overlap with `gh pr list --state open` and call out shared files in the PR.
- When the task touches SEO, CRO, analytics, or public marketing assets, also run
  `gh pr list --state open --label origin:marketing-agency` and inspect relevant
  recently merged labeled PRs before editing overlapping files or routes.
- Run and record:
  - `npm ci`
  - `npm run audit:production` (fails on high or critical production advisories;
    moderate findings remain visible in the job output)
  - `npm run lint --if-present`
  - `npm run type-check`
  - `npm run build`
  - `npm test --if-present`
- Update docs when the work changes scope, status, launch readiness, or P0 completion.
- Open a PR into `main` with `Closes #<issue>`; do not push directly to `main`.
- Complete every section and checklist item in the PR template. CI rejects missing
  traceability, placeholders, unchecked verification, and empty evidence sections.
- For an exceptional documentation-only or emergency change, a maintainer may add
  `governance-exception` with a comment explaining why the normal evidence contract
  cannot be completed. Remove the label as soon as the exception is no longer needed.

## Priority and Work Labels

- `P0`: blocks the controlled production-ready pilot. Complete before P1/P2 work.
- `P1`: major launch-quality work to complete before scaling customer traffic.
- `P2`: post-launch optimization, experiment, or non-blocking improvement.
- `epic`: parent issue coordinating several independently reviewable outcomes.
- `production-readiness`: controlled-production work; use with `P0` when blocking.
- `marketing`, `analytics`, `performance`, `accessibility`, `seo`, `cro`,
  `governance`, and `security`: topical ownership labels. Pair with one priority.
- `codex`: work specified so a coding agent can execute it using repository rules.
- `origin:marketing-agency`: work initiated by the autonomous marketing repo;
  requires the agency issue form, `agent/agency-*` branch, PR provenance block,
  and post-merge audit backlink.

## Weekly

- Review open PRs for stale work, conflicts, and overlapping files.
- Reconcile `origin:marketing-agency` PRs merged since the prior review. Confirm
  each has a full source link and a post-merge marketing audit backlink or a
  clearly recorded `pending` owner.
- Review merged remote branches and delete only branches already merged to `origin/main`.
- Do not delete open PR heads. At this baseline, open heads included `agent/console-warnings` and `codex/fix-preview-bug-and-improve-performance`; re-check before cleanup.
- Do not delete branches attached to active worktrees until the worktree is removed or intentionally repurposed.
- Check that `Docs/BACKLOG.md` and `Docs/CURRENT_STATUS.md` agree; run `npm run sync:status` after backlog edits.
- Run `npm audit` and record whether findings need immediate action or backlog tracking.
  Keep this full dependency-tree review separate from the production CI gate.
- Review `Docs/DEPLOYMENT_STATUS.md` for stale deployment or preview-environment notes.

## Monthly or Pre-Launch

- Run `Docs/QA_SMOKE_TEST_CHECKLIST.md` against the current deployment path.
- Review `Docs/VERCEL_SETUP_STEPS.md` and Supabase notes for drift from actual deployment settings.
- Verify `staging.snapcase.ai` still resolves to the dedicated `snapcase-staging`
  Vercel project and that its unauthenticated bundle references only the isolated
  staging Supabase project. Never attach the staging domain to the production
  Vercel project or a branch-scoped preview deployment.
- Run `npm run build` and review warnings, especially bundle-size and browser-data warnings.
- Revisit branch protection on `main`: require PRs, block direct pushes, require verification, and require up-to-date branches when practical.

## Temporary Development-Tool Exception

- `vite@5.4.21` remains a development-only dependency while the production tree
  is audited separately. The current npm advisory report covers local Vite
  development-server behavior, including Windows path and editor-launch handling;
  Vite is not shipped in the static production bundle.
- Compensating controls: do not expose `vite dev` to untrusted networks, do not
  run editor-launch links from untrusted input, and keep `npm run
audit:production` as a required PR check.
- Owner: repository maintainers. Revisit by **2026-08-15** with a focused Vite
  major-version compatibility PR. Upstream advisories:
  [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9),
  [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3),
  and
  [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff).

## Local Hooks

- Local hooks are optional guardrails for faster feedback.
- CI is authoritative; do not rely on local hooks as the only verification.
- If local hooks fail because the environment is missing dependencies, run `npm ci` and retry before bypassing.
