import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  EasyPostClient,
  extractEasyPostSafeError,
} from "../_shared/easypost.ts";
import {
  jsonServiceError,
  requireServiceRequest,
} from "../_shared/service-auth.ts";
import { toSafeShippingLabel } from "../_shared/shipping-labels.ts";

const TRUE_VALUES = new Set(["1", "true", "yes"]);
const requestSchema = z.object({
  labelId: z.string().uuid(),
  operatorEmail: z.string().email().max(320),
});

function firstRpcRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function resolveApiKey(): string {
  const mode = (Deno.env.get("EASYPOST_MODE") ?? "test").trim().toLowerCase();
  if (mode === "production") {
    if (
      !TRUE_VALUES.has(
        (Deno.env.get("EASYPOST_PRODUCTION_ENABLED") ?? "").toLowerCase(),
      )
    ) {
      throw new Error("EasyPost production mode is disabled");
    }
    return Deno.env.get("EASYPOST_API_KEY_PRODUCTION")?.trim() ?? "";
  }
  if (mode !== "test") throw new Error("Invalid EasyPost mode");
  return Deno.env.get("EASYPOST_API_KEY_TEST")?.trim() ?? "";
}

function readString(
  record: Record<string, unknown>,
  field: string,
): string | null {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

serve(async (req) => {
  if (req.method !== "POST") return jsonServiceError(405, "Method not allowed");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authError = requireServiceRequest(req, [
    serviceRoleKey,
    Deno.env.get("SHIPPING_INTERNAL_AUTH_SECRET"),
  ]);
  if (authError) return authError;
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonServiceError(500, "Server not configured");
  }

  let payload: z.infer<typeof requestSchema>;
  try {
    payload = requestSchema.parse(await req.json());
  } catch {
    return jsonServiceError(400, "Invalid request");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const claimToken = crypto.randomUUID();
  const { data: claimData, error: claimError } = await admin.rpc(
    "claim_easypost_label_refund",
    {
      p_label_id: payload.labelId,
      p_operator_email: payload.operatorEmail,
      p_claim_token: claimToken,
      p_lease_seconds: 300,
    },
  );
  const label = firstRpcRow(claimData) as Record<string, unknown> | null;
  if (claimError || !label) {
    return jsonServiceError(409, "Shipping label is not refundable");
  }
  if (label.state === "refunded") {
    return jsonResponse(200, {
      success: true,
      state: "refunded",
      label: toSafeShippingLabel(label),
    });
  }

  const shipmentId = readString(label, "provider_shipment_id");
  if (!shipmentId) {
    return jsonServiceError(500, "Persisted shipping state is incomplete");
  }

  let refundStatus = "unknown";
  let safeError: { code: string; message: string } | null = null;
  try {
    const apiKey = resolveApiKey();
    if (!apiKey) throw new Error("EasyPost is not configured");
    const client = new EasyPostClient({ apiKey });
    const requiresReconciliation =
      label.recovery_state === "refund_reconciliation_required";

    if (requiresReconciliation) {
      try {
        const shipment = await client.retrieveShipment(shipmentId);
        refundStatus = readString(
          shipment as unknown as Record<string, unknown>,
          "refund_status",
        ) ?? "unknown";
      } catch (retrievalError) {
        safeError = extractEasyPostSafeError(retrievalError);
        refundStatus = "unknown";
      }
    } else {
      try {
        const shipment = await client.refundShipment(shipmentId);
        refundStatus = readString(
          shipment as unknown as Record<string, unknown>,
          "refund_status",
        ) ?? "submitted";
      } catch (refundError) {
        safeError = extractEasyPostSafeError(refundError);
        try {
          const shipment = await client.retrieveShipment(shipmentId);
          refundStatus = readString(
            shipment as unknown as Record<string, unknown>,
            "refund_status",
          ) ?? "unknown";
        } catch {
          refundStatus = "unknown";
        }
      }
    }
  } catch (error) {
    safeError = extractEasyPostSafeError(error);
  }

  const acceptedStatus = ["submitted", "refunded", "rejected"].includes(
      refundStatus,
    )
    ? refundStatus
    : "unknown";
  if (acceptedStatus === "rejected" && !safeError) {
    safeError = {
      code: "EASYPOST_REFUND_REJECTED",
      message: "EasyPost rejected the label refund",
    };
  }
  const { data: finalizedData, error: finalizedError } = await admin.rpc(
    "finalize_easypost_label_refund",
    {
      p_label_id: payload.labelId,
      p_claim_token: claimToken,
      p_refund_status: acceptedStatus,
      p_error_code: safeError?.code ?? null,
      p_error_message: safeError?.message ?? null,
    },
  );
  const finalized = firstRpcRow(finalizedData) as
    | Record<string, unknown>
    | null;
  if (finalizedError || !finalized) {
    return jsonServiceError(500, "Unable to record refund result");
  }

  const httpStatus = acceptedStatus === "unknown"
    ? 503
    : acceptedStatus === "rejected"
    ? 409
    : 202;
  return jsonResponse(httpStatus, {
    success: acceptedStatus === "submitted" || acceptedStatus === "refunded",
    state: finalized.state,
    refundStatus: acceptedStatus,
    label: toSafeShippingLabel(finalized),
  });
});
