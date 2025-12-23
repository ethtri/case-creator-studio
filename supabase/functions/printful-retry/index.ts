import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const MAX_PRINTFUL_ATTEMPTS = 4;
const BATCH_LIMIT = 25;

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

function getJwtRole(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1];
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function hasRequiredShippingFields(shippingAddress: any): boolean {
  return Boolean(
    shippingAddress?.address &&
      shippingAddress?.city &&
      shippingAddress?.zip &&
      shippingAddress?.country &&
      shippingAddress?.state
  );
}

serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const role = getJwtRole(req.headers.get("authorization"));
  if (role !== "service_role") {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[PRINTFUL-RETRY] Missing Supabase configuration");
    return new Response("Not configured", { status: 500 });
  }

  const supabaseClient = createClient(supabaseUrl, serviceRoleKey);
  const now = Date.now();

  const { data: orders, error } = await supabaseClient
    .from("orders")
    .select("id, printful_attempts, printful_status, printful_next_attempt_at, shipping_address")
    .is("printful_order_id", null)
    .eq("status", "paid")
    .lt("printful_attempts", MAX_PRINTFUL_ATTEMPTS)
    .limit(50);

  if (error) {
    console.error("[PRINTFUL-RETRY] Failed to fetch orders:", error);
    return new Response("Query failed", { status: 500 });
  }

  const eligibleOrders = (orders ?? []).filter((order) => {
    const status = order.printful_status ?? "pending";
    const statusAllowed = status === "pending" || status === "retry" || status === "needs_shipping";
    const nextAttemptAt = order.printful_next_attempt_at
      ? Date.parse(order.printful_next_attempt_at)
      : null;
    const nextAttemptReady = !nextAttemptAt || nextAttemptAt <= now;
    return statusAllowed && nextAttemptReady;
  });

  let submitted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const order of eligibleOrders.slice(0, BATCH_LIMIT)) {
    if (!hasRequiredShippingFields(order.shipping_address)) {
      skipped += 1;
      if (!order.printful_status || order.printful_status === "pending") {
        await supabaseClient
          .from("orders")
          .update({ printful_status: "needs_shipping", printful_last_error: "Missing shipping address" })
          .eq("id", order.id);
      }
      continue;
    }

    try {
      const submitResponse = await fetch(`${supabaseUrl}/functions/v1/submit-printful-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
        body: JSON.stringify({ orderId: order.id }),
      });

      if (!submitResponse.ok) {
        const body = await submitResponse.text();
        errors.push(body);
      } else {
        submitted += 1;
      }
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : String(submitError);
      errors.push(message);
    }
  }

  return new Response(
    JSON.stringify({
      processed: eligibleOrders.length,
      submitted,
      skipped,
      errors: errors.slice(0, 5),
    }),
    {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }
  );
});
