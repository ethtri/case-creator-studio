#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSafeEvidenceOutputPath,
  buildEvidenceScaffold,
  FUNCTION_DEPLOYMENT_PATHS,
  parseSanitizedJson,
  parsePreflightArgs,
  REQUIRED_ANALYTICS_FUNCTIONS,
  REQUIRED_ANALYTICS_MIGRATIONS,
  REQUIRED_STRIPE_WEBHOOK_EVENTS,
  REQUIRED_VAULT_SECRET_NAMES,
  requiredEdgeSecretNames,
  validateDeploymentAttestation,
  validatePreflightOptions,
  validateRepositoryContract,
} from "./analytics-reconciliation-preflight-contract.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const HELP = `Snapcase analytics reconciliation preflight (read-only)

Usage:
  npm run analytics:reconciliation-preflight -- \\
    --target <non-secret-environment-label> \\
    --stripe-mode <test|live> \\
    --supabase-project-ref <20-character-ref> \\
    --operator <non-PII-operator-label> \\
    --window-start <ISO-8601> \\
    --window-end <ISO-8601> \\
    --timezone <IANA-timezone> \\
    --attestations <path-to-sanitized-json> \\
    --output output/analytics-reconciliation/<timestamped-name>.json

Live mode additionally requires:
  --confirm-live-read-only

This command performs repository and supplied-attestation checks only. It never
deploys code, changes secrets/webhooks, creates payments, issues refunds, or
acknowledges legal terms. It reports secret names only and rejects likely secret
or personal values in the attestation.
`;

const fail = (heading, errors) => {
  console.error(heading);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
};

const readJson = (filePath) => {
  const resolved = path.resolve(repositoryRoot, filePath);
  let source;
  try {
    source = fs.readFileSync(resolved, "utf8");
  } catch {
    throw new Error("Unable to read the attestation file");
  }
  return parseSanitizedJson(source, "Attestation");
};

const git = (args, options = {}) =>
  execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();

const currentCommit = () => git(["rev-parse", "HEAD"]);

const verifyTrackedSourcesClean = (paths, label) => {
  const comparison = spawnSync(
    "git",
    ["diff", "--quiet", "HEAD", "--", ...paths],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (comparison.status === 0) return { label, ok: true, paths };
  if (comparison.status === 1) {
    return {
      error: `${label} source differs from recorded repository HEAD`,
      label,
      ok: false,
      paths,
    };
  }
  return {
    error: `Unable to bind ${label} source to repository HEAD`,
    label,
    ok: false,
    paths,
  };
};

const verifyFunctionSource = ({ name, sourceCommit }) => {
  const paths = FUNCTION_DEPLOYMENT_PATHS[name];
  if (!paths) {
    return {
      error: `No repository path contract exists for ${name}`,
      name,
      ok: false,
    };
  }

  try {
    git(["cat-file", "-e", `${sourceCommit}^{commit}`]);
  } catch {
    return {
      error: `The attested ${name} source commit is not available locally`,
      name,
      ok: false,
    };
  }

  const ancestry = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", sourceCommit, "HEAD"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (ancestry.status !== 0) {
    return {
      error: `The attested ${name} source commit is not an ancestor of repository HEAD`,
      name,
      ok: false,
    };
  }

  const clean = verifyTrackedSourcesClean(paths, `${name} deployment`);
  if (!clean.ok) return { ...clean, name };

  const comparison = spawnSync(
    "git",
    ["diff", "--quiet", sourceCommit, "HEAD", "--", ...paths],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (comparison.status === 0) {
    return { name, ok: true, paths, sourceCommit };
  }
  if (comparison.status === 1) {
    return {
      error: `${name} analytics source differs from attested commit ${sourceCommit}`,
      name,
      ok: false,
      paths,
      sourceCommit,
    };
  }
  return {
    error: `Unable to compare ${name} against its attested source commit`,
    name,
    ok: false,
    paths,
    sourceCommit,
  };
};

const parsed = parsePreflightArgs(process.argv.slice(2));
if (parsed.help && parsed.errors.length === 0) {
  console.log(HELP);
  process.exit(0);
}

const optionErrors = validatePreflightOptions(parsed);
if (optionErrors.length > 0) {
  fail("Analytics reconciliation preflight input failed:", optionErrors);
} else {
  const options = {
    operator: parsed.values.operator,
    stripeMode: parsed.values["stripe-mode"],
    supabaseProjectRef: parsed.values["supabase-project-ref"],
    target: parsed.values.target,
    timezone: parsed.values.timezone,
    validationTime: new Date().toISOString(),
    windowEnd: parsed.values["window-end"],
    windowStart: parsed.values["window-start"],
  };

  try {
    const outputPath = assertSafeEvidenceOutputPath({
      outputPath: parsed.values.output,
      repositoryRoot,
    });
    if (fs.existsSync(outputPath)) {
      throw new Error(
        `Refusing to overwrite existing evidence: ${parsed.values.output}`,
      );
    }

    const attestation = readJson(parsed.values.attestations);
    const attestationValidation = validateDeploymentAttestation({
      attestation,
      options,
    });
    const repositoryValidation = validateRepositoryContract({ repositoryRoot });
    const repositoryCommit = currentCommit();
    const migrationSourceCheck = verifyTrackedSourcesClean(
      REQUIRED_ANALYTICS_MIGRATIONS.map(
        (name) => `supabase/migrations/${name}`,
      ),
      "analytics migration",
    );
    const functionSourceChecks =
      attestationValidation.ok && Array.isArray(attestation.deployedFunctions)
        ? REQUIRED_ANALYTICS_FUNCTIONS.map((name) => {
            const entry = attestation.deployedFunctions.find(
              (candidate) => candidate?.name === name,
            );
            return entry
              ? verifyFunctionSource(entry)
              : {
                  error: `Missing deployed function attestation: ${name}`,
                  name,
                  ok: false,
                };
          })
        : [];

    const errors = [
      ...repositoryValidation.errors,
      ...attestationValidation.errors,
      ...(migrationSourceCheck.ok ? [] : [migrationSourceCheck.error]),
      ...functionSourceChecks
        .filter((check) => !check.ok)
        .map((check) => check.error),
    ];
    if (errors.length > 0) {
      fail("Analytics reconciliation preflight failed closed:", [
        ...new Set(errors),
      ]);
    } else {
      const evidence = buildEvidenceScaffold({
        attestation,
        functionSourceChecks,
        generatedAt: options.validationTime,
        operator: options.operator,
        repositoryChecks: repositoryValidation.checks,
        repositoryCommit,
        stripeMode: options.stripeMode,
        supabaseProjectRef: options.supabaseProjectRef,
        target: options.target,
        timezone: options.timezone,
        windowEnd: options.windowEnd,
        windowStart: options.windowStart,
      });

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const recheckedOutputPath = assertSafeEvidenceOutputPath({
        outputPath: parsed.values.output,
        repositoryRoot,
      });
      const noFollow = fs.constants.O_NOFOLLOW ?? 0;
      const descriptor = fs.openSync(
        recheckedOutputPath,
        fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_WRONLY |
          noFollow,
        0o600,
      );
      try {
        fs.writeFileSync(descriptor, `${JSON.stringify(evidence, null, 2)}\n`, {
          encoding: "utf8",
        });
      } finally {
        fs.closeSync(descriptor);
      }

      console.log(
        "Offline analytics contract preflight passed; external deployment readiness is not verified by this command.",
      );
      console.log(`Target: ${options.target} (${options.stripeMode})`);
      console.log(
        `Repository contract checks: ${repositoryValidation.checks.length}`,
      );
      console.log(
        `Required Stripe events: ${REQUIRED_STRIPE_WEBHOOK_EVENTS.join(", ")}`,
      );
      console.log(
        `Required Edge Function secret names: ${requiredEdgeSecretNames(
          options.stripeMode,
        ).join(", ")}`,
      );
      console.log(
        `Required Vault secret names: ${REQUIRED_VAULT_SECRET_NAMES.join(", ")}`,
      );
      console.log(`Sanitized evidence scaffold: ${parsed.values.output}`);
      console.log(
        "No external state was changed. Cross-check every attestation against its private source capture before #100.",
      );
    }
  } catch (error) {
    fail("Analytics reconciliation preflight failed closed:", [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}
