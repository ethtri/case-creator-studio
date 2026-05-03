import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const ALLOWED_ORIGINS = [
  "https://snapcase.ai",
  "https://www.snapcase.ai",
  "https://snapcaseappv2.vercel.app",
];

const VERCEL_PROJECT_PREFIXES = ["snapcaseappv2"];
const JOB_STATUSES = [
  "queued",
  "artwork_ready",
  "printed",
  "packed",
  "shipped",
  "failed",
] as const;

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

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1")
  ) return true;
  if (origin.endsWith(".vercel.app")) {
    return VERCEL_PROJECT_PREFIXES.some((prefix) => origin.includes(prefix));
  }
  return false;
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, PATCH, OPTIONS",
  };
}

function getOperatorEmails(): Set<string> {
  return new Set(
    (Deno.env.get("OPERATOR_EMAILS") ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isVerifiedEmail(
  user: {
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
    user_metadata?: Record<string, unknown>;
  } | null,
): boolean {
  if (!user) return false;
  if (user.email_confirmed_at || user.confirmed_at) return true;
  return user.user_metadata?.email_verified === true;
}

async function requireOperator(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<{ email: string } | Response> {
  const authHeader = req.headers.get("authorization") ||
    req.headers.get("Authorization") || "";
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const supabaseAuth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await supabaseAuth.auth
    .getUser();

  if (authError || !authData?.user || !authData.user.email) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  if (!isVerifiedEmail(authData.user)) {
    return new Response(JSON.stringify({ error: "Email not verified" }), {
      status: 403,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const email = authData.user.email.toLowerCase();
  if (!getOperatorEmails().has(email)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  return { email };
}

function fulfillmentStatusForJobStatus(status: string): string {
  if (status === "shipped") return "shipped";
  if (status === "failed") return "failed";
  return `onshore_manual_${status}`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

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

  const operator = await requireOperator(req, supabaseUrl, anonKey);
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

  return new Response(JSON.stringify({ success: true, job: updatedJob }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
