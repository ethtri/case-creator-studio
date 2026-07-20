import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendOrderEmail } from "../_shared/email.ts";
import { getKexiaozhanNotificationSummary } from "../_shared/kexiaozhan-reconciliation.ts";
import { requireOperator } from "../_shared/operator-auth.ts";

const JOB_STATUSES = [
  "queued",
  "artwork_ready",
  "printed",
  "packed",
  "shipped",
  "failed",
] as const;
const SAFE_PREVIEW_HOSTS = [
  "printful.com",
  "snapcase.ai",
  "snapcaseappv2.vercel.app",
  "supabase.co",
];
const TRUE_VALUES = new Set(["1", "true", "yes"]);

const updateSchema = z.object({
  jobId: z.string().uuid(),
  action: z.literal("retry_kexiaozhan_notification").optional(),
  status: z.enum(JOB_STATUSES).optional(),
  trackingNumber: z.string().max(120).nullable().optional(),
  trackingCarrier: z.string().max(120).nullable().optional(),
  trackingUrl: z.string().url().max(1000).nullable().optional(),
  operatorNotes: z.string().max(2000).nullable().optional(),
}).refine((payload) => (
  payload.action !== undefined ||
  payload.status !== undefined ||
  payload.trackingNumber !== undefined ||
  payload.trackingCarrier !== undefined ||
  payload.trackingUrl !== undefined ||
  payload.operatorNotes !== undefined
), { message: "At least one update field is required" }).refine((payload) => (
  payload.action === undefined ||
  (
    payload.status === undefined &&
    payload.trackingNumber === undefined &&
    payload.trackingCarrier === undefined &&
    payload.trackingUrl === undefined &&
    payload.operatorNotes === undefined
  )
), { message: "Retry action cannot include update fields" });

function fulfillmentStatusForJobStatus(status: string): string {
  if (status === "shipped") return "shipped";
  if (status === "failed") return "failed";
  return `onshore_manual_${status}`;
}

function isEasyPostAutomationEnabled(): boolean {
  return TRUE_VALUES.has(
    (Deno.env.get("EASYPOST_AUTOMATION_ENABLED") ?? "").trim().toLowerCase(),
  );
}

async function invokeShippingPurchase(
  supabaseUrl: string,
  serviceRoleKey: string,
  jobId: string,
): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/shipping-purchase-label`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
        body: JSON.stringify({ jobId }),
      },
    );
    const body = await response.json().catch(() => null);
    return {
      success: response.ok,
      status: response.status,
      state: body && typeof body === "object" && "state" in body
        ? body.state
        : response.ok
        ? "purchased"
        : "purchase_reconciliation",
    };
  } catch {
    return {
      success: false,
      status: 503,
      state: "purchase_reconciliation",
    };
  }
}

function isSafePreviewUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return SAFE_PREVIEW_HOSTS.some((host) =>
      url.hostname === host || url.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

function sanitizeItems(items: unknown): unknown[] {
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    if (!item || typeof item !== "object") return item;
    const nextItem = { ...(item as Record<string, unknown>) };
    if (!isSafePreviewUrl(nextItem.designPreview)) {
      nextItem.designPreview = null;
    }
    return nextItem;
  });
}

function toSafeJob(job: Record<string, any>) {
  return {
    id: job.id,
    orderId: job.order_id,
    orderNumber: String(job.order_id).slice(0, 8).toUpperCase(),
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    status: job.status,
    fulfillmentProvider: job.provider,
    fulfillmentStatus: job.fulfillment_status,
    customerEmail: job.customer_email,
    customerName: job.customer_name,
    total: job.total,
    items: sanitizeItems(job.items),
    shippingAddress: job.shipping_address,
    trackingNumber: job.tracking_number,
    trackingCarrier: job.tracking_carrier,
    trackingUrl: job.tracking_url,
    operatorNotes: job.operator_notes,
    vendorNotification: getKexiaozhanNotificationSummary(job.metadata),
  };
}

type VendorRetryResult = {
  requestSucceeded: boolean;
  state: "succeeded" | "failed" | "in_progress" | "unknown";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function invokeVendorNotificationRetry(
  supabaseUrl: string,
  serviceRoleKey: string,
  orderId: string,
): Promise<VendorRetryResult> {
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/route-fulfillment-order`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
        body: JSON.stringify({
          orderId,
          provider: "onshore_manual",
        }),
      },
    );
    const body = await response.json().catch(() => null);
    const routedJob = isRecord(body) && isRecord(body.job) ? body.job : null;
    const summary = getKexiaozhanNotificationSummary(routedJob?.metadata);
    return {
      requestSucceeded: response.ok,
      state: summary?.state === "succeeded"
        ? "succeeded"
        : summary?.state === "in_progress"
        ? "in_progress"
        : summary?.state === "failed"
        ? "failed"
        : "unknown",
    };
  } catch {
    return {
      requestSucceeded: false,
      state: "unknown",
    };
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, "POST, PATCH, OPTIONS");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "PATCH") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const operator = await requireOperator(req, {
    supabaseUrl,
    anonKey,
    methods: "POST, PATCH, OPTIONS",
  });
  if (operator instanceof Response) return operator;

  let payload: z.infer<typeof updateSchema>;
  try {
    payload = updateSchema.parse(await req.json());
  } catch (error) {
    console.error("[UPDATE-PRODUCTION-JOB] Invalid request:", error);
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data: existingJob, error: existingError } = await supabaseAdmin
    .from("production_jobs")
    .select("*")
    .eq("id", payload.jobId)
    .single();

  if (existingError || !existingJob) {
    console.error("[UPDATE-PRODUCTION-JOB] Job not found:", existingError);
    return new Response(JSON.stringify({ error: "Production job not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (payload.action === "retry_kexiaozhan_notification") {
    const existingSummary = getKexiaozhanNotificationSummary(
      existingJob.metadata,
    );
    if (existingJob.provider !== "onshore_manual" || !existingSummary) {
      return new Response(
        JSON.stringify({ error: "Job has no Kexiaozhan notification" }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (existingSummary.state === "succeeded") {
      return new Response(
        JSON.stringify({
          success: true,
          alreadySucceeded: true,
          job: toSafeJob(existingJob),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!existingSummary.canRetry) {
      return new Response(
        JSON.stringify({ error: "Vendor notification is not retryable" }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    await supabaseAdmin
      .from("production_jobs")
      .update({ operator_email: operator.email })
      .eq("id", existingJob.id);

    const retry = await invokeVendorNotificationRetry(
      supabaseUrl,
      serviceRoleKey,
      existingJob.order_id,
    );
    const { data: refreshedJob, error: refreshError } = await supabaseAdmin
      .from("production_jobs")
      .select("*")
      .eq("id", existingJob.id)
      .single();

    if (refreshError || !refreshedJob) {
      console.error(
        "[UPDATE-PRODUCTION-JOB] Retried job refresh failed:",
        refreshError,
      );
      return new Response(
        JSON.stringify({ error: "Unable to refresh production job" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const refreshedSummary = getKexiaozhanNotificationSummary(
      refreshedJob.metadata,
    );
    const succeeded = retry.requestSucceeded &&
      refreshedSummary?.state === "succeeded";
    const inProgress = retry.state === "in_progress";

    return new Response(
      JSON.stringify({
        success: succeeded,
        inProgress,
        error: succeeded
          ? null
          : inProgress
          ? "Vendor notification retry is already in progress"
          : "Vendor notification still needs attention",
        job: toSafeJob(refreshedJob),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const nowIso = new Date().toISOString();
  const nextStatus = payload.status ?? existingJob.status;
  const shippingAutomationEnabled = isEasyPostAutomationEnabled() &&
    existingJob.provider === "onshore_manual";

  if (
    shippingAutomationEnabled &&
    (
      payload.trackingNumber !== undefined ||
      payload.trackingCarrier !== undefined ||
      payload.trackingUrl !== undefined
    )
  ) {
    return new Response(
      JSON.stringify({ error: "Tracking is managed by EasyPost" }),
      {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (
    shippingAutomationEnabled &&
    payload.status !== undefined &&
    ["printed", "packed", "shipped"].includes(nextStatus)
  ) {
    const { data: transitionData, error: transitionError } = await supabaseAdmin
      .rpc(
        "transition_easypost_production_job",
        {
          p_production_job_id: existingJob.id,
          p_next_status: nextStatus,
          p_operator_email: operator.email,
          p_operator_notes: payload.operatorNotes ?? null,
          p_update_operator_notes: payload.operatorNotes !== undefined,
        },
      );
    const transitionedJob = Array.isArray(transitionData)
      ? transitionData[0]
      : transitionData;

    if (transitionError || !transitionedJob) {
      console.error(
        "[UPDATE-PRODUCTION-JOB] Shipping transition was not accepted",
      );
      return new Response(
        JSON.stringify({ error: "Shipping transition was not accepted" }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let shippingPurchase: Record<string, unknown> | null = null;
    if (nextStatus === "printed") {
      shippingPurchase = await invokeShippingPurchase(
        supabaseUrl,
        serviceRoleKey,
        existingJob.id,
      );
    }

    if (nextStatus === "shipped") {
      const { data: updatedOrder, error: updatedOrderError } =
        await supabaseAdmin
          .from("orders")
          .select("*")
          .eq("id", existingJob.order_id)
          .single();
      if (!updatedOrderError && updatedOrder) {
        try {
          await sendOrderEmail(
            supabaseAdmin,
            "order_shipped",
            updatedOrder,
            {
              trackingNumber: updatedOrder.tracking_number,
              trackingCarrier: updatedOrder.tracking_carrier,
              trackingUrl: updatedOrder.tracking_url,
            },
          );
        } catch {
          console.error(
            "[UPDATE-PRODUCTION-JOB] Shipped email delivery failed",
          );
        }
      } else {
        console.error(
          "[UPDATE-PRODUCTION-JOB] Shipped email order lookup failed",
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        job: toSafeJob(transitionedJob),
        shippingPurchase,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const fulfillmentStatus = fulfillmentStatusForJobStatus(nextStatus);
  const jobUpdates: Record<string, unknown> = {
    operator_email: operator.email,
    fulfillment_status: fulfillmentStatus,
  };

  if (payload.status !== undefined) jobUpdates.status = payload.status;
  if (payload.operatorNotes !== undefined) {
    jobUpdates.operator_notes = payload.operatorNotes;
  }
  if (payload.trackingNumber !== undefined) {
    jobUpdates.tracking_number = payload.trackingNumber;
  }
  if (payload.trackingCarrier !== undefined) {
    jobUpdates.tracking_carrier = payload.trackingCarrier;
  }
  if (payload.trackingUrl !== undefined) {
    jobUpdates.tracking_url = payload.trackingUrl;
  }
  if (nextStatus !== "queued" && !existingJob.started_at) {
    jobUpdates.started_at = nowIso;
  }
  if (nextStatus === "shipped" && !existingJob.shipped_at) {
    jobUpdates.shipped_at = nowIso;
  }
  if (nextStatus === "failed" && !existingJob.failed_at) {
    jobUpdates.failed_at = nowIso;
  }

  const { data: updatedJob, error: updateError } = await supabaseAdmin
    .from("production_jobs")
    .update(jobUpdates)
    .eq("id", payload.jobId)
    .select()
    .single();

  if (updateError || !updatedJob) {
    console.error("[UPDATE-PRODUCTION-JOB] Update failed:", updateError);
    return new Response(
      JSON.stringify({ error: "Unable to update production job" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const orderUpdates: Record<string, unknown> = {
    fulfillment_provider: existingJob.provider,
    fulfillment_order_id: existingJob.id,
    fulfillment_status: fulfillmentStatus,
    fulfillment_last_error: nextStatus === "failed"
      ? (payload.operatorNotes ?? "Manual production failed")
      : null,
    printful_status: fulfillmentStatus,
    printful_last_error: nextStatus === "failed"
      ? (payload.operatorNotes ?? "Manual production failed")
      : null,
  };

  if (nextStatus === "shipped") {
    orderUpdates.status = "shipped";
    orderUpdates.shipped_at = existingJob.shipped_at ?? nowIso;
  } else if (nextStatus === "failed") {
    orderUpdates.status = "failed";
  } else {
    orderUpdates.status = "processing";
  }

  if (payload.trackingNumber !== undefined) {
    orderUpdates.tracking_number = payload.trackingNumber;
  }
  if (payload.trackingCarrier !== undefined) {
    orderUpdates.tracking_carrier = payload.trackingCarrier;
  }
  if (payload.trackingUrl !== undefined) {
    orderUpdates.tracking_url = payload.trackingUrl;
  }

  const { error: orderUpdateError } = await supabaseAdmin
    .from("orders")
    .update(orderUpdates)
    .eq("id", existingJob.order_id);

  if (orderUpdateError) {
    console.error(
      "[UPDATE-PRODUCTION-JOB] Order update failed:",
      orderUpdateError,
    );
  }

  const shippingPurchase: Record<string, unknown> | null = null;

  if (nextStatus === "shipped") {
    const { data: updatedOrder, error: updatedOrderError } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", existingJob.order_id)
      .single();
    if (!updatedOrderError && updatedOrder) {
      try {
        await sendOrderEmail(
          supabaseAdmin,
          "order_shipped",
          updatedOrder,
          {
            trackingNumber: updatedOrder.tracking_number,
            trackingCarrier: updatedOrder.tracking_carrier,
            trackingUrl: updatedOrder.tracking_url,
          },
        );
      } catch {
        console.error(
          "[UPDATE-PRODUCTION-JOB] Shipped email delivery failed",
        );
      }
    } else {
      console.error(
        "[UPDATE-PRODUCTION-JOB] Shipped email order lookup failed",
      );
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      job: toSafeJob(updatedJob),
      shippingPurchase,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
