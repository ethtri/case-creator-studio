import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { parseSvixSignatures } from "../_shared/svix.ts";

type ResendWebhookPayload = {
  type?: string;
  data?: Record<string, unknown>;
};

const SIGNATURE_HEADERS = {
  id: "svix-id",
  timestamp: "svix-timestamp",
  signature: "svix-signature",
};

function decodeSecret(secret: string): Uint8Array {
  const trimmed = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  try {
    const decoded = atob(trimmed);
    return new Uint8Array([...decoded].map((char) => char.charCodeAt(0)));
  } catch {
    return new TextEncoder().encode(secret);
  }
}

async function signPayload(secret: string, payload: string): Promise<string> {
  const keyBytes = decodeSecret(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
  if (!secret) {
    return true;
  }

  const msgId = req.headers.get(SIGNATURE_HEADERS.id);
  const timestamp = req.headers.get(SIGNATURE_HEADERS.timestamp);
  const signatureHeader = req.headers.get(SIGNATURE_HEADERS.signature);

  if (!msgId || !timestamp || !signatureHeader) {
    return false;
  }

  const signedPayload = `${msgId}.${timestamp}.${rawBody}`;
  const expectedSignature = await signPayload(secret, signedPayload);
  const providedSignatures = parseSvixSignatures(signatureHeader);

  return providedSignatures.some((sig) => sig === expectedSignature);
}

function extractMessageId(payload: ResendWebhookPayload): string | null {
  const data = payload.data ?? {};
  const id = (data as any)?.id ?? (data as any)?.email_id ?? null;
  return id ? String(id) : null;
}

function mapEventStatus(eventType: string | null): { status: string; error?: string | null } | null {
  if (!eventType) return null;
  const normalized = eventType.toLowerCase();

  if (normalized === "email.delivered") return { status: "delivered" };
  if (normalized === "email.sent") return { status: "sent" };
  if (normalized === "email.bounced") return { status: "bounced" };
  if (normalized === "email.complained") return { status: "complained" };
  if (normalized === "email.failed") return { status: "failed" };
  if (normalized === "email.opened") return { status: "opened" };
  if (normalized === "email.clicked") return { status: "clicked" };

  return { status: normalized };
}

function extractErrorMessage(payload: ResendWebhookPayload): string | null {
  const data = payload.data ?? {};
  const reason =
    (data as any)?.error ??
    (data as any)?.reason ??
    (data as any)?.bounced_reason ??
    (data as any)?.complaint_reason ??
    null;
  return reason ? String(reason) : null;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const isValid = await verifySignature(req, rawBody);
  if (!isValid) {
    console.error("[RESEND-WEBHOOK] Invalid signature");
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    console.error("[RESEND-WEBHOOK] Invalid JSON payload:", error);
    return new Response("Invalid payload", { status: 400 });
  }

  const messageId = extractMessageId(payload);
  const mapped = mapEventStatus(payload.type ?? null);
  if (!messageId || !mapped) {
    return new Response("OK", { status: 200 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[RESEND-WEBHOOK] Missing Supabase configuration");
    return new Response("Not configured", { status: 500 });
  }

  const supabaseClient = createClient(supabaseUrl, serviceRoleKey);
  const errorMessage = extractErrorMessage(payload);

  await supabaseClient
    .from("order_notifications")
    .update({
      status: mapped.status,
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_message_id", messageId);

  return new Response("OK", { status: 200 });
});
