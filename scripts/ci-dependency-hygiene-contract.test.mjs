import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(repositoryRoot, path), "utf8");
const packageJson = JSON.parse(read("package.json"));
const verifyWorkflow = read(".github/workflows/verify.yml");
const hygieneWorkflow = read(".github/workflows/pr-hygiene.yml");
const dependabot = read(".github/dependabot.yml");

test("CI audits production and full dependency trees at high severity", () => {
  assert.equal(packageJson.scripts.audit, "npm audit --audit-level=high");
  assert.equal(
    packageJson.scripts["audit:production"],
    "npm audit --omit=dev --audit-level=high",
  );
  assert.match(verifyWorkflow, /run:\s*npm run audit:production/);
  assert.match(verifyWorkflow, /run:\s*npm run audit(?:\r?\n|$)/);
});

test("official workflow actions run on Node 24-compatible majors", () => {
  assert.match(verifyWorkflow, /actions\/checkout@v7/);
  assert.match(verifyWorkflow, /actions\/setup-node@v7/);
  assert.match(verifyWorkflow, /actions\/upload-artifact@v7/);
  assert.match(verifyWorkflow, /node-version:\s*24/);
  assert.match(hygieneWorkflow, /actions\/checkout@v7/);
});

test("workflows stay least privilege and scheduled updates cover both ecosystems", () => {
  assert.match(verifyWorkflow, /permissions:\s*\r?\n\s+contents:\s*read/);
  assert.match(hygieneWorkflow, /permissions:\s*\r?\n\s+contents:\s*read\s*\r?\n\s+pull-requests:\s*read/);
  assert.match(dependabot, /package-ecosystem:\s*npm/);
  assert.match(dependabot, /package-ecosystem:\s*github-actions/);
  assert.equal((dependabot.match(/interval:\s*weekly/g) ?? []).length, 2);
});
