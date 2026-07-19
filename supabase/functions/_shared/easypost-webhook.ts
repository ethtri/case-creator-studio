import { sendOrderEmail } from "./email.ts";

export const EASYPOST_WEBHOOK_PATH = "/functions/v1/easypost-webhook";
export const EASYPOST_WEBHOOK_MAX_BODY_BYTES = 262_144;
export const EASYPOST_WEBHOOK_LEASE_SECONDS = 120;

const MAX_EVENT_ID_LENGTH = 200;
const MAX_EVENT_TYPE_LENGTH = 200;
const MAX_TRACKING_FIELD_LENGTH = 120;
const MAX_TRACKING_URL_LENGTH = 1000;
const SAFE_ERROR_CODE_LENGTH = 120;

const TRACKER_EVENT_TYPES = new Set([
  "tracker.created",
  "tracker.updated",
]);

const TRACKER_STATUSES = new Set([
  "unknown",
  "pre_transit",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "available_for_pickup",
  "return_to_sender",
  "failure",
  "canceled",
  "cancelled",
  "error",
]);

type JsonRecord = Record<string, unknown>;

export type SafeEasyPostWebhookEvent = {
  eventId: string;
  eventType: "tracker.created" | "tracker.updated";
  trackerId: string | null;
  shipmentId: string | null;
  carrier: string | null;
  trackingCode: string | null;
  trackerStatus: string;
  trackingUrl: string | null;
};

export type SafeEventParseResult =
  | { kind: "event"; event: SafeEasyPostWebhookEvent }
  | { kind: "ignored"; eventType: string | null };

export type ShippingWebhookClaimDecision =
  | { kind: "claimed"; eventRecordId: string; leaseToken: string }
  | { kind: "completed" }
  | { kind: "active" };

export type ShippingLabelMatch = {
  id: string;
  productionJobId: string;
  orderId: string;
};

export type DeliveredOrder = Record<string, unknown> & {
  id: string;
  customer_email?: string | null;
};

export type EasyPostWebhookProcessorDependencies = {
  findShippingLabel(
    event: SafeEasyPostWebhookEvent,
  ): Promise<ShippingLabelMatch | null>;
  updateTracking(
    label: ShippingLabelMatch,
    event: SafeEasyPostWebhookEvent,
  ): Promise<void>;
  markOrderDelivered(
    orderId: string,
    deliveredAt: string,
  ): Promise<DeliveredOrder>;
  sendDeliveredEmail(
    order: DeliveredOrder,
    event: SafeEasyPostWebhookEvent,
  ): Promise<{ sent: boolean; skipped: boolean }>;
  now?: () => Date;
};

export type ClaimedEventDependencies =
  & EasyPostWebhookProcessorDependencies
  & {
    complete(eventId: string, leaseToken: string): Promise<void>;
    fail(
      eventId: string,
      leaseToken: string,
      errorCode: string,
    ): Promise<void>;
  };

export type ProcessedEventResult =
  | "ignored"
  | "tracking_updated"
  | "delivered";

export type ClaimedEventResult =
  | { ok: true; result: ProcessedEventResult }
  | { ok: false; errorCode: string };

export class ShippingWebhookProcessingError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "ShippingWebhookProcessingError";
    this.code = toBoundedErrorCode(code);
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return null;
  if (/[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

function providerId(
  value: unknown,
  prefix: "evt" | "trk" | "shp",
  maxLength: number,
): string | null {
  const normalized = boundedText(value, maxLength);
  if (!normalized) return null;
  return new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(normalized)
    ? normalized
    : null;
}

function trackingCode(value: unknown): string | null {
  const normalized = boundedText(value, MAX_TRACKING_FIELD_LENGTH);
  if (!normalized) return null;
  return /^[A-Za-z0-9][A-Za-z0-9 -]*$/.test(normalized) ? normalized : null;
}

function safeTrackingUrl(value: unknown): string | null {
  const normalized = boundedText(value, MAX_TRACKING_URL_LENGTH);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function trackerResult(payload: JsonRecord): JsonRecord | null {
  const result = isRecord(payload.result) ? payload.result : null;
  if (!result) return null;
  if (isRecord(result.tracker)) return result.tracker;
  return result;
}

export function parseSafeEasyPostWebhookEvent(
  payload: unknown,
): SafeEventParseResult {
  if (!isRecord(payload)) {
    throw new ShippingWebhookProcessingError("INVALID_EVENT_PAYLOAD");
  }

  const rawEventType = boundedText(
    payload.description,
    MAX_EVENT_TYPE_LENGTH,
  )?.toLowerCase() ?? null;
  if (
    !rawEventType ||
    !TRACKER_EVENT_TYPES.has(rawEventType)
  ) {
    return { kind: "ignored", eventType: rawEventType };
  }

  const eventId = providerId(payload.id, "evt", MAX_EVENT_ID_LENGTH);
  const result = isRecord(payload.result) ? payload.result : null;
  const tracker = trackerResult(payload);
  if (!eventId || !result || !tracker) {
    throw new ShippingWebhookProcessingError("INVALID_TRACKER_EVENT");
  }

  const trackerId = providerId(tracker.id, "trk", MAX_TRACKING_FIELD_LENGTH);
  const shipmentId = providerId(
    tracker.shipment_id ?? (result.object === "Shipment" ? result.id : null),
    "shp",
    MAX_TRACKING_FIELD_LENGTH,
  );
  const normalizedStatus = boundedText(
    tracker.status,
    MAX_TRACKING_FIELD_LENGTH,
  )?.toLowerCase() ?? "unknown";
  const safeStatus = TRACKER_STATUSES.has(normalizedStatus)
    ? normalizedStatus
    : "unknown";
  const safeCode = trackingCode(tracker.tracking_code);

  if (!trackerId && !shipmentId) {
    throw new ShippingWebhookProcessingError(
      "TRACKER_IDENTIFIER_MISSING",
    );
  }

  return {
    kind: "event",
    event: {
      eventId,
      eventType: rawEventType as SafeEasyPostWebhookEvent["eventType"],
      trackerId,
      shipmentId,
      carrier: boundedText(tracker.carrier, MAX_TRACKING_FIELD_LENGTH),
      trackingCode: safeCode,
      trackerStatus: safeStatus,
      trackingUrl: safeTrackingUrl(
        tracker.public_url ?? result.public_url,
      ),
    },
  };
}

export function parseStoredSafeEasyPostEvent(
  value: unknown,
): SafeEasyPostWebhookEvent {
  if (!isRecord(value)) {
    throw new ShippingWebhookProcessingError("INVALID_SAFE_PAYLOAD");
  }

  const eventId = providerId(value.eventId, "evt", MAX_EVENT_ID_LENGTH);
  const eventType = boundedText(value.eventType, MAX_EVENT_TYPE_LENGTH)
    ?.toLowerCase();
  const trackerId = value.trackerId === null
    ? null
    : providerId(value.trackerId, "trk", MAX_TRACKING_FIELD_LENGTH);
  const shipmentId = value.shipmentId === null
    ? null
    : providerId(value.shipmentId, "shp", MAX_TRACKING_FIELD_LENGTH);
  const status = boundedText(value.trackerStatus, MAX_TRACKING_FIELD_LENGTH)
    ?.toLowerCase();

  if (
    !eventId ||
    !eventType ||
    !TRACKER_EVENT_TYPES.has(eventType) ||
    (!trackerId && !shipmentId) ||
    !status ||
    !TRACKER_STATUSES.has(status)
  ) {
    throw new ShippingWebhookProcessingError("INVALID_SAFE_PAYLOAD");
  }

  return {
    eventId,
    eventType: eventType as SafeEasyPostWebhookEvent["eventType"],
    trackerId,
    shipmentId,
    carrier: null,
    trackingCode: null,
    trackerStatus: status,
    trackingUrl: null,
  };
}

export function toStoredSafeEasyPostEvent(
  event: SafeEasyPostWebhookEvent,
): Record<string, string | null> {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    trackerId: event.trackerId,
    shipmentId: event.shipmentId,
    trackerStatus: event.trackerStatus,
    shipmentStatus: null,
  };
}

export function interpretShippingWebhookClaim(
  value: unknown,
): ShippingWebhookClaimDecision {
  const row = Array.isArray(value) ? value[0] : value;
  if (!isRecord(row)) {
    throw new ShippingWebhookProcessingError("INVALID_CLAIM_RESPONSE");
  }

  const rawDecision = boundedText(
    row.claimResult ?? row.claim_status ?? row.decision ?? row.outcome ??
      row.status,
    50,
  )?.toLowerCase();
  const event = isRecord(row.event) ? row.event : null;
  const leaseToken = boundedText(
    event?.lease_token ?? row.lease_token ?? row.leaseToken,
    200,
  );
  const eventRecordId = boundedText(
    event?.id ?? row.event_record_id ?? row.eventRecordId,
    100,
  );

  if (
    rawDecision === "claimed" ||
    rawDecision === "reclaimed" ||
    row.claimed === true
  ) {
    if (!leaseToken || !eventRecordId) {
      throw new ShippingWebhookProcessingError("INVALID_CLAIM_RESPONSE");
    }
    return { kind: "claimed", eventRecordId, leaseToken };
  }
  if (
    rawDecision === "completed" ||
    rawDecision === "processed" ||
    rawDecision === "duplicate_completed" ||
    rawDecision === "completed_duplicate"
  ) {
    return { kind: "completed" };
  }
  if (
    rawDecision === "active" ||
    rawDecision === "processing" ||
    rawDecision === "duplicate_active" ||
    rawDecision === "active_duplicate"
  ) {
    return { kind: "active" };
  }

  throw new ShippingWebhookProcessingError("INVALID_CLAIM_RESPONSE");
}

export function toBoundedErrorCode(
  error: unknown,
  fallback = "WEBHOOK_PROCESSING_FAILED",
): string {
  const candidate = error instanceof ShippingWebhookProcessingError
    ? error.code
    : typeof error === "string"
    ? error
    : fallback;
  const normalized = candidate
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, SAFE_ERROR_CODE_LENGTH);
  return normalized || fallback;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function validateEasyPostWebhookEnvelope(
  req: Request,
  now = new Date(),
  toleranceMinutes = 5,
): string | null {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return "INVALID_WEBHOOK_PATH";
  }
  if (url.pathname !== EASYPOST_WEBHOOK_PATH) {
    return "INVALID_WEBHOOK_PATH";
  }

  const signedPath = req.headers.get("x-path")?.trim() ?? "";
  if (signedPath !== EASYPOST_WEBHOOK_PATH) {
    return "INVALID_SIGNED_PATH";
  }
  const signature = req.headers.get("x-hmac-signature-v2")?.trim() ?? "";
  if (!/^hmac-sha256-hex=[a-fA-F0-9]{64}$/.test(signature)) {
    return "INVALID_WEBHOOK_SIGNATURE";
  }

  const rawTimestamp = req.headers.get("x-timestamp")?.trim() ?? "";
  const timestampMs = Date.parse(rawTimestamp);
  if (!Number.isFinite(timestampMs)) return "INVALID_WEBHOOK_TIMESTAMP";
  const ageMs = now.getTime() - timestampMs;
  if (
    ageMs > toleranceMinutes * 60_000 ||
    ageMs < -30_000
  ) {
    return "STALE_WEBHOOK_TIMESTAMP";
  }
  return null;
}

export async function processEasyPostWebhookEvent(
  event: SafeEasyPostWebhookEvent,
  dependencies: EasyPostWebhookProcessorDependencies,
): Promise<ProcessedEventResult> {
  const label = await dependencies.findShippingLabel(event);
  if (!label) return "ignored";

  await dependencies.updateTracking(label, event);
  if (event.trackerStatus !== "delivered") {
    return "tracking_updated";
  }

  const deliveredAt = (dependencies.now?.() ?? new Date()).toISOString();
  const order = await dependencies.markOrderDelivered(
    label.orderId,
    deliveredAt,
  );
  const emailResult = await dependencies.sendDeliveredEmail(order, event);
  if (!emailResult.sent && !emailResult.skipped) {
    throw new ShippingWebhookProcessingError("DELIVERED_EMAIL_FAILED");
  }
  return "delivered";
}

export async function executeClaimedEasyPostWebhookEvent(
  event: SafeEasyPostWebhookEvent,
  leaseToken: string,
  dependencies: ClaimedEventDependencies,
): Promise<ClaimedEventResult> {
  try {
    const result = await processEasyPostWebhookEvent(event, dependencies);
    await dependencies.complete(event.eventId, leaseToken);
    return { ok: true, result };
  } catch (error) {
    const errorCode = toBoundedErrorCode(error);
    try {
      await dependencies.fail(event.eventId, leaseToken, errorCode);
    } catch {
      return { ok: false, errorCode: "WEBHOOK_FAIL_TRANSITION_FAILED" };
    }
    return { ok: false, errorCode };
  }
}

function firstRow(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) {
    return isRecord(value[0]) ? value[0] : null;
  }
  return isRecord(value) ? value : null;
}

async function findLabelBy(
  admin: any,
  column: string,
  value: string | null,
): Promise<JsonRecord | null> {
  if (!value) return null;
  const { data, error } = await admin
    .from("shipping_labels")
    .select("id, production_job_id")
    .eq("provider", "easypost")
    .in("state", ["purchased", "refund_pending"])
    .eq(column, value)
    .maybeSingle();
  if (error) {
    throw new ShippingWebhookProcessingError("LABEL_LOOKUP_FAILED");
  }
  return firstRow(data);
}

export function createSupabaseEasyPostWebhookProcessor(
  admin: any,
  emailSender: typeof sendOrderEmail = sendOrderEmail,
): EasyPostWebhookProcessorDependencies {
  return {
    async findShippingLabel(event) {
      const label = await findLabelBy(
        admin,
        "provider_tracker_id",
        event.trackerId,
      ) ??
        await findLabelBy(
          admin,
          "provider_shipment_id",
          event.shipmentId,
        ) ??
        await findLabelBy(
          admin,
          "tracking_number",
          event.trackingCode,
        );
      if (!label) return null;

      const labelId = boundedText(label.id, 100);
      const productionJobId = boundedText(label.production_job_id, 100);
      if (!labelId || !productionJobId) {
        throw new ShippingWebhookProcessingError("INVALID_LABEL_RECORD");
      }
      const { data: job, error: jobError } = await admin
        .from("production_jobs")
        .select("order_id")
        .eq("id", productionJobId)
        .single();
      const jobRow = firstRow(job);
      const orderId = boundedText(jobRow?.order_id, 100);
      if (jobError || !orderId) {
        throw new ShippingWebhookProcessingError("JOB_LOOKUP_FAILED");
      }
      return { id: labelId, productionJobId, orderId };
    },

    async updateTracking(label, event) {
      const updates: Record<string, string | null> = {
        tracking_status: event.trackerStatus,
      };
      if (event.trackerId) {
        updates.provider_tracker_id = event.trackerId;
      }
      if (event.carrier) updates.carrier = event.carrier;
      if (event.trackingCode) updates.tracking_number = event.trackingCode;
      if (event.trackingUrl) updates.tracking_url = event.trackingUrl;
      const { error } = await admin
        .from("shipping_labels")
        .update(updates)
        .eq("id", label.id);
      if (error) {
        throw new ShippingWebhookProcessingError("TRACKING_UPDATE_FAILED");
      }
    },

    async markOrderDelivered(orderId, deliveredAt) {
      const { data, error } = await admin
        .from("orders")
        .update({
          fulfillment_status: "delivered",
          delivered_at: deliveredAt,
        })
        .eq("id", orderId)
        .select("*")
        .single();
      const order = firstRow(data);
      if (error || !order || typeof order.id !== "string") {
        throw new ShippingWebhookProcessingError(
          "DELIVERED_ORDER_UPDATE_FAILED",
        );
      }
      return order as DeliveredOrder;
    },

    async sendDeliveredEmail(order, event) {
      return await emailSender(admin, "order_delivered", order as any, {
        trackingNumber: event.trackingCode,
        trackingUrl: event.trackingUrl,
        trackingCarrier: event.carrier,
      });
    },
  };
}
