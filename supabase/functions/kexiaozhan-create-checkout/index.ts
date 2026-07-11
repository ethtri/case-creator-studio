import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getCorsHeaders, requireAllowedOrigin } from "../_shared/cors.ts";
import { getStripeSecretKey } from "../_shared/stripe-config.ts";
import {
  buildKexiaozhanSignedPayload,
  isAllowedKexiaozhanMachineSn,
  KEXIAOZHAN_DEFERRED_HANDOFF_MAX_AGE_SECONDS,
  normalizeKexiaozhanRedirectParams,
  resolveKexiaozhanHandoffMaxAgeSeconds,
  sameKexiaozhanSignedPayload,
  toKexiaozhanPaymentContext,
  validateKexiaozhanHandoffFreshness,
  verifyKexiaozhanRedirectSignature,
} from "../_shared/kexiaozhan-handoff.ts";
import {
  getKexiaozhanFulfillmentMethod,
  parseKexiaozhanPaymentNotificationExtraFields,
} from "../_shared/kexiaozhan-payment.ts";

const TRUE_VALUES = new Set(["1", "true", "yes"]);
const DEFAULT_PRODUCT_PRICE_CENTS = 2999;
const DEFAULT_SHIPPING_CENTS = 499;
const DEFAULT_CHECKOUT_CURRENCY = "usd";
const DEFAULT_PREVIEW_URL =
  "https://snapcase.ai/placeholder-vendor-preview.png";
const STRIPE_CHECKOUT_SESSION_SECONDS = 31 * 60;

const requestSchema = z.object({
  customerEmail: z.string().email().max(255),
  params: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
}).strict();

type HandoffRow = {
  id: string;
  out_trade_no: string;
  signed_payload: unknown;
  customer_email?: string | null;
  stripe_session_id?: string | null;
  snapcase_order_id?: string | null;
  status: string;
};

type OrderIdRow = {
  id: string;
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function isOnshoreManualEnabled(): boolean {
  return TRUE_VALUES.has(
    (Deno.env.get("ALLOW_ONSHORE_MANUAL") ?? "").trim().toLowerCase(),
  );
}

function getFulfillmentProvider(): string {
  return (
    Deno.env.get("FULFILLMENT_PROVIDER") ??
      Deno.env.get("ROUTE_FULFILLMENT_PROVIDER") ??
      "printful"
  ).trim().toLowerCase();
}

function readIntegerEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name)?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = readIntegerEnv(name, fallback);
  if (value <= 0) {
    throw new Error(`${name} must be greater than zero`);
  }
  return value;
}

function readCheckoutCurrency(): string {
  const currency = (Deno.env.get("KEXIAOZHAN_CHECKOUT_CURRENCY") ??
    DEFAULT_CHECKOUT_CURRENCY).trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) {
    throw new Error("KEXIAOZHAN_CHECKOUT_CURRENCY must be a 3-letter code");
  }
  return currency;
}

function clampText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildOrderItem(
  params: ReturnType<typeof normalizeKexiaozhanRedirectParams>,
  unitAmountCents: number,
): Record<string, unknown> {
  const payment = toKexiaozhanPaymentContext(params);
  const displayName = clampText(params.goods_name, 120);

  return {
    variantId: "kexiaozhan-vendor-case",
    brand: "Kexiaozhan",
    model: displayName,
    price: unitAmountCents / 100,
    quantity: 1,
    designPreview: DEFAULT_PREVIEW_URL,
    edmTemplateId: null,
    designId: `kexiaozhan_${params.out_trade_no}`.slice(0, 100),
    externalProductId: params.machine_sn,
    designSource: "kexiaozhan",
    vendorDesign: {
      provider: "kexiaozhan",
      handoffId: params.out_trade_no,
      orderNo: params.order_no,
      kexiaozhanPayment: payment,
    },
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  init: ResponseInit,
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      "Content-Type": "application/json",
    },
  });
}

function checkoutSessionIsOpen(session: Stripe.Checkout.Session): boolean {
  return session.status === "open" && typeof session.url === "string" &&
    session.url.length > 0;
}

function handoffStatusAllowsCheckout(status: string): boolean {
  return status === "received" || status === "checkout_created";
}

function getPostgrestErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders },
    );
  }

  try {
    if (getFulfillmentProvider() !== "onshore_manual") {
      throw new HttpError(
        409,
        "onshore_manual_required",
        "Kexiaozhan checkout requires onshore manual fulfillment",
      );
    }

    if (!isOnshoreManualEnabled()) {
      throw new HttpError(
        403,
        "onshore_manual_disabled",
        "Onshore manual fulfillment is not enabled",
      );
    }

    const checkoutOrigin = requireAllowedOrigin(req, "KEXIAOZHAN-CHECKOUT");
    const rawBody = requestSchema.parse(await req.json());
    const customerEmail = normalizeEmail(rawBody.customerEmail);
    const params = normalizeKexiaozhanRedirectParams(rawBody.params);

    const machineKey = Deno.env.get("KEXIAOZHAN_MACHINE_KEY")?.trim() ?? "";
    if (!machineKey) {
      throw new HttpError(
        500,
        "missing_machine_key",
        "Kexiaozhan machine key is not configured",
      );
    }

    const allowedMachineSn = Deno.env.get("KEXIAOZHAN_ALLOWED_MACHINE_SN") ??
      Deno.env.get("KEXIAOZHAN_MACHINE_SN") ?? "";
    if (!isAllowedKexiaozhanMachineSn(params.machine_sn, allowedMachineSn)) {
      throw new HttpError(
        403,
        "machine_not_allowed",
        "Kexiaozhan machine is not allowed",
      );
    }

    let fulfillmentMethod: string | null = null;
    try {
      fulfillmentMethod = getKexiaozhanFulfillmentMethod(
        parseKexiaozhanPaymentNotificationExtraFields(
          Deno.env.get("KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON"),
        ),
      );
    } catch {
      // Route fulfillment will report the invalid configuration before it mutates Kexiaozhan.
    }

    const configuredMaxAgeSeconds = readPositiveIntegerEnv(
      "KEXIAOZHAN_HANDOFF_MAX_AGE_SECONDS",
      KEXIAOZHAN_DEFERRED_HANDOFF_MAX_AGE_SECONDS,
    );
    const maxAgeSeconds = resolveKexiaozhanHandoffMaxAgeSeconds(
      configuredMaxAgeSeconds,
      fulfillmentMethod,
    );
    const futureSkewSeconds = readIntegerEnv(
      "KEXIAOZHAN_HANDOFF_FUTURE_SKEW_SECONDS",
      5 * 60,
    );
    const freshness = validateKexiaozhanHandoffFreshness(
      params,
      new Date(),
      maxAgeSeconds,
      futureSkewSeconds,
    );

    const signatureOk = await verifyKexiaozhanRedirectSignature(
      params,
      machineKey,
    );
    if (!signatureOk) {
      throw new HttpError(
        401,
        "invalid_signature",
        "Invalid Kexiaozhan signature",
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase service role is not configured");
    }

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey);
    const stripe = new Stripe(getStripeSecretKey("KEXIAOZHAN-CHECKOUT"), {
      apiVersion: "2025-08-27.basil",
    });

    const { data: existing, error: existingError } = await supabaseClient
      .from("kexiaozhan_handoffs")
      .select("*")
      .eq("out_trade_no", params.out_trade_no)
      .maybeSingle();

    if (existingError) {
      console.error(
        "[KEXIAOZHAN-CHECKOUT] Existing lookup failed:",
        existingError,
      );
      throw new Error("Unable to load Kexiaozhan handoff");
    }

    let existingHandoff = existing as HandoffRow | null;
    if (existingHandoff) {
      if (!handoffStatusAllowsCheckout(existingHandoff.status)) {
        throw new HttpError(
          409,
          "handoff_not_open",
          "This Kexiaozhan handoff is no longer open",
        );
      }

      if (
        !sameKexiaozhanSignedPayload(existingHandoff.signed_payload, params)
      ) {
        throw new HttpError(
          409,
          "changed_replay",
          "Kexiaozhan handoff fields changed for this payment number",
        );
      }

      if (
        existingHandoff.customer_email &&
        normalizeEmail(existingHandoff.customer_email) !== customerEmail
      ) {
        throw new HttpError(
          409,
          "email_mismatch",
          "This Kexiaozhan handoff is already tied to another email",
        );
      }

      if (existingHandoff.stripe_session_id) {
        const session = await stripe.checkout.sessions.retrieve(
          existingHandoff.stripe_session_id,
        );
        if (checkoutSessionIsOpen(session)) {
          return jsonResponse(
            {
              url: session.url,
              sessionId: session.id,
              existing: true,
            },
            { status: 200, headers: corsHeaders },
          );
        }

        throw new HttpError(
          409,
          "checkout_not_open",
          "This Kexiaozhan checkout is no longer open",
        );
      }
    } else {
      const { error: insertHandoffError } = await supabaseClient
        .from("kexiaozhan_handoffs")
        .insert({
          out_trade_no: params.out_trade_no,
          order_no: params.order_no,
          machine_sn: params.machine_sn,
          nonce: params.nonce,
          amount: params.amount,
          currency: params.currency,
          goods_name: params.goods_name,
          sign: params.sign,
          signed_payload: buildKexiaozhanSignedPayload(params),
          handoff_timestamp: freshness.handoffTimestamp.toISOString(),
          expires_at: freshness.expiresAt.toISOString(),
          status: "received",
        });

      if (insertHandoffError) {
        if (getPostgrestErrorCode(insertHandoffError) === "23505") {
          const { data: racedHandoff, error: racedHandoffError } =
            await supabaseClient
              .from("kexiaozhan_handoffs")
              .select("*")
              .eq("out_trade_no", params.out_trade_no)
              .maybeSingle();

          if (racedHandoffError) {
            console.error(
              "[KEXIAOZHAN-CHECKOUT] Raced handoff lookup failed:",
              racedHandoffError,
            );
            throw new Error("Unable to load Kexiaozhan handoff");
          }

          existingHandoff = racedHandoff as HandoffRow | null;
          if (!existingHandoff) {
            throw new HttpError(
              409,
              "nonce_replay",
              "Kexiaozhan nonce was already used",
            );
          }

          if (!handoffStatusAllowsCheckout(existingHandoff.status)) {
            throw new HttpError(
              409,
              "handoff_not_open",
              "This Kexiaozhan handoff is no longer open",
            );
          }

          if (
            !sameKexiaozhanSignedPayload(existingHandoff.signed_payload, params)
          ) {
            throw new HttpError(
              409,
              "changed_replay",
              "Kexiaozhan handoff fields changed for this payment number",
            );
          }
        } else {
          console.error(
            "[KEXIAOZHAN-CHECKOUT] Handoff insert failed:",
            insertHandoffError,
          );
          throw new Error("Unable to save Kexiaozhan handoff");
        }
      }
    }

    if (existingHandoff) {
      if (!handoffStatusAllowsCheckout(existingHandoff.status)) {
        throw new HttpError(
          409,
          "handoff_not_open",
          "This Kexiaozhan handoff is no longer open",
        );
      }

      if (
        existingHandoff.customer_email &&
        normalizeEmail(existingHandoff.customer_email) !== customerEmail
      ) {
        throw new HttpError(
          409,
          "email_mismatch",
          "This Kexiaozhan handoff is already tied to another email",
        );
      }

      if (existingHandoff.stripe_session_id) {
        const session = await stripe.checkout.sessions.retrieve(
          existingHandoff.stripe_session_id,
        );
        if (checkoutSessionIsOpen(session)) {
          return jsonResponse(
            {
              url: session.url,
              sessionId: session.id,
              existing: true,
            },
            { status: 200, headers: corsHeaders },
          );
        }

        throw new HttpError(
          409,
          "checkout_not_open",
          "This Kexiaozhan checkout is no longer open",
        );
      }
    }

    const unitAmountCents = readPositiveIntegerEnv(
      "KEXIAOZHAN_CHECKOUT_UNIT_AMOUNT_CENTS",
      DEFAULT_PRODUCT_PRICE_CENTS,
    );
    const shippingCents = readIntegerEnv(
      "KEXIAOZHAN_CHECKOUT_SHIPPING_CENTS",
      DEFAULT_SHIPPING_CENTS,
    );
    const checkoutCurrency = readCheckoutCurrency();
    const subtotal = unitAmountCents / 100;
    const shippingCost = shippingCents / 100;
    const total = subtotal + shippingCost;
    const orderItem = buildOrderItem(params, unitAmountCents);
    const productName = clampText(
      Deno.env.get("KEXIAOZHAN_CHECKOUT_PRODUCT_NAME")?.trim() ||
        params.goods_name ||
        "Custom phone case",
      200,
    );

    const query = new URLSearchParams(buildKexiaozhanSignedPayload(params));
    const session = await stripe.checkout.sessions.create({
      customer_email: customerEmail,
      client_reference_id: params.out_trade_no,
      line_items: [
        {
          price_data: {
            currency: checkoutCurrency,
            product_data: {
              name: productName,
              description: "Custom designed phone case",
              metadata: {
                source: "kexiaozhan",
                outTradeNo: params.out_trade_no,
                machineSn: params.machine_sn,
              },
            },
            unit_amount: unitAmountCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url:
        `${checkoutOrigin}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${checkoutOrigin}/kexiaozhan/checkout?${query.toString()}`,
      shipping_address_collection: {
        allowed_countries: ["US"],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: {
              amount: shippingCents,
              currency: checkoutCurrency,
            },
            display_name: "Standard shipping",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 2 },
              maximum: { unit: "business_day", value: 4 },
            },
          },
        },
      ],
      expires_at: Math.floor(Date.now() / 1000) +
        STRIPE_CHECKOUT_SESSION_SECONDS,
      metadata: {
        source: "kexiaozhan",
        orderNo: params.order_no,
        outTradeNo: params.out_trade_no,
        machineSn: params.machine_sn,
      },
      payment_intent_data: {
        metadata: {
          source: "kexiaozhan",
          orderNo: params.order_no,
          outTradeNo: params.out_trade_no,
          machineSn: params.machine_sn,
        },
      },
    }, {
      idempotencyKey: `kexiaozhan-checkout-${params.out_trade_no}`.slice(
        0,
        255,
      ),
    });

    const { data: insertedOrder, error: orderError } = await supabaseClient
      .from("orders")
      .insert({
        stripe_session_id: session.id,
        customer_email: customerEmail,
        items: [orderItem],
        subtotal,
        shipping_cost: shippingCost,
        discount_total: 0,
        marketing_attribution: {
          source: "kexiaozhan",
          orderNo: params.order_no,
          outTradeNo: params.out_trade_no,
          machineSn: params.machine_sn,
          receivedAt: new Date().toISOString(),
        },
        total,
        status: "pending",
        fulfillment_provider: "onshore_manual",
      })
      .select("id")
      .single();

    let snapcaseOrderId = (insertedOrder as OrderIdRow | null)?.id ?? null;
    if (orderError || !snapcaseOrderId) {
      if (getPostgrestErrorCode(orderError) === "23505") {
        const { data: existingOrder, error: existingOrderError } =
          await supabaseClient
            .from("orders")
            .select("id")
            .eq("stripe_session_id", session.id)
            .maybeSingle();

        if (existingOrderError) {
          console.error(
            "[KEXIAOZHAN-CHECKOUT] Existing order lookup failed:",
            existingOrderError,
          );
        } else {
          snapcaseOrderId = (existingOrder as OrderIdRow | null)?.id ?? null;
        }
      }
    }

    if (!snapcaseOrderId) {
      console.error("[KEXIAOZHAN-CHECKOUT] Order insert failed:", orderError);
      await supabaseClient.from("kexiaozhan_handoffs")
        .update({
          status: "failed",
          last_error: "Database order creation failed",
        })
        .eq("out_trade_no", params.out_trade_no);
      throw new Error("Database order creation failed");
    }

    const { error: updateHandoffError } = await supabaseClient
      .from("kexiaozhan_handoffs")
      .update({
        status: "checkout_created",
        customer_email: customerEmail,
        snapcase_order_id: snapcaseOrderId,
        stripe_session_id: session.id,
        last_error: null,
      })
      .eq("out_trade_no", params.out_trade_no);

    if (updateHandoffError) {
      console.error(
        "[KEXIAOZHAN-CHECKOUT] Handoff update failed:",
        updateHandoffError,
      );
    }

    return jsonResponse(
      {
        url: session.url,
        sessionId: session.id,
        existing: false,
      },
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    console.error("[KEXIAOZHAN-CHECKOUT] Failed:", error);
    const status = error instanceof HttpError ? error.status : 500;
    const code = error instanceof HttpError ? error.code : "server_error";
    const message = error instanceof HttpError
      ? error.message
      : "Unable to start Kexiaozhan checkout";

    return jsonResponse(
      { error: message, code },
      { status, headers: corsHeaders },
    );
  }
});
