import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("checkout correlation state is private, constrained, and indexed", async () => {
  const migration = await read(
    "supabase/migrations/20260908171524_checkout_attempt_observability.sql",
  );

  assert.match(migration, /CREATE TABLE public\.checkout_attempts/);
  assert.match(
    migration,
    /ALTER TABLE public\.checkout_attempts ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(
    migration,
    /ALTER TABLE public\.checkout_attempts FORCE ROW LEVEL SECURITY/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.checkout_attempts FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.checkout_attempts TO service_role/,
  );
  assert.match(migration, /checkout_attempts_status_check/);
  assert.match(migration, /checkout_attempts_error_code_check/);
  assert.match(migration, /checkout_attempts_session_path_check/);
  assert.match(migration, /checkout_attempts_unobserved_idx/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS checkout_attempt_id UUID/);
  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT false/,
  );
  assert.doesNotMatch(
    migration,
    /customer_email|shipping_address|stripe_session_id/i,
  );
});

test("create-checkout correlates browser, order, Stripe metadata, and safe logs", async () => {
  const source = await read("supabase/functions/create-checkout/index.ts");

  assert.match(
    source,
    /checkoutAttemptId: z\.string\(\)\.uuid\(\)\.optional\(\)/,
  );
  assert.match(source, /checkoutAttemptId: requestedCheckoutAttemptId/);
  assert.match(source, /metadata:\s*\{[\s\S]*checkoutAttemptId/);
  assert.match(source, /checkout_attempt_id: checkoutAttemptId/);
  assert.match(source, /is_synthetic: isSynthetic/);
  assert.match(source, /status: "server_completed"/);
  assert.match(source, /checkout_server_completed/);
  assert.match(source, /checkout_server_failed/);
  assert.match(source, /x-snapcase-checkout-attempt-id/);
  assert.doesNotMatch(source, /Processing checkout for/);
  assert.doesNotMatch(source, /Checkout session created:/);
  assert.doesNotMatch(source, /Full error details/);
});

test("client observation is narrow and cannot mutate order or payment state", async () => {
  const [endpoint, transport, page, config] = await Promise.all([
    read("supabase/functions/checkout-client-observation/index.ts"),
    read("src/lib/checkout-observability.ts"),
    read("src/pages/Checkout.tsx"),
    read("supabase/config.toml"),
  ]);

  assert.match(endpoint, /checkoutAttemptId: z\.string\(\)\.uuid\(\)/);
  assert.match(endpoint, /requireAllowedOrigin/);
  assert.match(endpoint, /\.from\("checkout_attempts"\)/);
  assert.match(endpoint, /\.eq\("status", "server_completed"\)/);
  assert.doesNotMatch(
    endpoint,
    /\.from\("orders"\)|stripe|payment|fulfillment/i,
  );
  assert.match(transport, /keepalive: true/);
  assert.match(transport, /checkout-client-observation/);
  assert.match(page, /const checkoutAttemptId = crypto\.randomUUID\(\)/);
  assert.match(page, /checkoutAttemptId,\s*\n\s*buildRequestBody/);
  assert.match(
    config,
    /\[functions\.checkout-client-observation\][\s\S]*verify_jwt = false/,
  );
});

test("synthetic canaries require a server-side secret and cannot stage recovery", async () => {
  const [source, canary, workflow] = await Promise.all([
    read("supabase/functions/create-checkout/index.ts"),
    read("scripts/production-checkout-canary.mjs"),
    read(".github/workflows/production-checkout-canary.yml"),
  ]);

  assert.match(source, /CHECKOUT_CANARY_AUTH_SECRET/);
  assert.match(source, /x-snapcase-checkout-canary/);
  assert.match(source, /configuredCanarySecret\.length >= 32/);
  assert.match(source, /createdOrder\?\.id && !isSynthetic/);
  assert.doesNotMatch(source, /isSynthetic[\s\S]{0,80}validationResult\.data/);
  assert.match(canary, /x-snapcase-checkout-canary/);
  assert.match(canary, /https:\/\/www\.snapcase\.ai/);
  assert.match(canary, /checkout\.stripe\.com/);
  assert.match(canary, /without payment/);
  assert.doesNotMatch(canary, /cardNumber|paymentMethod|4242/);
  assert.match(workflow, /cron: "17 \*\/6 \* \* \*"/);
  assert.match(workflow, /CHECKOUT_CANARY_SITE_URL: https:\/\/www\.snapcase\.ai/);
  assert.match(workflow, /secrets\.CHECKOUT_CANARY_AUTH_SECRET/);
});

test("checkout monitor alerts once per incident and requires proven recovery", async () => {
  const [monitor, schema, schedule, config] = await Promise.all([
    read("supabase/functions/checkout-health-monitor/index.ts"),
    read(
      "supabase/migrations/20260908171524_checkout_attempt_observability.sql",
    ),
    read(
      "supabase/migrations/20260908173347_schedule_checkout_health_monitor.sql",
    ),
    read("supabase/config.toml"),
  ]);

  assert.match(schema, /CREATE TABLE public\.checkout_health_state/);
  assert.match(schema, /FORCE ROW LEVEL SECURITY/);
  assert.match(schema, /orders_synthetic_pending_created_idx/);
  assert.match(monitor, /Idempotency-Key/);
  assert.match(monitor, /status", "redirect_accepted"/);
  assert.match(monitor, /incident_open", false/);
  assert.match(monitor, /is_synthetic", true/);
  assert.doesNotMatch(
    monitor,
    /customer_email|shipping_address|stripe_session_id/i,
  );
  assert.match(schedule, /checkout-health-monitor-5m/);
  assert.match(schedule, /checkout_health_monitor_enabled/);
  assert.match(
    config,
    /\[functions\.checkout-health-monitor\][\s\S]*verify_jwt = false/,
  );
});
