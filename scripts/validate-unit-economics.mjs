import fs from "node:fs/promises";
import path from "node:path";

import { validateUnitEconomicsEvidence } from "./unit-economics.mjs";

const evidencePath = path.resolve(
  process.argv[2] ??
    "scripts/fixtures/onshore-unit-economics.synthetic.example.json",
);
const evidence = JSON.parse(await fs.readFile(evidencePath, "utf8"));
const result = validateUnitEconomicsEvidence(evidence);

if (!result.ok) {
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

for (const summary of result.summaries) {
  console.log(
    `${summary.id}: revenue $${(summary.revenueCents / 100).toFixed(2)}, ` +
      `contribution $${(summary.contributionCents / 100).toFixed(2)} ` +
      `(${(summary.contributionMarginBps / 100).toFixed(2)}%)`,
  );
}
console.log(
  evidence.decision.type === "launch_approved"
    ? "Pricing evidence is launch-approved."
    : "Pricing evidence is analysis-only and does not authorize a launch price.",
);
