import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(repositoryRoot, path), "utf8");
const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
const eslintConfig = read("eslint.config.js");
const verifyWorkflow = read(".github/workflows/verify.yml");
const hygieneWorkflow = read(".github/workflows/pr-hygiene.yml");
const dependabot = read(".github/dependabot.yml");

test("CI audits production and full dependency trees at high severity", () => {
  assert.equal(
    packageJson.scripts.audit,
    "node scripts/run-npm-audit.mjs --audit-level=high",
  );
  assert.equal(
    packageJson.scripts["audit:production"],
    "node scripts/run-npm-audit.mjs --omit=dev --audit-level=high",
  );
  assert.match(verifyWorkflow, /run:\s*npm run audit:production/);
  assert.match(verifyWorkflow, /run:\s*npm run audit(?:\r?\n|$)/);
});

test("supported tooling updates remove the vulnerable glob and minimatch paths", () => {
  const packages = packageLock.packages;
  const eslint = packages["node_modules/eslint"];
  const eslintJs = packages["node_modules/@eslint/js"];
  const reactHooks = packages["node_modules/eslint-plugin-react-hooks"];
  const minimatch = packages["node_modules/minimatch"];
  const braceExpansion = packages["node_modules/brace-expansion"];
  const sucrase = packages["node_modules/sucrase"];
  const typescriptEstree =
    packages["node_modules/@typescript-eslint/typescript-estree"];

  assert.equal(packageJson.devDependencies.eslint, "^10.8.0");
  assert.equal(packageJson.devDependencies["@eslint/js"], "^10.0.1");
  assert.equal(
    packageJson.devDependencies["eslint-plugin-react-hooks"],
    "^7.1.1",
  );
  assert.equal(packageJson.devDependencies.tailwindcss, "^3.4.19");
  assert.equal(packageJson.devDependencies["typescript-eslint"], "^8.65.0");
  assert.equal(eslint.version, "10.8.0");
  assert.equal(eslint.dependencies.minimatch, "^10.2.5");
  assert.equal(eslintJs.version, "10.0.1");
  assert.match(reactHooks.peerDependencies.eslint, /\^10\.0\.0/);
  assert.equal(minimatch.version, "10.2.5");
  assert.equal(braceExpansion.version, "5.0.8");
  assert.equal(packages["node_modules/tailwindcss"].version, "3.4.19");
  assert.equal(sucrase.version, "3.35.1");
  assert.equal(sucrase.dependencies.glob, undefined);
  assert.equal(sucrase.dependencies.tinyglobby, "^0.2.11");
  assert.equal(typescriptEstree.version, "8.65.0");
  assert.equal(typescriptEstree.dependencies.minimatch, "^10.2.2");
});

test("ESLint 10 preserves the established core and React Hooks rule gates", () => {
  assert.match(eslintConfig, /"no-unassigned-vars": "off"/);
  assert.match(eslintConfig, /"no-useless-assignment": "off"/);
  assert.match(eslintConfig, /"preserve-caught-error": "off"/);
  assert.doesNotMatch(eslintConfig, /reactHooks\.configs\.recommended\.rules/);
  assert.match(eslintConfig, /"react-hooks\/rules-of-hooks": "error"/);
  assert.match(eslintConfig, /"react-hooks\/exhaustive-deps": "warn"/);
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
  assert.match(
    hygieneWorkflow,
    /permissions:\s*\r?\n\s+contents:\s*read\s*\r?\n\s+pull-requests:\s*read/,
  );
  assert.match(dependabot, /package-ecosystem:\s*npm/);
  assert.match(dependabot, /package-ecosystem:\s*github-actions/);
  assert.equal((dependabot.match(/interval:\s*weekly/g) ?? []).length, 2);
});
