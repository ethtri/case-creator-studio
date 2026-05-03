import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { type OrderEmailEvent, sendOrderEmail } from "../_shared/email.ts";

type PrintfulWebhookPayload = {
  type?: string;
  event?: string;
  created?: number;
  data?: Record<string, unknown>;
  order?: Record<string, unknown>;
  result?: Record<string, unknown>;
};

type TrackingDetails = {
  trackingNumber: string | null;
  trackingUrl: string | null;
  trackingCarrier: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
};

const SIGNATURE_HEADERS = [
  "x-printful-signature",
  "x-pf-signature",
];

function getSignatureHeader(req: Request): string | null {
  for (const headerName of SIGNATURE_HEADERS) {
    const value = req.headers.get(headerName);
    if (value) return value;
  }
  return null;
}

async function computeHmacSha256Hex(
  secret: string,
  payload: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function computeHmacSha256Base64(
  secret: string,
  payload: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function normalizeTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  return null;
}

function normalizeEventType(payload: PrintfulWebhookPayload): string {
  const raw = payload.type ?? payload.event ?? "";
  return raw.toLowerCase();
}

function extractStatus(payload: PrintfulWebhookPayload): string | null {
  const data = payload.data ?? payload.order ?? payload.result ?? {};
  const status = (data as any)?.status ??
    (data as any)?.order?.status ??
    (payload.order as any)?.status ??
    null;
  return typeof status === "string" ? status.toLowerCase() : null;
}

function extractOrderIdentifiers(
  payload: PrintfulWebhookPayload,
): { externalId: string | null; printfulOrderId: string | null } {
  const data = payload.data ?? payload.order ?? payload.result ?? {};
  const externalId = (data as any)?.external_id ??
    (data as any)?.order?.external_id ??
    (payload.order as any)?.external_id ??
    null;
  const orderId = (data as any)?.order_id ??
    (data as any)?.order?.id ??
    (data as any)?.id ??
    (payload.order as any)?.id ??
    null;

  return {
    externalId: externalId ? String(externalId) : null,
    printfulOrderId: orderId ? String(orderId) : null,
  };
}

function extractTrackingDetails(
  payload: PrintfulWebhookPayload,
): TrackingDetails {
  const data = payload.data ?? payload.order ?? payload.result ?? {};
  const trackingNumber = (data as any)?.tracking_number ??
    (data as any)?.trackingNumber ??
    (data as any)?.tracking?.number ??
    null;
  const trackingUrl = (data as any)?.tracking_url ??
    (data as any)?.trackingUrl ??
    (data as any)?.tracking?.url ??
    null;
  const trackingCarrier = (data as any)?.carrier ??
    (data as any)?.shipping_carrier ??
    (data as any)?.shipping_service ??
    (data as any)?.service ??
    (data as any)?.tracking?.carrier ??
    null;
  const shippedAt = normalizeTimestamp(
    (data as any)?.shipped_at ?? (data as any)?.ship_date ??
      (data as any)?.created,
  );
  const deliveredAt = normalizeTimestamp(
    (data as any)?.delivered_at ?? (data as any)?.delivered,
  );

  return {
    trackingNumber: trackingNumber ? String(trackingNumber) : null,
    trackingUrl: trackingUrl ? String(trackingUrl) : null,
    trackingCarrier: trackingCarrier ? String(trackingCarrier) : null,
    shippedAt,
    deliveredAt,
  };
}

function shouldUpdateStatus(
  currentStatus: string | null,
  nextStatus: string | null,
): boolean {
  if (!nextStatus) return false;
  if (!currentStatus) return true;
  if (currentStatus === "delivered") return nextStatus === "delivered";
  if (currentStatus === "canceled") return nextStatus === "canceled";
  if (currentStatus === "failed") return nextStatus === "failed";
  if (
    currentStatus === "shipped" &&
    (nextStatus === "processing" || nextStatus === "pending")
  ) {
    return false;
  }
  return true;
}

function mapEventToStatus(
  eventType: string,
  status: string | null,
  tracking: TrackingDetails,
): {
  nextStatus: string | null;
  emailEvent: OrderEmailEvent | null;
} {
  const hasTracking = Boolean(tracking.trackingNumber || tracking.trackingUrl);

  if (eventType.includes("delivered") || status === "delivered") {
    return { nextStatus: "delivered", emailEvent: "order_delivered" };
  }

  if (
    eventType.includes("shipped") ||
    (eventType.includes("shipment") && hasTracking) ||
    status === "fulfilled" ||
    status === "shipped"
  ) {
    return { nextStatus: "shipped", emailEvent: "order_shipped" };
  }

  if (
    eventType.includes("canceled") || eventType.includes("cancelled") ||
    status === "canceled"
  ) {
    return { nextStatus: "canceled", emailEvent: "order_canceled" };
  }

  if (eventType.includes("failed") || status === "failed") {
    return { nextStatus: "failed", emailEvent: "order_failed" };
  }

  if (
    status === "pending" || status === "processing" || status === "onhold" ||
    status === "hold" || status === "inprogress"
  ) {
    return { nextStatus: "processing", emailEvent: "order_processing" };
  }

  return { nextStatus: null, emailEvent: null };
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const webhookSecret = Deno.env.get("PRINTFUL_WEBHOOK_SECRET") ?? "";
  const signatureHeader = getSignatureHeader(req);

  if (webhookSecret) {
    if (!signatureHeader) {
      console.error("[PRINTFUL-WEBHOOK] Missing signature header");
      return new Response("Unauthorized", { status: 401 });
    }

    const expectedHex = await computeHmacSha256Hex(webhookSecret, rawBody);
    const expectedBase64 = await computeHmacSha256Base64(
      webhookSecret,
      rawBody,
    );
    const provided = signatureHeader.trim();

    if (provided !== expectedHex && provided !== expectedBase64) {
      console.error("[PRINTFUL-WEBHOOK] Signature mismatch");
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload: PrintfulWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    console.error("[PRINTFUL-WEBHOOK] Invalid JSON payload:", error);
    return new Response("Invalid payload", { status: 400 });
  }

  const { externalId, printfulOrderId } = extractOrderIdentifiers(payload);
  if (!externalId && !printfulOrderId) {
    console.warn("[PRINTFUL-WEBHOOK] Missing order identifiers");
    return new Response("OK", { status: 200 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[PRINTFUL-WEBHOOK] Missing Supabase configuration");
    return new Response("Not configured", { status: 500 });
  }

  const supabaseClient = createClient(supabaseUrl, serviceRoleKey);

  let order: any | null = null;
  if (externalId) {
    const { data } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("id", externalId)
      .maybeSingle();
    order = data ?? null;
  }

  if (!order && printfulOrderId) {
    const { data } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("printful_order_id", printfulOrderId)
      .maybeSingle();
    order = data ?? null;
  }

  if (!order) {
    console.warn("[PRINTFUL-WEBHOOK] Order not found for webhook payload");
    return new Response("OK", { status: 200 });
  }

  if (order.fulfillment_provider && order.fulfillment_provider !== "printful") {
    console.warn("[PRINTFUL-WEBHOOK] Ignoring non-Printful order:", order.id);
    return new Response("OK", { status: 200 });
  }

  const eventType = normalizeEventType(payload);
  const status = extractStatus(payload);
  const tracking = extractTrackingDetails(payload);
  const { nextStatus, emailEvent } = mapEventToStatus(
    eventType,
    status,
    tracking,
  );

  const updates: Record<string, unknown> = {};
  if (shouldUpdateStatus(order.printful_status ?? null, nextStatus)) {
    updates.printful_status = nextStatus;
    updates.fulfillment_provider = "printful";
    updates.fulfillment_status = nextStatus;
    updates.fulfillment_last_error = null;
  }

  if (printfulOrderId) {
    updates.fulfillment_order_id = printfulOrderId;
  }

  if (tracking.trackingNumber) {
    updates.tracking_number = tracking.trackingNumber;
  }
  if (tracking.trackingUrl) updates.tracking_url = tracking.trackingUrl;
  if (tracking.trackingCarrier) {
    updates.tracking_carrier = tracking.trackingCarrier;
  }

  const nowIso = new Date().toISOString();
  if (nextStatus === "shipped" && !order.shipped_at) {
    updates.shipped_at = tracking.shippedAt ?? nowIso;
  }
  if (nextStatus === "delivered" && !order.delivered_at) {
    updates.delivered_at = tracking.deliveredAt ?? nowIso;
  }

  let updatedOrder = order;
  if (Object.keys(updates).length > 0) {
    const { data } = await supabaseClient
      .from("orders")
      .update(updates)
      .eq("id", order.id)
      .select()
      .single();
    updatedOrder = data ?? order;
  }

  if (emailEvent) {
    try {
      await sendOrderEmail(supabaseClient, emailEvent, updatedOrder, {
        trackingNumber: tracking.trackingNumber,
        trackingUrl: tracking.trackingUrl,
        trackingCarrier: tracking.trackingCarrier,
      });
    } catch (error) {
      console.error("[PRINTFUL-WEBHOOK] Failed to send email:", error);
    }
  }

  return new Response("OK", { status: 200 });
});
