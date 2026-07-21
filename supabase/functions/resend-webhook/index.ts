import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  handleResendWebhookRequest,
  type ResendWebhookEvent,
  type ResendWebhookPersistenceOutcome,
} from "../_shared/resend-webhook.ts";

serve(async (req) => {
  return handleResendWebhookRequest(req, {
    webhookSecret: Deno.env.get("RESEND_WEBHOOK_SECRET"),
    persistEvent: async (event: ResendWebhookEvent) => {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("Missing Supabase configuration");
      }

      const supabaseClient = createClient(supabaseUrl, serviceRoleKey);
      const { data, error } = await supabaseClient.rpc(
        "apply_resend_webhook_event",
        {
          p_svix_id: event.svixId,
          p_provider_message_id: event.providerMessageId,
          p_event_type: event.eventType,
          p_delivery_status: event.deliveryStatus,
          p_event_created_at: event.eventCreatedAt,
          p_error_message: event.errorMessage,
        },
      );

      if (error) throw error;
      if (
        !["applied", "duplicate", "out_of_order", "unmatched"].includes(data)
      ) {
        throw new Error("Unexpected webhook persistence result");
      }

      return data as ResendWebhookPersistenceOutcome;
    },
  });
});
