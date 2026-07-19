import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  createSupabaseEasyPostWebhookProcessor,
  EASYPOST_WEBHOOK_LEASE_SECONDS,
  executeClaimedEasyPostWebhookEvent,
  interpretShippingWebhookClaim,
  parseStoredSafeEasyPostEvent,
  toBoundedErrorCode,
} from "../_shared/easypost-webhook.ts";
import {
  jsonServiceError,
  requireServiceRequest,
} from "../_shared/service-auth.ts";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type JsonRecord = Record<string, unknown>;

function jsonResponse(status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function readLimit(req: Request): Promise<number> {
  const rawBody = await req.text();
  if (!rawBody.trim()) return DEFAULT_LIMIT;
  const payload = JSON.parse(rawBody);
  const rawLimit = payload && typeof payload === "object"
    ? (payload as JsonRecord).limit
    : null;
  const limit = typeof rawLimit === "number" ? rawLimit : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("Invalid limit");
  }
  return Math.min(limit, MAX_LIMIT);
}

serve(async (req) => {
  if (req.method !== "POST") return jsonServiceError(405, "Method not allowed");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authError = requireServiceRequest(req, [
    serviceRoleKey,
    Deno.env.get("SHIPPING_WEBHOOK_DRAIN_AUTH_SECRET"),
  ]);
  if (authError) return authError;
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonServiceError(500, "Server not configured");
  }

  let limit: number;
  try {
    limit = await readLimit(req);
  } catch {
    return jsonServiceError(400, "Invalid request");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const staleBefore = new Date().toISOString();
  const { data, error } = await admin
    .from("shipping_webhook_events")
    .select(
      "event_id, event_type, payload_sha256, safe_payload, status, lease_expires_at",
    )
    .eq("provider", "easypost")
    .or(
      `status.in.(received,failed),and(status.eq.processing,lease_expires_at.lt.${staleBefore})`,
    )
    .order("received_at", { ascending: true })
    .limit(limit);
  if (error || !Array.isArray(data)) {
    return jsonServiceError(503, "Drain unavailable");
  }

  const summary = {
    selected: data.length,
    claimed: 0,
    processed: 0,
    failed: 0,
    completedDuplicates: 0,
    activeDuplicates: 0,
  };
  const processor = createSupabaseEasyPostWebhookProcessor(admin);

  for (const row of data) {
    const eventId = typeof row.event_id === "string" ? row.event_id : "";
    const eventType = typeof row.event_type === "string" ? row.event_type : "";
    const payloadSha256 = typeof row.payload_sha256 === "string"
      ? row.payload_sha256
      : null;
    const claimToken = crypto.randomUUID();

    const { data: claimData, error: claimError } = await admin.rpc(
      "claim_shipping_webhook_event",
      {
        p_provider: "easypost",
        p_event_id: eventId,
        p_event_type: eventType,
        p_payload_sha256: payloadSha256,
        p_safe_payload: row.safe_payload,
        p_claim_token: claimToken,
        p_lease_seconds: EASYPOST_WEBHOOK_LEASE_SECONDS,
      },
    );
    if (claimError) {
      summary.failed += 1;
      continue;
    }

    let decision: ReturnType<typeof interpretShippingWebhookClaim>;
    try {
      decision = interpretShippingWebhookClaim(claimData);
    } catch {
      summary.failed += 1;
      continue;
    }
    if (decision.kind === "completed") {
      summary.completedDuplicates += 1;
      continue;
    }
    if (decision.kind === "active") {
      summary.activeDuplicates += 1;
      continue;
    }
    summary.claimed += 1;

    let event;
    try {
      event = parseStoredSafeEasyPostEvent(row.safe_payload);
    } catch (parseError) {
      const errorCode = toBoundedErrorCode(
        parseError,
        "INVALID_SAFE_PAYLOAD",
      );
      const { error: failError } = await admin.rpc(
        "fail_shipping_webhook_event",
        {
          p_event_record_id: decision.eventRecordId,
          p_claim_token: decision.leaseToken,
          p_error_code: errorCode,
          p_error_message: "Shipping webhook processing failed",
        },
      );
      summary.failed += 1;
      if (failError) {
        console.error(
          "[SHIPPING-WEBHOOK-DRAIN] Failure transition failed",
        );
      }
      continue;
    }

    const outcome = await executeClaimedEasyPostWebhookEvent(
      event,
      decision.leaseToken,
      {
        ...processor,
        async complete(_claimedEventId, leaseToken) {
          const { error } = await admin.rpc(
            "complete_shipping_webhook_event",
            {
              p_event_record_id: decision.eventRecordId,
              p_claim_token: leaseToken,
            },
          );
          if (error) throw new Error("Webhook completion failed");
        },
        async fail(_claimedEventId, leaseToken, errorCode) {
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
    if (outcome.ok) summary.processed += 1;
    else summary.failed += 1;
  }

  return jsonResponse(200, summary);
});
