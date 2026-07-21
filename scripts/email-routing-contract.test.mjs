import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SNAPCASE_EMAILS as SITE_SNAPCASE_EMAILS } from "../src/lib/email-identities.ts";
import {
  OFFICIAL_SNAPCASE_EMAILS,
  SNAPCASE_EMAILS,
  resolveOfficialSnapcaseEmail,
  resolveSnapcaseRoleEmail,
} from "../supabase/functions/_shared/email-identities.ts";
import { parseSvixSignatures } from "../supabase/functions/_shared/svix.ts";
import {
  handleResendWebhookRequest,
  isNotificationSendTerminal,
  parseResendWebhookEvent,
  verifyResendWebhookSignature,
} from "../supabase/functions/_shared/resend-webhook.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webhookMigration = readFileSync(
  resolve(repositoryRoot, "supabase/migrations/20260721155000_harden_resend_webhook.sql"),
  "utf8",
);

const webhookSecret = `whsec_${Buffer.from("snapcase-webhook-test-secret").toString("base64")}`;
const webhookNowMs = Date.parse("2026-07-21T15:50:00.000Z");
const webhookTimestamp = String(Math.floor(webhookNowMs / 1000));

function createSignedWebhookRequest({
  body,
  svixId = "evt_test_123",
  timestamp = webhookTimestamp,
  secret = webhookSecret,
}) {
  const signingKey = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", signingKey)
    .update(`${svixId}.${timestamp}.${body}`)
    .digest("base64");

  return new Request("https://example.test/resend-webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": svixId,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
    body,
  });
}

test("official Snapcase email identities are complete and role-specific", () => {
  assert.deepEqual(OFFICIAL_SNAPCASE_EMAILS, [
    "hello@snapcase.ai",
    "partnerships@snapcase.ai",
    "support@snapcase.ai",
    "social@snapcase.ai",
  ]);
  assert.deepEqual(SITE_SNAPCASE_EMAILS, SNAPCASE_EMAILS);

  assert.equal(
    resolveOfficialSnapcaseEmail("  SUPPORT@SNAPCASE.AI ", SNAPCASE_EMAILS.hello, "EMAIL"),
    SNAPCASE_EMAILS.support,
  );
  assert.equal(
    resolveSnapcaseRoleEmail(undefined, SNAPCASE_EMAILS.hello, "RESEND_FROM_EMAIL"),
    SNAPCASE_EMAILS.hello,
  );
  assert.throws(
    () =>
      resolveSnapcaseRoleEmail(
        SNAPCASE_EMAILS.social,
        SNAPCASE_EMAILS.support,
        "SUPPORT_EMAIL",
      ),
    /SUPPORT_EMAIL must be support@snapcase\.ai/,
  );
  assert.throws(
    () =>
      resolveOfficialSnapcaseEmail(
        `legacy${"@"}snapcase.ai`,
        SNAPCASE_EMAILS.hello,
        "EMAIL",
      ),
    /must use an official Snapcase address/,
  );
});

test("tracked Snapcase email references use only official identities", () => {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  const officialEmails = new Set(OFFICIAL_SNAPCASE_EMAILS);
  const unexpectedReferences = [];

  for (const relativePath of trackedFiles) {
    const source = readFileSync(resolve(repositoryRoot, relativePath), "utf8");
    const matches = source.matchAll(/[A-Z0-9._%+-]+@snapcase\.ai/gi);

    for (const match of matches) {
      const normalized = match[0].toLowerCase();
      if (!officialEmails.has(normalized)) {
        unexpectedReferences.push(`${relativePath}: ${match[0]}`);
      }
    }
  }

  assert.deepEqual(unexpectedReferences, []);
});

test("Resend webhook signatures preserve the v1 prefix delimiter", () => {
  assert.deepEqual(parseSvixSignatures("v1,current-signature"), ["current-signature"]);
  assert.deepEqual(
    parseSvixSignatures("v1,old-signature v1,current-signature"),
    ["old-signature", "current-signature"],
  );
  assert.deepEqual(parseSvixSignatures("v2,ignored malformed"), []);
});

test("Resend webhook verification is signed, fresh, and fail closed", async () => {
  const body = JSON.stringify({ type: "email.sent" });
  const request = createSignedWebhookRequest({ body });
  const valid = await verifyResendWebhookSignature({
    secret: webhookSecret,
    svixId: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signatureHeader: request.headers.get("svix-signature"),
    rawBody: body,
    nowMs: webhookNowMs,
  });
  assert.equal(valid.ok, true);

  const missingSecret = await verifyResendWebhookSignature({
    secret: "",
    svixId: "evt_test_123",
    timestamp: webhookTimestamp,
    signatureHeader: request.headers.get("svix-signature"),
    rawBody: body,
    nowMs: webhookNowMs,
  });
  assert.deepEqual(missingSecret, { ok: false, reason: "missing_secret" });

  const stale = await verifyResendWebhookSignature({
    secret: webhookSecret,
    svixId: "evt_test_123",
    timestamp: String(Number(webhookTimestamp) - 301),
    signatureHeader: request.headers.get("svix-signature"),
    rawBody: body,
    nowMs: webhookNowMs,
  });
  assert.deepEqual(stale, { ok: false, reason: "stale_timestamp" });

  const tampered = await verifyResendWebhookSignature({
    secret: webhookSecret,
    svixId: "evt_test_123",
    timestamp: webhookTimestamp,
    signatureHeader: request.headers.get("svix-signature"),
    rawBody: `${body} `,
    nowMs: webhookNowMs,
  });
  assert.deepEqual(tampered, { ok: false, reason: "invalid_signature" });
});

test("Resend webhook payloads use the top-level event timestamp and bounded errors", () => {
  const parsed = parseResendWebhookEvent(
    {
      type: "email.bounced",
      created_at: "2026-07-21T15:49:59.000Z",
      data: {
        email_id: "email_test_123",
        bounce: { message: "permanent rejection" },
      },
    },
    "evt_test_123",
  );

  assert.deepEqual(parsed, {
    kind: "event",
    event: {
      svixId: "evt_test_123",
      providerMessageId: "email_test_123",
      eventType: "email.bounced",
      deliveryStatus: "bounced",
      eventCreatedAt: "2026-07-21T15:49:59.000Z",
      errorMessage: "permanent rejection",
    },
  });
});

test("Resend webhook handler rejects missing configuration and retries persistence failures", async () => {
  const body = JSON.stringify({
    type: "email.delivered",
    created_at: "2026-07-21T15:49:59.000Z",
    data: { email_id: "email_test_123" },
  });

  const missingSecret = await handleResendWebhookRequest(
    createSignedWebhookRequest({ body }),
    {
      webhookSecret: "",
      now: () => webhookNowMs,
      persistEvent: async () => "applied",
    },
  );
  assert.equal(missingSecret.status, 500);

  const persistenceFailure = await handleResendWebhookRequest(
    createSignedWebhookRequest({ body }),
    {
      webhookSecret,
      now: () => webhookNowMs,
      persistEvent: async () => {
        throw new Error("database unavailable");
      },
    },
  );
  assert.equal(persistenceFailure.status, 500);
});

test("Resend webhook replay IDs are delegated to durable idempotent persistence", async () => {
  const body = JSON.stringify({
    type: "email.delivered",
    created_at: "2026-07-21T15:49:59.000Z",
    data: { email_id: "email_test_123" },
  });
  const processed = new Set();
  const outcomes = [];
  const dependencies = {
    webhookSecret,
    now: () => webhookNowMs,
    persistEvent: async (event) => {
      const outcome = processed.has(event.svixId) ? "duplicate" : "applied";
      processed.add(event.svixId);
      outcomes.push(outcome);
      return outcome;
    },
  };

  const first = await handleResendWebhookRequest(createSignedWebhookRequest({ body }), dependencies);
  const replay = await handleResendWebhookRequest(createSignedWebhookRequest({ body }), dependencies);

  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.deepEqual(outcomes, ["applied", "duplicate"]);
});

test("accepted provider messages are terminal for duplicate-send prevention", () => {
  for (const status of ["sent", "delivered", "opened", "clicked", "bounced", "complained", "suppressed"]) {
    assert.equal(isNotificationSendTerminal(status), true, status);
  }
  assert.equal(isNotificationSendTerminal("failed", "email_test_123"), true);
  assert.equal(isNotificationSendTerminal("failed", null), false);
  assert.equal(isNotificationSendTerminal("pending", "email_test_123"), false);
});

test("Resend webhook persistence is atomic, replay-safe, ordered, and service-only", () => {
  assert.match(webhookMigration, /CREATE TABLE IF NOT EXISTS public\.resend_webhook_events/);
  assert.match(webhookMigration, /svix_id TEXT PRIMARY KEY/);
  assert.match(webhookMigration, /ON CONFLICT \(svix_id\) DO NOTHING/);
  assert.match(webhookMigration, /last_provider_event_at < p_event_created_at/);
  assert.match(webhookMigration, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(webhookMigration, /REVOKE ALL ON FUNCTION public\.apply_resend_webhook_event/);
  assert.match(webhookMigration, /GRANT EXECUTE ON FUNCTION public\.apply_resend_webhook_event[\s\S]*TO service_role/);
});
