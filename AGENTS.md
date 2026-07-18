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
Done means: code/docs change complete + docs updated (if P0) + verification
run + PR opened, QA passed, and PR merged. If a PR cannot be merged, document
the specific external blocker and leave it open only while that blocker is
active.

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

### Goal execution and delegation
- The lead agent owns the goal end to end: confirm the current issue/board state,
  order dependencies, delegate independent slices, integrate results, update
  status, and verify the final goal acceptance criteria.
- Proactively use sub-agents for independent implementation, research, review, or
  QA slices when parallel work will shorten the critical path. Delegation does
  not transfer the lead agent's accountability for the completed goal.
- Before delegating, give each sub-agent a concrete task contract:
  - GitHub issue and acceptance criteria
  - allowed scope and expected files or ownership boundary
  - dedicated worktree and branch name
  - dependencies and whether the PR may merge immediately
  - required verification and handoff evidence
- Sub-agents are empowered to inspect the repo, implement their assigned scope,
  run verification, open a PR, address review or CI findings, and squash-merge
  when this file's merge gates pass. They should not wait for separate approval
  for those actions unless the task contract marks the work as review-only or
  dependent on an unmerged prerequisite.
- Do not delegate overlapping edits to the same shared foundation in parallel.
  Establish and merge the shared contract first, then update dependent branches
  from `main`. When overlap is unavoidable, assign one owner and make other
  agents review-only for those files.
- Every sub-agent must read this file and the relevant canonical docs before
  editing. Each sub-agent uses its own worktree; agents never share uncommitted
  files, terminals, branches, or worktrees.
- A sub-agent handoff must include the issue and PR, files changed, verification
  results, migrations or environment changes, risks, and any acceptance criteria
  that remain unproven.
- The lead agent owns external coordination. Sub-agents must not contact or ask
  the user, vendors, or on-site staff to test unless their task contract
  explicitly delegates that communication and the stated preconditions are met.
- After each dependent merge, the lead agent updates downstream branches from
  `main`, reruns affected verification, and checks the GitHub board, open PRs,
  review comments, and CI before starting the next wave.
- Merged code is not enough to close an issue when staging, production, vendor,
  or physical evidence remains in its acceptance criteria. Record the remaining
  gate and keep the issue open.
- Delegation is not a stopping point. The lead agent continues through
  integration and final QA until the goal is achieved or a specific external
  blocker is documented.

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

### Proactive PR QA And Merge (always)
- After opening a PR, proactively inspect its diff, review comments, merge
  state, and CI status. Do not wait for a separate user request to begin QA.
- Merge the PR with squash once all required checks pass, focused validation is
  appropriate for the changed surface, there are no unresolved review comments,
  and the PR is clean against `main`.
- For frontend-visible changes, perform a rendered browser check when a usable
  environment is available. If the environment prevents that check, record the
  limitation and complete all available static/build validation.
- Before merging a PR that touches shared foundations, fetch current `main`,
  update the branch if needed, and rerun the affected verification.
- Never merge failing, conflicted, stale, or insufficiently verified PRs. Fix
  them first; if a PR is a proven duplicate or already superseded, leave an
  evidence-backed comment and close it instead of force-merging it.

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
