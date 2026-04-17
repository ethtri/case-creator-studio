# AGENTS

## Scope and precedence
- Keep context small. Prefer docs in this order:
  1. `Docs/CURRENT_STATUS.md`
  2. `Docs/MVP_SCOPE.md`
  3. `Docs/BACKLOG.md`
  4. `Docs/QA_SMOKE_TEST_CHECKLIST.md`
  5. `Docs/PRINTFUL_NOTES.md`
  6. `Docs/DECISIONS.md`
- Canonical docs folder is `Docs/` (case-sensitive on some systems).
- If docs disagree, `Docs/DECISIONS.md` wins.
- This file is guardrails only; use the relevant doc for details (see `Docs/README.md`).
- Task DoD is below; MVP DoD stays in `Docs/MVP_SCOPE.md`.

## Do
- Focus on P0 items first.
- Prefer small, reviewable PRs (one feature, fix, or hygiene slice per PR).
- Keep changes minimal and reversible.
- Update `Docs/CURRENT_STATUS.md` when you complete a P0 item.
- Run `npm run sync:status` after editing `Docs/BACKLOG.md`.
- Prefer `npm ci` for installs/verification (use `npm install` only when a doc explicitly requires it).
- If this touches the same files as another open PR, say so.

## Do Not
- Reformat or rewrite docs unless asked.
- Add new large docs without removing older ones.
- Expand scope beyond `Docs/MVP_SCOPE.md`.

## Definition of Done (task)
Done means: code/docs change complete + docs updated (if P0) + verification run + PR opened.

## Version control protocol (must follow)

### Never
- Never commit or push directly to `main`.

### Unified workflow (all agents)
- Always work in a dedicated Git worktree for the task.
- Start from current `main` unless the user explicitly names another base.
- Always create a new branch for the task.
- Branch naming: `agent/<short-task-slug>`.
- Open a PR into `main` for every change, even for local work.
- Run verification on the PR branch; local testing happens by checking out that branch.
- Treat local hooks as optional guardrails; CI is the source of truth.

### PR requirements (always)
- PR description includes:
  - Summary (1-3 bullets)
  - Files changed
  - Verification commands + results:
    - npm ci
    - npm run build
    - npm run type-check
    - npm test --if-present
    - npm run lint --if-present
  - How to test (localhost steps or a clear note when no runtime flow changed)
  - Docs/status updates
  - Risk/overlap notes, including open PRs touching the same files

### Multi-agent branch safety
- If another PR that touches shared foundations merges, update your branch from `main` before final verification.
- Re-run verification after syncing.
- Call out conflicts or risky overlaps in the PR description or status update.

### Multi-agent worktree safety
- Each agent must work in its own Git worktree directory (not the same repo folder).
- One worktree = one checked-out branch. Do not run two agents in the same worktree.
- Worktree naming convention:
  - Directory: `../wt-<short-task-slug>`
  - Branch: `agent/<short-task-slug>`
- Do not edit the root `main` worktree directly for task work.

## Hygiene routines
- Use `Docs/HYGIENE_ROUTINES.md` for per-PR, weekly, and pre-launch hygiene checks.
- Keep `main` protected in GitHub when repository permissions allow it: PR required, direct pushes blocked, and verification required before merge.
