import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
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

const updateSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(JOB_STATUSES).optional(),
  trackingNumber: z.string().max(120).nullable().optional(),
  trackingCarrier: z.string().max(120).nullable().optional(),
  trackingUrl: z.string().url().max(1000).nullable().optional(),
  operatorNotes: z.string().max(2000).nullable().optional(),
}).refine((payload) => (
  payload.status !== undefined ||
  payload.trackingNumber !== undefined ||
  payload.trackingCarrier !== undefined ||
  payload.trackingUrl !== undefined ||
  payload.operatorNotes !== undefined
), { message: "At least one update field is required" });

function fulfillmentStatusForJobStatus(status: string): string {
  if (status === "shipped") return "shipped";
  if (status === "failed") return "failed";
  return `onshore_manual_${status}`;
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
  };
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

  const nowIso = new Date().toISOString();
  const nextStatus = payload.status ?? existingJob.status;
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

  return new Response(
    JSON.stringify({ success: true, job: toSafeJob(updatedJob) }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
