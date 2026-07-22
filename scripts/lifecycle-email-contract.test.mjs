import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  LIFECYCLE_CONSENT_COPY_VERSION,
  LIFECYCLE_FLOW_CLASSIFICATION,
  LIFECYCLE_PRIVACY_POLICY_VERSION,
  LifecycleProviderError,
  buildSafeSignupAnalytics,
  normalizeSubscriberEmail,
  processLifecycleOutboxClaim,
  validateSignupInput,
} from "../supabase/functions/_shared/lifecycle-marketing.ts";
import {
  parseLifecycleProviderEvent,
  verifyLifecycleWebhook,
} from "../supabase/functions/_shared/lifecycle-marketing-webhook.ts";
import {
  getMarketingPageLocation,
  getMarketingPagePath,
} from "../src/lib/marketing-routing.ts";

const validSignup = {
  action: "subscribe",
  campaign: "phase5_welcome",
  consentCopyVersion: LIFECYCLE_CONSENT_COPY_VERSION,
  consentGranted: true,
  email: "  Buyer@Example.com ",
  honeypot: "",
  placement: "homepage_email_card",
  policyVersion: LIFECYCLE_PRIVACY_POLICY_VERSION,
  requestId: "d9d7e1e2-c9b4-4cf4-ae30-6339d0b9a014",
  source: "website",
};

test("signup validation normalizes identity and pins consent versions", () => {
  assert.equal(normalizeSubscriberEmail(validSignup.email), "buyer@example.com");
  assert.deepEqual(validateSignupInput(validSignup), {
    ok: true,
    value: {
      campaign: "phase5_welcome",
      consentCopyVersion: LIFECYCLE_CONSENT_COPY_VERSION,
      email: "buyer@example.com",
      placement: "homepage_email_card",
      policyVersion: LIFECYCLE_PRIVACY_POLICY_VERSION,
      requestId: validSignup.requestId,
      source: "website",
    },
  });
  assert.deepEqual(
    validateSignupInput({ ...validSignup, consentGranted: false }),
    { ok: false, code: "invalid_request" },
  );
  assert.deepEqual(
    validateSignupInput({ ...validSignup, consentCopyVersion: "old_copy" }),
    { ok: false, code: "stale_consent" },
  );
  assert.deepEqual(
    validateSignupInput({ ...validSignup, honeypot: "https://spam.invalid" }),
    { ok: false, code: "bot_rejected" },
  );
  assert.deepEqual(
    validateSignupInput({ ...validSignup, campaign: "free text is rejected" }),
    { ok: false, code: "invalid_request" },
  );
});

test("flow classifications keep marketing separate from transaction delivery", () => {
  assert.equal(LIFECYCLE_FLOW_CLASSIFICATION.welcome, "marketing");
  assert.equal(LIFECYCLE_FLOW_CLASSIFICATION.abandoned_cart, "marketing");
  assert.equal(LIFECYCLE_FLOW_CLASSIFICATION.post_purchase_receipt, "transactional");
  assert.equal(LIFECYCLE_FLOW_CLASSIFICATION.post_purchase_promotion, "marketing");
});

test("email_signup analytics contains only safe campaign context", () => {
  assert.deepEqual(
    buildSafeSignupAnalytics({
      campaign: "phase5_welcome",
      placement: "homepage_email_card",
      source: "website",
    }),
    {
      campaign: "phase5_welcome",
      placement: "homepage_email_card",
      source: "website",
    },
  );
  assert.deepEqual(
    Object.keys(buildSafeSignupAnalytics({
      campaign: null,
      placement: "homepage_email_card",
      source: "website",
    })).sort(),
    ["placement", "source"],
  );
});

test("preference tokens are removed from analytics path and location", () => {
  const search = "?token=opaque-preference-token&utm_campaign=phase5";
  assert.equal(
    getMarketingPagePath("/email-preferences", search),
    "/email-preferences",
  );
  assert.equal(
    getMarketingPageLocation(
      "https://www.snapcase.ai",
      "/email-preferences",
      search,
    ),
    "https://www.snapcase.ai/email-preferences?utm_campaign=phase5",
  );
});

const claim = {
  attempts: 1,
  id: "outbox-1",
  maxAttempts: 3,
  operation: "welcome",
  subscriberId: "subscriber-1",
};

const runOutbox = async (overrides = {}) => {
  const calls = [];
  const result = await processLifecycleOutboxClaim(claim, {
    complete: async () => calls.push("complete"),
    deliver: async () => calls.push("deliver"),
    dryRun: false,
    isEligible: async () => true,
    mark: async (_claim, status, reason, retryAfter) =>
      calls.push(`${status}:${reason}:${retryAfter ?? ""}`),
    providerMode: "configured",
    ...overrides,
  });
  return { calls, result };
};

test("outbox is dry-run capable and fails closed when provider is disabled", async () => {
  const preview = await runOutbox({ dryRun: true });
  assert.equal(preview.result, "dry_run");
  assert.deepEqual(preview.calls, ["dry_run:preview_only:"]);

  const disabled = await runOutbox({ providerMode: "disabled" });
  assert.equal(disabled.result, "disabled");
  assert.deepEqual(disabled.calls, ["disabled:provider_not_configured:"]);

  const suppressed = await runOutbox({ isEligible: async () => false });
  assert.equal(suppressed.result, "suppressed");
  assert.equal(suppressed.calls.includes("deliver"), false);
});

test("outbox never retries an ambiguous mutation", async () => {
  const ambiguous = await runOutbox({
    deliver: async () => {
      throw new LifecycleProviderError("timeout_after_write", "ambiguous");
    },
  });
  assert.equal(ambiguous.result, "uncertain");
  assert.deepEqual(ambiguous.calls, ["uncertain:timeout_after_write:"]);

  const retryable = await runOutbox({
    deliver: async () => {
      throw new LifecycleProviderError("rate_limited", "retryable", 429);
    },
  });
  assert.equal(retryable.result, "retry");
  assert.deepEqual(retryable.calls, ["retry:rate_limited:60"]);

  const permanent = await runOutbox({
    deliver: async () => {
      throw new LifecycleProviderError("invalid_contact", "permanent", 400);
    },
  });
  assert.equal(permanent.result, "dead_letter");
});

test("provider webhook authentication is fresh, signed, and replay-keyed", async () => {
  const secret = "test-secret-not-a-production-credential";
  const eventId = "event_fixture_001";
  const timestamp = "1784746800";
  const rawBody = JSON.stringify({
    contact_id: "provider_contact_fixture",
    occurred_at: "2026-07-22T19:00:00.000Z",
    type: "email.complained",
  });
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBytes = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${eventId}.${timestamp}.${rawBody}`),
  ));
  const signature = [...signatureBytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

  assert.equal(await verifyLifecycleWebhook({
    eventId,
    nowMs: Number(timestamp) * 1000,
    rawBody,
    secret,
    signature,
    timestamp,
  }), true);
  assert.equal(await verifyLifecycleWebhook({
    eventId,
    nowMs: (Number(timestamp) + 301) * 1000,
    rawBody,
    secret,
    signature,
    timestamp,
  }), false);
  assert.deepEqual(parseLifecycleProviderEvent(rawBody, eventId), {
    eventId,
    eventType: "email.complained",
    occurredAt: "2026-07-22T19:00:00.000Z",
    providerContactId: "provider_contact_fixture",
  });
});

test("repository contract encodes neutral public responses, immediate suppression, and one-click unsubscribe", async () => {
  const [component, page, client, migration, preferenceFunction, outboxFunction, config, fixture] =
    await Promise.all([
      readFile(new URL("../src/components/LifecycleSignup.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/pages/EmailPreferences.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/lib/lifecycle-email.ts", import.meta.url), "utf8"),
      readFile(new URL("../supabase/migrations/20260722120000_add_lifecycle_marketing_foundation.sql", import.meta.url), "utf8"),
      readFile(new URL("../supabase/functions/lifecycle-email-preferences/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../supabase/functions/lifecycle-email-outbox/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../config/lifecycle-email-contract.json", import.meta.url), "utf8"),
      readFile(new URL("./fixtures/lifecycle-welcome-dry-run.json", import.meta.url), "utf8"),
    ]);

  assert.match(component, /useState\(false\)/);
  assert.match(component, /data-marketing-consent="unchecked-by-default"/);
  assert.match(component, /optional and is not required to design, order, or receive order updates/i);
  assert.match(component, /preference_preserved/);
  assert.doesNotMatch(component, /defaultChecked/);
  assert.match(component, /result === "subscribed"/);
  assert.doesNotMatch(
    component.match(/trackMarketingEvent\("email_signup", \{[\s\S]*?\}\);/)?.[0] ?? "",
    /\b(email|token|subscriber)\s*:/i,
  );
  assert.match(page, /data-email-preferences="no-login"/);
  assert.match(page, /searchParams\.delete\("token"\)/);
  assert.match(page, /history\.replaceState/);
  assert.match(page, /cannot be reversed by an automated signup/i);
  assert.match(client, /action: "unsubscribe"/);
  assert.match(migration, /status = 'suppressed', revoked_at = now\(\), suppression_reason = 'unsubscribe'/);
  assert.match(migration, /blocked_resubscribe/);
  assert.match(migration, /lifecycle_consent_replay_mismatch/);
  assert.match(migration, /ELSE 'already_subscribed'/);
  assert.match(migration, /pg_advisory_xact_lock\([\s\S]*p_event_id/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(migration, /REVOKE ALL ON TABLE public\.lifecycle_marketing_subscribers FROM anon, authenticated/);
  assert.match(preferenceFunction, /List-Unsubscribe/);
  assert.match(preferenceFunction, /One-Click/);
  assert.match(preferenceFunction, /preference_preserved/);
  assert.match(outboxFunction, /provider_not_configured/);
  assert.match(outboxFunction, /preview_only_no_provider_mutation/);
  assert.equal(JSON.parse(config).provider.liveSendEnabled, false);
  const welcomeFixture = JSON.parse(fixture);
  assert.equal(welcomeFixture.destination, "redacted@example.invalid");
  assert.equal(welcomeFixture.from, "Snapcase Team <hello@snapcase.ai>");
  assert.equal(welcomeFixture.replyTo, "support@snapcase.ai");
  assert.equal(welcomeFixture.commercialAddress, "1401 21st Street, Sacramento, CA 95811");
  assert.deepEqual(new Set(Object.values(welcomeFixture.checks)), new Set([
    "pass",
    "pass_https_token_placeholder",
    "pass_no_direct_identifier_in_output",
    "pass_no_unapproved_claims_present",
    "pass_reserved_invalid_domain",
    "pass_required_before_claim",
    "pass_synthetic_eligibility_contract",
  ]));
});
