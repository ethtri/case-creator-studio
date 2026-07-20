import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("vendor notification claims are leased and service-role only", async () => {
  const sql = await read(
    "supabase/migrations/20260720010000_claim_kexiaozhan_vendor_notification.sql",
  );

  assert.match(sql, /claim_kexiaozhan_payment_notification/i);
  assert.match(sql, /status = 'vendor_notifying'/i);
  assert.match(sql, /notify_claim_id/i);
  assert.match(sql, /notify_claimed_at/i);
  assert.match(sql, /FOR UPDATE/i);
  assert.match(sql, /make_interval\(secs => v_lease_seconds\)/i);
  assert.match(sql, /payment_notified_at IS NOT NULL/i);
  assert.match(sql, /service_role required/i);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.claim_kexiaozhan_payment_notification[\s\S]*FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.claim_kexiaozhan_payment_notification[\s\S]*TO service_role/i,
  );
});

test("fulfillment routing claims before sending and preserves recorded success", async () => {
  const route = await read(
    "supabase/functions/route-fulfillment-order/index.ts",
  );

  const previousSuccess = route.indexOf(
    'previousNotification?.mode === "live" && previousResponse?.ok === true',
  );
  const claim = route.indexOf(
    "claimKexiaozhanPaymentNotification(",
    previousSuccess,
  );
  const vendorFetch = route.indexOf("const response = await fetch(endpoint", claim);

  assert.ok(previousSuccess >= 0);
  assert.ok(claim > previousSuccess);
  assert.ok(vendorFetch > claim);
  assert.match(route, /claim\.state === "in_progress"/);
  assert.match(route, /claim\.state === "already_succeeded"/);
  assert.match(route, /\.eq\("notify_claim_id", notifyClaimId\)/);
  assert.match(route, /signal:\s*AbortSignal\.timeout\(20_000\)/);
  assert.match(route, /error:\s*"network_error"/);
  assert.match(route, /KEXIAOZHAN_VENDOR_NOTIFY_FAILED_STATUS|vendor_notify_failed/);
});

test("operator endpoints expose a safe projection and a narrow retry action", async () => {
  const [list, update, summary] = await Promise.all([
    read("supabase/functions/production-jobs/index.ts"),
    read("supabase/functions/update-production-job/index.ts"),
    read("supabase/functions/_shared/kexiaozhan-reconciliation.ts"),
  ]);

  assert.match(list, /requireOperator/);
  assert.match(list, /vendorNotification: getKexiaozhanNotificationSummary/);
  assert.doesNotMatch(list, /metadata:\s*job\.metadata/);
  assert.match(update, /requireOperator/);
  assert.match(update, /retry_kexiaozhan_notification/);
  assert.match(update, /route-fulfillment-order/);
  assert.match(update, /provider:\s*"onshore_manual"/);
  assert.match(summary, /message\.slice\(0, 160\)/);
  assert.match(summary, /canRetry:\s*true/);
  assert.doesNotMatch(summary, /notify_request|signed_payload|machineKey/);
});

test("operations UI prioritizes failures and supports visible recovery", async () => {
  const operations = await read("src/pages/Operations.tsx");

  assert.match(operations, /Vendor handoff needs attention/);
  assert.match(operations, /Retry vendor handoff/);
  assert.match(operations, /Vendor notification recovered/);
  assert.match(
    operations,
    /Number\(b\.vendorNotification\?\.state === "failed"\)/,
  );
  assert.match(operations, /role="alert"/);
  assert.match(operations, /disabled=\{isSaving \|\| isRetrying\}/);
});
