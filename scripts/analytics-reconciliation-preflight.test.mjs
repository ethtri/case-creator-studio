import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertHealthQueriesReadOnly,
  assertNoSensitiveValues,
  assertSafeEvidenceOutputPath,
  buildEvidenceScaffold,
  FUNCTION_DEPLOYMENT_PATHS,
  HEALTH_QUERIES,
  isStrictIsoTimestamp,
  parseSanitizedJson,
  parsePreflightArgs,
  REQUIRED_ANALYTICS_FUNCTIONS,
  REQUIRED_ANALYTICS_MIGRATIONS,
  REQUIRED_EVIDENCE_SOURCES,
  REQUIRED_STRIPE_WEBHOOK_EVENTS,
  REQUIRED_VAULT_SECRET_NAMES,
  requiredEdgeSecretNames,
  REPOSITORY_CONTRACTS,
  validateDeploymentAttestation,
  validateCompletedEvidenceArtifact,
  validatePreflightOptions,
  validateRepositoryContract,
} from "./analytics-reconciliation-preflight-contract.mjs";

const repositoryRoot = path.resolve(
  path.dirname(
    new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  ),
  "..",
);

const baseArgs = [
  "--target",
  "staging-analytics",
  "--stripe-mode",
  "test",
  "--supabase-project-ref",
  "abcdefghijklmnopqrst",
  "--operator",
  "launch-operator",
  "--window-start",
  "2026-07-18T16:00:00.000Z",
  "--window-end",
  "2026-07-18T17:00:00.000Z",
  "--timezone",
  "America/Los_Angeles",
  "--attestations",
  "output/analytics-reconciliation/attestations.json",
  "--output",
  "output/analytics-reconciliation/evidence.json",
];

const baseOptions = {
  operator: "launch-operator",
  stripeMode: "test",
  supabaseProjectRef: "abcdefghijklmnopqrst",
  target: "staging-analytics",
  timezone: "America/Los_Angeles",
  validationTime: "2026-07-18T15:45:00.000Z",
  windowEnd: "2026-07-18T17:00:00.000Z",
  windowStart: "2026-07-18T16:00:00.000Z",
};

const baseAttestation = () => ({
  appliedMigrations: [...REQUIRED_ANALYTICS_MIGRATIONS],
  deployedFunctions: REQUIRED_ANALYTICS_FUNCTIONS.map((name, index) => ({
    name,
    sourceCommit: index === 0 ? "a".repeat(40) : "b".repeat(40),
    version: `2026.07.18-${index + 1}`,
  })),
  evidenceSources: Object.fromEntries(
    Object.entries(REQUIRED_EVIDENCE_SOURCES).map(([area, source]) => [
      area,
      {
        capturedAt: "2026-07-18T15:30:00.000Z",
        evidenceId: `${area}-capture-20260718`,
        source,
      },
    ]),
  ),
  presentSecretNames: [...requiredEdgeSecretNames("test")],
  presentVaultSecretNames: [...REQUIRED_VAULT_SECRET_NAMES],
  schemaVersion: 1,
  stripeMode: "test",
  stripeWebhook: {
    enabled: true,
    endpoint:
      "https://abcdefghijklmnopqrst.supabase.co/functions/v1/stripe-webhook",
    eventTypes: [...REQUIRED_STRIPE_WEBHOOK_EVENTS],
    mode: "test",
  },
  supabaseProjectRef: "abcdefghijklmnopqrst",
  targetEnvironment: "staging-analytics",
});

test("parses and validates a complete explicit test-mode input", () => {
  const parsed = parsePreflightArgs(baseArgs);
  assert.deepEqual(validatePreflightOptions(parsed), []);
  assert.equal(parsed.confirmLiveReadOnly, false);
});

test("fails each required CLI input independently", () => {
  const requiredNames = [
    "attestations",
    "operator",
    "output",
    "stripe-mode",
    "supabase-project-ref",
    "target",
    "timezone",
    "window-end",
    "window-start",
  ];
  for (const name of requiredNames) {
    const index = baseArgs.indexOf(`--${name}`);
    const parsed = parsePreflightArgs([
      ...baseArgs.slice(0, index),
      ...baseArgs.slice(index + 2),
    ]);
    assert.match(
      validatePreflightOptions(parsed).join("\n"),
      new RegExp(`--${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
  }
});

test("live mode requires an explicit read-only confirmation", () => {
  const args = [...baseArgs];
  args[args.indexOf("test")] = "live";
  const parsed = parsePreflightArgs(args);
  assert.match(
    validatePreflightOptions(parsed).join("\n"),
    /--confirm-live-read-only/,
  );
  assert.deepEqual(
    validatePreflightOptions(
      parsePreflightArgs([...args, "--confirm-live-read-only"]),
    ),
    [],
  );
});

test("timestamps must be complete RFC 3339 UTC values", () => {
  const args = [...baseArgs];
  args[args.indexOf("2026-07-18T16:00:00.000Z")] = "2026";
  assert.match(
    validatePreflightOptions(parsePreflightArgs(args)).join("\n"),
    /RFC 3339 UTC/,
  );
});

test("timestamps reject normalized impossible dates and hour 24", () => {
  for (const value of [
    "2026-02-30T16:00:00.000Z",
    "2026-04-31T00:00:00Z",
    "2026-07-18T24:00:00Z",
  ]) {
    assert.equal(isStrictIsoTimestamp(value), false, value);
  }
  assert.equal(isStrictIsoTimestamp("2026-07-18T16:00:00.000Z"), true);
});

test("repository contract passes against current source", () => {
  const result = validateRepositoryContract({ repositoryRoot });
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("repository contract detects a missing or stale marker", () => {
  const result = validateRepositoryContract({
    readFile: (filePath) => {
      const contract = REPOSITORY_CONTRACTS.find((entry) =>
        filePath.endsWith(entry.path.replaceAll("/", path.sep)),
      );
      return contract?.id === "ga4-outbox-drain-contract"
        ? "stale worker"
        : fs.readFileSync(filePath, "utf8");
    },
    repositoryRoot,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /ga4-outbox-drain-contract/);
});

test("function deployment source binding covers the local dependency closure", () => {
  for (const expectedPath of [
    "supabase/functions/_shared/email.ts",
    "supabase/functions/_shared/kexiaozhan-payment-guard.ts",
    "supabase/functions/_shared/kexiaozhan-payment.ts",
    "supabase/functions/_shared/stripe-checkout-payment.ts",
    "supabase/functions/_shared/stripe-webhook-ownership.ts",
  ]) {
    assert.ok(
      FUNCTION_DEPLOYMENT_PATHS["stripe-webhook"].includes(expectedPath),
      expectedPath,
    );
  }
});

test("deployment attestation validates the complete contract", () => {
  const result = validateDeploymentAttestation({
    attestation: baseAttestation(),
    options: baseOptions,
  });
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("deployment attestation fails each required external precondition", () => {
  const mutations = [
    (value) => value.appliedMigrations.pop(),
    (value) => value.deployedFunctions.pop(),
    (value) => value.presentSecretNames.pop(),
    (value) => value.presentVaultSecretNames.pop(),
    (value) => value.stripeWebhook.eventTypes.pop(),
    (value) => {
      delete value.evidenceSources.functions;
    },
    (value) => {
      value.stripeWebhook.enabled = false;
    },
    (value) => {
      value.stripeMode = "live";
    },
    (value) => {
      value.supabaseProjectRef = "zyxwvutsrqponmlkjihg";
    },
    (value) => {
      value.deployedFunctions[0].version = "replace-with-version";
    },
  ];

  for (const mutate of mutations) {
    const attestation = baseAttestation();
    mutate(attestation);
    const result = validateDeploymentAttestation({
      attestation,
      options: baseOptions,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
  }
});

test("deployment attestation rejects out-of-order migrations and duplicate functions", () => {
  const attestation = baseAttestation();
  attestation.appliedMigrations.reverse();
  attestation.deployedFunctions.push({
    ...attestation.deployedFunctions[0],
  });
  const result = validateDeploymentAttestation({
    attestation,
    options: baseOptions,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /out of order/);
  assert.match(result.errors.join("\n"), /duplicates/);
});

test("deployment attestation rejects future source captures and future windows", () => {
  const attestation = baseAttestation();
  for (const entry of Object.values(attestation.evidenceSources)) {
    entry.capturedAt = "2030-07-18T15:30:00.000Z";
  }
  const result = validateDeploymentAttestation({
    attestation,
    options: {
      ...baseOptions,
      validationTime: "2026-07-18T15:45:00.000Z",
      windowEnd: "2030-07-18T17:00:00.000Z",
      windowStart: "2030-07-18T16:00:00.000Z",
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /validationTime/);
});

test("likely credentials and personal values are rejected", () => {
  for (const unsafe of [
    "sk_live_example",
    "rk_live_example",
    "rk_test_example",
    "whsec_example",
    "Bearer abc.def.ghi",
    "person@example.com",
    "password=hunter2",
  ]) {
    assert.throws(
      () => assertNoSensitiveValues({ value: unsafe }),
      /Sensitive evidence rejected/,
    );
  }
  assert.doesNotThrow(() =>
    assertNoSensitiveValues({
      endpoint:
        "https://abcdefghijklmnopqrst.supabase.co/functions/v1/stripe-webhook",
      presentSecretNames: requiredEdgeSecretNames("test"),
    }),
  );
});

test("sensitive keys and malformed JSON fail without echoing secret fragments", () => {
  for (const [value, blockedFragment] of [
    [{ apiSecret: "not-even-a-value" }, "apiSecret"],
    [{ sk_live_SUPERSECRET: "person@example.com" }, "sk_live_SUPERSECRET"],
    [{ "123e4567-e89b-12d3-a456-426614174000": "ordinary" }, "123e4567"],
  ]) {
    let message = "";
    try {
      assertNoSensitiveValues(value, "Attestation");
      assert.fail("Expected sanitized JSON parsing to fail");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    assert.doesNotMatch(message, new RegExp(blockedFragment));
  }
  let malformedMessage = "";
  try {
    parseSanitizedJson('{"value":"sk_live_DO_NOT_ECHO"', "Attestation");
    assert.fail("Expected malformed JSON to fail");
  } catch (error) {
    malformedMessage = error instanceof Error ? error.message : String(error);
  }
  assert.doesNotMatch(malformedMessage, /sk_live_DO_NOT_ECHO/);
});

test("validation diagnostics never echo invalid attestation values", () => {
  const attestation = baseAttestation();
  attestation.presentSecretNames.push("sk_live_DO_NOT_ECHO");
  attestation.unexpectedSecret = "harmless-placeholder";
  const result = validateDeploymentAttestation({
    attestation,
    options: baseOptions,
  });
  const diagnostics = result.errors.join("\n");
  assert.equal(result.ok, false);
  assert.doesNotMatch(diagnostics, /sk_live_DO_NOT_ECHO|unexpectedSecret/);
});

test("evidence output is constrained to the ignored repository directory", () => {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "snapcase-preflight-"),
  );
  try {
    assert.equal(
      assertSafeEvidenceOutputPath({
        outputPath: "output/analytics-reconciliation/run.json",
        repositoryRoot: temporaryRoot,
      }),
      path.join(
        temporaryRoot,
        "output",
        "analytics-reconciliation",
        "run.json",
      ),
    );
    for (const unsafe of [
      "../run.json",
      "output/run.json",
      "output/analytics-reconciliation",
      "output/analytics-reconciliation/run.txt",
      "output/analytics-reconciliation/NUL.json",
      "output/analytics-reconciliation/con.json",
      "output/analytics-reconciliation/COM1.json",
      "output/analytics-reconciliation/run.json:alternate",
      path.join(
        temporaryRoot,
        "output",
        "analytics-reconciliation",
        "run.json",
      ),
    ]) {
      assert.throws(
        () =>
          assertSafeEvidenceOutputPath({
            outputPath: unsafe,
            repositoryRoot: temporaryRoot,
          }),
        /--output/,
      );
    }
  } finally {
    fs.rmSync(temporaryRoot, { force: true, recursive: true });
  }
});

test("symbolic-link traversal is rejected on every platform", () => {
  assert.throws(
    () =>
      assertSafeEvidenceOutputPath({
        fileSystem: {
          existsSync: () => true,
          lstatSync: () => ({ isSymbolicLink: () => true }),
        },
        outputPath: "output/analytics-reconciliation/run.json",
        repositoryRoot,
      }),
    /symbolic link/,
  );
});

test("CLI creates one scaffold and redacts malformed secret input", () => {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  const suffix = `${process.pid}-${Date.now()}`;
  const relativeAttestation = `output/analytics-reconciliation/attestation-${suffix}.json`;
  const relativeEvidence = `output/analytics-reconciliation/evidence-${suffix}.json`;
  const relativeMalformed = `output/analytics-reconciliation/malformed-${suffix}.json`;
  const relativeRejectedOutput = `output/analytics-reconciliation/rejected-${suffix}.json`;
  const paths = [
    relativeAttestation,
    relativeEvidence,
    relativeMalformed,
    relativeRejectedOutput,
  ].map((relativePath) => path.join(repositoryRoot, relativePath));
  fs.mkdirSync(path.dirname(paths[0]), { recursive: true });
  for (const filePath of paths) fs.rmSync(filePath, { force: true });

  try {
    const attestation = baseAttestation();
    const cliNow = Date.now();
    const cliCapturedAt = new Date(cliNow - 60_000).toISOString();
    const cliWindowStart = new Date(cliNow + 5 * 60_000).toISOString();
    const cliWindowEnd = new Date(cliNow + 65 * 60_000).toISOString();
    for (const entry of Object.values(attestation.evidenceSources)) {
      entry.capturedAt = cliCapturedAt;
    }
    attestation.deployedFunctions = attestation.deployedFunctions.map(
      (entry) => ({
        ...entry,
        sourceCommit: commit,
        version: "contract-test",
      }),
    );
    fs.writeFileSync(paths[0], `${JSON.stringify(attestation, null, 2)}\n`);

    const cli = path.join(
      repositoryRoot,
      "scripts",
      "analytics-reconciliation-preflight.mjs",
    );
    const commonArgs = [
      cli,
      "--target",
      baseOptions.target,
      "--stripe-mode",
      baseOptions.stripeMode,
      "--supabase-project-ref",
      baseOptions.supabaseProjectRef,
      "--operator",
      baseOptions.operator,
      "--window-start",
      cliWindowStart,
      "--window-end",
      cliWindowEnd,
      "--timezone",
      baseOptions.timezone,
    ];
    const success = spawnSync(
      process.execPath,
      [
        ...commonArgs,
        "--attestations",
        relativeAttestation,
        "--output",
        relativeEvidence,
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    assert.equal(success.status, 0, `${success.stdout}\n${success.stderr}`);
    assert.match(
      success.stdout,
      /external deployment readiness is not verified/i,
    );
    assert.doesNotMatch(success.stdout, /deployment ready/i);
    assert.ok(fs.existsSync(paths[1]));
    const generated = JSON.parse(fs.readFileSync(paths[1], "utf8"));
    assert.equal(generated.preflight.offlineContractPassed, true);
    assert.equal(
      generated.preflight.externalDeploymentVerifiedByCommand,
      false,
    );

    fs.writeFileSync(paths[2], '{"value":"sk_live_DO_NOT_ECHO"');
    const rejected = spawnSync(
      process.execPath,
      [
        ...commonArgs,
        "--attestations",
        relativeMalformed,
        "--output",
        relativeRejectedOutput,
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    assert.equal(rejected.status, 1);
    assert.doesNotMatch(
      `${rejected.stdout}\n${rejected.stderr}`,
      /sk_live_DO_NOT_ECHO/,
    );
    assert.equal(fs.existsSync(paths[3]), false);

    for (const helpArgs of [
      ["--help=unexpected"],
      ["--help", "--not-a-real-option"],
    ]) {
      const help = spawnSync(process.execPath, [cli, ...helpArgs], {
        cwd: repositoryRoot,
        encoding: "utf8",
      });
      assert.equal(help.status, 1);
    }
  } finally {
    for (const filePath of paths) fs.rmSync(filePath, { force: true });
  }
});

test("evidence output rejects an existing symbolic-link path component", () => {
  if (process.platform === "win32") return;
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "snapcase-preflight-"),
  );
  const outside = fs.mkdtempSync(
    path.join(os.tmpdir(), "snapcase-preflight-outside-"),
  );
  try {
    fs.mkdirSync(path.join(temporaryRoot, "output"), { recursive: true });
    fs.symlinkSync(
      outside,
      path.join(temporaryRoot, "output", "analytics-reconciliation"),
      "dir",
    );
    assert.throws(
      () =>
        assertSafeEvidenceOutputPath({
          outputPath: "output/analytics-reconciliation/run.json",
          repositoryRoot: temporaryRoot,
        }),
      /symbolic link/,
    );
  } finally {
    fs.rmSync(temporaryRoot, { force: true, recursive: true });
    fs.rmSync(outside, { force: true, recursive: true });
  }
});

test("health queries are read-only and cover required states", () => {
  assert.equal(assertHealthQueriesReadOnly(), true);
  const source = Object.values(HEALTH_QUERIES).join("\n");
  for (const marker of [
    "pending",
    "failed",
    "sending",
    "stale_leases",
    "dead_letter",
    "ambiguous",
    "purchase",
    "refund",
    "count(*) > 1",
  ]) {
    assert.match(source, new RegExp(marker.replace(/[()*+]/g, "\\$&")));
  }
  assert.throws(
    () =>
      assertHealthQueriesReadOnly({ unsafe: "delete from analytics_events" }),
    /Mutating SQL/,
  );
});

test("sanitized scaffold includes checks and empty reconciliation slots", () => {
  const attestation = baseAttestation();
  const scaffold = buildEvidenceScaffold({
    attestation,
    functionSourceChecks: REQUIRED_ANALYTICS_FUNCTIONS.map((name) => ({
      name,
      ok: true,
    })),
    generatedAt: "2026-07-18T15:45:00.000Z",
    operator: baseOptions.operator,
    repositoryChecks: REPOSITORY_CONTRACTS.map(({ id, path }) => ({
      id,
      ok: true,
      path,
    })),
    repositoryCommit: "c".repeat(40),
    stripeMode: baseOptions.stripeMode,
    supabaseProjectRef: baseOptions.supabaseProjectRef,
    target: baseOptions.target,
    timezone: baseOptions.timezone,
    windowEnd: baseOptions.windowEnd,
    windowStart: baseOptions.windowStart,
  });
  assert.equal(scaffold.preflight.offlineContractPassed, true);
  assert.equal(scaffold.preflight.externalDeploymentVerifiedByCommand, false);
  assert.equal(
    scaffold.readiness,
    "offline-contract-passed-external-verification-required",
  );
  assert.equal(scaffold.evidence.purchase.orderFingerprint, null);
  assert.equal(scaffold.evidence.refund.orderFingerprint, null);
  assert.ok(scaffold.healthQueries.purchaseRefundReconciliation);
  assert.equal(scaffold.evidence.growthValidator.exportFingerprint, null);
  assert.equal(
    scaffold.evidence.growthValidator.command,
    "node scripts/validate-growth-reporting.mjs <privacy-reviewed-growth-export.json>",
  );
  assert.doesNotThrow(() => assertNoSensitiveValues(scaffold));
  assert.equal(validateCompletedEvidenceArtifact(scaffold).ok, false);
});

test("completed evidence accepts only bounded sanitized references", () => {
  const attestation = baseAttestation();
  const scaffold = buildEvidenceScaffold({
    attestation,
    functionSourceChecks: REQUIRED_ANALYTICS_FUNCTIONS.map((name) => ({
      name,
      ok: true,
    })),
    generatedAt: "2026-07-18T15:45:00.000Z",
    operator: baseOptions.operator,
    repositoryChecks: REPOSITORY_CONTRACTS.map(({ id, path }) => ({
      id,
      ok: true,
      path,
    })),
    repositoryCommit: "c".repeat(40),
    stripeMode: baseOptions.stripeMode,
    supabaseProjectRef: baseOptions.supabaseProjectRef,
    target: baseOptions.target,
    timezone: baseOptions.timezone,
    windowEnd: baseOptions.windowEnd,
    windowStart: baseOptions.windowStart,
  });

  for (const phase of ["preRun", "postRun"]) {
    for (const [name, reference] of Object.entries(
      scaffold.evidence[phase].queries,
    )) {
      reference.capturedAt = "2026-07-18T16:30:00.000Z";
      reference.evidenceId = `${name}-capture`;
      reference.result = "pass";
    }
  }
  for (const [index, kind] of ["purchase", "refund"].entries()) {
    const evidence = scaffold.evidence[kind];
    evidence.ga4EvidenceId = `${kind}-ga4-capture`;
    evidence.orderFingerprint = (index === 0 ? "a" : "b").repeat(12);
    evidence.outboxEventFingerprint = (index === 0 ? "c" : "d").repeat(12);
    evidence.stripeEvidenceId = `${kind}-stripe-capture`;
    evidence.reconciledValues = {
      currency: "USD",
      eventValue: kind === "purchase" ? 34.98 : 29.99,
      itemCount: 1,
      matches: true,
      orderValue: kind === "purchase" ? 34.98 : 29.99,
      shipping: kind === "purchase" ? 4.99 : 0,
      tax: 0,
    };
  }
  scaffold.evidence.idempotencyAndRecovery = {
    gaFailureRecoveryEvidenceId: "ga-failure-recovery-capture",
    successPageRefreshEvidenceId: "success-refresh-capture",
    webhookReplayEvidenceId: "webhook-replay-capture",
  };
  scaffold.evidence.growthValidator = {
    command:
      "node scripts/validate-growth-reporting.mjs <privacy-reviewed-growth-export.json>",
    completedAt: "2026-07-18T17:30:00.000Z",
    evidenceId: "growth-validator-capture",
    exportFingerprint: "abcdef123456",
    result: "pass",
  };
  scaffold.evidence.cleanup = {
    actions: [
      "controlled-refund-recorded",
      "private-query-results-retained",
      "public-evidence-sanitized",
      "temporary-artifacts-removed",
    ],
    completedAt: "2026-07-18T17:45:00.000Z",
    evidenceId: "cleanup-capture",
  };

  const validationOptions = {
    validationTime: "2026-07-18T18:00:00.000Z",
  };
  const valid = validateCompletedEvidenceArtifact(scaffold, validationOptions);
  assert.equal(valid.ok, true, valid.errors.join("\n"));

  for (const mutate of [
    (value) => {
      value.preflight.externalDeploymentVerifiedByCommand = true;
    },
    (value) => {
      value.target.environment = "different";
    },
    (value) => {
      value.healthQueries = { unsafe: "delete from orders" };
    },
    (value) => {
      value.unexpectedTopLevel = true;
    },
    (value) => {
      value.evidence.preRun.queries.statusSummary.capturedAt =
        "2099-01-01T00:00:00.000Z";
    },
    (value) => {
      value.evidence.growthValidator.completedAt = "2026-07-18T15:00:00.000Z";
    },
    (value) => {
      value.evidence.cleanup.completedAt = "2026-07-18T17:00:00.000Z";
    },
    (value) => {
      value.evidence.cleanup.actions = ["controlled-refund-recorded"];
    },
  ]) {
    const tampered = structuredClone(scaffold);
    mutate(tampered);
    const result = validateCompletedEvidenceArtifact(
      tampered,
      validationOptions,
    );
    assert.equal(result.ok, false, JSON.stringify(tampered));
  }

  const tamperDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "snapcase-evidence-validator-"),
  );
  try {
    const tamperedPath = path.join(tamperDirectory, "tampered.json");
    const tampered = structuredClone(scaffold);
    tampered.preflight.externalDeploymentVerifiedByCommand = true;
    fs.writeFileSync(tamperedPath, `${JSON.stringify(tampered, null, 2)}\n`);
    const validation = spawnSync(
      process.execPath,
      [
        path.join(
          repositoryRoot,
          "scripts",
          "validate-analytics-reconciliation-evidence.mjs",
        ),
        tamperedPath,
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    assert.equal(validation.status, 1);
    assert.match(
      `${validation.stdout}\n${validation.stderr}`,
      /externalDeploymentVerifiedByCommand/,
    );
  } finally {
    fs.rmSync(tamperDirectory, { force: true, recursive: true });
  }

  scaffold.evidence.cleanup.notes = "unrestricted text is forbidden";
  const withNotes = validateCompletedEvidenceArtifact(
    scaffold,
    validationOptions,
  );
  assert.equal(withNotes.ok, false);
  assert.doesNotMatch(withNotes.errors.join("\n"), /unrestricted text/);

  delete scaffold.evidence.cleanup.notes;
  scaffold.evidence.purchase.orderFingerprint =
    "123e4567-e89b-12d3-a456-426614174000";
  const withRawIdentifier = validateCompletedEvidenceArtifact(
    scaffold,
    validationOptions,
  );
  assert.equal(withRawIdentifier.ok, false);
  assert.doesNotMatch(
    withRawIdentifier.errors.join("\n"),
    /123e4567-e89b-12d3-a456-426614174000/,
  );
});
