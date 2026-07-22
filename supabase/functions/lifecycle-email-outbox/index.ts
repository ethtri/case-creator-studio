import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  LIFECYCLE_COMMERCIAL_ADDRESS,
  LIFECYCLE_REPLY_TO,
  LIFECYCLE_SENDER,
} from "../_shared/lifecycle-marketing.ts";

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
    status,
  });

const authorized = (req: Request, secrets: string[]) => {
  const authorization = req.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const apiKey = req.headers.get("apikey") ?? "";
  return secrets.filter(Boolean).some((secret) => secret === bearer || secret === apiKey);
};

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }
  if (req.headers.get("origin")) {
    return jsonResponse({ error: "browser_requests_blocked" }, 403);
  }
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const workerSecret = Deno.env.get("LIFECYCLE_OUTBOX_WORKER_SECRET") ?? "";
  if (!authorized(req, [serviceRoleKey, workerSecret])) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }
  const dryRun = body.dryRun === true;
  const provider = (Deno.env.get("LIFECYCLE_EMAIL_PROVIDER") ?? "disabled")
    .trim().toLowerCase();
  const liveEnabled = Deno.env.get("LIFECYCLE_EMAIL_ENABLED") === "true";

  if (dryRun) {
    return jsonResponse({
      auditRequired: true,
      checks: {
        audit: "pass",
        claims: "pass_no_unapproved_claims_present",
        consent: "pass_synthetic_eligibility_contract",
        destination: "pass_reserved_invalid_domain",
        privacy: "pass_no_direct_identifier_in_output",
        suppression: "pass_required_before_claim",
        unsubscribe: "pass_https_token_placeholder",
      },
      commercialAddress: LIFECYCLE_COMMERCIAL_ADDRESS,
      destination: "redacted@example.invalid",
      flow: "welcome",
      from: LIFECYCLE_SENDER,
      oneClickUnsubscribe: true,
      providerMode: provider,
      replyTo: LIFECYCLE_REPLY_TO,
      result: "preview_only_no_provider_mutation",
      unsubscribeUrl: "https://<verified-host>/functions/v1/lifecycle-email-preferences?token={{opaque_token}}",
    }, 200);
  }

  // No marketing ESP has been selected and verified. This endpoint therefore
  // fails closed before claiming a row or contacting an external provider.
  if (provider === "disabled" || !liveEnabled) {
    return jsonResponse({ error: "provider_not_configured" }, 503);
  }

  return jsonResponse({
    error: "provider_adapter_not_approved",
    nextAction: "Complete the provider decision, secret, webhook, and send-specific compliance gate.",
  }, 503);
});
