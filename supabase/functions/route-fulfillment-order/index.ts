import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const PROVIDERS = ["printful", "onshore_manual"] as const;
type FulfillmentProvider = (typeof PROVIDERS)[number];

const routeSchema = z.object({
  orderId: z.string().uuid(),
  provider: z.enum(PROVIDERS).optional(),
});

function authorizeServiceRole(
  req: Request,
  serviceRoleKey: string,
): Response | null {
  const authHeader = req.headers.get("authorization") ||
    req.headers.get("Authorization");
  const apiKey = req.headers.get("apikey");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (bearerToken !== serviceRoleKey && apiKey !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}

function blockBrowserRequests(req: Request): Response | null {
  if (!req.headers.get("origin")) return null;

  return new Response(
    JSON.stringify({ error: "This endpoint is not accessible from browsers" }),
    {
      status: 403,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function normalizeProvider(
  value: string | null | undefined,
): FulfillmentProvider {
  const provider = (value ?? "printful").trim().toLowerCase();
  if (provider === "printful" || provider === "onshore_manual") {
    return provider;
  }
  throw new Error(`Unsupported fulfillment provider: ${provider}`);
}

function hasRequiredShippingFields(shippingAddress: any): boolean {
  return Boolean(
    shippingAddress?.address &&
      shippingAddress?.city &&
      shippingAddress?.zip &&
      shippingAddress?.country &&
      shippingAddress?.state,
  );
}

async function routeToPrintful(
  supabaseUrl: string,
  serviceRoleKey: string,
  orderId: string,
): Promise<Response> {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/submit-printful-order`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ orderId }),
    },
  );

  const body = await response.text();
  return new Response(body || JSON.stringify({ success: response.ok }), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ??
        "application/json",
    },
  });
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const browserResponse = blockBrowserRequests(req);
  if (browserResponse) return browserResponse;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[ROUTE-FULFILLMENT] Missing Supabase configuration");
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authResponse = authorizeServiceRole(req, serviceRoleKey);
  if (authResponse) return authResponse;

  let payload: z.infer<typeof routeSchema>;
  try {
    payload = routeSchema.parse(await req.json());
  } catch (error) {
    console.error("[ROUTE-FULFILLMENT] Invalid request:", error);
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", payload.orderId)
    .single();

  if (orderError || !order) {
    console.error("[ROUTE-FULFILLMENT] Order not found:", orderError);
    return new Response(JSON.stringify({ error: "Order not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let provider: FulfillmentProvider;
  try {
    provider = payload.provider ?? normalizeProvider(
      order.fulfillment_provider ??
        Deno.env.get("FULFILLMENT_PROVIDER") ??
        Deno.env.get("ROUTE_FULFILLMENT_PROVIDER"),
    );
  } catch (error) {
    console.error("[ROUTE-FULFILLMENT] Unsupported provider:", error);
    return new Response(
      JSON.stringify({ error: "Unsupported fulfillment provider" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (provider === "printful") {
    const { error: providerUpdateError } = await supabaseAdmin
      .from("orders")
      .update({
        fulfillment_provider: "printful",
        fulfillment_status: order.printful_status ?? "pending",
        fulfillment_last_error: order.printful_last_error ?? null,
        fulfillment_routed_at: new Date().toISOString(),
      })
      .eq("id", payload.orderId);

    if (providerUpdateError) {
      console.error(
        "[ROUTE-FULFILLMENT] Printful provider update failed:",
        providerUpdateError,
      );
    }

    return await routeToPrintful(supabaseUrl, serviceRoleKey, payload.orderId);
  }

  const { data: existingJob, error: existingLookupError } = await supabaseAdmin
    .from("production_jobs")
    .select()
    .eq("order_id", order.id)
    .eq("provider", provider)
    .maybeSingle();

  if (existingLookupError) {
    console.error(
      "[ROUTE-FULFILLMENT] Production job lookup failed:",
      existingLookupError,
    );
    return new Response(
      JSON.stringify({ error: "Unable to load production job" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (existingJob) {
    await supabaseAdmin
      .from("orders")
      .update({
        fulfillment_provider: provider,
        fulfillment_order_id: existingJob.id,
        fulfillment_status: existingJob.fulfillment_status ??
          existingJob.status,
        fulfillment_last_error: null,
      })
      .eq("id", order.id);

    return new Response(
      JSON.stringify({
        success: true,
        provider,
        created: false,
        job: existingJob,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (order.status !== "paid" && order.status !== "processing") {
    return new Response(
      JSON.stringify({ error: "Order must be paid before fulfillment" }),
      {
        status: 409,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (!hasRequiredShippingFields(order.shipping_address)) {
    await supabaseAdmin
      .from("orders")
      .update({
        fulfillment_provider: provider,
        fulfillment_status: "needs_shipping",
        fulfillment_last_error: "Missing shipping address",
        printful_status: "needs_shipping",
        printful_last_error: "Missing shipping address",
      })
      .eq("id", payload.orderId);

    return new Response(
      JSON.stringify({ error: "Shipping address is required" }),
      {
        status: 422,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const jobPayload = {
    order_id: order.id,
    provider,
    status: "queued",
    order_status: order.status,
    fulfillment_status: "onshore_manual_queued",
    customer_email: order.customer_email,
    customer_name: order.customer_name ?? null,
    total: order.total,
    shipping_address: order.shipping_address ?? null,
    items: order.items,
    metadata: {
      routed_at: new Date().toISOString(),
      stripe_session_id: order.stripe_session_id ?? null,
    },
  };

  const { data: insertedJob, error: insertError } = await supabaseAdmin
    .from("production_jobs")
    .insert(jobPayload)
    .select()
    .single();

  if (insertError) {
    if (insertError.code !== "23505") {
      console.error(
        "[ROUTE-FULFILLMENT] Production job insert failed:",
        insertError,
      );
      return new Response(
        JSON.stringify({ error: "Unable to create production job" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { data: duplicateJob, error: duplicateError } = await supabaseAdmin
      .from("production_jobs")
      .select()
      .eq("order_id", order.id)
      .eq("provider", provider)
      .single();

    if (duplicateError || !duplicateJob) {
      console.error(
        "[ROUTE-FULFILLMENT] Production job lookup failed:",
        duplicateError,
      );
      return new Response(
        JSON.stringify({ error: "Unable to load production job" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    await supabaseAdmin
      .from("orders")
      .update({
        fulfillment_provider: provider,
        fulfillment_order_id: duplicateJob.id,
        fulfillment_status: duplicateJob.fulfillment_status ??
          duplicateJob.status,
        fulfillment_last_error: null,
      })
      .eq("id", order.id);

    return new Response(
      JSON.stringify({
        success: true,
        provider,
        created: false,
        job: duplicateJob,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("orders")
    .update({
      status: "processing",
      fulfillment_provider: provider,
      fulfillment_order_id: insertedJob.id,
      fulfillment_status: "onshore_manual_queued",
      fulfillment_last_error: null,
      fulfillment_routed_at: new Date().toISOString(),
      printful_status: "onshore_manual_queued",
      printful_last_error: null,
      printful_next_attempt_at: null,
    })
    .eq("id", order.id);

  if (updateError) {
    console.error(
      "[ROUTE-FULFILLMENT] Order status update failed:",
      updateError,
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      provider,
      created: true,
      job: insertedJob,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});
