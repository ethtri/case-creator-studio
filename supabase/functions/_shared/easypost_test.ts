import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  EasyPostClient,
  type EasyPostRate,
  type EasyPostShipment,
  extractEasyPostSafeError,
  extractPdfLabelUrl,
  parseEasyPostParcelConfig,
  parseEasyPostRatePolicy,
  selectEasyPostRate,
  validateEasyPostWebhook,
} from "./easypost.ts";

const WEBHOOK_PATH = "/functions/v1/easypost-webhook";
const WEBHOOK_SECRET = "test-webhook-secret";
const WEBHOOK_BODY = '{"description":"tracker.updated"}';
const WEBHOOK_NOW = Date.UTC(2026, 6, 19, 12, 0, 0);
const WEBHOOK_TIMESTAMP = "Sun, 19 Jul 2026 12:00:00 +0000";

async function signatureFor(
  timestamp = WEBHOOK_TIMESTAMP,
  method = "POST",
  path = WEBHOOK_PATH,
  body = WEBHOOK_BODY,
) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(timestamp + method + path + body),
    ),
  );
  return "hmac-sha256-hex=" +
    Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
}

async function validWebhookHeaders(
  overrides: Record<string, string> = {},
): Promise<Record<string, string>> {
  return {
    "x-timestamp": WEBHOOK_TIMESTAMP,
    "x-path": WEBHOOK_PATH,
    "x-hmac-signature-v2": await signatureFor(),
    ...overrides,
  };
}

Deno.test("validateEasyPostWebhook accepts a valid HMAC v2 request", async () => {
  const result = await validateEasyPostWebhook({
    secret: WEBHOOK_SECRET,
    headers: await validWebhookHeaders(),
    method: "post",
    expectedPath: WEBHOOK_PATH,
    rawBody: WEBHOOK_BODY,
    toleranceMinutes: 5,
    now: WEBHOOK_NOW,
  });

  assert(result.valid);
  assertEquals(result.timestamp.toISOString(), "2026-07-19T12:00:00.000Z");
});

Deno.test("validateEasyPostWebhook rejects bad signatures and path mismatch", async () => {
  const invalidSignature = await validateEasyPostWebhook({
    secret: WEBHOOK_SECRET,
    headers: await validWebhookHeaders({
      "x-hmac-signature-v2": `hmac-sha256-hex=${"0".repeat(64)}`,
    }),
    method: "POST",
    expectedPath: WEBHOOK_PATH,
    rawBody: WEBHOOK_BODY,
    toleranceMinutes: 5,
    now: WEBHOOK_NOW,
  });
  assertEquals(invalidSignature, {
    valid: false,
    reason: "invalid_signature",
  });

  const uppercaseSignature = await validateEasyPostWebhook({
    secret: WEBHOOK_SECRET,
    headers: await validWebhookHeaders({
      "x-hmac-signature-v2": (await signatureFor()).toUpperCase(),
    }),
    method: "POST",
    expectedPath: WEBHOOK_PATH,
    rawBody: WEBHOOK_BODY,
    toleranceMinutes: 5,
    now: WEBHOOK_NOW,
  });
  assertEquals(uppercaseSignature, {
    valid: false,
    reason: "invalid_signature",
  });

  const pathMismatch = await validateEasyPostWebhook({
    secret: WEBHOOK_SECRET,
    headers: await validWebhookHeaders({ "x-path": "/wrong-path" }),
    method: "POST",
    expectedPath: WEBHOOK_PATH,
    rawBody: WEBHOOK_BODY,
    toleranceMinutes: 5,
    now: WEBHOOK_NOW,
  });
  assertEquals(pathMismatch, { valid: false, reason: "path_mismatch" });
});

Deno.test("validateEasyPostWebhook rejects replay and future timestamps", async () => {
  const replayTimestamp = "Sun, 19 Jul 2026 11:54:59 +0000";
  const replay = await validateEasyPostWebhook({
    secret: WEBHOOK_SECRET,
    headers: {
      "x-timestamp": replayTimestamp,
      "x-path": WEBHOOK_PATH,
      "x-hmac-signature-v2": await signatureFor(replayTimestamp),
    },
    method: "POST",
    expectedPath: WEBHOOK_PATH,
    rawBody: WEBHOOK_BODY,
    toleranceMinutes: 5,
    now: WEBHOOK_NOW,
  });
  assertEquals(replay, { valid: false, reason: "expired" });

  const futureTimestamp = "Sun, 19 Jul 2026 12:00:31 +0000";
  const future = await validateEasyPostWebhook({
    secret: WEBHOOK_SECRET,
    headers: {
      "x-timestamp": futureTimestamp,
      "x-path": WEBHOOK_PATH,
      "x-hmac-signature-v2": await signatureFor(futureTimestamp),
    },
    method: "POST",
    expectedPath: WEBHOOK_PATH,
    rawBody: WEBHOOK_BODY,
    toleranceMinutes: 5,
    now: WEBHOOK_NOW,
  });
  assertEquals(future, { valid: false, reason: "future_timestamp" });

  const invalidTolerance = await validateEasyPostWebhook({
    secret: WEBHOOK_SECRET,
    headers: await validWebhookHeaders(),
    method: "POST",
    expectedPath: WEBHOOK_PATH,
    rawBody: WEBHOOK_BODY,
    toleranceMinutes: 61,
    now: WEBHOOK_NOW,
  });
  assertEquals(invalidTolerance, {
    valid: false,
    reason: "invalid_configuration",
  });
});

Deno.test("parcel and rate policy configs are strict", () => {
  assertEquals(
    parseEasyPostParcelConfig(
      '{"length":8,"width":6,"height":2,"weight":12}',
    ),
    { length: 8, width: 6, height: 2, weight: 12 },
  );
  assertThrows(
    () =>
      parseEasyPostParcelConfig(
        '{"length":8,"width":6,"height":2,"weight":0}',
      ),
    Error,
    "parcel weight",
  );
  assertThrows(
    () =>
      parseEasyPostRatePolicy(
        '{"allowedCarriers":["USPS"],"allowedServices":["GroundAdvantage"],"maxRateCents":2000,"currency":"usd"}',
      ),
    Error,
    "uppercase",
  );
  assertEquals(
    parseEasyPostParcelConfig({
      length: "8",
      width: "6",
      height: "2",
      weight: "12.5",
    }),
    { length: 8, width: 6, height: 2, weight: 12.5 },
  );
  assertEquals(
    parseEasyPostRatePolicy({
      allowedCarriers: "USPS, UPS",
      allowedServices: "GroundAdvantage,Ground",
      maxRateCents: "2000",
      maxDeliveryDays: "7",
    }),
    {
      allowedCarriers: ["USPS", "UPS"],
      allowedServices: ["GroundAdvantage", "Ground"],
      maxRateCents: 2_000,
      maxDeliveryDays: 7,
      currency: "USD",
    },
  );
});

Deno.test("selectEasyPostRate applies policy and deterministic cheapest selection", () => {
  const policy = parseEasyPostRatePolicy(
    '{"allowedCarriers":["USPS"],"allowedServices":["GroundAdvantage","Priority"],"maxRateCents":1000,"maxDeliveryDays":5,"currency":"USD"}',
  );
  const rates: EasyPostRate[] = [
    {
      id: "rate_priority",
      carrier: "USPS",
      service: "Priority",
      rate: "8.20",
      currency: "USD",
      delivery_days: 2,
    },
    {
      id: "rate_ground",
      carrier: "USPS",
      service: "GroundAdvantage",
      rate: "5.40",
      currency: "USD",
      delivery_days: 4,
    },
    {
      id: "rate_slow",
      carrier: "USPS",
      service: "GroundAdvantage",
      rate: "4.10",
      currency: "USD",
      delivery_days: 8,
    },
    {
      id: "rate_ups",
      carrier: "UPS",
      service: "Ground",
      rate: "3.00",
      currency: "USD",
      delivery_days: 3,
    },
  ];

  assertEquals(selectEasyPostRate(rates, policy), {
    ...rates[1],
    amountCents: 540,
    deliveryDays: 4,
    eligibleRateCount: 2,
  });
  assertThrows(
    () =>
      selectEasyPostRate(
        [{ ...rates[0], rate: "10.01" }],
        { ...policy, maxRateCents: 1_000 },
      ),
    Error,
    "No shipping rate",
  );
});

Deno.test("safe provider errors redact credentials and PII", () => {
  const safe = extractEasyPostSafeError({
    error: {
      code: "ADDRESS.VERIFY.FAILURE",
      message:
        "email=buyer@example.com phone=415-555-0100 token=EZTKabc123 https://private.example/path",
    },
  });

  assertEquals(safe.code, "ADDRESS.VERIFY.FAILURE");
  assert(!safe.message.includes("buyer@example.com"));
  assert(!safe.message.includes("415-555-0100"));
  assert(!safe.message.includes("EZTKabc123"));
  assert(!safe.message.includes("private.example"));
  assert(safe.message.length <= 240);
});

Deno.test("extractPdfLabelUrl accepts only approved EasyPost 4x6 PDF URLs", () => {
  const shipment = {
    id: "shp_test",
    object: "Shipment",
    rates: [],
    postage_label: {
      label_size: "4x6",
      label_file_type: "application/pdf",
      label_pdf_url:
        "https://easypost-files.s3.us-west-2.amazonaws.com/files/postage_label/20260719/example.pdf",
    },
  } satisfies EasyPostShipment;

  assertEquals(
    extractPdfLabelUrl(shipment),
    shipment.postage_label.label_pdf_url,
  );
  assertThrows(
    () =>
      extractPdfLabelUrl({
        ...shipment,
        postage_label: {
          ...shipment.postage_label,
          label_pdf_url:
            "https://easypost-files.s3.us-west-2.amazonaws.com.evil.example/files/postage_label/example.pdf",
        },
      }),
    Error,
    "approved PDF location",
  );
});

Deno.test("downloadPdfLabel validates manual redirects and PDF content", async () => {
  const requests: string[] = [];
  const initial =
    "https://easypost-files.s3-us-west-2.amazonaws.com/files/postage_label/20260719/start.pdf";
  const final =
    "https://easypost-files.s3.us-west-2.amazonaws.com/files/postage_label/20260719/final.pdf";
  const mockFetch: typeof fetch = (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    requests.push(String(input));
    assertEquals(init?.redirect, "manual");
    if (String(input) === initial) {
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: final },
        }),
      );
    }
    return Promise.resolve(
      new Response(new TextEncoder().encode("%PDF-1.7\nmock"), {
        status: 200,
        headers: { "content-type": "application/pdf; charset=binary" },
      }),
    );
  };
  const client = new EasyPostClient({
    apiKey: "EZTK_test_key",
    fetch: mockFetch,
  });

  const bytes = await client.downloadPdfLabel(initial);
  assertEquals(new TextDecoder().decode(bytes), "%PDF-1.7\nmock");
  assertEquals(requests, [initial, final]);
});

Deno.test("downloadPdfLabel rejects SSRF redirects and invalid PDF bodies", async () => {
  const ssrfClient = new EasyPostClient({
    apiKey: "EZTK_test_key",
    fetch: () =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "https://127.0.0.1/internal.pdf" },
        }),
      ),
  });
  const validUrl =
    "https://easypost-files.s3.amazonaws.com/files/postage_label/example.pdf";
  await assertRejects(
    () => ssrfClient.downloadPdfLabel(validUrl),
    Error,
    "approved PDF location",
  );

  const invalidPdfClient = new EasyPostClient({
    apiKey: "EZTK_test_key",
    fetch: () =>
      Promise.resolve(
        new Response("<html>not a label</html>", {
          status: 200,
          headers: { "content-type": "application/pdf" },
        }),
      ),
  });
  await assertRejects(
    () => invalidPdfClient.downloadPdfLabel(validUrl),
    Error,
    "valid PDF",
  );

  const wrongContentTypeClient = new EasyPostClient({
    apiKey: "EZTK_test_key",
    fetch: () =>
      Promise.resolve(
        new Response("%PDF-1.7", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      ),
  });
  await assertRejects(
    () => wrongContentTypeClient.downloadPdfLabel(validUrl),
    Error,
    "not a PDF",
  );
});

Deno.test("EasyPostClient uses Basic auth and requests PDF 4x6 labels", async () => {
  const mockFetch: typeof fetch = (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    assertEquals(String(input), "https://api.easypost.com/v2/shipments");
    assertEquals(
      new Headers(init?.headers).get("authorization"),
      `Basic ${btoa("EZTK_test_key:")}`,
    );
    const body = JSON.parse(String(init?.body));
    assertEquals(body.shipment.options, {
      label_format: "PDF",
      label_size: "4x6",
    });
    return Promise.resolve(
      new Response(
        JSON.stringify({ id: "shp_test", object: "Shipment", rates: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  };
  const client = new EasyPostClient({
    apiKey: "EZTK_test_key",
    fetch: mockFetch,
  });

  const shipment = await client.createShipment({
    toAddressId: "adr_to",
    fromAddressId: "adr_from",
    parcel: { length: 8, width: 6, height: 2, weight: 12 },
  });
  assertEquals(shipment.id, "shp_test");
});

Deno.test("EasyPostClient strictly maps and normalizes verified addresses", async () => {
  const mockFetch: typeof fetch = (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    assertEquals(String(input), "https://api.easypost.com/v2/addresses");
    const body = JSON.parse(String(init?.body));
    assertEquals(body, {
      address: {
        name: "Case Customer",
        street1: "1 Main St",
        city: "Los Angeles",
        state: "CA",
        zip: "90001",
        country: "US",
        residential: true,
      },
      verify_strict: true,
    });
    return Promise.resolve(
      new Response(
        JSON.stringify({
          id: "adr_verified",
          object: "Address",
          name: "Case Customer",
          street1: "1 MAIN ST",
          street2: null,
          city: "LOS ANGELES",
          state: "CA",
          zip: "90001-1234",
          country: "US",
          residential: true,
          verifications: { delivery: { success: true } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  };
  const client = new EasyPostClient({
    apiKey: "EZTK_test_key",
    fetch: mockFetch,
  });

  const address = await client.createVerifiedAddress({
    name: "Case Customer",
    street1: "1 Main St",
    city: "Los Angeles",
    state: "CA",
    zip: "90001",
    country: "us",
    residential: true,
  });
  assertEquals(address.id, "adr_verified");
  assertEquals(address.street1, "1 MAIN ST");
  assertEquals(address.corrected, true);
});
