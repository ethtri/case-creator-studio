# Hygiene Routines

Lightweight routines for keeping the repo reviewable, verifiable, and safe for multi-agent work.

## Per PR
- Work from a dedicated worktree: `../wt-<short-task-slug>` on `agent/<short-task-slug>`.
- Start from current `main`; sync from `main` again before final verification if shared-foundation PRs merged.
- Confirm `git status --short --branch` is clean or contains only intended files before staging.
- Check open PR overlap with `gh pr list --state open` and call out shared files in the PR.
- Run and record:
  - `npm ci`
  - `npm run lint --if-present`
  - `npm run type-check`
  - `npm run build`
  - `npm test --if-present`
- Update docs when the work changes scope, status, launch readiness, or P0 completion.
- Open a PR into `main`; do not push directly to `main`.

## Weekly
- Review open PRs for stale work, conflicts, and overlapping files.
- Review merged remote branches and delete only branches already merged to `origin/main`.
- Do not delete open PR heads. At this baseline, open heads included `agent/console-warnings` and `codex/fix-preview-bug-and-improve-performance`; re-check before cleanup.
- Do not delete branches attached to active worktrees until the worktree is removed or intentionally repurposed.
- Check that `Docs/BACKLOG.md` and `Docs/CURRENT_STATUS.md` agree; run `npm run sync:status` after backlog edits.
- Run `npm audit` and record whether findings need immediate action or backlog tracking.
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

## Local Hooks
- Local hooks are optional guardrails for faster feedback.
- CI is authoritative; do not rely on local hooks as the only verification.
- If local hooks fail because the environment is missing dependencies, run `npm ci` and retry before bypassing.
