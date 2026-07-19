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
    if (label.provider !== "easypost" || label.state !== "purchased") {
      return jsonResponse(req, 409, {
        error: "Shipping label is not refundable",
      });
    }

    const { data, error } = await admin.rpc(
      "request_shipping_label_refund",
      {
        p_label_id: label.id,
        p_operator_email: operator.email,
      },
    );
    const updated = firstRpcRow(data);
    if (error || !updated) {
      return jsonResponse(req, 409, {
        error: "Refund request was not accepted",
      });
    }

    return jsonResponse(req, 202, { label: toSafeShippingLabel(updated) });
  }

  if (
    label.provider !== "easypost" ||
    !["refunded", "failed"].includes(label.state)
  ) {
    return jsonResponse(req, 409, {
      error: "EasyPost label must be refunded or failed before replacement",
    });
  }

  const { data, error: replacementError } = await admin.rpc(
    "request_shipping_label_replacement",
    {
      p_label_id: label.id,
      p_operator_email: operator.email,
    },
  );
  const replacement = firstRpcRow(data);
  if (replacementError || !replacement) {
    return jsonResponse(req, 409, {
      error: "Replacement request was not accepted",
    });
  }

  return jsonResponse(req, 202, {
    label: toSafeShippingLabel(replacement),
  });
});
