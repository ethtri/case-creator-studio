import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  type EasyPostAddressMappingInput,
  EasyPostClient,
  extractEasyPostSafeError,
  parseEasyPostParcelConfig,
  parseEasyPostRatePolicy,
  selectEasyPostRate,
} from "../_shared/easypost.ts";
import {
  jsonServiceError,
  requireServiceRequest,
} from "../_shared/service-auth.ts";
import { toSafeShippingLabel } from "../_shared/shipping-labels.ts";

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

function readAddress(
  job: Record<string, unknown>,
): EasyPostAddressMappingInput {
  const raw = job.shipping_address;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Shipping address is missing");
  }
  const address = raw as Record<string, unknown>;
  const text = (field: string): string => {
    const value = address[field];
    return typeof value === "string" ? value.trim() : "";
  };

  const street1 = text("address") || text("line1") || text("street1");
  const city = text("city");
  const state = text("state");
  const zip = text("zip") || text("postal_code");
  const country = (text("country") || "US").toUpperCase();
  if (!street1 || !city || !state || !zip || country.length !== 2) {
    throw new Error("Shipping address is incomplete");
  }

  return {
    name: typeof job.customer_name === "string"
      ? job.customer_name.trim()
      : undefined,
    address: street1,
    address2: text("address2") || text("line2") || text("street2") ||
      undefined,
    city,
    state,
    zip,
    country,
    phone: text("phone") || undefined,
    email: typeof job.customer_email === "string"
      ? job.customer_email.trim()
      : undefined,
  };
}

function normalizedAddressForJob(
  original: Record<string, unknown>,
  address: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...original,
    address: address.street1 ?? null,
    address2: address.street2 ?? null,
    city: address.city ?? null,
    state: address.state ?? null,
    zip: address.zip ?? null,
    country: address.country ?? null,
  };
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
  const { data: job, error: jobError } = await admin
    .from("production_jobs")
    .select("*")
    .eq("id", payload.jobId)
    .single();
  if (jobError || !job) {
    return jsonServiceError(404, "Production job not found");
  }
  if (job.provider !== "onshore_manual") {
    return jsonServiceError(409, "Shipping automation is not enabled for job");
  }

  const { data: preparationData, error: preparationError } = await admin.rpc(
    "prepare_easypost_shipping_label",
    {
      p_production_job_id: job.id,
      p_label_format: "pdf_4x6",
    },
  );
  const label = firstRpcRow(preparationData) as Record<string, unknown> | null;
  if (preparationError || !label) {
    return jsonServiceError(409, "Shipping preparation was not accepted");
  }
  if (
    ["rated", "purchasing", "purchase_reconciliation", "purchased"].includes(
      String(label.state),
    )
  ) {
    return jsonResponse(200, {
      success: true,
      state: label.state,
      label: toSafeShippingLabel(label),
    });
  }

  let failureCategory = "config";
  try {
    const apiKey = resolveApiKey();
    const fromAddressId = Deno.env.get("EASYPOST_FROM_ADDRESS_ID")?.trim() ??
      "";
    if (!apiKey || !fromAddressId) {
      throw new Error("EasyPost is not configured");
    }

    const client = new EasyPostClient({ apiKey });
    const parcel = parseEasyPostParcelConfig(
      Deno.env.get("EASYPOST_PARCEL_JSON") ?? undefined,
    );
    const policy = parseEasyPostRatePolicy(
      Deno.env.get("EASYPOST_RATE_POLICY_JSON") ?? undefined,
    );
    const submittedAddress = readAddress(job);
    failureCategory = "address";
    if (submittedAddress.country !== "US") {
      throw new Error("EasyPost pilot shipping is limited to U.S. addresses");
    }
    const verifiedAddress = await client.createVerifiedAddress(
      submittedAddress,
    );
    failureCategory = "provider";
    const shipment = await client.createShipment({
      toAddressId: verifiedAddress.id,
      fromAddressId,
      parcel,
      reference: `snapcase:${job.id}`,
    });
    failureCategory = "rate";
    const selectedRate = selectEasyPostRate(shipment.rates ?? [], policy);

    const { data: finalizedData, error: finalizedError } = await admin.rpc(
      "finalize_easypost_shipping_rate_and_job",
      {
        p_label_id: label.id,
        p_provider_address_id: verifiedAddress.id,
        p_provider_shipment_id: shipment.id,
        p_provider_rate_id: selectedRate.id,
        p_address_status: verifiedAddress.corrected ? "corrected" : "valid",
        p_carrier: selectedRate.carrier,
        p_service: selectedRate.service,
        p_quoted_amount_cents: selectedRate.amountCents,
        p_currency: selectedRate.currency,
        p_delivery_days: selectedRate.deliveryDays,
        p_rate_summary: {
          eligibleRateCount: selectedRate.eligibleRateCount,
          policyVersion: 1,
        },
        p_normalized_shipping_address: normalizedAddressForJob(
          job.shipping_address as Record<string, unknown>,
          verifiedAddress as unknown as Record<string, unknown>,
        ),
      },
    );
    const finalized = firstRpcRow(finalizedData) as
      | Record<string, unknown>
      | null;
    if (finalizedError || !finalized) {
      throw new Error("Unable to persist EasyPost rate");
    }

    return jsonResponse(200, {
      success: true,
      state: "rated",
      label: toSafeShippingLabel(finalized),
    });
  } catch (error) {
    const safeError = extractEasyPostSafeError(error);
    await admin.rpc("fail_easypost_shipping_preparation", {
      p_label_id: label.id,
      p_failure_category: failureCategory,
      p_error_code: safeError.code,
      p_error_message: safeError.message,
    });
    await admin.from("production_jobs").update({
      fulfillment_status: "shipping_review",
    }).eq("id", job.id);
    console.error(
      "[SHIPPING-PREPARE] Preparation requires review:",
      safeError.code,
    );
    return jsonResponse(422, {
      success: false,
      state: "shipping_review",
      error: safeError.message,
      code: safeError.code,
    });
  }
});
