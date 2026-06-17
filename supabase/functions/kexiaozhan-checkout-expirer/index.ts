import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  KEXIAOZHAN_CHECKOUT_EXPIRED_ERROR,
  parseKexiaozhanCheckoutExpiryLeewaySeconds,
  shouldExpireKexiaozhanCheckout,
} from "../_shared/kexiaozhan-checkout-expiry.ts";
import { getStripeSecretKey } from "../_shared/stripe-config.ts";

const DEFAULT_BATCH_LIMIT = 25;
const MAX_BATCH_LIMIT = 100;
const DEFAULT_EXPIRY_LEEWAY_SECONDS = 60;

type JsonRecord = Record<string, unknown>;

type KexiaozhanHandoffRow = {
  id: string;
  out_trade_no: string;
  stripe_session_id: string | null;
  status: string;
  expires_at: string;
};

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

function readBatchLimit(value: unknown): number {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
    ? Number(value)
    : DEFAULT_BATCH_LIMIT;

  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new Error("limit must be a positive integer");
  }

  return Math.min(numeric, MAX_BATCH_LIMIT);
}

async function readPayload(req: Request): Promise<JsonRecord> {
  if (req.method === "GET") {
    return Object.fromEntries(new URL(req.url).searchParams.entries());
  }

  const text = await req.text();
  if (!text.trim()) return {};

  const parsed = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object");
  }
  return parsed as JsonRecord;
}

function isDryRun(payload: JsonRecord): boolean {
  const value = payload.dryRun ?? payload.dry_run;
  if (value === true) return true;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes"].includes(value.trim().toLowerCase());
}

function truncate(value: string, maxLength = 1000): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const browserResponse = blockBrowserRequests(req);
  if (browserResponse) return browserResponse;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const expirerAuthSecret =
    Deno.env.get("KEXIAOZHAN_CHECKOUT_EXPIRER_AUTH_SECRET") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[KEXIAOZHAN-EXPIRER] Missing Supabase configuration");
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authResponse = authorizeServiceRole(req, [
    serviceRoleKey,
    expirerAuthSecret,
  ]);
  if (authResponse) return authResponse;

  let payload: JsonRecord;
  try {
    payload = await readPayload(req);
  } catch (error) {
    console.error("[KEXIAOZHAN-EXPIRER] Invalid request:", error);
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let limit: number;
  let leewaySeconds: number;
  try {
    limit = readBatchLimit(payload.limit);
    leewaySeconds = parseKexiaozhanCheckoutExpiryLeewaySeconds(
      Deno.env.get("KEXIAOZHAN_CHECKOUT_EXPIRY_LEEWAY_SECONDS"),
      DEFAULT_EXPIRY_LEEWAY_SECONDS,
    );
  } catch (error) {
    console.error("[KEXIAOZHAN-EXPIRER] Invalid configuration:", error);
    return new Response(JSON.stringify({ error: "Invalid configuration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const dryRun = isDryRun(payload);
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const stripe = new Stripe(getStripeSecretKey("KEXIAOZHAN-EXPIRER"), {
    apiVersion: "2025-08-27.basil",
  });
  const now = new Date();
  const cutoff = new Date(
    now.getTime() + leewaySeconds * 1000,
  ).toISOString();

  const { data, error } = await supabaseAdmin
    .from("kexiaozhan_handoffs")
    .select("id,out_trade_no,stripe_session_id,status,expires_at")
    .in("status", ["received", "checkout_created"])
    .lte("expires_at", cutoff)
    .order("expires_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[KEXIAOZHAN-EXPIRER] Handoff query failed:", error);
    return new Response(JSON.stringify({ error: "Query failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let markedExpired = 0;
  let stripeExpired = 0;
  let alreadyExpired = 0;
  let skipped = 0;
  const errors: JsonRecord[] = [];

  for (const handoff of (data ?? []) as KexiaozhanHandoffRow[]) {
    if (!shouldExpireKexiaozhanCheckout(handoff, now, leewaySeconds)) {
      skipped += 1;
      continue;
    }

    try {
      if (!handoff.stripe_session_id) {
        if (!dryRun) {
          const { error: updateError } = await supabaseAdmin
            .from("kexiaozhan_handoffs")
            .update({
              status: "expired",
              last_error:
                `${KEXIAOZHAN_CHECKOUT_EXPIRED_ERROR}; no Stripe session`,
            })
            .eq("id", handoff.id);
          if (updateError) throw updateError;
        }
        markedExpired += 1;
        continue;
      }

      const session = await stripe.checkout.sessions.retrieve(
        handoff.stripe_session_id,
      );

      if (session.status === "open") {
        if (!dryRun) {
          await stripe.checkout.sessions.expire(handoff.stripe_session_id);
          const { error: updateError } = await supabaseAdmin
            .from("kexiaozhan_handoffs")
            .update({
              status: "expired",
              last_error: KEXIAOZHAN_CHECKOUT_EXPIRED_ERROR,
            })
            .eq("id", handoff.id);
          if (updateError) throw updateError;
        }
        stripeExpired += 1;
      } else if (session.status === "expired") {
        if (!dryRun) {
          const { error: updateError } = await supabaseAdmin
            .from("kexiaozhan_handoffs")
            .update({
              status: "expired",
              last_error: KEXIAOZHAN_CHECKOUT_EXPIRED_ERROR,
            })
            .eq("id", handoff.id);
          if (updateError) throw updateError;
        }
        alreadyExpired += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({
        outTradeNo: handoff.out_trade_no,
        stripeSessionId: handoff.stripe_session_id,
        error: truncate(message),
      });

      if (!dryRun) {
        await supabaseAdmin
          .from("kexiaozhan_handoffs")
          .update({
            last_error: truncate(`Checkout expiry failed: ${message}`),
          })
          .eq("id", handoff.id);
      }
    }
  }

  return new Response(
    JSON.stringify({
      dryRun,
      cutoff,
      leewaySeconds,
      scanned: data?.length ?? 0,
      markedExpired,
      stripeExpired,
      alreadyExpired,
      skipped,
      errors: errors.slice(0, 10),
    }),
    {
      status: errors.length > 0 ? 207 : 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});
