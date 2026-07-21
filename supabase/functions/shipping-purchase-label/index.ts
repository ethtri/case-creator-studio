import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  EasyPostClient,
  type EasyPostShipment,
  extractEasyPostSafeError,
  extractPdfLabelUrl,
} from "../_shared/easypost.ts";
import {
  jsonServiceError,
  requireServiceRequest,
} from "../_shared/service-auth.ts";
import {
  isShippingLabelFormat,
  SHIPPING_LABEL_BUCKET,
  toSafeShippingLabel,
} from "../_shared/shipping-labels.ts";

const TRUE_VALUES = new Set(["1", "true", "yes"]);
const requestSchema = z.object({ jobId: z.string().uuid() });

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

function hasPurchasedPostage(shipment: EasyPostShipment): boolean {
  return Boolean(shipment.postage_label && shipment.tracking_code);
}

function readString(
  record: Record<string, unknown>,
  field: string,
): string | null {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function markReconciliation(
  admin: unknown,
  labelId: string,
  claimToken: string,
  code: string,
  message: string,
): Promise<void> {
  const rpcClient = admin as {
    rpc: (
      name: string,
      parameters: Record<string, unknown>,
    ) => PromiseLike<unknown>;
  };
  await rpcClient.rpc("mark_easypost_purchase_reconciliation", {
    p_label_id: labelId,
    p_claim_token: claimToken,
    p_error_code: code,
    p_error_message: message,
  });
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
  const { data: existingLabel, error: existingLabelError } = await admin
    .from("shipping_labels")
    .select("*")
    .eq("production_job_id", payload.jobId)
    .eq("provider", "easypost")
    .in("state", [
      "rated",
      "purchasing",
      "purchase_reconciliation",
      "purchased",
    ])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingLabelError || !existingLabel) {
    return jsonServiceError(409, "No approved EasyPost rate is available");
  }
  if (existingLabel.state === "purchased") {
    return jsonResponse(200, {
      success: true,
      state: "purchased",
      label: toSafeShippingLabel(existingLabel),
    });
  }

  const claimToken = crypto.randomUUID();
  const { data: claimData, error: claimError } = await admin.rpc(
    "claim_easypost_label_purchase",
    {
      p_production_job_id: payload.jobId,
      p_claim_token: claimToken,
      p_lease_seconds: 300,
      p_reconciliation_result: null,
    },
  );
  const label = firstRpcRow(claimData) as Record<string, unknown> | null;
  if (claimError || !label) {
    return jsonServiceError(409, "Label purchase was not accepted");
  }
  const labelId = readString(label, "id");
  const shipmentId = readString(label, "provider_shipment_id");
  const rateId = readString(label, "provider_rate_id");
  const labelFormat = readString(label, "label_format");
  if (
    !labelId || !shipmentId || !rateId ||
    !isShippingLabelFormat(labelFormat)
  ) {
    return jsonServiceError(500, "Persisted shipping state is incomplete");
  }

  try {
    const apiKey = resolveApiKey();
    if (!apiKey) throw new Error("EasyPost is not configured");
    const client = new EasyPostClient({ apiKey });

    let shipment = await client.retrieveShipment(shipmentId);
    if (
      hasPurchasedPostage(shipment) &&
      label.state === "purchase_reconciliation"
    ) {
      const { data: reconciledData, error: reconciledError } = await admin.rpc(
        "claim_easypost_label_purchase",
        {
          p_production_job_id: payload.jobId,
          p_claim_token: claimToken,
          p_lease_seconds: 300,
          p_reconciliation_result: "purchased",
        },
      );
      const reconciled = firstRpcRow(reconciledData) as
        | Record<string, unknown>
        | null;
      if (
        reconciledError ||
        reconciled?.state !== "purchase_reconciliation"
      ) {
        return jsonResponse(503, {
          success: false,
          state: "purchase_reconciliation",
          code: "purchase_reconciliation_incomplete",
        });
      }
    }
    if (
      !hasPurchasedPostage(shipment) &&
      label.state === "purchase_reconciliation"
    ) {
      const { data: reconciledData, error: reconciledError } = await admin.rpc(
        "claim_easypost_label_purchase",
        {
          p_production_job_id: payload.jobId,
          p_claim_token: claimToken,
          p_lease_seconds: 300,
          p_reconciliation_result: "not_purchased",
        },
      );
      const reconciled = firstRpcRow(reconciledData) as
        | Record<string, unknown>
        | null;
      if (reconciledError || reconciled?.state !== "purchasing") {
        return jsonResponse(503, {
          success: false,
          state: "purchase_reconciliation",
          code: "purchase_reconciliation_incomplete",
        });
      }
    }

    if (!hasPurchasedPostage(shipment)) {
      try {
        shipment = await client.buyShipment(shipmentId, rateId);
      } catch (buyError) {
        try {
          shipment = await client.retrieveShipment(shipmentId);
        } catch {
          const safeError = extractEasyPostSafeError(buyError);
          await markReconciliation(
            admin,
            labelId,
            claimToken,
            "purchase_outcome_unknown",
            safeError.message,
          );
          return jsonResponse(503, {
            success: false,
            state: "purchase_reconciliation",
            code: "purchase_outcome_unknown",
          });
        }

        if (!hasPurchasedPostage(shipment)) {
          const safeError = extractEasyPostSafeError(buyError);
          await markReconciliation(
            admin,
            labelId,
            claimToken,
            "purchase_not_completed",
            safeError.message,
          );
          return jsonResponse(503, {
            success: false,
            state: "purchase_reconciliation",
            code: "purchase_not_completed",
          });
        }
      }
    }

    const shipmentRecord = shipment as unknown as Record<string, unknown>;
    const pdfUrl = extractPdfLabelUrl(shipment, labelFormat);
    const pdfBytes = await client.downloadPdfLabel(pdfUrl);
    const storagePath = `easypost/${payload.jobId}/${labelId}.pdf`;
    const { error: uploadError } = await admin.storage
      .from(SHIPPING_LABEL_BUCKET)
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadError) throw new Error("Private label storage failed");

    const selectedRate = shipmentRecord.selected_rate &&
        typeof shipmentRecord.selected_rate === "object"
      ? shipmentRecord.selected_rate as Record<string, unknown>
      : {};
    const tracker = shipmentRecord.tracker &&
        typeof shipmentRecord.tracker === "object"
      ? shipmentRecord.tracker as Record<string, unknown>
      : {};
    const purchasedRate = Number(readString(selectedRate, "rate") ?? "");
    const purchasedAmountCents = Number.isFinite(purchasedRate)
      ? Math.round(purchasedRate * 100)
      : Number(label.quoted_amount_cents);
    const trackingNumber = readString(shipmentRecord, "tracking_code");
    if (!trackingNumber) {
      throw new Error("Purchased label has no tracking code");
    }

    const { data: finalizedData, error: finalizedError } = await admin.rpc(
      "finalize_easypost_label_purchase",
      {
        p_label_id: labelId,
        p_claim_token: claimToken,
        p_provider_tracker_id: readString(tracker, "id"),
        p_carrier: readString(selectedRate, "carrier") ??
          readString(label, "carrier"),
        p_service: readString(selectedRate, "service") ??
          readString(label, "service"),
        p_purchased_amount_cents: purchasedAmountCents,
        p_currency: readString(selectedRate, "currency") ??
          readString(label, "currency") ?? "USD",
        p_tracking_number: trackingNumber,
        p_tracking_status: readString(shipmentRecord, "status") ??
          readString(tracker, "status") ?? "pre_transit",
        p_tracking_url: readString(tracker, "public_url"),
        p_label_storage_path: storagePath,
        p_label_format: labelFormat,
      },
    );
    const finalized = firstRpcRow(finalizedData) as
      | Record<string, unknown>
      | null;
    if (finalizedError || !finalized) {
      throw new Error("Purchased label finalization failed");
    }

    await admin.from("production_jobs").update({
      fulfillment_status: "onshore_manual_label_ready",
    }).eq("id", payload.jobId);

    return jsonResponse(200, {
      success: true,
      state: "purchased",
      label: toSafeShippingLabel(finalized),
    });
  } catch (error) {
    const safeError = extractEasyPostSafeError(error);
    await markReconciliation(
      admin,
      labelId,
      claimToken,
      safeError.code,
      safeError.message,
    );
    console.error(
      "[SHIPPING-PURCHASE] Purchase requires reconciliation:",
      safeError.code,
    );
    return jsonResponse(503, {
      success: false,
      state: "purchase_reconciliation",
      code: safeError.code,
    });
  }
});
