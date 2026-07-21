import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("EasyPost automation migration is leased, recoverable, and service-only", async () => {
  const sql = await read(
    "supabase/migrations/20260719040000_add_easypost_shipping_automation.sql",
  );

  for (const rpc of [
    "prepare_easypost_shipping_label",
    "finalize_easypost_shipping_rate",
    "fail_easypost_shipping_preparation",
    "claim_easypost_label_purchase",
    "finalize_easypost_label_purchase",
    "mark_easypost_purchase_reconciliation",
    "transition_easypost_production_job",
    "claim_easypost_label_refund",
    "finalize_easypost_label_refund",
    "claim_shipping_webhook_event",
    "complete_shipping_webhook_event",
    "fail_shipping_webhook_event",
  ]) {
    assert.match(sql, new RegExp(`FUNCTION public\\.${rpc}`, "i"));
  }

  assert.match(sql, /shipping_review/i);
  assert.match(sql, /purchase_reconciliation/i);
  assert.match(sql, /refund_reconciliation_required/i);
  assert.match(sql, /purchase_lease_expires_at/i);
  assert.match(sql, /refund_lease_expires_at/i);
  assert.match(
    sql,
    /claim_shipping_webhook_event[\s\S]*payload_sha256[\s\S]*lease_expires_at/i,
  );
  assert.match(
    sql,
    /claim_easypost_label_purchase[\s\S]*v_job_status NOT IN \('printed', 'packed'\)/i,
  );
  assert.match(
    sql,
    /finalize_easypost_label_purchase[\s\S]*storage\.objects/i,
  );
  assert.match(
    sql,
    /transition_easypost_production_job[\s\S]*FROM public\.shipping_labels[\s\S]*FOR UPDATE[\s\S]*FROM public\.production_jobs[\s\S]*FOR UPDATE/i,
  );
  assert.match(
    sql,
    /claim_easypost_label_refund[\s\S]*FROM public\.shipping_labels[\s\S]*FOR UPDATE[\s\S]*FROM public\.production_jobs[\s\S]*FOR UPDATE/i,
  );
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_easypost/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_easypost/i);
});

test("shipping preparation validates the recipient and selects only an approved rate", async () => {
  const source = await read(
    "supabase/functions/shipping-prepare-order/index.ts",
  );

  assert.match(source, /EASYPOST_PRODUCTION_ENABLED/);
  assert.match(source, /EASYPOST_PARCEL_JSON/);
  assert.match(source, /EASYPOST_RATE_POLICY_JSON/);
  assert.match(source, /createVerifiedAddress/);
  assert.match(source, /submittedAddress\.country !== "US"/);
  assert.match(source, /selectEasyPostRate/);
  assert.match(source, /finalize_easypost_shipping_rate/);
  assert.match(source, /fail_easypost_shipping_preparation/);
  assert.match(source, /shipping_review/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^)]*shipping_address/i);
});

test("postage purchase reconciles before retry and stores only a private PDF", async () => {
  const source = await read(
    "supabase/functions/shipping-purchase-label/index.ts",
  );

  const retrieveIndex = source.indexOf("retrieveShipment");
  const buyIndex = source.indexOf("buyShipment");
  assert.ok(retrieveIndex >= 0 && buyIndex > retrieveIndex);
  assert.match(source, /p_reconciliation_result:\s*"not_purchased"/);
  assert.match(source, /mark_easypost_purchase_reconciliation/);
  assert.match(source, /SHIPPING_LABEL_BUCKET/);
  assert.match(source, /contentType:\s*"application\/pdf"/);
  assert.match(source, /finalize_easypost_label_purchase/);
  assert.doesNotMatch(source, /getPublicUrl/);
  assert.doesNotMatch(source, /label_pdf_url\s*:/);
});

test("refund actions call the provider and reconcile ambiguous outcomes", async () => {
  const [actions, refund, safeLabel] = await Promise.all([
    read("supabase/functions/shipping-label-actions/index.ts"),
    read("supabase/functions/shipping-refund-label/index.ts"),
    read("supabase/functions/_shared/shipping-labels.ts"),
  ]);

  assert.match(actions, /shipping-refund-label/);
  assert.match(actions, /shipping-prepare-order/);
  assert.match(actions, /replaces_label_id/);
  assert.match(actions, /existingReplacement/);
  assert.match(actions, /requireOperator/);
  assert.match(refund, /claim_easypost_label_refund/);
  assert.match(refund, /refund_reconciliation_required/);
  assert.match(refund, /retrieveShipment/);
  assert.match(refund, /refundShipment/);
  assert.match(refund, /finalize_easypost_label_refund/);
  assert.doesNotMatch(actions, /request_shipping_label_refund/);
  assert.match(safeLabel, /recoveryState:\s*row\.recovery_state/);
  assert.match(safeLabel, /lastErrorCode:\s*row\.last_error_code/);
  assert.doesNotMatch(safeLabel, /providerShipmentId/);
});

test("webhooks require EasyPost HMAC and persist only a bounded safe payload", async () => {
  const [webhook, drain, config, schedule] = await Promise.all([
    read("supabase/functions/easypost-webhook/index.ts"),
    read("supabase/functions/shipping-webhook-drain/index.ts"),
    read("supabase/config.toml"),
    read(
      "supabase/migrations/20260719041000_schedule_shipping_webhook_drain.sql",
    ),
  ]);

  assert.match(webhook, /validateEasyPostWebhook/);
  assert.match(webhook, /rawBody/);
  assert.match(webhook, /claim_shipping_webhook_event/);
  assert.match(webhook, /EdgeRuntime\.waitUntil/);
  assert.match(drain, /claim_shipping_webhook_event/);
  assert.match(drain, /complete_shipping_webhook_event/);
  assert.match(drain, /fail_shipping_webhook_event/);
  assert.match(config, /\[functions\.easypost-webhook\]\s*verify_jwt = false/);
  assert.match(
    config,
    /\[functions\.shipping-webhook-drain\]\s*verify_jwt = false/,
  );
  assert.doesNotMatch(webhook, /safe_payload:\s*(?:payload|event)\b/i);
  assert.match(schedule, /shipping_webhook_drain_auth_secret/);
  assert.match(schedule, /shipping-webhook-drain-1m/);
  assert.match(schedule, /Vault secrets are missing/);
  assert.match(schedule, /https:\/\/\[a-z0-9\]\{20\}/);
  assert.match(
    schedule,
    /REVOKE ALL ON FUNCTION public\.configure_shipping_webhook_drain_schedule/i,
  );
});

test("the production workflow prepares early, purchases after print, and gates packing", async () => {
  const [route, update, prepare] = await Promise.all([
    read("supabase/functions/route-fulfillment-order/index.ts"),
    read("supabase/functions/update-production-job/index.ts"),
    read("supabase/functions/shipping-prepare-order/index.ts"),
  ]);

  assert.match(route, /EASYPOST_AUTOMATION_ENABLED/);
  assert.match(route, /shipping-prepare-order/);
  assert.match(update, /existingJob\.provider === "onshore_manual"/);
  assert.match(update, /transition_easypost_production_job/);
  assert.match(update, /shipping-purchase-label/);
  assert.match(update, /nextStatus === "printed"/);
  assert.doesNotMatch(update, /\.select\("state, tracking_number"\)/);
  assert.match(update, /Tracking is managed by EasyPost/);
  assert.match(update, /sendOrderEmail[\s\S]*"order_shipped"/);
  assert.match(prepare, /fulfillmentStatusAfterSuccessfulRating/);

  const transitionIndex = update.indexOf(
    '"transition_easypost_production_job"',
  );
  const transitionReturnIndex = update.indexOf(
    "return new Response(",
    transitionIndex,
  );
  const laterGenericJobWriteIndex = update.indexOf(
    '.from("production_jobs")',
    transitionIndex,
  );
  assert.ok(
    transitionReturnIndex > transitionIndex &&
      transitionReturnIndex < laterGenericJobWriteIndex,
  );
});
