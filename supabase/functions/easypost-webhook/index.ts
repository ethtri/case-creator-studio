import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { validateEasyPostWebhook } from "../_shared/easypost.ts";
import {
  createSupabaseEasyPostWebhookProcessor,
  EASYPOST_WEBHOOK_LEASE_SECONDS,
  EASYPOST_WEBHOOK_MAX_BODY_BYTES,
  EASYPOST_WEBHOOK_PATH,
  executeClaimedEasyPostWebhookEvent,
  interpretShippingWebhookClaim,
  parseSafeEasyPostWebhookEvent,
  readBoundedRequestBytes,
  sha256Hex,
  toBoundedErrorCode,
  toStoredSafeEasyPostEvent,
  validateEasyPostWebhookEnvelope,
} from "../_shared/easypost-webhook.ts";

declare const EdgeRuntime:
  | { waitUntil(promise: Promise<unknown>): void }
  | undefined;

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function schedule(promise: Promise<unknown>): void {
  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(promise);
    return;
  }
  promise.catch(() => undefined);
}

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const envelopeError = validateEasyPostWebhookEnvelope(req);
  if (envelopeError) {
    return jsonResponse(401, { error: "Invalid webhook" });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > EASYPOST_WEBHOOK_MAX_BODY_BYTES
  ) {
    return jsonResponse(413, { error: "Payload too large" });
  }

  let rawBodyBytes: Uint8Array | null;
  try {
    rawBodyBytes = await readBoundedRequestBytes(req);
  } catch {
    return jsonResponse(400, { error: "Invalid payload" });
  }
  if (!rawBodyBytes) {
    return jsonResponse(413, { error: "Payload too large" });
  }

  let rawBody: string;
  try {
    rawBody = new TextDecoder("utf-8", { fatal: true }).decode(rawBodyBytes);
  } catch {
    return jsonResponse(400, { error: "Invalid payload" });
  }

  const webhookSecret = Deno.env.get("EASYPOST_WEBHOOK_SECRET")?.trim() ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse(503, { error: "Webhook unavailable" });
  }

  try {
    const validation = await validateEasyPostWebhook({
      secret: webhookSecret,
      headers: req.headers,
      rawBody: rawBodyBytes,
    });
    if (!validation.valid) {
      return jsonResponse(401, { error: "Invalid webhook" });
    }
  } catch {
    return jsonResponse(401, { error: "Invalid webhook" });
  }

  let parsed: ReturnType<typeof parseSafeEasyPostWebhookEvent>;
  try {
    parsed = parseSafeEasyPostWebhookEvent(JSON.parse(rawBody));
  } catch {
    return jsonResponse(400, { error: "Invalid payload" });
  }
  if (parsed.kind === "ignored") {
    return jsonResponse(200, { received: true });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const payloadSha256 = await sha256Hex(rawBodyBytes);
  const claimToken = crypto.randomUUID();
  const { data, error } = await admin.rpc(
    "claim_shipping_webhook_event",
    {
      p_provider: "easypost",
      p_event_id: parsed.event.eventId,
      p_event_type: parsed.event.eventType,
      p_payload_sha256: payloadSha256,
      p_safe_payload: toStoredSafeEasyPostEvent(parsed.event),
      p_claim_token: claimToken,
      p_lease_seconds: EASYPOST_WEBHOOK_LEASE_SECONDS,
    },
  );
  if (error) {
    return jsonResponse(503, { error: "Webhook unavailable" });
  }

  let decision: ReturnType<typeof interpretShippingWebhookClaim>;
  try {
    decision = interpretShippingWebhookClaim(data);
  } catch {
    return jsonResponse(503, { error: "Webhook unavailable" });
  }
  if (decision.kind === "completed") {
    return jsonResponse(200, { received: true });
  }
  if (decision.kind === "active") {
    return jsonResponse(202, { received: true });
  }

  const processor = createSupabaseEasyPostWebhookProcessor(admin);
  schedule((async () => {
    const outcome = await executeClaimedEasyPostWebhookEvent(
      parsed.event,
      decision.leaseToken,
      {
        ...processor,
        async complete(_eventId, leaseToken) {
          const { error } = await admin.rpc(
            "complete_shipping_webhook_event",
            {
              p_event_record_id: decision.eventRecordId,
              p_claim_token: leaseToken,
            },
          );
          if (error) throw new Error("Webhook completion failed");
        },
        async fail(_eventId, leaseToken, errorCode) {
          const { error } = await admin.rpc(
            "fail_shipping_webhook_event",
            {
              p_event_record_id: decision.eventRecordId,
              p_claim_token: leaseToken,
              p_error_code: toBoundedErrorCode(errorCode),
              p_error_message: "Shipping webhook processing failed",
            },
          );
          if (error) throw new Error("Webhook failure transition failed");
        },
      },
    );
    if (!outcome.ok) {
      console.error("[EASYPOST-WEBHOOK] Processing failed:", outcome.errorCode);
    }
  })());

  return jsonResponse(202, { received: true });
});
