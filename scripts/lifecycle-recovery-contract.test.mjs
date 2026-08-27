import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildRecoveryCartItems,
  safeRecoveryAnalytics,
  validateRecoveryToken,
} from "../supabase/functions/_shared/lifecycle-recovery.ts";

const migrationPath = new URL("../supabase/migrations/20260827151509_add_lifecycle_recovery.sql", import.meta.url);
const edgePath = new URL("../supabase/functions/lifecycle-recovery/index.ts", import.meta.url);
const pagePath = new URL("../src/pages/Recovery.tsx", import.meta.url);
const savePath = new URL("../supabase/functions/save-design/index.ts", import.meta.url);
const checkoutPath = new URL("../supabase/functions/create-checkout/index.ts", import.meta.url);
const privacyPath = new URL("../src/pages/Privacy.tsx", import.meta.url);
const contractPath = new URL("../config/lifecycle-recovery-contract.json", import.meta.url);
const read = (url) => readFile(url, "utf8");

test("recovery contract remains a no-send extension of canonical lifecycle consent", async () => {
  const contract = JSON.parse(await read(contractPath));
  assert.equal(contract.extends, "config/lifecycle-email-contract.json@1.0.0");
  assert.equal(contract.providerMode, "disabled");
  assert.equal(contract.liveSendEnabled, false);
  assert.equal(contract.eligibility.requiresCanonicalSubscribedState, true);
  assert.equal(contract.eligibility.suppressionWins, true);
  assert.equal(contract.token.randomBytes, 32);
  assert.equal(contract.token.storedForm, "sha256_digest_only");
  assert.equal(contract.token.singleUse, true);
});

test("token parser rejects PII, paths, guessable IDs, and wrong entropy", () => {
  assert.equal(validateRecoveryToken("f".repeat(64)), "f".repeat(64));
  for (const hostile of ["customer@example.com", "550e8400-e29b-41d4-a716-446655440000", "../design/design-123", "a".repeat(63), "g".repeat(64)]) {
    assert.equal(validateRecoveryToken(hostile), null);
  }
});

test("database stores only token digests and revokes on every terminal condition", async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /gen_random_bytes\(32\)/);
  assert.match(sql, /encode\(digest\(v_token, 'sha256'\), 'hex'\)/);
  assert.doesNotMatch(sql, /raw_token\s+TEXT/i);
  for (const state of ["purchased", "suppressed", "expired", "deleted", "invalidated"]) assert.match(sql, new RegExp(`'${state}'`));
  assert.match(sql, /status = 'revoked', revoked_at/);
  assert.match(sql, /status = 'consumed', consumed_at/);
});

test("RLS, grants, and function access keep recovery tables server-only", async () => {
  const sql = await read(migrationPath);
  for (const table of ["lifecycle_recovery_intents", "lifecycle_recovery_tokens", "lifecycle_recovery_exclusions"]) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated`));
  }
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_lifecycle_recovery_state\(TEXT, BOOLEAN\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_lifecycle_recovery_state\(TEXT, BOOLEAN\) TO service_role/);
  for (const triggerFunction of [
    "lifecycle_recovery_design_revision",
    "lifecycle_recovery_design_cancel",
    "lifecycle_recovery_order_purchase_cancel",
    "lifecycle_recovery_suppression_cancel",
  ]) {
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${triggerFunction}\\(\\) FROM PUBLIC, anon, authenticated`),
    );
  }
});

test("saved-design revision, deletion, suppression, and purchase transitions stop recovery", async () => {
  const sql = await read(migrationPath);
  for (const marker of ["superseded_revision", "design_deleted", "subscriber_not_eligible", "order_purchased"]) assert.match(sql, new RegExp(marker));
  assert.match(sql, /AFTER UPDATE OF status ON public\.orders/);
  assert.match(sql, /AFTER UPDATE OF status ON public\.lifecycle_marketing_subscribers/);
});

test("employee, QA, fixture, invalid-cart, and uncertain-provider states fail closed", async () => {
  const sql = await read(migrationPath);
  for (const marker of ["'employee'", "'qa'", "'test_fixture'", "cart_not_eligible", "recovery_provider_state_uncertain"]) {
    assert.match(sql, new RegExp(marker));
  }
  assert.match(sql, /snapcase\\\.ai\|example\\\.invalid/);
  assert.match(sql, /status = 'uncertain'/);
});

test("intent and outbox registration is idempotent and bounded to one recovery operation", async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /idempotency_key TEXT NOT NULL UNIQUE/);
  assert.match(sql, /lifecycle_outbox_recovery_once_idx/);
  assert.match(sql, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
  assert.match(sql, /abandoned_design:' \|\| v_design\.id/);
  assert.match(sql, /abandoned_cart:' \|\| v_order\.id/);
});

test("save and checkout stage eligibility without inferring consent or failing checkout", async () => {
  const [save, checkout] = await Promise.all([read(savePath), read(checkoutPath)]);
  assert.match(save, /register_saved_design_recovery/);
  assert.doesNotMatch(save, /register_lifecycle_marketing_consent/);
  assert.match(checkout, /register_abandoned_cart_recovery/);
  assert.doesNotMatch(checkout, /Processing checkout for:/);
  assert.match(checkout, /Recovery eligibility could not be staged/);
});

test("server cart restoration rejects unsupported state and replaces stale prices", () => {
  const valid = buildRecoveryCartItems([{
    variantId: "galaxy-s24", edmTemplateId: 123, quantity: 1,
    designId: "safe-design-reference", designPreview: "https://example.invalid/private-preview",
    externalProductId: "685", price: 1,
  }]);
  assert.equal(valid?.repriced, true);
  assert.equal(valid?.items[0].unitPrice, 29.99);
  assert.equal(buildRecoveryCartItems([{ variantId: "unsupported" }]), null);
});

test("edge flow checks conflicting authenticated ownership before consumption", async () => {
  const edge = await read(edgePath);
  assert.match(edge, /recoveryAuthorizationNeedsUserVerification/);
  const conflict = edge.indexOf("inspected.ownerUserId !== authenticatedUserId");
  const consume = edge.indexOf("readState(true)");
  assert.ok(conflict > -1 && consume > conflict);
  assert.match(edge, /buildRecoveryCartItems/);
  assert.doesNotMatch(edge, /console\.(log|error|warn)/);
});

test("customer route strips the token and renders every material accessible state", async () => {
  const page = await read(pagePath);
  assert.match(page, /searchParams\.delete\("token"\)/);
  assert.match(page, /window\.history\.replaceState/);
  for (const state of ["ready", "repriced", "already_purchased", "already_used", "deleted", "expired", "revoked", "stale_revision", "unavailable_model", "invalid", "generic_failure"]) {
    assert.match(page, new RegExp(`${state}:`));
  }
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /role="status"/);
});

test("analytics and public privacy projections exclude identity and artwork", async () => {
  const [page, privacy] = await Promise.all([read(pagePath), read(privacyPath)]);
  const safe = safeRecoveryAnalytics({ flow: "abandoned_design", outcome: "ready" });
  assert.deepEqual(Object.keys(safe).sort(), ["flow", "outcome", "repriced"]);
  assert.doesNotMatch(JSON.stringify(safe), /email|artwork|preview|token|designId|orderId/i);
  assert.match(page, /recovery_view/);
  assert.match(page, /recovery_resume/);
  assert.match(privacy, /random\s+token/i);
  assert.match(privacy, /single-use/i);
});

test("repository artifacts contain no concrete recovery token, recipient, or artwork fixture", async () => {
  const sources = await Promise.all([read(migrationPath), read(edgePath), read(pagePath), read(contractPath)]);
  for (const source of sources) {
    assert.doesNotMatch(source, /[a-f0-9]{64}/i);
    assert.doesNotMatch(source, /[a-z0-9._%+-]+@(?!example\.invalid)[a-z0-9.-]+\.[a-z]{2,}/i);
    assert.doesNotMatch(source, /data:image\//i);
  }
});
