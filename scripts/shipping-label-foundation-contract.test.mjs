import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260719020000_add_shipping_label_foundation.sql";

test("shipping label migration keeps artifacts private and duplicate-safe", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /'shipping-labels'[\s\S]*public[\s\S]*false/i);
  assert.match(sql, /allowed_mime_types[\s\S]*application\/pdf/i);
  assert.match(
    sql,
    /shipping_labels_one_active_per_job[\s\S]*WHERE state IN/i,
  );
  assert.match(
    sql,
    /shipping_webhook_events_provider_event_unique[\s\S]*UNIQUE \(provider, event_id\)/i,
  );
  assert.match(sql, /shipping_labels_purchased_artifact_check/i);
  assert.match(sql, /shipping_labels_easypost_purchase_check/i);
  assert.match(
    sql,
    /production_jobs\(id\) ON DELETE RESTRICT/i,
  );
  assert.match(sql, /prepare_manual_shipping_label/i);
  assert.match(
    sql,
    /complete_manual_shipping_label[\s\S]*FOR SHARE[\s\S]*v_job_status IN \('shipped', 'failed'\)/i,
  );
  assert.match(sql, /fail_manual_shipping_label/i);
  assert.match(sql, /authorize_shipping_label_print/i);
  assert.match(
    sql,
    /request_shipping_label_refund[\s\S]*print_accessed_at IS NOT NULL[\s\S]*v_job_status = 'shipped'/i,
  );
  assert.match(sql, /request_shipping_label_replacement/i);
  assert.match(
    sql,
    /register_shipping_webhook_event[\s\S]*ON CONFLICT \(provider, event_id\) DO NOTHING/i,
  );
  assert.match(sql, /sync_shipping_label_tracking_to_order/i);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(
    sql,
    /REVOKE ALL ON public\.shipping_labels FROM anon, authenticated/i,
  );
  assert.doesNotMatch(sql, /public\s*=\s*true/i);
});

test("operator endpoints use trusted auth and never expose permanent paths", async () => {
  const [
    actions,
    upload,
    helpers,
    operatorAuth,
    productionJobs,
    updateProductionJob,
  ] = await Promise.all([
    readFile("supabase/functions/shipping-label-actions/index.ts", "utf8"),
    readFile("supabase/functions/shipping-label-upload/index.ts", "utf8"),
    readFile("supabase/functions/_shared/shipping-labels.ts", "utf8"),
    readFile("supabase/functions/_shared/operator-auth.ts", "utf8"),
    readFile("supabase/functions/production-jobs/index.ts", "utf8"),
    readFile("supabase/functions/update-production-job/index.ts", "utf8"),
  ]);

  assert.match(actions, /createSignedUrl/);
  assert.match(actions, /requireOperator/);
  assert.match(actions, /authorize_shipping_label_print/);
  assert.match(actions, /request_shipping_label_refund/);
  assert.match(actions, /request_shipping_label_replacement/);
  assert.match(upload, /hasPdfMagic/);
  assert.match(upload, /requireOperator/);
  assert.match(upload, /prepare_manual_shipping_label/);
  assert.match(upload, /complete_manual_shipping_label/);
  assert.match(upload, /fail_manual_shipping_label/);
  assert.doesNotMatch(upload, /\.remove\(/);
  assert.doesNotMatch(helpers, /label_storage_path:\s*row\.label_storage_path/);
  assert.doesNotMatch(actions, /getPublicUrl/);
  assert.doesNotMatch(upload, /getPublicUrl/);
  assert.doesNotMatch(operatorAuth, /user_metadata/);
  assert.doesNotMatch(operatorAuth, /\.confirmed_at/);
  assert.match(productionJobs, /_shared\/operator-auth\.ts/);
  assert.match(updateProductionJob, /_shared\/operator-auth\.ts/);
  assert.doesNotMatch(productionJobs, /user_metadata/);
  assert.doesNotMatch(updateProductionJob, /user_metadata/);
});
