import assert from "node:assert/strict";
import test from "node:test";
import { validatePullRequestBody } from "./validate-pr-body.mjs";

function baseBody(extra = "") {
  return `## Issue traceability

- Closes #189

${extra}
## Summary

- Complete outcome.

## Files changed

- \`path\`: changed.

## Verification

- [x] \`npm ci\` - passed
- [x] \`npm run lint --if-present\` - passed
- [x] \`npm run type-check\` - passed
- [x] \`npm run build\` - passed
- [x] \`npm test --if-present\` - passed

## How to test

1. Run the checks.

## Docs/status updates

- Documentation updated.

## Risk/overlap

- Rollback is a revert.

## Workflow confirmation

- [x] Dedicated worktree used.
`;
}

const provenance = `## Cross-repo provenance

- Change origin: \`marketing-agency\`
- Originating repository: \`ethtri/Snapcase_Autonomous_MarketingAgency\`
- Source issue: \`ethtri/Snapcase_Autonomous_MarketingAgency#174\`
- Source artifact: \`https://github.com/ethtri/Snapcase_Autonomous_MarketingAgency/blob/300332a6fdfc15906b198de745f5f6fab1055ae9/integrations/ecommerce_site_repo.md\`
- Source ID: \`cross_repo_coordination_20260721\`
- Authority or approval ID: \`authority_20260720_zero_spend_marketing\`
- Marketing execution audit: \`pending\`
- Post-merge reconciliation owner: \`ethtri/Snapcase_Autonomous_MarketingAgency\`

`;

test("keeps complete website BAU pull requests backward compatible", () => {
  assert.deepEqual(
    validatePullRequestBody({ body: baseBody(), headRef: "agent/bau-change" }),
    [],
  );
});

test("accepts a complete agency-originated pull request", () => {
  assert.deepEqual(
    validatePullRequestBody({
      body: baseBody(provenance),
      labels: ["origin:marketing-agency"],
      headRef: "agent/agency-cross-repo-coordination",
    }),
    [],
  );
});

test("rejects an agency branch without the origin label", () => {
  const errors = validatePullRequestBody({
    body: baseBody(provenance),
    headRef: "agent/agency-cross-repo-coordination",
  });
  assert.ok(
    errors.some((error) => error.includes("origin:marketing-agency label")),
  );
});

test("rejects incomplete agency provenance", () => {
  const incomplete = provenance
    .replace("cross_repo_coordination_20260721", "N/A")
    .replace(
      "- Marketing execution audit: `pending`",
      "- Marketing execution audit: `N/A`",
    );
  const errors = validatePullRequestBody({
    body: baseBody(incomplete),
    labels: ["origin:marketing-agency"],
    headRef: "agent/agency-cross-repo-coordination",
  });
  assert.ok(errors.some((error) => error.startsWith("Source ID")));
  assert.ok(
    errors.some((error) => error.startsWith("Marketing execution audit")),
  );
});
