# Marketing Agency / Website Coordination

This contract keeps the autonomous marketing agency and website BAU agents aware
of one another without maintaining two competing product changelogs.

## Source-of-truth boundary

- `ethtri/case-creator-studio` owns implementation truth: issue, diff, checks,
  merge commit, deployment, and rollback of website code.
- `ethtri/Snapcase_Autonomous_MarketingAgency` owns marketing truth: source brief
  or queue item, claims/rights review, authority or approval, measurement intent,
  and the execution audit.
- Cross-links are mandatory. Do not copy a whole brief, audit, or website status
  record into the other repository.

## Agency-originated intake

1. Open the **Agency-originated website change** issue form in this repository.
2. Apply `origin:marketing-agency` and link the full source reference as
   `ethtri/Snapcase_Autonomous_MarketingAgency#<number>`.
3. Work from current `main` on `agent/agency-<short-task-slug>`.
4. Complete the PR template's Cross-repo provenance section. Before merge, the
   marketing execution audit may be `pending`; every other field must be final.
5. Pass PR Hygiene, normal CI, focused validation, and rendered QA when visible
   UI changes.

PR Hygiene treats a PR as agency-originated when any signal is present: the
origin label, an `agent/agency-*` branch, or the marketing repository in the
provenance block. Missing any other required signal then fails the check.

## BAU-agent awareness

Before overlapping website work, BAU agents inspect:

```powershell
gh pr list --state open --label origin:marketing-agency
gh pr list --state merged --label origin:marketing-agency --search "merged:>=YYYY-MM-DD"
```

Read the linked source artifact when the task shares a route, file, claim,
metric, asset path, or rollback surface. Current `main` remains authoritative for
the code itself.

## Post-merge reconciliation

The originating marketing agent must:

1. Verify the production or intended deployment result.
2. Write an audit containing the website issue, PR URL, 40-character merge SHA,
   source artifact/ID, authority or approval, result, and rollback.
3. Commit the audit and use its immutable GitHub permalink in a comment on the
   merged website PR or issue.
4. Reconcile the originating marketing queue/report so it does not continue to
   treat shipped work as pending.

If verification fails, leave the website issue open or reopen it, record the
failure and owner in both places, and follow the rollback path.

## Why there is no cross-repo dispatch token

GitHub issues, PRs, labels, checks, and immutable permalinks provide the needed
coordination without adding a credential that can write across repositories.
Add dispatch automation only if measured reconciliation failures justify the
extra secret, permission, rotation, and failure-handling surface.
