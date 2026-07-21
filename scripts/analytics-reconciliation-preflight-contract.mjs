import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

export const PREFLIGHT_SCHEMA_VERSION = 1;

export const REQUIRED_ANALYTICS_MIGRATIONS = Object.freeze([
  "20260717090000_add_analytics_event_outbox.sql",
  "20260717160000_harden_analytics_event_outbox.sql",
  "20260717161000_schedule_analytics_outbox_drain.sql",
  "20260721020000_harden_analytics_outbox_schedule.sql",
]);

export const REQUIRED_STRIPE_WEBHOOK_EVENTS = Object.freeze([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "refund.created",
]);

export const REQUIRED_ANALYTICS_FUNCTIONS = Object.freeze([
  "stripe-webhook",
  "ga4-outbox-drain",
]);

export const REQUIRED_EVIDENCE_SOURCES = Object.freeze({
  functions: "supabase-function-list",
  migrations: "supabase-migration-list",
  secrets: "supabase-edge-secret-list",
  stripeWebhook: "stripe-webhook-endpoint-list",
  vault: "supabase-vault-secret-list",
});

export const REQUIRED_VAULT_SECRET_NAMES = Object.freeze([
  "project_url",
  "ga4_outbox_drain_auth_secret",
  "ga4_outbox_drain_enabled",
]);

export const FUNCTION_DEPLOYMENT_PATHS = Object.freeze({
  "stripe-webhook": Object.freeze([
    "supabase/functions/stripe-webhook/index.ts",
    "supabase/functions/_shared/ga4-client-id.ts",
    "supabase/functions/_shared/ga4-measurement.ts",
    "supabase/functions/_shared/email.ts",
    "supabase/functions/_shared/kexiaozhan-payment-guard.ts",
    "supabase/functions/_shared/kexiaozhan-payment.ts",
    "supabase/functions/_shared/stripe-config.ts",
    "supabase/functions/_shared/stripe-checkout-payment.ts",
    "supabase/functions/_shared/stripe-webhook-ownership.ts",
  ]),
  "ga4-outbox-drain": Object.freeze([
    "supabase/functions/ga4-outbox-drain/index.ts",
    "supabase/functions/_shared/analytics-outbox.ts",
    "supabase/functions/_shared/ga4-client-id.ts",
    "supabase/functions/_shared/ga4-measurement.ts",
  ]),
});

export const REPOSITORY_CONTRACTS = Object.freeze([
  {
    id: "analytics-outbox-migration",
    path: `supabase/migrations/${REQUIRED_ANALYTICS_MIGRATIONS[0]}`,
    markers: [
      "CREATE TABLE IF NOT EXISTS public.analytics_events",
      "event_key TEXT NOT NULL UNIQUE",
      "analytics_consent",
    ],
  },
  {
    id: "analytics-outbox-hardening-migration",
    path: `supabase/migrations/${REQUIRED_ANALYTICS_MIGRATIONS[1]}`,
    markers: [
      "lease_expires_at",
      "claim_analytics_event_batch",
      "mark_analytics_event_ambiguous",
      "requeue_analytics_event",
      "dead_letter",
    ],
  },
  {
    id: "analytics-outbox-schedule-migration",
    path: `supabase/migrations/${REQUIRED_ANALYTICS_MIGRATIONS[2]}`,
    markers: [
      "ga4-outbox-drain-1m",
      "ga4_outbox_drain_auth_secret",
      "/functions/v1/ga4-outbox-drain",
    ],
  },
  {
    id: "analytics-outbox-schedule-gate-migration",
    path: `supabase/migrations/${REQUIRED_ANALYTICS_MIGRATIONS[3]}`,
    markers: [
      "configure_ga4_outbox_drain_schedule",
      "ga4_outbox_drain_enabled",
      "cron.unschedule",
      "RETURN FALSE",
    ],
  },
  {
    id: "stripe-webhook-analytics-contract",
    path: "supabase/functions/stripe-webhook/index.ts",
    markers: [
      "sendGa4Purchase",
      "sendGa4Refund",
      "sendGa4CheckoutSignal",
      "GA4_MEASUREMENT_ID",
      "GA4_API_SECRET",
      ...REQUIRED_STRIPE_WEBHOOK_EVENTS.map((eventName) => `"${eventName}"`),
    ],
  },
  {
    id: "ga4-outbox-drain-contract",
    path: "supabase/functions/ga4-outbox-drain/index.ts",
    markers: [
      "GA4_OUTBOX_DRAIN_AUTH_SECRET",
      "GA4_MEASUREMENT_ID",
      "GA4_API_SECRET",
      "claim_analytics_event_batch",
      "complete_analytics_event",
      "fail_analytics_event",
      "mark_analytics_event_ambiguous",
    ],
  },
  {
    id: "shared-ga4-delivery-contract",
    path: "supabase/functions/_shared/ga4-measurement.ts",
    markers: [
      "buildGa4PurchaseParams",
      "buildGa4RefundParams",
      "postGa4Measurement",
      "sendGa4Purchase",
      "sendGa4Refund",
      "mark_analytics_event_ambiguous",
    ],
  },
  {
    id: "shared-ga4-retry-contract",
    path: "supabase/functions/_shared/analytics-outbox.ts",
    markers: [
      "ANALYTICS_OUTBOX_MAX_ATTEMPTS",
      "buildGa4RetryPayload",
      "drainAnalyticsOutbox",
      "GA delivery outcome is uncertain",
    ],
  },
]);

export const HEALTH_QUERIES = Object.freeze({
  statusSummary: `select
  status,
  count(*) as events,
  min(created_at) as oldest_created_at,
  min(next_attempt_at) filter (
    where status in ('pending', 'failed')
  ) as oldest_next_attempt_at
from public.analytics_events
group by status
order by status;`,
  retryAndLeaseHealth: `select
  status,
  count(*) filter (
    where status in ('pending', 'failed')
      and coalesce(next_attempt_at, created_at) <= now() - interval '5 minutes'
  ) as overdue_retryable,
  count(*) filter (
    where status = 'sending'
      and coalesce(lease_expires_at, claimed_at + interval '5 minutes') <= now()
  ) as stale_leases,
  count(*) filter (
    where status = 'dead_letter' or attempts >= max_attempts
  ) as exhausted,
  count(*) filter (where status = 'ambiguous') as ambiguous
from public.analytics_events
group by status
order by status;`,
  failureInventory: `select
  left(md5(event_key), 12) as event_key_fingerprint,
  event_name,
  status,
  attempts,
  max_attempts,
  last_failure_kind,
  last_http_status,
  next_attempt_at,
  lease_expires_at,
  ambiguous_at,
  terminal_at
from public.analytics_events
where status in ('failed', 'ambiguous', 'dead_letter')
   or attempts >= max_attempts
order by created_at;`,
  duplicateLogicalKeys: `select
  left(md5(event_key), 12) as event_key_fingerprint,
  count(*) as rows
from public.analytics_events
group by event_key
having count(*) > 1
order by rows desc;`,
  purchaseRefundReconciliation: `-- Set order_id only in a private operator session. Do not paste it into public evidence.
select
  left(md5(o.id::text), 12) as order_fingerprint,
  o.status as order_status,
  o.analytics_consent,
  o.total,
  o.shipping_cost,
  o.discount_total,
  count(*) filter (where ae.event_name = 'purchase') as purchase_rows,
  count(*) filter (where ae.event_name = 'refund') as refund_rows,
  coalesce(sum(ae.source_amount) filter (where ae.event_name = 'purchase'), 0) as purchase_value,
  coalesce(sum(ae.source_amount) filter (where ae.event_name = 'refund'), 0) as refund_value,
  array_agg(distinct ae.status) filter (where ae.id is not null) as outbox_statuses
from public.orders o
left join public.analytics_events ae on ae.source_order_id = o.id
where o.id = :'order_id'::uuid
group by o.id, o.status, o.analytics_consent, o.total, o.shipping_cost, o.discount_total;`,
  blockedPayloadFieldScan: `select
  left(md5(event_key), 12) as event_key_fingerprint,
  event_name
from public.analytics_events
where payload::text ~* '"(customer_email|customer_name|shipping_address|artwork|design_preview|free_text|authorization|password|api_secret)"'
order by created_at;`,
});

const ALLOWED_ARGUMENTS = new Set([
  "attestations",
  "confirm-live-read-only",
  "help",
  "operator",
  "output",
  "stripe-mode",
  "supabase-project-ref",
  "target",
  "timezone",
  "window-end",
  "window-start",
]);

const REQUIRED_VALUE_ARGUMENTS = Object.freeze([
  "attestations",
  "operator",
  "output",
  "stripe-mode",
  "supabase-project-ref",
  "target",
  "timezone",
  "window-end",
  "window-start",
]);

const SAFE_LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;
const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/;
const ENV_SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,79}$/;
const VAULT_SECRET_NAME_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;
const SENSITIVE_VALUE_PATTERNS = Object.freeze([
  { label: "Stripe secret key", pattern: /\bsk_(?:live|test)_[A-Za-z0-9]+/i },
  {
    label: "Stripe restricted key",
    pattern: /\brk_(?:live|test)_[A-Za-z0-9]+/i,
  },
  { label: "Stripe webhook secret", pattern: /\bwhsec_[A-Za-z0-9]+/i },
  { label: "authorization header", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+/i },
  {
    label: "email address",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    label: "JWT",
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  },
  {
    label: "embedded credential",
    pattern: /\b(?:api[_-]?secret|password|authorization)\s*[:=]\s*\S+/i,
  },
  {
    label: "full UUID identifier",
    pattern:
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  },
  {
    label: "Stripe object identifier",
    pattern: /\b(?:cs_(?:test|live)|pi|re|ch|evt)_[A-Za-z0-9_]+\b/i,
  },
  {
    label: "phone-like value",
    pattern: /(?:\+\d[\d ()-]{8,}\d|\b\d{10,15}\b|\b\d{3}[ -]\d{3}[ -]\d{4}\b)/,
  },
]);
const SAFE_SENSITIVE_METADATA_KEYS = new Set([
  "presentSecretNames",
  "presentVaultSecretNames",
  "requiredSecretNames",
  "requiredVaultSecretNames",
]);
const SENSITIVE_KEY_PATTERN =
  /api[_-]?secret|apiSecret|authorization|customer|email|address|artwork|free[_-]?text|freeText|password|token/i;
const WINDOWS_RESERVED_SEGMENT_PATTERN =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const PORTABLE_UNSAFE_SEGMENT_PATTERN = /[<>:"|?*]/;
const PLACEHOLDER_PATTERN = /(?:replace|placeholder|example|unknown|tbd|todo)/i;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const PUBLIC_EVIDENCE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{1,63}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^[0-9a-f]{12}$/;
const CONTRACT_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

const isPlainObject = (value) =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const canonicalJson = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const immutableEvidenceContract = (artifact) => ({
  generatedAt: artifact.generatedAt,
  healthQueries: artifact.healthQueries,
  preflight: artifact.preflight,
  privacy: artifact.privacy,
  readiness: artifact.readiness,
  schemaVersion: artifact.schemaVersion,
  target: artifact.target,
});

const evidenceContractFingerprint = (artifact) =>
  createHash("sha256")
    .update(canonicalJson(immutableEvidenceContract(artifact)))
    .digest("hex");

const listMissing = (actualValues, requiredValues) => {
  const actual = new Set(actualValues);
  return requiredValues.filter((value) => !actual.has(value));
};

const listUnexpected = (actualValues, allowedValues) => {
  const allowed = new Set(allowedValues);
  return actualValues.filter((value) => !allowed.has(value));
};

const validateExactKeys = (value, allowedKeys, context, errors) => {
  if (!isPlainObject(value)) {
    errors.push(`${context} must be a JSON object`);
    return false;
  }
  const unexpected = listUnexpected(Object.keys(value), allowedKeys);
  if (unexpected.length > 0) {
    errors.push(`${context} contains ${unexpected.length} unsupported key(s)`);
  }
  return unexpected.length === 0;
};

const validateSafeStringArray = ({
  context,
  errors,
  pattern,
  required = [],
  value,
}) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${context} must be an array of strings`);
    return [];
  }
  const unique = [...new Set(value)];
  if (unique.length !== value.length) {
    errors.push(`${context} must not contain duplicates`);
  }
  const invalid = unique.filter((item) => !pattern.test(item));
  if (invalid.length > 0) {
    errors.push(`${context} contains ${invalid.length} invalid value(s)`);
  }
  const missing = listMissing(unique, required);
  if (missing.length > 0) {
    errors.push(`${context} is missing: ${missing.join(", ")}`);
  }
  return unique;
};

export const isStrictIsoTimestamp = (value) => {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/,
  );
  if (!match) return false;
  const [, year, month, day, hour, minute, second, fraction = ""] = match;
  const milliseconds = Number(fraction.padEnd(3, "0"));
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds,
  );
  if (!Number.isFinite(timestamp)) return false;
  const parsed = new Date(timestamp);
  return (
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() === Number(month) - 1 &&
    parsed.getUTCDate() === Number(day) &&
    parsed.getUTCHours() === Number(hour) &&
    parsed.getUTCMinutes() === Number(minute) &&
    parsed.getUTCSeconds() === Number(second) &&
    parsed.getUTCMilliseconds() === milliseconds
  );
};

export const requiredEdgeSecretNames = (stripeMode) =>
  Object.freeze([
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_MODE",
    stripeMode === "test" ? "STRIPE_SECRET_KEY_TEST" : "STRIPE_SECRET_KEY",
    stripeMode === "test"
      ? "STRIPE_WEBHOOK_SECRET_TEST"
      : "STRIPE_WEBHOOK_SECRET",
    "GA4_MEASUREMENT_ID",
    "GA4_API_SECRET",
    "GA4_OUTBOX_DRAIN_AUTH_SECRET",
  ]);

export const parsePreflightArgs = (argv) => {
  const values = {};
  const booleans = new Set();
  const errors = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      errors.push(`Unexpected positional argument at index ${index}`);
      continue;
    }

    const [rawName, inlineValue] = token.slice(2).split("=", 2);
    if (!ALLOWED_ARGUMENTS.has(rawName)) {
      errors.push(`Unknown option at index ${index}`);
      continue;
    }

    if (rawName === "help" || rawName === "confirm-live-read-only") {
      if (inlineValue !== undefined) {
        errors.push(`--${rawName} does not accept a value`);
      }
      if (booleans.has(rawName)) {
        errors.push(`Duplicate option: --${rawName}`);
      }
      booleans.add(rawName);
      continue;
    }

    if (Object.hasOwn(values, rawName)) {
      errors.push(`Duplicate option: --${rawName}`);
      continue;
    }

    const nextValue = inlineValue ?? argv[index + 1];
    if (
      !nextValue ||
      (inlineValue === undefined && nextValue.startsWith("--"))
    ) {
      errors.push(`--${rawName} requires a value`);
      continue;
    }
    values[rawName] = nextValue;
    if (inlineValue === undefined) index += 1;
  }

  return {
    errors,
    help: booleans.has("help"),
    confirmLiveReadOnly: booleans.has("confirm-live-read-only"),
    values,
  };
};

export const validatePreflightOptions = (parsed) => {
  const errors = [...parsed.errors];
  if (parsed.help) return errors;

  for (const name of REQUIRED_VALUE_ARGUMENTS) {
    if (!parsed.values[name]) errors.push(`Missing required option: --${name}`);
  }

  const target = parsed.values.target;
  const operator = parsed.values.operator;
  const stripeMode = parsed.values["stripe-mode"];
  const projectRef = parsed.values["supabase-project-ref"];
  const windowStart = parsed.values["window-start"];
  const windowEnd = parsed.values["window-end"];
  const timezone = parsed.values.timezone;

  if (target && !SAFE_LABEL_PATTERN.test(target)) {
    errors.push("--target must be a 2-64 character non-secret label");
  }
  if (operator && !SAFE_LABEL_PATTERN.test(operator)) {
    errors.push("--operator must be a 2-64 character non-PII label (no email)");
  }
  if (stripeMode && !["test", "live"].includes(stripeMode)) {
    errors.push("--stripe-mode must be test or live");
  }
  if (stripeMode === "live" && !parsed.confirmLiveReadOnly) {
    errors.push(
      "--confirm-live-read-only is required when --stripe-mode is live",
    );
  }
  if (projectRef && !SUPABASE_PROJECT_REF_PATTERN.test(projectRef)) {
    errors.push(
      "--supabase-project-ref must be a 20-character lowercase project ref",
    );
  }

  const startMs = isStrictIsoTimestamp(windowStart)
    ? Date.parse(windowStart)
    : Number.NaN;
  const endMs = isStrictIsoTimestamp(windowEnd)
    ? Date.parse(windowEnd)
    : Number.NaN;
  if (windowStart && !isStrictIsoTimestamp(windowStart)) {
    errors.push("--window-start must be an RFC 3339 UTC timestamp");
  }
  if (windowEnd && !isStrictIsoTimestamp(windowEnd)) {
    errors.push("--window-end must be an RFC 3339 UTC timestamp");
  }
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && startMs >= endMs) {
    errors.push("--window-start must be earlier than --window-end");
  }

  if (timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    } catch {
      errors.push("--timezone must be a valid IANA timezone");
    }
  }

  return [...new Set(errors)];
};

export const assertNoSensitiveValues = (value, context = "input") => {
  const errors = [];
  const visit = (entry, currentPath) => {
    if (typeof entry === "string") {
      for (const { label, pattern } of SENSITIVE_VALUE_PATTERNS) {
        if (pattern.test(entry)) {
          errors.push(`${currentPath} appears to contain a ${label}`);
        }
      }
      return;
    }
    if (Array.isArray(entry)) {
      entry.forEach((item, index) => visit(item, `${currentPath}[${index}]`));
      return;
    }
    if (isPlainObject(entry)) {
      Object.entries(entry).forEach(([key, item]) => {
        const keyMatchesSensitiveValue = SENSITIVE_VALUE_PATTERNS.some(
          ({ pattern }) => pattern.test(key),
        );
        if (
          !SAFE_SENSITIVE_METADATA_KEYS.has(key) &&
          (SENSITIVE_KEY_PATTERN.test(key) || keyMatchesSensitiveValue)
        ) {
          errors.push(`${currentPath} contains a blocked sensitive key`);
          visit(item, `${currentPath}.[blocked-key]`);
          return;
        }
        visit(item, `${currentPath}.${key}`);
      });
    }
  };
  visit(value, context);
  if (errors.length > 0) {
    throw new Error(`Sensitive evidence rejected:\n- ${errors.join("\n- ")}`);
  }
};

export const parseSanitizedJson = (source, context = "input") => {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`${context} is not valid JSON`);
  }
  assertNoSensitiveValues(parsed, context);
  return parsed;
};

export const validateRepositoryContract = ({
  readFile = (filePath) => fs.readFileSync(filePath, "utf8"),
  repositoryRoot,
}) => {
  const checks = REPOSITORY_CONTRACTS.map((contract) => {
    const absolutePath = path.join(repositoryRoot, contract.path);
    try {
      const source = readFile(absolutePath);
      const missingMarkers = contract.markers.filter(
        (marker) => !source.includes(marker),
      );
      return {
        id: contract.id,
        missingMarkers,
        ok: missingMarkers.length === 0,
        path: contract.path,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        id: contract.id,
        missingMarkers: contract.markers,
        ok: false,
        path: contract.path,
      };
    }
  });

  const migrationNames = fs
    .readdirSync(path.join(repositoryRoot, "supabase", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const migrationIndexes = REQUIRED_ANALYTICS_MIGRATIONS.map((migration) =>
    migrationNames.indexOf(migration),
  );
  const migrationOrderOk =
    migrationIndexes.every((index) => index >= 0) &&
    migrationIndexes.every(
      (index, position) =>
        position === 0 || index > migrationIndexes[position - 1],
    );
  checks.push({
    id: "analytics-migration-order",
    missingMarkers: migrationOrderOk
      ? []
      : REQUIRED_ANALYTICS_MIGRATIONS.filter(
          (migration) => !migrationNames.includes(migration),
        ),
    ok: migrationOrderOk,
    path: "supabase/migrations",
  });

  return {
    checks,
    errors: checks
      .filter((check) => !check.ok)
      .map((check) => {
        const details = check.missingMarkers.length
          ? ` missing ${check.missingMarkers.join(", ")}`
          : "";
        return `${check.id} failed (${check.path})${details}`;
      }),
    ok: checks.every((check) => check.ok),
  };
};

export const validateDeploymentAttestation = ({ attestation, options }) => {
  const errors = [];
  const validationTime = options.validationTime;
  const validationTimeMs = isStrictIsoTimestamp(validationTime)
    ? Date.parse(validationTime)
    : Number.NaN;
  const windowStartMs = Date.parse(options.windowStart);
  if (!Number.isFinite(validationTimeMs)) {
    errors.push("validationTime must be an RFC 3339 UTC timestamp");
  } else if (validationTimeMs > windowStartMs) {
    errors.push("validationTime must not be later than the test-window start");
  }
  if (
    !validateExactKeys(
      attestation,
      [
        "appliedMigrations",
        "deployedFunctions",
        "evidenceSources",
        "presentSecretNames",
        "presentVaultSecretNames",
        "schemaVersion",
        "stripeMode",
        "stripeWebhook",
        "supabaseProjectRef",
        "targetEnvironment",
      ],
      "attestation",
      errors,
    )
  ) {
    return { errors, ok: false };
  }

  if (attestation.schemaVersion !== PREFLIGHT_SCHEMA_VERSION) {
    errors.push(
      `attestation.schemaVersion must equal ${PREFLIGHT_SCHEMA_VERSION}`,
    );
  }
  if (attestation.targetEnvironment !== options.target) {
    errors.push("attestation.targetEnvironment does not match --target");
  }
  if (attestation.stripeMode !== options.stripeMode) {
    errors.push("attestation.stripeMode does not match --stripe-mode");
  }
  if (attestation.supabaseProjectRef !== options.supabaseProjectRef) {
    errors.push(
      "attestation.supabaseProjectRef does not match --supabase-project-ref",
    );
  }

  const evidenceSources = attestation.evidenceSources;
  if (
    validateExactKeys(
      evidenceSources,
      Object.keys(REQUIRED_EVIDENCE_SOURCES),
      "attestation.evidenceSources",
      errors,
    )
  ) {
    const earliestCapture = windowStartMs - 24 * 60 * 60 * 1000;
    const latestCapture = Math.min(validationTimeMs, windowStartMs);
    for (const [area, expectedSource] of Object.entries(
      REQUIRED_EVIDENCE_SOURCES,
    )) {
      const context = `attestation.evidenceSources.${area}`;
      const entry = evidenceSources[area];
      if (
        !validateExactKeys(
          entry,
          ["capturedAt", "evidenceId", "source"],
          context,
          errors,
        )
      ) {
        continue;
      }
      if (entry.source !== expectedSource) {
        errors.push(`${context}.source is invalid`);
      }
      if (
        typeof entry.evidenceId !== "string" ||
        !VERSION_PATTERN.test(entry.evidenceId) ||
        PLACEHOLDER_PATTERN.test(entry.evidenceId)
      ) {
        errors.push(`${context}.evidenceId is invalid`);
      }
      if (!isStrictIsoTimestamp(entry.capturedAt)) {
        errors.push(`${context}.capturedAt must be an RFC 3339 UTC timestamp`);
      } else {
        const capturedAt = Date.parse(entry.capturedAt);
        if (
          !Number.isFinite(latestCapture) ||
          capturedAt < earliestCapture ||
          capturedAt > latestCapture
        ) {
          errors.push(
            `${context}.capturedAt must be within 24 hours before the test window and no later than validationTime`,
          );
        }
      }
    }
  }

  const migrations = validateSafeStringArray({
    context: "attestation.appliedMigrations",
    errors,
    pattern: /^[0-9]{14}_[a-z0-9_]+\.sql$/,
    required: REQUIRED_ANALYTICS_MIGRATIONS,
    value: attestation.appliedMigrations,
  });
  const migrationIndexes = REQUIRED_ANALYTICS_MIGRATIONS.map((migration) =>
    migrations.indexOf(migration),
  );
  if (
    migrationIndexes.every((index) => index >= 0) &&
    !migrationIndexes.every(
      (index, position) =>
        position === 0 || index > migrationIndexes[position - 1],
    )
  ) {
    errors.push(
      "attestation.appliedMigrations has the analytics chain out of order",
    );
  }

  const functions = attestation.deployedFunctions;
  if (!Array.isArray(functions)) {
    errors.push("attestation.deployedFunctions must be an array");
  } else {
    const names = [];
    functions.forEach((entry, index) => {
      const context = `attestation.deployedFunctions[${index}]`;
      if (
        !validateExactKeys(
          entry,
          ["name", "sourceCommit", "version"],
          context,
          errors,
        )
      ) {
        return;
      }
      if (!REQUIRED_ANALYTICS_FUNCTIONS.includes(entry.name)) {
        errors.push(`${context}.name is unsupported`);
      } else {
        names.push(entry.name);
      }
      if (
        typeof entry.version !== "string" ||
        !VERSION_PATTERN.test(entry.version) ||
        PLACEHOLDER_PATTERN.test(entry.version)
      ) {
        errors.push(`${context}.version is invalid`);
      }
      if (
        typeof entry.sourceCommit !== "string" ||
        !COMMIT_PATTERN.test(entry.sourceCommit)
      ) {
        errors.push(`${context}.sourceCommit must be a 7-40 character Git SHA`);
      }
    });
    const duplicateNames = names.filter(
      (name, index) => names.indexOf(name) !== index,
    );
    if (duplicateNames.length > 0) {
      errors.push(
        `attestation.deployedFunctions contains duplicates: ${[
          ...new Set(duplicateNames),
        ].join(", ")}`,
      );
    }
    const missingFunctions = listMissing(names, REQUIRED_ANALYTICS_FUNCTIONS);
    if (missingFunctions.length > 0) {
      errors.push(
        `attestation.deployedFunctions is missing: ${missingFunctions.join(", ")}`,
      );
    }
  }

  validateSafeStringArray({
    context: "attestation.presentSecretNames",
    errors,
    pattern: ENV_SECRET_NAME_PATTERN,
    required: requiredEdgeSecretNames(options.stripeMode),
    value: attestation.presentSecretNames,
  });
  validateSafeStringArray({
    context: "attestation.presentVaultSecretNames",
    errors,
    pattern: VAULT_SECRET_NAME_PATTERN,
    required: REQUIRED_VAULT_SECRET_NAMES,
    value: attestation.presentVaultSecretNames,
  });

  const webhook = attestation.stripeWebhook;
  if (
    validateExactKeys(
      webhook,
      ["enabled", "endpoint", "eventTypes", "mode"],
      "attestation.stripeWebhook",
      errors,
    )
  ) {
    if (webhook.enabled !== true) {
      errors.push("attestation.stripeWebhook.enabled must be true");
    }
    if (webhook.mode !== options.stripeMode) {
      errors.push(
        "attestation.stripeWebhook.mode does not match --stripe-mode",
      );
    }
    const expectedEndpoint = `https://${options.supabaseProjectRef}.supabase.co/functions/v1/stripe-webhook`;
    if (webhook.endpoint !== expectedEndpoint) {
      errors.push(
        `attestation.stripeWebhook.endpoint must equal ${expectedEndpoint}`,
      );
    }
    validateSafeStringArray({
      context: "attestation.stripeWebhook.eventTypes",
      errors,
      pattern: /^[a-z][a-z0-9_.]+$/,
      required: REQUIRED_STRIPE_WEBHOOK_EVENTS,
      value: webhook.eventTypes,
    });
  }

  try {
    assertNoSensitiveValues(attestation, "attestation");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return { errors: [...new Set(errors)], ok: errors.length === 0 };
};

export const assertSafeEvidenceOutputPath = ({
  fileSystem = fs,
  outputPath,
  repositoryRoot,
}) => {
  if (!outputPath || path.isAbsolute(outputPath)) {
    throw new Error(
      "--output must be a repository-relative path under output/analytics-reconciliation",
    );
  }

  const normalized = outputPath.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    !normalized.startsWith("output/analytics-reconciliation/") ||
    normalized.includes("../") ||
    segments.length !== 3 ||
    !normalized.endsWith(".json") ||
    normalized.endsWith("/.json")
  ) {
    throw new Error(
      "--output must name a .json file under output/analytics-reconciliation",
    );
  }
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment.endsWith(" ") ||
        segment.endsWith(".") ||
        PORTABLE_UNSAFE_SEGMENT_PATTERN.test(segment) ||
        WINDOWS_RESERVED_SEGMENT_PATTERN.test(segment),
    )
  ) {
    throw new Error("--output contains an unsafe or reserved path segment");
  }

  const allowedRoot = path.resolve(
    repositoryRoot,
    "output",
    "analytics-reconciliation",
  );
  const resolved = path.resolve(repositoryRoot, outputPath);
  const relative = path.relative(allowedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      "--output resolves outside output/analytics-reconciliation",
    );
  }

  let cursor = repositoryRoot;
  for (const segment of path
    .relative(repositoryRoot, path.dirname(resolved))
    .split(path.sep)) {
    if (!segment) continue;
    cursor = path.join(cursor, segment);
    if (
      fileSystem.existsSync(cursor) &&
      fileSystem.lstatSync(cursor).isSymbolicLink()
    ) {
      throw new Error(`--output traverses a symbolic link: ${cursor}`);
    }
  }
  if (
    fileSystem.existsSync(allowedRoot) &&
    typeof fileSystem.realpathSync === "function"
  ) {
    const canonicalAllowedRoot = fileSystem.realpathSync(allowedRoot);
    const canonicalParent = fileSystem.realpathSync(path.dirname(resolved));
    if (canonicalAllowedRoot !== canonicalParent) {
      throw new Error("--output parent resolves outside the allowed directory");
    }
  }

  return resolved;
};

export const assertHealthQueriesReadOnly = (queries = HEALTH_QUERIES) => {
  const blocked =
    /\b(insert|update|delete|alter|drop|truncate|grant|revoke|call|perform)\b/i;
  const failures = Object.entries(queries)
    .filter(([, query]) => blocked.test(query.replace(/--.*$/gm, "")))
    .map(([name]) => name);
  if (failures.length > 0) {
    throw new Error(
      `Mutating SQL found in health queries: ${failures.join(", ")}`,
    );
  }
  return true;
};

const PRE_RUN_QUERY_NAMES = Object.freeze([
  "blockedPayloadFieldScan",
  "duplicateLogicalKeys",
  "failureInventory",
  "retryAndLeaseHealth",
  "statusSummary",
]);
const POST_RUN_QUERY_NAMES = Object.freeze([
  ...PRE_RUN_QUERY_NAMES,
  "purchaseRefundReconciliation",
]);
const CLEANUP_ACTIONS = Object.freeze([
  "controlled-refund-recorded",
  "private-query-results-retained",
  "public-evidence-sanitized",
  "temporary-artifacts-removed",
]);
const READINESS_WARNING =
  "offline-contract-passed-external-verification-required";
const EVIDENCE_PRIVACY_POLICY = Object.freeze({
  classification: "sanitized-launch-evidence",
  identifierRule:
    "Keep full order, Stripe, and GA identifiers private; publish only a one-way fingerprint or short non-reversible evidence label.",
  prohibitedData: [
    "secret values and authorization headers",
    "customer contact or address data",
    "uploaded artwork, preview URLs, and free-form text",
    "full payment, Checkout Session, PaymentIntent, order, or GA client identifiers",
  ],
  warning:
    "Run queries in a private operator session and sanitize screenshots/exports before attaching them to GitHub.",
});
const GROWTH_VALIDATOR_COMMAND =
  "node scripts/validate-growth-reporting.mjs <privacy-reviewed-growth-export.json>";

const emptyEvidenceReference = () => ({
  capturedAt: null,
  evidenceId: null,
  result: null,
});

const emptyQueryEvidence = (names) =>
  Object.fromEntries(names.map((name) => [name, emptyEvidenceReference()]));

const emptyReconciledValues = () => ({
  currency: null,
  eventValue: null,
  itemCount: null,
  matches: null,
  orderValue: null,
  shipping: null,
  tax: null,
});

export const buildEvidenceScaffold = ({
  attestation,
  functionSourceChecks,
  generatedAt,
  operator,
  repositoryChecks,
  repositoryCommit,
  stripeMode,
  supabaseProjectRef,
  target,
  timezone,
  windowEnd,
  windowStart,
}) => {
  assertHealthQueriesReadOnly();
  const requiredSecrets = requiredEdgeSecretNames(stripeMode);
  const deployedFunctions = REQUIRED_ANALYTICS_FUNCTIONS.map((name) => {
    const entry = attestation.deployedFunctions.find(
      (candidate) => candidate.name === name,
    );
    const sourceCheck = functionSourceChecks.find(
      (candidate) => candidate.name === name,
    );
    return {
      name,
      sourceCommit: entry.sourceCommit,
      sourceMatchesRepository: sourceCheck?.ok === true,
      version: entry.version,
    };
  });

  const scaffold = {
    schemaVersion: PREFLIGHT_SCHEMA_VERSION,
    generatedAt,
    readiness: READINESS_WARNING,
    privacy: EVIDENCE_PRIVACY_POLICY,
    target: {
      environment: target,
      operator,
      stripeMode,
      supabaseProjectRef,
      testWindow: {
        end: windowEnd,
        start: windowStart,
        timezone,
      },
    },
    preflight: {
      externalDeploymentVerifiedByCommand: false,
      externalEvidenceAttested: true,
      offlineContractPassed: true,
      repositoryCommit,
      repositoryChecks: repositoryChecks.map(
        ({ id, ok, path: contractPath }) => ({
          id,
          ok,
          path: contractPath,
        }),
      ),
      deploymentAttestation: {
        evidenceSources: Object.fromEntries(
          Object.keys(REQUIRED_EVIDENCE_SOURCES).map((area) => [
            area,
            {
              capturedAt: attestation.evidenceSources[area].capturedAt,
              evidenceId: attestation.evidenceSources[area].evidenceId,
              source: attestation.evidenceSources[area].source,
            },
          ]),
        ),
        appliedMigrations: REQUIRED_ANALYTICS_MIGRATIONS.map((name) => ({
          name,
          present: attestation.appliedMigrations.includes(name),
        })),
        deployedFunctions,
        requiredSecretNames: requiredSecrets.map((name) => ({
          name,
          present: attestation.presentSecretNames.includes(name),
        })),
        requiredVaultSecretNames: REQUIRED_VAULT_SECRET_NAMES.map((name) => ({
          name,
          present: attestation.presentVaultSecretNames.includes(name),
        })),
        stripeWebhook: {
          enabled: attestation.stripeWebhook.enabled,
          endpoint: attestation.stripeWebhook.endpoint,
          eventTypes: REQUIRED_STRIPE_WEBHOOK_EVENTS.map((name) => ({
            name,
            subscribed: attestation.stripeWebhook.eventTypes.includes(name),
          })),
          mode: attestation.stripeWebhook.mode,
        },
      },
    },
    healthQueries: HEALTH_QUERIES,
    evidence: {
      preRun: {
        queries: emptyQueryEvidence(PRE_RUN_QUERY_NAMES),
      },
      purchase: {
        ga4EvidenceId: null,
        orderFingerprint: null,
        outboxEventFingerprint: null,
        reconciledValues: emptyReconciledValues(),
        stripeEvidenceId: null,
      },
      idempotencyAndRecovery: {
        gaFailureRecoveryEvidenceId: null,
        successPageRefreshEvidenceId: null,
        webhookReplayEvidenceId: null,
      },
      refund: {
        ga4EvidenceId: null,
        orderFingerprint: null,
        outboxEventFingerprint: null,
        reconciledValues: emptyReconciledValues(),
        stripeEvidenceId: null,
      },
      postRun: {
        queries: emptyQueryEvidence(POST_RUN_QUERY_NAMES),
      },
      growthValidator: {
        command: GROWTH_VALIDATOR_COMMAND,
        completedAt: null,
        evidenceId: null,
        exportFingerprint: null,
        result: null,
      },
      cleanup: {
        actions: [],
        completedAt: null,
        evidenceId: null,
      },
    },
  };

  scaffold.contractFingerprint = evidenceContractFingerprint(scaffold);
  assertNoSensitiveValues(scaffold, "evidenceScaffold");
  return scaffold;
};

const validateEvidenceId = (value, context, errors) => {
  if (
    typeof value !== "string" ||
    !PUBLIC_EVIDENCE_ID_PATTERN.test(value) ||
    PLACEHOLDER_PATTERN.test(value) ||
    UUID_PATTERN.test(value)
  ) {
    errors.push(`${context} must be a sanitized public evidence label`);
  }
};

const validateEvidenceReference = (
  value,
  context,
  errors,
  { maximum, minimum } = {},
) => {
  if (
    !validateExactKeys(
      value,
      ["capturedAt", "evidenceId", "result"],
      context,
      errors,
    )
  ) {
    return Number.NaN;
  }
  const capturedAt = validateTimestampWithin({
    context: `${context}.capturedAt`,
    errors,
    maximum,
    minimum,
    value: value.capturedAt,
  });
  validateEvidenceId(value.evidenceId, `${context}.evidenceId`, errors);
  if (!["pass", "fail"].includes(value.result)) {
    errors.push(`${context}.result must be pass or fail`);
  }
  return capturedAt;
};

const validateQueryEvidence = (value, names, context, errors, bounds) => {
  if (!validateExactKeys(value, names, context, errors)) return [];
  return names.map((name) =>
    validateEvidenceReference(
      value[name],
      `${context}.${name}`,
      errors,
      bounds,
    ),
  );
};

const validateReconciledValues = (value, context, errors) => {
  const keys = [
    "currency",
    "eventValue",
    "itemCount",
    "matches",
    "orderValue",
    "shipping",
    "tax",
  ];
  if (!validateExactKeys(value, keys, context, errors)) return;
  if (
    typeof value.currency !== "string" ||
    !/^[A-Z]{3}$/.test(value.currency)
  ) {
    errors.push(`${context}.currency must be a three-letter code`);
  }
  for (const name of ["eventValue", "orderValue", "shipping", "tax"]) {
    if (
      typeof value[name] !== "number" ||
      !Number.isFinite(value[name]) ||
      value[name] < 0
    ) {
      errors.push(`${context}.${name} must be a finite non-negative number`);
    }
  }
  if (!Number.isSafeInteger(value.itemCount) || value.itemCount < 1) {
    errors.push(`${context}.itemCount must be a positive integer`);
  }
  if (typeof value.matches !== "boolean") {
    errors.push(`${context}.matches must be boolean`);
  }
};

const validateTransactionEvidence = (value, context, errors) => {
  const keys = [
    "ga4EvidenceId",
    "orderFingerprint",
    "outboxEventFingerprint",
    "reconciledValues",
    "stripeEvidenceId",
  ];
  if (!validateExactKeys(value, keys, context, errors)) return;
  validateEvidenceId(value.ga4EvidenceId, `${context}.ga4EvidenceId`, errors);
  validateEvidenceId(
    value.stripeEvidenceId,
    `${context}.stripeEvidenceId`,
    errors,
  );
  for (const name of ["orderFingerprint", "outboxEventFingerprint"]) {
    if (
      typeof value[name] !== "string" ||
      !FINGERPRINT_PATTERN.test(value[name])
    ) {
      errors.push(
        `${context}.${name} must be a 12-character lowercase hexadecimal fingerprint`,
      );
    }
  }
  validateReconciledValues(
    value.reconciledValues,
    `${context}.reconciledValues`,
    errors,
  );
};

const validateTimestampWithin = ({
  context,
  errors,
  maximum,
  minimum,
  value,
}) => {
  if (!isStrictIsoTimestamp(value)) {
    errors.push(`${context} must be an RFC 3339 UTC timestamp`);
    return Number.NaN;
  }
  const timestamp = Date.parse(value);
  if (Number.isFinite(minimum) && timestamp < minimum) {
    errors.push(`${context} is earlier than the permitted evidence window`);
  }
  if (Number.isFinite(maximum) && timestamp > maximum) {
    errors.push(`${context} is later than the permitted evidence window`);
  }
  return timestamp;
};

const validateGeneratedPreflight = ({
  artifact,
  errors,
  generatedAtMs,
  validationTimeMs,
  windowStartMs,
}) => {
  const preflight = artifact.preflight;
  if (
    !validateExactKeys(
      preflight,
      [
        "deploymentAttestation",
        "externalDeploymentVerifiedByCommand",
        "externalEvidenceAttested",
        "offlineContractPassed",
        "repositoryChecks",
        "repositoryCommit",
      ],
      "preflight",
      errors,
    )
  ) {
    return;
  }
  if (preflight.externalDeploymentVerifiedByCommand !== false) {
    errors.push(
      "preflight.externalDeploymentVerifiedByCommand must remain false",
    );
  }
  if (preflight.externalEvidenceAttested !== true) {
    errors.push("preflight.externalEvidenceAttested must remain true");
  }
  if (preflight.offlineContractPassed !== true) {
    errors.push("preflight.offlineContractPassed must remain true");
  }
  if (
    typeof preflight.repositoryCommit !== "string" ||
    !COMMIT_PATTERN.test(preflight.repositoryCommit)
  ) {
    errors.push("preflight.repositoryCommit is invalid");
  }

  const expectedRepositoryChecks = REPOSITORY_CONTRACTS.map(({ id, path }) => ({
    id,
    ok: true,
    path,
  }));
  if (
    !isDeepStrictEqual(preflight.repositoryChecks, expectedRepositoryChecks)
  ) {
    errors.push(
      "preflight.repositoryChecks must exactly match the passing repository contract",
    );
  }

  const deployment = preflight.deploymentAttestation;
  if (
    !validateExactKeys(
      deployment,
      [
        "appliedMigrations",
        "deployedFunctions",
        "evidenceSources",
        "requiredSecretNames",
        "requiredVaultSecretNames",
        "stripeWebhook",
      ],
      "preflight.deploymentAttestation",
      errors,
    )
  ) {
    return;
  }

  const expectedMigrations = REQUIRED_ANALYTICS_MIGRATIONS.map((name) => ({
    name,
    present: true,
  }));
  if (!isDeepStrictEqual(deployment.appliedMigrations, expectedMigrations)) {
    errors.push(
      "preflight deployment migrations must exactly match the required applied chain",
    );
  }

  if (
    !Array.isArray(deployment.deployedFunctions) ||
    deployment.deployedFunctions.length !== REQUIRED_ANALYTICS_FUNCTIONS.length
  ) {
    errors.push(
      "preflight deployed functions must exactly match the required function set",
    );
  } else {
    deployment.deployedFunctions.forEach((entry, index) => {
      const context = `preflight.deploymentAttestation.deployedFunctions[${index}]`;
      if (
        !validateExactKeys(
          entry,
          ["name", "sourceCommit", "sourceMatchesRepository", "version"],
          context,
          errors,
        )
      ) {
        return;
      }
      if (
        entry.name !== REQUIRED_ANALYTICS_FUNCTIONS[index] ||
        entry.sourceMatchesRepository !== true ||
        typeof entry.sourceCommit !== "string" ||
        !COMMIT_PATTERN.test(entry.sourceCommit) ||
        typeof entry.version !== "string" ||
        !VERSION_PATTERN.test(entry.version) ||
        PLACEHOLDER_PATTERN.test(entry.version)
      ) {
        errors.push(`${context} is not a valid repository-bound deployment`);
      }
    });
  }

  const evidenceSources = deployment.evidenceSources;
  if (
    validateExactKeys(
      evidenceSources,
      Object.keys(REQUIRED_EVIDENCE_SOURCES),
      "preflight.deploymentAttestation.evidenceSources",
      errors,
    )
  ) {
    const earliestCapture = windowStartMs - 24 * 60 * 60 * 1000;
    for (const [area, source] of Object.entries(REQUIRED_EVIDENCE_SOURCES)) {
      const entry = evidenceSources[area];
      const context = `preflight.deploymentAttestation.evidenceSources.${area}`;
      if (
        !validateExactKeys(
          entry,
          ["capturedAt", "evidenceId", "source"],
          context,
          errors,
        )
      ) {
        continue;
      }
      validateTimestampWithin({
        context: `${context}.capturedAt`,
        errors,
        maximum: Math.min(generatedAtMs, validationTimeMs),
        minimum: earliestCapture,
        value: entry.capturedAt,
      });
      validateEvidenceId(entry.evidenceId, `${context}.evidenceId`, errors);
      if (entry.source !== source) {
        errors.push(`${context}.source is invalid`);
      }
    }
  }

  const stripeMode = artifact.target?.stripeMode;
  const expectedSecretNames = requiredEdgeSecretNames(stripeMode).map(
    (name) => ({ name, present: true }),
  );
  if (!isDeepStrictEqual(deployment.requiredSecretNames, expectedSecretNames)) {
    errors.push(
      "preflight required secret names must exactly match the selected Stripe mode",
    );
  }
  const expectedVaultNames = REQUIRED_VAULT_SECRET_NAMES.map((name) => ({
    name,
    present: true,
  }));
  if (
    !isDeepStrictEqual(deployment.requiredVaultSecretNames, expectedVaultNames)
  ) {
    errors.push(
      "preflight required Vault names must exactly match the launch contract",
    );
  }

  const webhook = deployment.stripeWebhook;
  if (
    validateExactKeys(
      webhook,
      ["enabled", "endpoint", "eventTypes", "mode"],
      "preflight.deploymentAttestation.stripeWebhook",
      errors,
    )
  ) {
    const expectedEvents = REQUIRED_STRIPE_WEBHOOK_EVENTS.map((name) => ({
      name,
      subscribed: true,
    }));
    const expectedEndpoint = `https://${artifact.target?.supabaseProjectRef}.supabase.co/functions/v1/stripe-webhook`;
    if (
      webhook.enabled !== true ||
      webhook.endpoint !== expectedEndpoint ||
      webhook.mode !== stripeMode ||
      !isDeepStrictEqual(webhook.eventTypes, expectedEvents)
    ) {
      errors.push(
        "preflight Stripe webhook must exactly match the selected target and event contract",
      );
    }
  }
};

export const validateCompletedEvidenceArtifact = (
  artifact,
  { validationTime = new Date().toISOString() } = {},
) => {
  const errors = [];
  try {
    assertNoSensitiveValues(artifact, "evidenceArtifact");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  if (!isPlainObject(artifact) || !isPlainObject(artifact.evidence)) {
    errors.push("Evidence artifact must contain the generated evidence object");
    return { errors: [...new Set(errors)], ok: false };
  }
  validateExactKeys(
    artifact,
    [
      "contractFingerprint",
      "evidence",
      "generatedAt",
      "healthQueries",
      "preflight",
      "privacy",
      "readiness",
      "schemaVersion",
      "target",
    ],
    "evidenceArtifact",
    errors,
  );
  if (
    typeof artifact.contractFingerprint !== "string" ||
    !CONTRACT_FINGERPRINT_PATTERN.test(artifact.contractFingerprint) ||
    artifact.contractFingerprint !== evidenceContractFingerprint(artifact)
  ) {
    errors.push(
      "Evidence immutable contract fingerprint does not match the generated preflight",
    );
  }
  if (artifact.schemaVersion !== PREFLIGHT_SCHEMA_VERSION) {
    errors.push(
      `Evidence schemaVersion must equal ${PREFLIGHT_SCHEMA_VERSION}`,
    );
  }
  if (artifact.readiness !== READINESS_WARNING) {
    errors.push(
      "Evidence readiness must preserve the external verification warning",
    );
  }
  if (!isDeepStrictEqual(artifact.privacy, EVIDENCE_PRIVACY_POLICY)) {
    errors.push("Evidence privacy policy must remain unchanged");
  }
  if (!isDeepStrictEqual(artifact.healthQueries, HEALTH_QUERIES)) {
    errors.push("Evidence health queries must remain read-only and unchanged");
  }

  const validationTimeMs = isStrictIsoTimestamp(validationTime)
    ? Date.parse(validationTime)
    : Number.NaN;
  if (!Number.isFinite(validationTimeMs)) {
    errors.push("validationTime must be an RFC 3339 UTC timestamp");
  }
  const generatedAtMs = validateTimestampWithin({
    context: "generatedAt",
    errors,
    maximum: validationTimeMs,
    value: artifact.generatedAt,
  });

  const target = artifact.target;
  let windowStartMs = Number.NaN;
  let windowEndMs = Number.NaN;
  if (
    validateExactKeys(
      target,
      [
        "environment",
        "operator",
        "stripeMode",
        "supabaseProjectRef",
        "testWindow",
      ],
      "target",
      errors,
    )
  ) {
    if (
      typeof target.environment !== "string" ||
      !SAFE_LABEL_PATTERN.test(target.environment) ||
      typeof target.operator !== "string" ||
      !SAFE_LABEL_PATTERN.test(target.operator) ||
      !["test", "live"].includes(target.stripeMode) ||
      typeof target.supabaseProjectRef !== "string" ||
      !SUPABASE_PROJECT_REF_PATTERN.test(target.supabaseProjectRef)
    ) {
      errors.push("Evidence target metadata is invalid");
    }
    if (
      validateExactKeys(
        target.testWindow,
        ["end", "start", "timezone"],
        "target.testWindow",
        errors,
      )
    ) {
      windowStartMs = validateTimestampWithin({
        context: "target.testWindow.start",
        errors,
        value: target.testWindow.start,
      });
      windowEndMs = validateTimestampWithin({
        context: "target.testWindow.end",
        errors,
        maximum: validationTimeMs,
        value: target.testWindow.end,
      });
      if (
        Number.isFinite(windowStartMs) &&
        Number.isFinite(windowEndMs) &&
        windowStartMs >= windowEndMs
      ) {
        errors.push("Evidence test window start must be earlier than its end");
      }
      if (
        Number.isFinite(generatedAtMs) &&
        Number.isFinite(windowStartMs) &&
        generatedAtMs > windowStartMs
      ) {
        errors.push(
          "Evidence must be generated no later than test-window start",
        );
      }
      try {
        new Intl.DateTimeFormat("en-US", {
          timeZone: target.testWindow.timezone,
        }).format();
      } catch {
        errors.push("target.testWindow.timezone is invalid");
      }
    }
  }

  validateGeneratedPreflight({
    artifact,
    errors,
    generatedAtMs,
    validationTimeMs,
    windowStartMs,
  });

  const evidence = artifact.evidence;
  const evidenceKeys = [
    "cleanup",
    "growthValidator",
    "idempotencyAndRecovery",
    "postRun",
    "preRun",
    "purchase",
    "refund",
  ];
  let preRunTimestamps = [];
  let postRunTimestamps = [];
  let growthCompletedAt = Number.NaN;
  if (validateExactKeys(evidence, evidenceKeys, "evidence", errors)) {
    if (
      validateExactKeys(evidence.preRun, ["queries"], "evidence.preRun", errors)
    ) {
      preRunTimestamps = validateQueryEvidence(
        evidence.preRun.queries,
        PRE_RUN_QUERY_NAMES,
        "evidence.preRun.queries",
        errors,
        {
          maximum: Math.min(windowEndMs, validationTimeMs),
          minimum: windowStartMs,
        },
      );
    }
    if (
      validateExactKeys(
        evidence.postRun,
        ["queries"],
        "evidence.postRun",
        errors,
      )
    ) {
      postRunTimestamps = validateQueryEvidence(
        evidence.postRun.queries,
        POST_RUN_QUERY_NAMES,
        "evidence.postRun.queries",
        errors,
        {
          maximum: Math.min(windowEndMs, validationTimeMs),
          minimum: windowStartMs,
        },
      );
    }
    const latestPreRun = Math.max(...preRunTimestamps.filter(Number.isFinite));
    const earliestPostRun = Math.min(
      ...postRunTimestamps.filter(Number.isFinite),
    );
    if (
      Number.isFinite(latestPreRun) &&
      Number.isFinite(earliestPostRun) &&
      earliestPostRun < latestPreRun
    ) {
      errors.push("Post-run query evidence must not precede pre-run evidence");
    }
    validateTransactionEvidence(evidence.purchase, "evidence.purchase", errors);
    validateTransactionEvidence(evidence.refund, "evidence.refund", errors);

    const recoveryKeys = [
      "gaFailureRecoveryEvidenceId",
      "successPageRefreshEvidenceId",
      "webhookReplayEvidenceId",
    ];
    if (
      validateExactKeys(
        evidence.idempotencyAndRecovery,
        recoveryKeys,
        "evidence.idempotencyAndRecovery",
        errors,
      )
    ) {
      for (const name of recoveryKeys) {
        validateEvidenceId(
          evidence.idempotencyAndRecovery[name],
          `evidence.idempotencyAndRecovery.${name}`,
          errors,
        );
      }
    }

    const validator = evidence.growthValidator;
    if (
      validateExactKeys(
        validator,
        ["command", "completedAt", "evidenceId", "exportFingerprint", "result"],
        "evidence.growthValidator",
        errors,
      )
    ) {
      if (validator.command !== GROWTH_VALIDATOR_COMMAND) {
        errors.push(
          "evidence.growthValidator.command must use the positional export path",
        );
      }
      growthCompletedAt = validateTimestampWithin({
        context: "evidence.growthValidator.completedAt",
        errors,
        maximum: validationTimeMs,
        minimum: windowEndMs,
        value: validator.completedAt,
      });
      validateEvidenceId(
        validator.evidenceId,
        "evidence.growthValidator.evidenceId",
        errors,
      );
      if (
        typeof validator.exportFingerprint !== "string" ||
        !FINGERPRINT_PATTERN.test(validator.exportFingerprint)
      ) {
        errors.push(
          "evidence.growthValidator.exportFingerprint must be a 12-character lowercase hexadecimal fingerprint",
        );
      }
      if (!["pass", "fail"].includes(validator.result)) {
        errors.push("evidence.growthValidator.result must be pass or fail");
      }
    }

    const cleanup = evidence.cleanup;
    if (
      validateExactKeys(
        cleanup,
        ["actions", "completedAt", "evidenceId"],
        "evidence.cleanup",
        errors,
      )
    ) {
      validateTimestampWithin({
        context: "evidence.cleanup.completedAt",
        errors,
        maximum: validationTimeMs,
        minimum: Number.isFinite(growthCompletedAt)
          ? growthCompletedAt
          : windowEndMs,
        value: cleanup.completedAt,
      });
      validateEvidenceId(
        cleanup.evidenceId,
        "evidence.cleanup.evidenceId",
        errors,
      );
      if (!isDeepStrictEqual(cleanup.actions, [...CLEANUP_ACTIONS])) {
        errors.push(
          `evidence.cleanup.actions must contain the complete ordered cleanup contract: ${CLEANUP_ACTIONS.join(", ")}`,
        );
      }
    }
  }

  return { errors: [...new Set(errors)], ok: errors.length === 0 };
};
