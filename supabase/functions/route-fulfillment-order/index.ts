import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  buildKexiaozhanPaymentNotification,
  formatKexiaozhanPayTimeUtc,
  getKexiaozhanFulfillmentMethod,
  parseKexiaozhanPaymentNotificationExtraFields,
} from "../_shared/kexiaozhan-payment.ts";
import { resolveKexiaozhanLiveNotifyGate } from "../_shared/kexiaozhan-notify-gate.ts";
import {
  resolveKexiaozhanPaymentTransaction,
} from "../_shared/kexiaozhan-payment-transaction.ts";
import {
  buildExpiredKexiaozhanOrderUpdate,
  KEXIAOZHAN_EXPIRED_HANDOFF_ERROR,
  shouldBlockExpiredKexiaozhanHandoff,
} from "../_shared/kexiaozhan-payment-guard.ts";

const PROVIDERS = ["printful", "onshore_manual"] as const;
type FulfillmentProvider = (typeof PROVIDERS)[number];
const TRUE_VALUES = new Set(["1", "true", "yes"]);
const KEXIAOZHAN_DEFAULT_API_BASE = "https://kxzcnt.kexiaozhan.com";

type JsonRecord = Record<string, unknown>;

type OrderRecord = JsonRecord & {
  id: string;
  items?: unknown;
};

type ProductionJobRecord = JsonRecord & {
  id: string;
  status: string;
  fulfillment_status?: string | null;
  metadata?: unknown;
};

type ProductionJobsClient = {
  from(table: "production_jobs"): {
    update(values: JsonRecord): {
      eq(column: "id", value: unknown): {
        select(): {
          single(): Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
};

type KexiaozhanHandoffsClient = {
  from(table: "kexiaozhan_handoffs"): {
    select(columns?: string): {
      eq(
        column: "out_trade_no",
        value: unknown,
      ): {
        maybeSingle(): Promise<{ data: unknown; error: unknown }>;
      };
    };
    update(values: JsonRecord): {
      eq(
        column: "out_trade_no",
        value: unknown,
      ): Promise<{ error: unknown }>;
    };
  };
};

type KexiaozhanPaymentContext = {
  orderNo: string | null;
  outTradeNo: string;
  amount: string;
  goodsName: string | null;
  currency: string | null;
  machineSn: string;
  timestamp: string | null;
  nonce: string | null;
};

const routeSchema = z.object({
  orderId: z.string().uuid(),
  provider: z.enum(PROVIDERS).optional(),
});

function authorizeServiceRole(
  req: Request,
  allowedKeys: string[],
): Response | null {
  const authHeader = req.headers.get("authorization") ||
    req.headers.get("Authorization");
  const apiKey = req.headers.get("apikey");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  const validKeys = allowedKeys.filter(Boolean);

  if (
    !validKeys.includes(bearerToken ?? "") && !validKeys.includes(apiKey ?? "")
  ) {
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

function isOnshoreManualEnabled(): boolean {
  return TRUE_VALUES.has(
    (Deno.env.get("ALLOW_ONSHORE_MANUAL") ?? "").trim().toLowerCase(),
  );
}

function isEasyPostAutomationEnabled(): boolean {
  return TRUE_VALUES.has(
    (Deno.env.get("EASYPOST_AUTOMATION_ENABLED") ?? "").trim().toLowerCase(),
  );
}

async function prepareEasyPostShipping(
  supabaseUrl: string,
  serviceRoleKey: string,
  jobId: string,
): Promise<JsonRecord | null> {
  if (!isEasyPostAutomationEnabled()) return null;

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/shipping-prepare-order`,
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
    if (response.ok && isRecord(body)) return body;

    console.error(
      "[ROUTE-FULFILLMENT] Shipping preparation did not complete:",
      response.status,
    );
    return {
      success: false,
      state: "shipping_review",
      status: response.status,
    };
  } catch {
    console.error(
      "[ROUTE-FULFILLMENT] Shipping preparation request failed",
    );
    return {
      success: false,
      state: "shipping_review",
      status: 503,
    };
  }
}

function hasRequiredShippingFields(shippingAddress: unknown): boolean {
  if (!isRecord(shippingAddress)) return false;

  return Boolean(
    getStringField(shippingAddress, "address") &&
      getStringField(shippingAddress, "city") &&
      getStringField(shippingAddress, "zip") &&
      getStringField(shippingAddress, "country") &&
      getStringField(shippingAddress, "state"),
  );
}

function orderStatusForJobStatus(status: string): string {
  if (status === "shipped") return "shipped";
  if (status === "failed") return "failed";
  return "processing";
}

function resolveKexiaozhanNotifyGate(outTradeNo: string) {
  return resolveKexiaozhanLiveNotifyGate(outTradeNo, {
    enabled: Deno.env.get("KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED"),
    requireAllowlist: Deno.env.get(
      "KEXIAOZHAN_PAYMENT_NOTIFY_REQUIRE_ALLOWLIST",
    ),
    allowedOutTradeNos:
      Deno.env.get("KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_OUT_TRADE_NOS") ??
        Deno.env.get("KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_OUT_TRADE_NO"),
    allowedPrefixes: Deno.env.get(
      "KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_PREFIXES",
    ),
  });
}

function getKexiaozhanApiBaseUrl(): string {
  const configured = (Deno.env.get("KEXIAOZHAN_API_BASE_URL") ??
    KEXIAOZHAN_DEFAULT_API_BASE).trim();
  return configured.replace(/\/+$/, "") || KEXIAOZHAN_DEFAULT_API_BASE;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField(record: JsonRecord, field: string): string | null {
  const value = record[field];
  if (typeof value === "string") {
    const text = value.trim();
    return text ? text : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function extractKexiaozhanPaymentContext(
  items: unknown,
): KexiaozhanPaymentContext | null {
  if (!Array.isArray(items)) return null;

  for (const item of items) {
    if (!isRecord(item)) continue;
    const vendorDesign = item.vendorDesign;
    if (!isRecord(vendorDesign)) continue;
    const payment = vendorDesign.kexiaozhanPayment;
    if (!isRecord(payment)) continue;

    const outTradeNo = getStringField(payment, "outTradeNo");
    const amount = getStringField(payment, "amount");
    const machineSn = getStringField(payment, "machineSn");
    if (!outTradeNo || !amount || !machineSn) continue;

    return {
      orderNo: getStringField(payment, "orderNo"),
      outTradeNo,
      amount,
      goodsName: getStringField(payment, "goodsName"),
      currency: getStringField(payment, "currency"),
      machineSn,
      timestamp: getStringField(payment, "timestamp"),
      nonce: getStringField(payment, "nonce"),
    };
  }

  return null;
}

function buildExtraInfo(orderId: string, jobId: string): string {
  return JSON.stringify({
    snapcaseOrderId: orderId,
    productionJobId: jobId,
  }).slice(0, 1000);
}

function truncateForMetadata(value: string, maxLength = 1000): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

async function blockExpiredKexiaozhanHandoffBeforeFulfillment(
  supabaseAdmin: unknown,
  order: OrderRecord,
): Promise<Response | null> {
  const payment = extractKexiaozhanPaymentContext(order.items);
  if (!payment) return null;

  const { data: handoff, error: handoffLookupError } =
    await (supabaseAdmin as KexiaozhanHandoffsClient)
      .from("kexiaozhan_handoffs")
      .select("expires_at")
      .eq("out_trade_no", payment.outTradeNo)
      .maybeSingle();

  if (handoffLookupError) {
    console.error(
      "[ROUTE-FULFILLMENT] Kexiaozhan handoff lookup failed:",
      handoffLookupError,
    );
    return new Response(
      JSON.stringify({ error: "Unable to verify Kexiaozhan handoff state" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (
    !handoff ||
    !shouldBlockExpiredKexiaozhanHandoff(
      handoff,
      Deno.env.get("KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON"),
    )
  ) {
    return null;
  }

  const { error: handoffUpdateError } =
    await (supabaseAdmin as KexiaozhanHandoffsClient)
      .from("kexiaozhan_handoffs")
      .update({
        status: "expired",
        stripe_payment_intent_id: getStringField(
          isRecord(order) ? order : {},
          "stripe_payment_intent_id",
        ),
        last_error: KEXIAOZHAN_EXPIRED_HANDOFF_ERROR,
      })
      .eq("out_trade_no", payment.outTradeNo);

  if (handoffUpdateError) {
    console.error(
      "[ROUTE-FULFILLMENT] Kexiaozhan expired handoff update failed:",
      handoffUpdateError,
    );
  }

  const { error: orderUpdateError } = await (supabaseAdmin as {
    from(table: "orders"): {
      update(values: JsonRecord): {
        eq(column: "id", value: unknown): Promise<{ error: unknown }>;
      };
    };
  })
    .from("orders")
    .update(buildExpiredKexiaozhanOrderUpdate({}))
    .eq("id", order.id);

  if (orderUpdateError) {
    console.error(
      "[ROUTE-FULFILLMENT] Expired Kexiaozhan order update failed:",
      orderUpdateError,
    );
    return new Response(
      JSON.stringify({ error: "Unable to block expired Kexiaozhan order" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({
      error: "Kexiaozhan handoff expired before fulfillment routing",
      outTradeNo: payment.outTradeNo,
    }),
    {
      status: 409,
      headers: { "Content-Type": "application/json" },
    },
  );
}

async function recordKexiaozhanHandoffNotification(
  supabaseAdmin: unknown,
  payment: KexiaozhanPaymentContext,
  paymentNotification: JsonRecord,
  stripePaymentIntentId: string | null,
): Promise<void> {
  try {
    const response = isRecord(paymentNotification.response)
      ? paymentNotification.response
      : null;
    const responseOk = response?.ok === true;
    const notifyMode = getStringField(paymentNotification, "mode");
    const reason = getStringField(paymentNotification, "reason");
    const request = isRecord(paymentNotification.request)
      ? paymentNotification.request
      : null;
    const requestBody = request && isRecord(request.body) ? request.body : null;
    const hasSuccessfulPayment = getStringField(
      requestBody ?? {},
      "orderStatus",
    ) === "1";
    const status = notifyMode === "live"
      ? responseOk ? "vendor_notified" : "vendor_notify_failed"
      : hasSuccessfulPayment
      ? "paid"
      : "checkout_created";
    const lastError = responseOk
      ? null
      : reason ?? getStringField(response ?? {}, "error") ??
        (notifyMode === "live" ? "Kexiaozhan notify failed" : null);

    const update: JsonRecord = {
      status,
      stripe_payment_intent_id: stripePaymentIntentId,
      notify_request: paymentNotification.request ?? null,
      notify_response: response,
      last_error: lastError,
    };

    if (responseOk) {
      update.payment_notified_at = new Date().toISOString();
    }

    const { error } = await (supabaseAdmin as KexiaozhanHandoffsClient)
      .from("kexiaozhan_handoffs")
      .update(update)
      .eq("out_trade_no", payment.outTradeNo);

    if (error) {
      console.error(
        "[ROUTE-FULFILLMENT] Kexiaozhan handoff update failed:",
        error,
      );
    }
  } catch (error) {
    console.error(
      "[ROUTE-FULFILLMENT] Kexiaozhan handoff recording failed:",
      error,
    );
  }
}

async function recordKexiaozhanPaymentNotification(
  supabaseAdmin: unknown,
  order: OrderRecord,
  job: ProductionJobRecord,
): Promise<ProductionJobRecord> {
  try {
    const payment = extractKexiaozhanPaymentContext(order.items);
    if (!payment) return job;

    const existingMetadata = isRecord(job.metadata) ? job.metadata : {};
    const existingKexiaozhan = isRecord(existingMetadata.kexiaozhan)
      ? existingMetadata.kexiaozhan
      : {};
    const previousNotification = isRecord(
        existingKexiaozhan.paymentNotification,
      )
      ? existingKexiaozhan.paymentNotification
      : null;
    const previousResponse = previousNotification &&
        isRecord(previousNotification.response)
      ? previousNotification.response
      : null;
    if (
      previousNotification?.mode === "live" && previousResponse?.ok === true
    ) {
      return job;
    }

    const endpoint =
      `${getKexiaozhanApiBaseUrl()}/client/process-payment-notify`;
    const machineKey = Deno.env.get("KEXIAOZHAN_MACHINE_KEY")?.trim() ?? "";
    const stripePaymentIntentId = getStringField(
      isRecord(order) ? order : {},
      "stripe_payment_intent_id",
    );
    const transaction = resolveKexiaozhanPaymentTransaction({
      orderId: String(order.id),
      orderStatus: order.status,
      orderTotal: order.total,
      stripeSessionId: order.stripe_session_id,
      stripePaymentIntentId,
    });
    const transactionId = transaction?.transactionId ?? null;
    const payTime = formatKexiaozhanPayTimeUtc(new Date());
    let extraNotifyFields = parseKexiaozhanPaymentNotificationExtraFields(
      undefined,
    );
    let extraNotifyFieldsError: string | null = null;
    try {
      extraNotifyFields = parseKexiaozhanPaymentNotificationExtraFields(
        Deno.env.get("KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON"),
      );
    } catch (error) {
      extraNotifyFieldsError = error instanceof Error
        ? error.message
        : "invalid Kexiaozhan callback extra fields";
    }
    const fulfillmentMethod = getKexiaozhanFulfillmentMethod(
      extraNotifyFields,
    );
    const unsignedBody = {
      outTradeNo: payment.outTradeNo,
      transactionId: transactionId ?? "",
      amount: payment.amount,
      extraInfo: buildExtraInfo(String(order.id), String(job.id)),
      orderStatus: transactionId ? 1 as const : 0 as const,
      payTime,
      ...extraNotifyFields,
    };

    const paymentMetadata = {
      orderNo: payment.orderNo,
      outTradeNo: payment.outTradeNo,
      machineSn: payment.machineSn,
      amount: payment.amount,
      currency: payment.currency,
      goodsName: payment.goodsName,
      timestamp: payment.timestamp,
      nonce: payment.nonce,
    };
    const paymentNotification: JsonRecord = {
      endpoint,
      generatedAt: new Date().toISOString(),
      payTimeFormat: "RFC3339",
      payTimeTimezone: "UTC",
      authentication: "signature_only",
      transactionIdSource: transaction?.source ?? null,
    };

    if (!transactionId) {
      paymentNotification.mode = "blocked";
      paymentNotification.reason = "missing_verified_payment_reference";
      paymentNotification.request = {
        method: "POST",
        body: unsignedBody,
      };
    } else if (extraNotifyFieldsError) {
      paymentNotification.mode = "blocked";
      paymentNotification.reason = "invalid_payment_notify_extra_fields";
      paymentNotification.configError = truncateForMetadata(
        extraNotifyFieldsError,
      );
      paymentNotification.request = {
        method: "POST",
        body: unsignedBody,
      };
    } else if (!fulfillmentMethod) {
      paymentNotification.mode = "blocked";
      paymentNotification.reason = "missing_or_invalid_fulfillmentMethod";
      paymentNotification.request = {
        method: "POST",
        body: unsignedBody,
      };
    } else if (!machineKey) {
      paymentNotification.mode = "dry_run";
      paymentNotification.reason = "missing_KEXIAOZHAN_MACHINE_KEY";
      paymentNotification.request = {
        method: "POST",
        body: { ...unsignedBody, orderStatus: 1 },
      };
    } else {
      const body = await buildKexiaozhanPaymentNotification({
        ...unsignedBody,
        transactionId,
        orderStatus: 1,
      }, machineKey);
      const notifyGate = resolveKexiaozhanNotifyGate(payment.outTradeNo);
      const notifyEnabled = notifyGate.allowed;

      paymentNotification.mode = notifyEnabled ? "live" : "dry_run";
      if (!notifyEnabled && notifyGate.reason) {
        paymentNotification.reason = notifyGate.reason;
      }
      paymentNotification.request = {
        method: "POST",
        body,
      };

      if (notifyEnabled) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          paymentNotification.response = {
            ok: response.ok,
            status: response.status,
            body: truncateForMetadata(await response.text()),
          };
        } catch (error) {
          const message = error instanceof Error
            ? error.message
            : String(error);
          paymentNotification.response = {
            ok: false,
            error: truncateForMetadata(message),
          };
        }
      }
    }

    await recordKexiaozhanHandoffNotification(
      supabaseAdmin,
      payment,
      paymentNotification,
      stripePaymentIntentId,
    );

    const metadata = {
      ...existingMetadata,
      kexiaozhan: {
        ...existingKexiaozhan,
        payment: paymentMetadata,
        paymentNotification,
      },
    };

    const { data: updatedJob, error: updateError } =
      await (supabaseAdmin as ProductionJobsClient)
        .from("production_jobs")
        .update({ metadata })
        .eq("id", job.id)
        .select()
        .single();

    if (updateError) {
      console.error(
        "[ROUTE-FULFILLMENT] Kexiaozhan notification metadata update failed:",
        updateError,
      );
      return job;
    }

    return updatedJob
      ? updatedJob as ProductionJobRecord
      : { ...job, metadata };
  } catch (error) {
    console.error(
      "[ROUTE-FULFILLMENT] Kexiaozhan notification recording failed:",
      error,
    );
    return job;
  }
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
  const routeAuthKey = Deno.env.get("ROUTE_FULFILLMENT_AUTH_SECRET") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[ROUTE-FULFILLMENT] Missing Supabase configuration");
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authResponse = authorizeServiceRole(req, [
    serviceRoleKey,
    routeAuthKey,
  ]);
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

  if (provider === "onshore_manual" && !isOnshoreManualEnabled()) {
    console.error(
      "[ROUTE-FULFILLMENT] onshore_manual requested without ALLOW_ONSHORE_MANUAL=true",
    );
    return new Response(
      JSON.stringify({ error: "Onshore manual fulfillment is not enabled" }),
      {
        status: 403,
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
    const jobWithPaymentNotification =
      await recordKexiaozhanPaymentNotification(
        supabaseAdmin,
        order,
        existingJob,
      );

    await supabaseAdmin
      .from("orders")
      .update({
        status: orderStatusForJobStatus(jobWithPaymentNotification.status),
        fulfillment_provider: provider,
        fulfillment_order_id: jobWithPaymentNotification.id,
        fulfillment_status: jobWithPaymentNotification.fulfillment_status ??
          jobWithPaymentNotification.status,
        fulfillment_last_error: null,
        fulfillment_routed_at: new Date().toISOString(),
        printful_status: jobWithPaymentNotification.fulfillment_status ??
          jobWithPaymentNotification.status,
        printful_last_error: null,
        printful_next_attempt_at: null,
      })
      .eq("id", order.id);

    const shipping = await prepareEasyPostShipping(
      supabaseUrl,
      serviceRoleKey,
      jobWithPaymentNotification.id,
    );

    return new Response(
      JSON.stringify({
        success: true,
        provider,
        created: false,
        job: jobWithPaymentNotification,
        shipping,
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

  const expiredKexiaozhanResponse =
    await blockExpiredKexiaozhanHandoffBeforeFulfillment(
      supabaseAdmin,
      order,
    );
  if (expiredKexiaozhanResponse) return expiredKexiaozhanResponse;

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

    const jobWithPaymentNotification =
      await recordKexiaozhanPaymentNotification(
        supabaseAdmin,
        order,
        duplicateJob,
      );

    await supabaseAdmin
      .from("orders")
      .update({
        status: orderStatusForJobStatus(jobWithPaymentNotification.status),
        fulfillment_provider: provider,
        fulfillment_order_id: jobWithPaymentNotification.id,
        fulfillment_status: jobWithPaymentNotification.fulfillment_status ??
          jobWithPaymentNotification.status,
        fulfillment_last_error: null,
        fulfillment_routed_at: new Date().toISOString(),
        printful_status: jobWithPaymentNotification.fulfillment_status ??
          jobWithPaymentNotification.status,
        printful_last_error: null,
        printful_next_attempt_at: null,
      })
      .eq("id", order.id);

    const shipping = await prepareEasyPostShipping(
      supabaseUrl,
      serviceRoleKey,
      jobWithPaymentNotification.id,
    );

    return new Response(
      JSON.stringify({
        success: true,
        provider,
        created: false,
        job: jobWithPaymentNotification,
        shipping,
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

  const jobWithPaymentNotification = await recordKexiaozhanPaymentNotification(
    supabaseAdmin,
    order,
    insertedJob,
  );
  const shipping = await prepareEasyPostShipping(
    supabaseUrl,
    serviceRoleKey,
    jobWithPaymentNotification.id,
  );

  return new Response(
    JSON.stringify({
      success: true,
      provider,
      created: true,
      job: jobWithPaymentNotification,
      shipping,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});
