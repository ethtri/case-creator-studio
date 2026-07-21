import { parseSvixSignatures } from "./svix.ts";

export const RESEND_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export const RESEND_DELIVERY_STATUS_BY_EVENT = {
  "email.sent": "sent",
  "email.delivery_delayed": "delivery_delayed",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.failed": "failed",
  "email.bounced": "bounced",
  "email.suppressed": "suppressed",
  "email.complained": "complained",
} as const;

export type ResendDeliveryEventType =
  keyof typeof RESEND_DELIVERY_STATUS_BY_EVENT;
export type ResendDeliveryStatus =
  (typeof RESEND_DELIVERY_STATUS_BY_EVENT)[ResendDeliveryEventType];

export type ResendWebhookEvent = {
  svixId: string;
  providerMessageId: string;
  eventType: ResendDeliveryEventType;
  deliveryStatus: ResendDeliveryStatus;
  eventCreatedAt: string;
  errorMessage: string | null;
};

export type ResendWebhookPersistenceOutcome =
  | "applied"
  | "duplicate"
  | "out_of_order"
  | "unmatched";

type VerificationFailureReason =
  | "missing_secret"
  | "invalid_secret"
  | "missing_headers"
  | "invalid_timestamp"
  | "stale_timestamp"
  | "invalid_signature";

export type ResendWebhookVerification =
  | { ok: true; svixId: string; timestampSeconds: number }
  | { ok: false; reason: VerificationFailureReason };

type ResendWebhookPayload = {
  type?: unknown;
  created_at?: unknown;
  data?: Record<string, unknown>;
};

export type ResendWebhookDependencies = {
  webhookSecret: string | null | undefined;
  now?: () => number;
  persistEvent: (
    event: ResendWebhookEvent,
  ) => Promise<ResendWebhookPersistenceOutcome>;
};

function decodeBase64(value: string): Uint8Array | null {
  try {
    const decoded = atob(value);
    return new Uint8Array(
      [...decoded].map((character) => character.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}

function decodeWebhookSecret(secret: string): Uint8Array | null {
  const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  return encoded ? decodeBase64(encoded) : null;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function signatureMatches(
  secret: Uint8Array,
  signedPayload: string,
  signature: string,
): Promise<boolean> {
  const signatureBytes = decodeBase64(signature);
  if (!signatureBytes) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  return crypto.subtle.verify(
    "HMAC",
    key,
    toArrayBuffer(signatureBytes),
    toArrayBuffer(new TextEncoder().encode(signedPayload)),
  );
}

export async function verifyResendWebhookSignature(input: {
  secret: string | null | undefined;
  svixId: string | null;
  timestamp: string | null;
  signatureHeader: string | null;
  rawBody: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): Promise<ResendWebhookVerification> {
  const secret = input.secret?.trim() ?? "";
  if (!secret) return { ok: false, reason: "missing_secret" };

  const secretBytes = decodeWebhookSecret(secret);
  if (!secretBytes) return { ok: false, reason: "invalid_secret" };

  if (!input.svixId || !input.timestamp || !input.signatureHeader) {
    return { ok: false, reason: "missing_headers" };
  }

  if (!/^\d+$/.test(input.timestamp)) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const timestampSeconds = Number(input.timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const toleranceSeconds = input.toleranceSeconds ??
    RESEND_WEBHOOK_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const signedPayload = `${input.svixId}.${input.timestamp}.${input.rawBody}`;
  const signatures = parseSvixSignatures(input.signatureHeader);
  for (const signature of signatures) {
    if (await signatureMatches(secretBytes, signedPayload, signature)) {
      return { ok: true, svixId: input.svixId, timestampSeconds };
    }
  }

  return { ok: false, reason: "invalid_signature" };
}

function boundedString(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maximumLength) : null;
}

function extractErrorMessage(data: Record<string, unknown>): string | null {
  const bounce = typeof data.bounce === "object" && data.bounce
    ? data.bounce
    : null;
  const complaint = typeof data.complaint === "object" && data.complaint
    ? data.complaint
    : null;
  const candidates = [
    data.error,
    data.reason,
    data.bounced_reason,
    data.complaint_reason,
    bounce && "message" in bounce ? bounce.message : null,
    complaint && "message" in complaint ? complaint.message : null,
  ];

  for (const candidate of candidates) {
    const message = boundedString(candidate, 1000);
    if (message) return message;
  }

  return null;
}

export function parseResendWebhookEvent(
  payload: ResendWebhookPayload,
  svixId: string,
): { kind: "event"; event: ResendWebhookEvent } | { kind: "ignore" } | {
  kind: "invalid";
} {
  const eventType = boundedString(payload.type, 100);
  if (!eventType || !(eventType in RESEND_DELIVERY_STATUS_BY_EVENT)) {
    return { kind: "ignore" };
  }

  const data = payload.data ?? {};
  const providerMessageId = boundedString(data.email_id ?? data.id, 255);
  const createdAt = boundedString(payload.created_at, 100);
  if (!providerMessageId || !createdAt) return { kind: "invalid" };

  const eventCreatedAt = new Date(createdAt);
  if (Number.isNaN(eventCreatedAt.getTime())) return { kind: "invalid" };

  const typedEvent = eventType as ResendDeliveryEventType;
  return {
    kind: "event",
    event: {
      svixId,
      providerMessageId,
      eventType: typedEvent,
      deliveryStatus: RESEND_DELIVERY_STATUS_BY_EVENT[typedEvent],
      eventCreatedAt: eventCreatedAt.toISOString(),
      errorMessage: extractErrorMessage(data),
    },
  };
}

export function isNotificationSendTerminal(
  status: string | null | undefined,
  providerMessageId?: string | null,
): boolean {
  if (!status) return false;
  if (
    [
      "sent",
      "delivered",
      "opened",
      "clicked",
      "bounced",
      "complained",
      "suppressed",
    ].includes(status)
  ) {
    return true;
  }

  return status === "failed" && Boolean(providerMessageId);
}

export async function handleResendWebhookRequest(
  request: Request,
  dependencies: ResendWebhookDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await request.text();
  const verification = await verifyResendWebhookSignature({
    secret: dependencies.webhookSecret,
    svixId: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signatureHeader: request.headers.get("svix-signature"),
    rawBody,
    nowMs: dependencies.now?.(),
  });

  if (!verification.ok) {
    if (
      verification.reason === "missing_secret" ||
      verification.reason === "invalid_secret"
    ) {
      console.error("[RESEND-WEBHOOK] Signing secret is missing or invalid");
      return new Response("Not configured", { status: 500 });
    }

    console.error(`[RESEND-WEBHOOK] Rejected request: ${verification.reason}`);
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ResendWebhookPayload;
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  const parsed = parseResendWebhookEvent(payload, verification.svixId);
  if (parsed.kind === "ignore") return new Response("OK", { status: 200 });
  if (parsed.kind === "invalid") {
    return new Response("Invalid payload", { status: 400 });
  }

  try {
    await dependencies.persistEvent(parsed.event);
  } catch (error) {
    console.error("[RESEND-WEBHOOK] Failed to persist event", error);
    return new Response("Persistence failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
