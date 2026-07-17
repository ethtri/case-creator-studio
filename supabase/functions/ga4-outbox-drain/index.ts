import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  type AnalyticsOutboxClaim,
  drainAnalyticsOutbox,
} from "../_shared/analytics-outbox.ts";
import {
  type Ga4Order,
  postGa4Measurement,
} from "../_shared/ga4-measurement.ts";

const DEFAULT_BATCH_LIMIT = 25;
const MAX_BATCH_LIMIT = 100;
const GA4_REQUEST_TIMEOUT_MS = 10_000;

type JsonRecord = Record<string, unknown>;

const jsonResponse = (body: JsonRecord, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });

const authorizeServiceRole = (
  req: Request,
  allowedKeys: string[],
): Response | null => {
  const authHeader = req.headers.get("authorization") ??
    req.headers.get("Authorization");
  const apiKey = req.headers.get("apikey");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  const validKeys = allowedKeys.filter(Boolean);
  if (
    !validKeys.includes(bearerToken ?? "") &&
    !validKeys.includes(apiKey ?? "")
  ) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  return null;
};

const blockBrowserRequests = (req: Request): Response | null =>
  req.headers.get("origin")
    ? jsonResponse(
      { error: "This endpoint is not accessible from browsers" },
      403,
    )
    : null;

const readPayload = async (req: Request): Promise<JsonRecord> => {
  if (req.method === "GET") {
    return Object.fromEntries(new URL(req.url).searchParams.entries());
  }
  const text = await req.text();
  if (!text.trim()) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object");
  }
  return parsed as JsonRecord;
};

const readLimit = (value: unknown) => {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
    ? Number(value)
    : DEFAULT_BATCH_LIMIT;
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("limit must be a positive integer");
  }
  return Math.min(parsed, MAX_BATCH_LIMIT);
};

const asClaims = (data: unknown): AnalyticsOutboxClaim[] => {
  if (!Array.isArray(data)) {
    throw new Error("Analytics claim response was not an array");
  }
  return data.map((value) => {
    if (
      !value ||
      typeof value !== "object" ||
      typeof value.id !== "string" ||
      typeof value.event_key !== "string" ||
      typeof value.event_name !== "string" ||
      typeof value.claim_token !== "string"
    ) {
      throw new Error("Analytics claim response was malformed");
    }
    return value as AnalyticsOutboxClaim;
  });
};

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const browserResponse = blockBrowserRequests(req);
  if (browserResponse) return browserResponse;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const drainAuthSecret =
    Deno.env.get("GA4_OUTBOX_DRAIN_AUTH_SECRET") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[GA4-OUTBOX] Missing Supabase configuration");
    return jsonResponse({ error: "Server not configured" }, 500);
  }

  const authResponse = authorizeServiceRole(req, [
    serviceRoleKey,
    drainAuthSecret,
  ]);
  if (authResponse) return authResponse;

  let limit: number;
  try {
    limit = readLimit((await readPayload(req)).limit);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : String(error) },
      400,
    );
  }

  const store = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const measurementId = Deno.env.get("GA4_MEASUREMENT_ID");
  const apiSecret = Deno.env.get("GA4_API_SECRET");

  try {
    const summary = await drainAnalyticsOutbox({
      async claimBatch(batchLimit, workerId, now) {
        const { data, error } = await store.rpc(
          "claim_analytics_event_batch",
          {
            p_limit: batchLimit,
            p_now: now,
            p_worker_id: workerId,
          },
        );
        if (error) throw new Error(error.message);
        return asClaims(data);
      },
      async complete(claim, httpStatus, now) {
        const { data, error } = await store.rpc(
          "complete_analytics_event",
          {
            p_claim_token: claim.claim_token,
            p_event_id: claim.id,
            p_http_status: httpStatus,
            p_now: now,
          },
        );
        if (error) throw new Error(error.message);
        return data === true;
      },
      deliver(payload) {
        return postGa4Measurement({
          apiSecret,
          measurementId,
          payload,
          signal: AbortSignal.timeout(GA4_REQUEST_TIMEOUT_MS),
        });
      },
      async fail(claim, failure, now) {
        const { data, error } = await store.rpc(
          "fail_analytics_event",
          {
            p_claim_token: claim.claim_token,
            p_error: failure.message,
            p_event_id: claim.id,
            p_failure_kind: failure.failureKind,
            p_http_status: failure.httpStatus,
            p_now: now,
          },
        );
        if (error) throw new Error(error.message);
        if (!Array.isArray(data) || data.length !== 1) {
          throw new Error("Analytics failure transition lost claim ownership");
        }
        const status = data[0]?.status;
        if (status !== "failed" && status !== "dead_letter") {
          throw new Error("Analytics failure transition returned invalid status");
        }
        return status;
      },
      async finalizeWithoutDelivery(
        claim,
        status,
        reason,
        failureKind,
        now,
      ) {
        const { data, error } = await store.rpc(
          "finalize_analytics_event_without_delivery",
          {
            p_claim_token: claim.claim_token,
            p_event_id: claim.id,
            p_failure_kind: failureKind,
            p_now: now,
            p_reason: reason,
            p_status: status,
          },
        );
        if (error) throw new Error(error.message);
        return data === true;
      },
      async loadOrder(orderId) {
        const { data, error } = await store
          .from("orders")
          .select(
            "id,items,total,shipping_cost,discount_total,promotion_code,analytics_client_id,analytics_consent",
          )
          .eq("id", orderId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data as Ga4Order | null;
      },
      async markAmbiguous(claim, reason, httpStatus, now) {
        const { data, error } = await store.rpc(
          "mark_analytics_event_ambiguous",
          {
            p_claim_token: claim.claim_token,
            p_error: reason,
            p_event_id: claim.id,
            p_http_status: httpStatus,
            p_now: now,
          },
        );
        if (error) throw new Error(error.message);
        return data === true;
      },
      async renewLease(claim, now) {
        const { data, error } = await store.rpc(
          "renew_analytics_event_lease",
          {
            p_claim_token: claim.claim_token,
            p_event_id: claim.id,
            p_now: now,
          },
        );
        if (error) throw new Error(error.message);
        return data === true;
      },
    }, limit);

    const unhealthy = summary.transitionErrors > 0 ||
      summary.splitBrainPersistenceFailures > 0;
    if (unhealthy) {
      console.error("[GA4-OUTBOX] Drain completed with state errors", summary);
    } else if (
      summary.ambiguous > 0 ||
      summary.deadLetter > 0 ||
      summary.leaseLost > 0
    ) {
      console.warn("[GA4-OUTBOX] Drain requires operator review", summary);
    } else {
      console.log("[GA4-OUTBOX] Drain completed", summary);
    }

    return jsonResponse(summary, unhealthy ? 500 : 200);
  } catch (error) {
    console.error("[GA4-OUTBOX] Drain failed before completion", error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
