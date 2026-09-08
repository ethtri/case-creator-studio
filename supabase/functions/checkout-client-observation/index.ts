import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getCorsHeaders, requireAllowedOrigin } from "../_shared/cors.ts";

const observationSchema = z.object({
  checkoutAttemptId: z.string().uuid(),
  outcome: z.enum(["redirect_accepted", "client_rejected"]),
  errorCode: z.literal("invalid_checkout_url").optional(),
}).superRefine((value, context) => {
  if (value.outcome === "client_rejected" && !value.errorCode) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Rejected observations require an error code",
    });
  }
  if (value.outcome === "redirect_accepted" && value.errorCode) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Accepted observations cannot include an error code",
    });
  }
});

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    if (!req.headers.get("origin")) {
      return new Response("Origin required", {
        status: 403,
        headers: corsHeaders,
      });
    }
    requireAllowedOrigin(req, "CHECKOUT-CLIENT-OBSERVATION");
    const parsed = observationSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response("Invalid observation", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing database configuration");
    }

    const observedAt = new Date().toISOString();
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await supabase
      .from("checkout_attempts")
      .update({
        status: parsed.data.outcome,
        error_code: parsed.data.errorCode ?? null,
        client_observed_at: observedAt,
        updated_at: observedAt,
      })
      .eq("id", parsed.data.checkoutAttemptId)
      .eq("status", "server_completed")
      .select("id")
      .maybeSingle();

    if (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "checkout_client_observation_failed",
        checkoutAttemptId: parsed.data.checkoutAttemptId,
        errorCode: "database_update_failed",
      }));
      throw new Error("Observation persistence failed");
    }

    console.log(JSON.stringify({
      level: "info",
      event: data
        ? "checkout_client_observation_recorded"
        : "checkout_client_observation_ignored",
      checkoutAttemptId: parsed.data.checkoutAttemptId,
      outcome: parsed.data.outcome,
    }));

    return new Response(null, { status: 204, headers: corsHeaders });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "checkout_client_observation_request_failed",
      errorCode: error instanceof SyntaxError
        ? "invalid_json"
        : "request_failed",
    }));
    return new Response("Observation failed", {
      status: 500,
      headers: corsHeaders,
    });
  }
});
