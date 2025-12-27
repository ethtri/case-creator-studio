import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { sendOrderEmail } from "../_shared/email.ts";

const allowedEvents = [
  "order_confirmed",
  "order_processing",
  "order_shipped",
  "order_delivered",
  "order_canceled",
  "order_failed",
] as const;

const requestSchema = z.object({
  orderId: z.string().uuid(),
  eventType: z.enum(allowedEvents),
  recipientEmail: z.string().email().optional(),
  force: z.boolean().optional(),
  trackingNumber: z.string().max(200).optional(),
  trackingUrl: z.string().url().optional(),
  trackingCarrier: z.string().max(200).optional(),
});

function authorizeServiceRole(req: Request, serviceRoleKey: string): Response | null {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  const apiKey = req.headers.get("apikey");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (bearerToken !== serviceRoleKey && apiKey !== serviceRoleKey) {
    return new Response("Unauthorized", { status: 401 });
  }

  return null;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[SEND-TEST-EMAIL] Missing Supabase configuration");
    return new Response("Not configured", { status: 500 });
  }

  const authResponse = authorizeServiceRole(req, serviceRoleKey);
  if (authResponse) return authResponse;

  let payload: z.infer<typeof requestSchema>;
  try {
    const rawBody = await req.json();
    const result = requestSchema.safeParse(rawBody);
    if (!result.success) {
      return new Response("Invalid request", { status: 400 });
    }
    payload = result.data;
  } catch (error) {
    console.error("[SEND-TEST-EMAIL] Invalid JSON payload:", error);
    return new Response("Invalid payload", { status: 400 });
  }

  const supabaseClient = createClient(supabaseUrl, serviceRoleKey);

  if (payload.force) {
    await supabaseClient
      .from("order_notifications")
      .delete()
      .eq("order_id", payload.orderId)
      .eq("event_type", payload.eventType);
  }

  const { data: order, error } = await supabaseClient
    .from("orders")
    .select("*")
    .eq("id", payload.orderId)
    .single();

  if (error || !order) {
    return new Response("Order not found", { status: 404 });
  }

  const recipientEmail = payload.recipientEmail ?? order.customer_email;
  if (!recipientEmail) {
    return new Response("Recipient email required", { status: 400 });
  }

  const orderWithRecipient = {
    ...order,
    customer_email: recipientEmail,
  };

  const result = await sendOrderEmail(supabaseClient, payload.eventType, orderWithRecipient, {
    trackingNumber: payload.trackingNumber ?? null,
    trackingUrl: payload.trackingUrl ?? null,
    trackingCarrier: payload.trackingCarrier ?? null,
  });

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
