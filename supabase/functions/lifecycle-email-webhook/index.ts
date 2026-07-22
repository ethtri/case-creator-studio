import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  parseLifecycleProviderEvent,
  verifyLifecycleWebhook,
} from "../_shared/lifecycle-marketing-webhook.ts";

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
    status,
  });

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }
  if (req.headers.get("origin")) {
    return jsonResponse({ error: "browser_requests_blocked" }, 403);
  }

  const provider = (Deno.env.get("LIFECYCLE_EMAIL_PROVIDER") ?? "disabled")
    .trim().toLowerCase();
  const webhookSecret = Deno.env.get("LIFECYCLE_EMAIL_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (provider === "disabled" || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("[LIFECYCLE-WEBHOOK] Provider synchronization is disabled");
    return jsonResponse({ error: "not_configured" }, 503);
  }

  const rawBody = await req.text();
  const eventId = req.headers.get("x-lifecycle-event-id");
  const timestamp = req.headers.get("x-lifecycle-timestamp");
  const signature = req.headers.get("x-lifecycle-signature");
  if (!(await verifyLifecycleWebhook({
    eventId,
    rawBody,
    secret: webhookSecret,
    signature,
    timestamp,
  }))) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const event = parseLifecycleProviderEvent(rawBody, eventId ?? "");
  if (!event) return jsonResponse({ error: "invalid_payload" }, 400);

  const store = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await store.rpc("apply_lifecycle_provider_event", {
    p_event_id: event.eventId,
    p_event_type: event.eventType,
    p_occurred_at: event.occurredAt,
    p_provider: provider,
    p_provider_contact_id: event.providerContactId,
  });
  if (error) {
    console.error("[LIFECYCLE-WEBHOOK] Persistence failed without logging payload");
    return jsonResponse({ error: "persistence_failed" }, 500);
  }
  return jsonResponse({ outcome: data }, 200);
});
