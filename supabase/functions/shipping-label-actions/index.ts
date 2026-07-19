import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getCorsHeaders, requireAllowedOrigin } from "../_shared/cors.ts";
import { requireOperator } from "../_shared/operator-auth.ts";
import {
  parseSignedUrlTtlSeconds,
  SHIPPING_LABEL_BUCKET,
  toSafeShippingLabel,
} from "../_shared/shipping-labels.ts";

const METHODS = "POST, OPTIONS";
const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("get_print_url"),
    labelId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("request_refund"),
    labelId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("request_replacement"),
    labelId: z.string().uuid(),
  }),
]);

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

function firstRpcRow<T>(data: T | T[] | null): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req, METHODS) });
  }
  if (req.method !== "POST") {
    return jsonResponse(req, 405, { error: "Method not allowed" });
  }
  try {
    requireAllowedOrigin(req, "SHIPPING-LABEL-ACTIONS");
  } catch {
    return jsonResponse(req, 403, { error: "Origin not allowed" });
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

  let payload: z.infer<typeof actionSchema>;
  try {
    payload = actionSchema.parse(await req.json());
  } catch {
    return jsonResponse(req, 400, { error: "Invalid request" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: label, error: labelError } = await admin
    .from("shipping_labels")
    .select("*")
    .eq("id", payload.labelId)
    .single();
  if (labelError || !label) {
    return jsonResponse(req, 404, { error: "Shipping label not found" });
  }

  if (payload.action === "get_print_url") {
    if (label.state !== "purchased" || !label.label_storage_path) {
      return jsonResponse(req, 409, {
        error: "Shipping label is not printable",
      });
    }

    const ttlSeconds = parseSignedUrlTtlSeconds(
      Deno.env.get("SHIPPING_LABEL_SIGNED_URL_TTL_SECONDS") ?? undefined,
    );
    const { data, error } = await admin.storage
      .from(SHIPPING_LABEL_BUCKET)
      .createSignedUrl(label.label_storage_path, ttlSeconds);
    if (error || !data?.signedUrl) {
      return jsonResponse(req, 500, { error: "Unable to create print link" });
    }

    const { data: authorizationData, error: authorizationError } = await admin
      .rpc(
        "authorize_shipping_label_print",
        {
          p_label_id: label.id,
          p_operator_email: operator.email,
          p_ttl_seconds: ttlSeconds,
        },
      );
    const authorizedLabel = firstRpcRow(authorizationData);
    if (authorizationError || !authorizedLabel) {
      return jsonResponse(req, 409, {
        error: "Shipping label is no longer printable",
      });
    }

    return jsonResponse(req, 200, {
      label: toSafeShippingLabel(authorizedLabel),
      signedUrl: data.signedUrl,
      expiresIn: ttlSeconds,
    });
  }

  if (payload.action === "request_refund") {
    if (
      label.provider !== "easypost" ||
      !["purchased", "refund_pending"].includes(label.state)
    ) {
      return jsonResponse(req, 409, {
        error: "Shipping label is not refundable",
      });
    }

    let refundResponse: Response;
    try {
      refundResponse = await fetch(
        `${supabaseUrl}/functions/v1/shipping-refund-label`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "apikey": serviceRoleKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            labelId: label.id,
            operatorEmail: operator.email,
          }),
        },
      );
    } catch {
      return jsonResponse(req, 503, {
        error: "Shipping refund service is unavailable",
      });
    }

    let refundResult: Record<string, unknown> | null = null;
    try {
      const parsed = await refundResponse.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        refundResult = parsed as Record<string, unknown>;
      }
    } catch {
      // The provider handler intentionally returns only bounded JSON responses.
    }

    if (!refundResponse.ok || !refundResult?.label) {
      const status = refundResponse.status === 409 ? 409 : 503;
      return jsonResponse(req, status, {
        error: "Refund request was not accepted",
      });
    }

    return jsonResponse(req, refundResponse.status, {
      label: refundResult.label,
      refundStatus: refundResult.refundStatus ?? null,
    });
  }

  if (
    label.provider !== "easypost" ||
    !["refunded", "failed"].includes(label.state)
  ) {
    return jsonResponse(req, 409, {
      error: "EasyPost label must be refunded or failed before replacement",
    });
  }

  const { data: existingReplacement, error: existingReplacementError } =
    await admin
      .from("shipping_labels")
      .select("*")
      .eq("provider", "easypost")
      .eq("replaces_label_id", label.id)
      .in("state", [
        "preparing",
        "shipping_review",
        "rated",
        "purchasing",
        "purchase_reconciliation",
        "purchased",
        "refund_pending",
      ])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (existingReplacementError) {
    return jsonResponse(req, 500, {
      error: "Unable to verify replacement state",
    });
  }

  let replacement = existingReplacement;
  if (!replacement) {
    const { data, error: replacementError } = await admin.rpc(
      "request_shipping_label_replacement",
      {
        p_label_id: label.id,
        p_operator_email: operator.email,
      },
    );
    replacement = firstRpcRow(data);
    if (replacementError || !replacement) {
      return jsonResponse(req, 409, {
        error: "Replacement request was not accepted",
      });
    }
  }

  let preparedLabel = toSafeShippingLabel(replacement);
  let preparationState = "preparing";
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/shipping-prepare-order`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId: replacement.production_job_id,
        }),
      },
    );
    const result = await response.json().catch(() => null);
    if (result && typeof result === "object" && !Array.isArray(result)) {
      const safeResult = result as Record<string, unknown>;
      if (
        safeResult.label &&
        typeof safeResult.label === "object" &&
        !Array.isArray(safeResult.label)
      ) {
        preparedLabel = safeResult.label as Record<string, unknown>;
      }
      if (typeof safeResult.state === "string") {
        preparationState = safeResult.state;
      }
    }
  } catch {
    // The preparing row remains visible and can be retried without duplication.
  }

  return jsonResponse(req, 202, {
    label: preparedLabel,
    preparationState,
  });
});
