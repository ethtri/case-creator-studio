import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  executeClaimedEasyPostWebhookEvent,
  interpretShippingWebhookClaim,
  parseSafeEasyPostWebhookEvent,
  processEasyPostWebhookEvent,
  type SafeEasyPostWebhookEvent,
  ShippingWebhookProcessingError,
  toBoundedErrorCode,
  toStoredSafeEasyPostEvent,
  validateEasyPostWebhookEnvelope,
} from "./easypost-webhook.ts";

const baseEvent: SafeEasyPostWebhookEvent = {
  eventId: "evt_123",
  eventType: "tracker.updated",
  trackerId: "trk_123",
  shipmentId: "shp_123",
  carrier: "USPS",
  trackingCode: "9400111899223856928499",
  trackerStatus: "in_transit",
  trackingUrl: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400",
};

Deno.test("EasyPost payload minimization excludes recipient and address data", () => {
  const parsed = parseSafeEasyPostWebhookEvent({
    id: "evt_123",
    description: "tracker.updated",
    result: {
      id: "trk_123",
      object: "Tracker",
      shipment_id: "shp_123",
      carrier: "USPS",
      tracking_code: "9400111899223856928499",
      status: "in_transit",
      public_url: "https://track.example.test/9400",
      name: "Private Recipient",
      email: "private@example.test",
      address: { street1: "123 Private Street" },
    },
  });

  assertEquals(parsed.kind, "event");
  if (parsed.kind !== "event") return;
  assertEquals(parsed.event, {
    ...baseEvent,
    trackingUrl: "https://track.example.test/9400",
  });
  assertFalse("address" in parsed.event);
  assertFalse("email" in parsed.event);
  assertFalse("name" in parsed.event);
});

Deno.test("EasyPost tracker statuses are normalized to a safe allowlist", () => {
  const statuses = [
    "pre_transit",
    "in_transit",
    "out_for_delivery",
    "delivered",
    "available_for_pickup",
    "return_to_sender",
    "failure",
    "cancelled",
    "error",
  ];
  for (const status of statuses) {
    const parsed = parseSafeEasyPostWebhookEvent({
      id: "evt_123",
      description: "tracker.updated",
      result: {
        id: "trk_123",
        tracking_code: "9400",
        status,
      },
    });
    assertEquals(parsed.kind, "event");
    if (parsed.kind === "event") {
      assertEquals(parsed.event.trackerStatus, status);
    }
  }

  const unknown = parseSafeEasyPostWebhookEvent({
    id: "evt_123",
    description: "tracker.updated",
    result: {
      id: "trk_123",
      tracking_code: "9400",
      status: "unexpected-provider-value",
    },
  });
  assertEquals(unknown.kind, "event");
  if (unknown.kind === "event") {
    assertEquals(unknown.event.trackerStatus, "unknown");
  }
});

Deno.test("non-tracker events are ignored without retaining their payload", () => {
  assertEquals(
    parseSafeEasyPostWebhookEvent({
      id: "evt_123",
      description: "shipment.purchased",
      result: {
        to_address: { email: "private@example.test" },
      },
    }),
    { kind: "ignored", eventType: "shipment.purchased" },
  );
});

Deno.test("stored safe events retain only replay-required identifiers and statuses", () => {
  assertEquals(toStoredSafeEasyPostEvent(baseEvent), {
    eventId: "evt_123",
    eventType: "tracker.updated",
    trackerId: "trk_123",
    shipmentId: "shp_123",
    carrier: "USPS",
    trackingCode: "9400111899223856928499",
    trackerStatus: "in_transit",
    trackingUrl: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400",
    shipmentStatus: null,
  });
});

Deno.test("claim decisions distinguish claimed and duplicate deliveries", () => {
  assertEquals(
    interpretShippingWebhookClaim({
      claimResult: "claimed",
      leaseToken: "lease-123",
      event: { id: "event-record-123" },
    }),
    {
      kind: "claimed",
      eventRecordId: "event-record-123",
      leaseToken: "lease-123",
    },
  );
  assertEquals(
    interpretShippingWebhookClaim({
      claimResult: "claimed",
      event: {
        id: "event-record-456",
        lease_token: "lease-456",
      },
    }),
    {
      kind: "claimed",
      eventRecordId: "event-record-456",
      leaseToken: "lease-456",
    },
  );
  assertEquals(
    interpretShippingWebhookClaim({ claim_status: "processed" }),
    { kind: "completed" },
  );
  assertEquals(
    interpretShippingWebhookClaim({ claim_status: "processing" }),
    { kind: "active" },
  );
});

Deno.test("bounded errors never return provider or recipient detail", () => {
  assertEquals(
    toBoundedErrorCode(
      new ShippingWebhookProcessingError("label lookup failed"),
    ),
    "LABEL_LOOKUP_FAILED",
  );
  const bounded = toBoundedErrorCode(
    "private@example.test 123 Private Street ".repeat(20),
  );
  assert(bounded.length <= 120);
  assertFalse(bounded.includes("@"));
  assertFalse(bounded.includes("."));
  assertFalse(bounded.includes(" "));
});

Deno.test("webhook envelope requires the exact route and HMAC header", () => {
  const headers = {
    "x-hmac-signature": `hmac-sha256-hex=${"a".repeat(64)}`,
  };
  assertEquals(
    validateEasyPostWebhookEnvelope(
      new Request(
        "https://example.test/functions/v1/easypost-webhook",
        { method: "POST", headers },
      ),
    ),
    null,
  );
  assertEquals(
    validateEasyPostWebhookEnvelope(
      new Request(
        "https://example.test/easypost-webhook",
        { method: "POST", headers },
      ),
    ),
    null,
  );
  assertEquals(
    validateEasyPostWebhookEnvelope(
      new Request(
        "https://example.test/functions/v1/other",
        { method: "POST", headers },
      ),
    ),
    "INVALID_WEBHOOK_PATH",
  );
  assertEquals(
    validateEasyPostWebhookEnvelope(
      new Request(
        "https://example.test/functions/v1/easypost-webhook",
        {
          method: "POST",
          headers: {},
        },
      ),
    ),
    "INVALID_WEBHOOK_SIGNATURE",
  );
});

Deno.test("delivered tracking updates the order and sends one ledger-backed email", async () => {
  const calls: string[] = [];
  const delivered = { ...baseEvent, trackerStatus: "delivered" };
  const result = await processEasyPostWebhookEvent(delivered, {
    async findShippingLabel() {
      calls.push("find");
      return {
        id: "label-1",
        productionJobId: "job-1",
        orderId: "order-1",
      };
    },
    async updateTracking() {
      calls.push("tracking");
    },
    async markOrderDelivered(orderId, deliveredAt) {
      calls.push(`delivered:${orderId}:${deliveredAt}`);
      return { id: orderId, customer_email: "customer@example.test" };
    },
    async sendDeliveredEmail() {
      calls.push("email");
      return { sent: true, skipped: false };
    },
    now: () => new Date("2026-07-18T12:00:00Z"),
  });

  assertEquals(result, "delivered");
  assertEquals(calls, [
    "find",
    "tracking",
    "delivered:order-1:2026-07-18T12:00:00.000Z",
    "email",
  ]);
});

Deno.test("non-delivered tracking does not send delivered email", async () => {
  let emailCalled = false;
  const result = await processEasyPostWebhookEvent(baseEvent, {
    async findShippingLabel() {
      return {
        id: "label-1",
        productionJobId: "job-1",
        orderId: "order-1",
      };
    },
    async updateTracking() {},
    async markOrderDelivered() {
      throw new Error("not expected");
    },
    async sendDeliveredEmail() {
      emailCalled = true;
      return { sent: true, skipped: false };
    },
  });
  assertEquals(result, "tracking_updated");
  assertFalse(emailCalled);
});

Deno.test("claimed processing completes success and fails with bounded codes", async () => {
  const transitions: string[] = [];
  const successful = await executeClaimedEasyPostWebhookEvent(
    baseEvent,
    "lease-1",
    {
      async findShippingLabel() {
        return null;
      },
      async updateTracking() {},
      async markOrderDelivered() {
        throw new Error("not expected");
      },
      async sendDeliveredEmail() {
        throw new Error("not expected");
      },
      async complete(eventId, leaseToken) {
        transitions.push(`complete:${eventId}:${leaseToken}`);
      },
      async fail() {
        throw new Error("not expected");
      },
    },
  );
  assertEquals(successful, { ok: true, result: "ignored" });
  assertEquals(transitions, ["complete:evt_123:lease-1"]);

  const failed = await executeClaimedEasyPostWebhookEvent(
    baseEvent,
    "lease-2",
    {
      async findShippingLabel() {
        throw new ShippingWebhookProcessingError("label lookup failed");
      },
      async updateTracking() {},
      async markOrderDelivered() {
        throw new Error("not expected");
      },
      async sendDeliveredEmail() {
        throw new Error("not expected");
      },
      async complete() {
        throw new Error("not expected");
      },
      async fail(eventId, leaseToken, errorCode) {
        transitions.push(`fail:${eventId}:${leaseToken}:${errorCode}`);
      },
    },
  );
  assertEquals(failed, { ok: false, errorCode: "LABEL_LOOKUP_FAILED" });
  assertEquals(
    transitions.at(-1),
    "fail:evt_123:lease-2:LABEL_LOOKUP_FAILED",
  );
});
