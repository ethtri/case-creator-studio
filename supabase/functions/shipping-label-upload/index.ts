import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, requireAllowedOrigin } from "../_shared/cors.ts";
import { requireOperator } from "../_shared/operator-auth.ts";
import {
  buildManualLabelPath,
  hasPdfMagic,
  isPdfFile,
  isShippingLabelFormat,
  MAX_MANUAL_LABEL_BYTES,
  SHIPPING_LABEL_BUCKET,
  toSafeShippingLabel,
} from "../_shared/shipping-labels.ts";

const METHODS = "POST, OPTIONS";

function jsonResponse(
  req: Request,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req, METHODS),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req, METHODS) });
  }
  if (req.method !== "POST") {
    return jsonResponse(req, 405, { error: "Method not allowed" });
  }
  try {
    requireAllowedOrigin(req, "SHIPPING-LABEL-UPLOAD");
  } catch {
    return jsonResponse(req, 403, { error: "Origin not allowed" });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_MANUAL_LABEL_BYTES + 1024 * 1024
  ) {
    return jsonResponse(req, 413, { error: "Manual label is too large" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(req, 500, { error: "Server not configured" });
  }

  const operator = await requireOperator(req, {
    supabaseUrl,
    anonKey,
    methods: METHODS,
  });
  if (operator instanceof Response) return operator;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse(req, 400, { error: "Invalid multipart request" });
  }

  const jobId = form.get("jobId");
  const labelFormat = form.get("labelFormat");
  const file = form.get("file");
  if (
    typeof jobId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(jobId) ||
    !isShippingLabelFormat(labelFormat) ||
    !(file instanceof File) ||
    !isPdfFile(file)
  ) {
    return jsonResponse(req, 400, { error: "Invalid manual label" });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasPdfMagic(bytes)) {
    return jsonResponse(req, 400, { error: "Invalid PDF content" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: job, error: jobError } = await admin
    .from("production_jobs")
    .select("id, status")
    .eq("id", jobId)
    .single();
  if (jobError || !job) {
    return jsonResponse(req, 404, { error: "Production job not found" });
  }
  if (["shipped", "failed"].includes(job.status)) {
    return jsonResponse(req, 409, {
      error: "Production job cannot accept a shipping label",
    });
  }

  const labelId = crypto.randomUUID();
  const storagePath = buildManualLabelPath(job.id, labelId);
  const { data: preparationData, error: preparationError } = await admin.rpc(
    "prepare_manual_shipping_label",
    {
      p_label_id: labelId,
      p_production_job_id: job.id,
      p_storage_path: storagePath,
      p_label_format: labelFormat,
      p_operator_email: operator.email,
      p_size_bytes: bytes.byteLength,
    },
  );
  const preparedLabel = Array.isArray(preparationData)
    ? preparationData[0]
    : preparationData;
  if (preparationError || !preparedLabel) {
    return jsonResponse(req, 409, {
      error: "Production job already has an active shipping label",
    });
  }

  const { error: uploadError } = await admin.storage
    .from(SHIPPING_LABEL_BUCKET)
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) {
    await admin.rpc("fail_manual_shipping_label", {
      p_label_id: labelId,
      p_error_code: "storage_upload_failed",
      p_operator_email: operator.email,
    });
    return jsonResponse(req, 500, { error: "Unable to store manual label" });
  }

  const { data, error: completionError } = await admin.rpc(
    "complete_manual_shipping_label",
    {
      p_label_id: labelId,
      p_operator_email: operator.email,
    },
  );
  const label = Array.isArray(data) ? data[0] : data;
  if (completionError || !label) {
    return jsonResponse(req, 500, {
      error: "Manual label requires operator recovery",
    });
  }

  return jsonResponse(req, 201, {
    label: toSafeShippingLabel(label),
  });
});
