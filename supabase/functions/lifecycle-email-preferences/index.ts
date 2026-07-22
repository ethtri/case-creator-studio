import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, requireAllowedOrigin } from "../_shared/cors.ts";
import {
  validateSignupInput,
  type SignupInput,
} from "../_shared/lifecycle-marketing.ts";

type JsonRecord = Record<string, unknown>;

const jsonResponse = (
  req: Request,
  body: JsonRecord,
  status = 200,
) => new Response(JSON.stringify(body), {
  headers: {
    ...getCorsHeaders(req, "GET, POST, OPTIONS"),
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  },
  status,
});

const readJson = async (req: Request): Promise<JsonRecord> => {
  const body = await req.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("invalid_request");
  }
  return body as JsonRecord;
};

const isOneClickRequest = async (req: Request) => {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) return false;
  const body = await req.text();
  return new URLSearchParams(body).get("List-Unsubscribe") === "One-Click";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: getCorsHeaders(req, "GET, POST, OPTIONS"),
    });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[LIFECYCLE-PREFERENCES] Server configuration is missing");
    return jsonResponse(req, { error: "temporarily_unavailable" }, 503);
  }
  const store = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const url = new URL(req.url);

  try {
    if (req.method === "GET") {
      requireAllowedOrigin(req, "LIFECYCLE-PREFERENCES");
      const token = url.searchParams.get("token") ?? "";
      const { data, error } = await store.rpc(
        "get_lifecycle_preference_state",
        { p_token: token },
      );
      if (error) throw new Error("preference_lookup_failed");
      return jsonResponse(req, data as JsonRecord);
    }

    const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      // RFC 8058 one-click requests carry no browser login or analytics state.
      // Never log the token or request body.
      const token = url.searchParams.get("token") ?? "";
      if (!(await isOneClickRequest(req)) || !token) {
        return jsonResponse(req, { error: "invalid_request" }, 400);
      }
      const { data, error } = await store.rpc(
        "unsubscribe_lifecycle_marketing",
        { p_token: token, p_request_id: crypto.randomUUID() },
      );
      if (error) throw new Error("unsubscribe_failed");
      const result = data as JsonRecord;
      const status = result.status === "invalid" ? 400 : 200;
      return jsonResponse(req, result, status);
    }

    requireAllowedOrigin(req, "LIFECYCLE-PREFERENCES");
    const body = await readJson(req);
    if (body.action === "subscribe") {
      const validation = validateSignupInput(body as SignupInput);
      if (!validation.ok) {
        // Honeypot responses remain indistinguishable from ordinary acceptance.
        if (validation.code === "bot_rejected") {
          return jsonResponse(req, {
            status: "preference_preserved",
            contractVersion: "1.0.0",
          });
        }
        return jsonResponse(req, { error: validation.code }, 400);
      }
      const value = validation.value;
      const { data, error } = await store.rpc(
        "register_lifecycle_marketing_consent",
        {
          p_campaign: value.campaign,
          p_consent_copy_version: value.consentCopyVersion,
          p_consent_granted: true,
          p_email: value.email,
          p_placement: value.placement,
          p_privacy_policy_version: value.policyVersion,
          p_request_id: value.requestId,
          p_source: value.source,
        },
      );
      if (error) throw new Error("signup_failed");
      const result = data as JsonRecord;
      if (result.status === "suppressed" || result.status === "already_subscribed") {
        return jsonResponse(req, {
          contractVersion: result.contractVersion,
          status: "preference_preserved",
        });
      }
      return jsonResponse(req, result);
    }

    if (body.action === "status" || body.action === "unsubscribe") {
      const token = typeof body.token === "string" ? body.token.trim() : "";
      if (!token || token.length > 256) {
        return jsonResponse(req, { error: "invalid_request" }, 400);
      }
      if (body.action === "status") {
        const { data, error } = await store.rpc(
          "get_lifecycle_preference_state",
          { p_token: token },
        );
        if (error) throw new Error("preference_lookup_failed");
        return jsonResponse(req, data as JsonRecord);
      }
      const requestId = typeof body.requestId === "string"
        ? body.requestId
        : crypto.randomUUID();
      const { data, error } = await store.rpc(
        "unsubscribe_lifecycle_marketing",
        { p_token: token, p_request_id: requestId },
      );
      if (error) throw new Error("unsubscribe_failed");
      return jsonResponse(req, data as JsonRecord);
    }

    return jsonResponse(req, { error: "invalid_request" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "request_failed";
    if (message.includes("Origin is not allowed")) {
      return jsonResponse(req, { error: "origin_not_allowed" }, 403);
    }
    console.error("[LIFECYCLE-PREFERENCES] Request failed without logging identity");
    return jsonResponse(req, { error: "temporarily_unavailable" }, 503);
  }
});
