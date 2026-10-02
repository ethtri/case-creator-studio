import { handleResendWebhookRequest } from "./resend-webhook.ts";
export async function handleLifecycleNativeWebhook(req: Request, options: {
  secret: string;
  persist: (args: Record<string, string>) => Promise<any>;
  now?: () => number;
}) {
  if (req.headers.get("origin")) {
    return new Response("Browser requests blocked", { status: 403 });
  }
  return handleResendWebhookRequest(req, {
    webhookSecret: options.secret,
    now: options.now,
    persistEvent: (event) =>
      options.persist({
        p_event: event.svixId,
        p_message: event.providerMessageId,
        p_type: event.eventType,
        p_at: event.eventCreatedAt,
      }),
  });
}
