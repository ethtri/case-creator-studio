import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  resolveOfficialSnapcaseEmail,
  SNAPCASE_EMAILS,
} from "../_shared/email-identities.ts";

const LOOKBACK_MINUTES = 15;
const STALE_MINUTES = 3;
const SYNTHETIC_RETENTION_HOURS = 30;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });

function authorized(req: Request, expected: string): boolean {
  if (!expected || expected.length < 32 || req.headers.get("origin")) {
    return false;
  }
  const authorization = req.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const apiKey = req.headers.get("apikey") ?? "";
  return bearer === expected || apiKey === expected;
}

async function countQuery(
  query: PromiseLike<{ count: number | null; error: unknown }>,
) {
  const { count, error } = await query;
  if (error) throw new Error("checkout_health_query_failed");
  return count ?? 0;
}

async function sendAlert(input: {
  kind: "outage" | "recovery";
  incidentId: string;
  counts: {
    internalFailures: number;
    clientRejections: number;
    staleHandoffs: number;
  };
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!apiKey) throw new Error("checkout_alert_provider_not_configured");
  const recipient = resolveOfficialSnapcaseEmail(
    Deno.env.get("CHECKOUT_ALERT_EMAIL"),
    SNAPCASE_EMAILS.support,
    "CHECKOUT_ALERT_EMAIL",
  );
  const from = resolveOfficialSnapcaseEmail(
    Deno.env.get("RESEND_FROM_EMAIL"),
    SNAPCASE_EMAILS.hello,
    "RESEND_FROM_EMAIL",
  );
  const outage = input.kind === "outage";
  const subject = outage
    ? "P0 checkout handoff alert - Snapcase"
    : "Checkout handoff recovered - Snapcase";
  const summary = outage
    ? `The production checkout handoff is unhealthy. Internal failures: ${input.counts.internalFailures}; rejected Stripe URLs: ${input.counts.clientRejections}; unobserved redirects: ${input.counts.staleHandoffs}.`
    : "A successful browser-to-Stripe redirect has been observed after the checkout incident.";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `checkout-${input.kind}-${input.incidentId}`,
    },
    body: JSON.stringify({
      from: `Snapcase Checkout Monitor <${from}>`,
      to: recipient,
      subject,
      text:
        `${summary}\n\nIncident: ${input.incidentId}\nWindow: ${LOOKBACK_MINUTES} minutes\nRunbook: https://github.com/ethtri/case-creator-studio/issues/280`,
      html:
        `<p>${summary}</p><p><strong>Incident:</strong> ${input.incidentId}<br><strong>Window:</strong> ${LOOKBACK_MINUTES} minutes</p><p><a href="https://github.com/ethtri/case-creator-studio/issues/280">Open the incident runbook</a></p>`,
    }),
  });
  if (!response.ok) throw new Error("checkout_alert_delivery_failed");
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const monitorSecret = Deno.env.get("CHECKOUT_HEALTH_MONITOR_AUTH_SECRET") ??
    "";
  if (!supabaseUrl || !serviceRoleKey || !authorized(req, monitorSecret)) {
    return json({ error: "unauthorized" }, 401);
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const now = new Date();
  const lookback = new Date(now.getTime() - LOOKBACK_MINUTES * 60_000)
    .toISOString();
  const stale = new Date(now.getTime() - STALE_MINUTES * 60_000).toISOString();
  const syntheticCutoff = new Date(
    now.getTime() - SYNTHETIC_RETENTION_HOURS * 3_600_000,
  ).toISOString();

  try {
    const [internalFailures, clientRejections, staleHandoffs] = await Promise
      .all([
        countQuery(
          client.from("checkout_attempts").select("id", {
            count: "exact",
            head: true,
          })
            .eq("status", "server_failed").eq("error_code", "internal_failure")
            .gte("started_at", lookback),
        ),
        countQuery(
          client.from("checkout_attempts").select("id", {
            count: "exact",
            head: true,
          })
            .eq("status", "client_rejected").gte("started_at", lookback),
        ),
        countQuery(
          client.from("checkout_attempts").select("id", {
            count: "exact",
            head: true,
          })
            .eq("status", "server_completed").is("client_observed_at", null)
            .lte("server_completed_at", stale)
            .gte("started_at", lookback),
        ),
      ]);
    const counts = { internalFailures, clientRejections, staleHandoffs };
    const unhealthy = Object.values(counts).some((count) => count > 0);

    const { data: state, error: stateError } = await client.from(
      "checkout_health_state",
    )
      .select("incident_id,incident_started_at,incident_open,alert_status")
      .eq("singleton", true).single();
    if (stateError) throw new Error("checkout_health_state_unavailable");

    let action: "none" | "outage" | "recovery" = "none";
    let incidentId = state.incident_id as string | null;
    if (unhealthy && !state.incident_open) {
      incidentId = crypto.randomUUID();
      const { data: claimed, error } = await client.from(
        "checkout_health_state",
      ).update({
        incident_id: incidentId,
        incident_started_at: now.toISOString(),
        incident_open: true,
        alert_status: "pending",
        updated_at: now.toISOString(),
      }).eq("singleton", true).eq("incident_open", false).select("incident_id")
        .maybeSingle();
      if (error) throw new Error("checkout_health_claim_failed");
      if (claimed) action = "outage";
    } else if (
      unhealthy && state.incident_open && incidentId &&
      state.alert_status !== "sent"
    ) {
      action = "outage";
    } else if (
      !unhealthy && state.incident_open && state.incident_started_at &&
      incidentId
    ) {
      const successfulRedirects = await countQuery(
        client.from("checkout_attempts").select("id", {
          count: "exact",
          head: true,
        })
          .eq("status", "redirect_accepted").gt(
            "client_observed_at",
            state.incident_started_at,
          ),
      );
      if (successfulRedirects > 0) action = "recovery";
    }

    if (action !== "none" && incidentId) {
      try {
        await sendAlert({ kind: action, incidentId, counts });
        await client.from("checkout_health_state").update(
          action === "outage"
            ? {
              alert_status: "sent",
              last_alerted_at: now.toISOString(),
              updated_at: now.toISOString(),
            }
            : {
              incident_open: false,
              alert_status: "idle",
              last_recovered_at: now.toISOString(),
              updated_at: now.toISOString(),
            },
        ).eq("singleton", true).eq("incident_id", incidentId);
      } catch (error) {
        console.error(
          JSON.stringify({ event: "checkout_health_alert_failed", action }),
        );
        await client.from("checkout_health_state").update({
          alert_status: "failed",
          updated_at: now.toISOString(),
        }).eq("singleton", true).eq("incident_id", incidentId);
        throw error;
      }
    }

    const { error: cleanupError } = await client.from("orders").update({
      status: "canceled",
    })
      .eq("is_synthetic", true).eq("status", "pending").lt(
        "created_at",
        syntheticCutoff,
      );
    if (cleanupError) throw new Error("checkout_synthetic_cleanup_failed");

    console.log(
      JSON.stringify({
        event: "checkout_health_checked",
        action,
        unhealthy,
        ...counts,
      }),
    );
    return json({ ok: true, action, unhealthy, counts });
  } catch (error) {
    console.error(JSON.stringify({ event: "checkout_health_monitor_failed" }));
    return json({
      error: error instanceof Error ? error.message : "internal_failure",
    }, 500);
  }
});
