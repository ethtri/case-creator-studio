#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  parseSanitizedJson,
  validateCompletedEvidenceArtifact,
} from "./analytics-reconciliation-preflight-contract.mjs";

const args = process.argv.slice(2);
if (args.length !== 1 || args[0].startsWith("--")) {
  console.error(
    "Usage: npm run analytics:reconciliation-evidence-check -- <sanitized-evidence.json>",
  );
  process.exitCode = 1;
} else {
  let source;
  try {
    source = fs.readFileSync(path.resolve(process.cwd(), args[0]), "utf8");
  } catch {
    console.error("Unable to read the analytics reconciliation evidence file.");
    process.exitCode = 1;
  }

  if (source !== undefined) {
    try {
      const artifact = parseSanitizedJson(source, "Evidence artifact");
      const result = validateCompletedEvidenceArtifact(artifact);
      if (!result.ok) {
        console.error("Analytics reconciliation evidence failed closed:");
        result.errors.forEach((error) => console.error(`- ${error}`));
        process.exitCode = 1;
      } else {
        console.log(
          "Analytics reconciliation evidence is structurally complete and privacy-safe.",
        );
        console.log(
          "This check does not verify external deployment or transaction truth; retain the private source captures.",
        );
      }
    } catch (error) {
      console.error(
        error instanceof Error
          ? error.message
          : "Analytics reconciliation evidence validation failed.",
      );
      process.exitCode = 1;
    }
  }
}
