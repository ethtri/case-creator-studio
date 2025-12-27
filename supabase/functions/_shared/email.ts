const RESEND_API_URL = "https://api.resend.com/emails";

const DEFAULT_SITE_URL = "https://snapcase.ai";
const DEFAULT_SUPPORT_EMAIL = "support@snapcase.ai";

export type OrderEmailEvent =
  | "order_confirmed"
  | "order_processing"
  | "order_shipped"
  | "order_delivered"
  | "order_canceled"
  | "order_failed";

type OrderItem = {
  brand?: string;
  model?: string;
  quantity?: number;
  price?: number;
};

type OrderRecord = {
  id: string;
  customer_email?: string | null;
  customer_name?: string | null;
  items?: OrderItem[] | null;
  subtotal?: number | null;
  shipping_cost?: number | null;
  total?: number | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  tracking_carrier?: string | null;
};

type SendOrderEmailOptions = {
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  trackingCarrier?: string | null;
  siteUrl?: string;
  supportEmail?: string;
};

type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

const SUBJECTS: Record<OrderEmailEvent, string> = {
  order_confirmed: "Order confirmed - Snapcase",
  order_processing: "Your Snapcase is in production",
  order_shipped: "Your Snapcase has shipped",
  order_delivered: "Your Snapcase has been delivered",
  order_canceled: "Order canceled - Snapcase",
  order_failed: "Issue with your Snapcase order",
};

const HEADLINES: Record<OrderEmailEvent, string> = {
  order_confirmed: "Thanks for your order",
  order_processing: "We are making your case",
  order_shipped: "Your order is on the way",
  order_delivered: "Delivered",
  order_canceled: "Order canceled",
  order_failed: "We hit a snag",
};

const DESCRIPTIONS: Record<OrderEmailEvent, string> = {
  order_confirmed: "We received your order and are getting it ready for production.",
  order_processing: "Your custom case is now in production. We will notify you when it ships.",
  order_shipped: "Your order has shipped. Use the tracking link below to follow delivery.",
  order_delivered: "Your order was delivered. We hope you love your new case!",
  order_canceled: "Your order was canceled. If this is unexpected, please contact support.",
  order_failed: "We ran into an issue fulfilling your order. Please contact support for help.",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCurrency(value: number | null | undefined): string {
  const normalized = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `$${normalized.toFixed(2)} USD`;
}

function formatOrderId(orderId: string): string {
  if (!orderId) return "";
  return orderId.slice(0, 8).toUpperCase();
}

function buildFromAddress(): string {
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  if (!fromEmail) {
    throw new Error("RESEND_FROM_EMAIL is required");
  }
  const fromName = Deno.env.get("RESEND_FROM_NAME") ?? "";
  return fromName ? `${fromName} <${fromEmail}>` : fromEmail;
}

function getSiteUrl(options?: SendOrderEmailOptions): string {
  return options?.siteUrl ?? Deno.env.get("SITE_URL") ?? DEFAULT_SITE_URL;
}

function getSupportEmail(options?: SendOrderEmailOptions): string {
  return options?.supportEmail ?? Deno.env.get("SUPPORT_EMAIL") ?? DEFAULT_SUPPORT_EMAIL;
}

function renderItems(items: OrderItem[] | null | undefined): string {
  if (!items || items.length === 0) {
    return "<li>Custom Phone Case</li>";
  }
  return items
    .map((item) => {
      const brand = item.brand ? escapeHtml(item.brand) : "Custom";
      const model = item.model ? escapeHtml(item.model) : "Case";
      const quantity = item.quantity ? ` x${item.quantity}` : "";
      return `<li>${brand} ${model}${quantity}</li>`;
    })
    .join("");
}

function renderOrderEmail(eventType: OrderEmailEvent, order: OrderRecord, options?: SendOrderEmailOptions): RenderedEmail {
  const siteUrl = getSiteUrl(options);
  const supportEmail = getSupportEmail(options);
  const orderNumber = formatOrderId(order.id);
  const trackingNumber = options?.trackingNumber ?? order.tracking_number ?? null;
  const trackingUrl = options?.trackingUrl ?? order.tracking_url ?? null;
  const trackingCarrier = options?.trackingCarrier ?? order.tracking_carrier ?? null;

  const trackingLine = trackingUrl
    ? `<p style="margin: 8px 0 0 0;"><strong>Tracking:</strong> <a href="${trackingUrl}">${escapeHtml(trackingNumber ?? trackingUrl)}</a></p>`
    : trackingNumber
      ? `<p style="margin: 8px 0 0 0;"><strong>Tracking:</strong> ${escapeHtml(trackingNumber)}</p>`
      : "";
  const carrierLine = trackingCarrier ? `<p style="margin: 4px 0 0 0;"><strong>Carrier:</strong> ${escapeHtml(trackingCarrier)}</p>` : "";

  const html = `
  <div style="font-family: Arial, Helvetica, sans-serif; background-color: #f6f6f6; padding: 24px;">
    <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 24px;">
      <h1 style="font-size: 22px; margin: 0 0 8px 0;">${HEADLINES[eventType]}</h1>
      <p style="margin: 0 0 16px 0; color: #444;">${DESCRIPTIONS[eventType]}</p>
      ${trackingLine}
      ${carrierLine}
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="margin: 0 0 8px 0;"><strong>Order #</strong> ${escapeHtml(orderNumber)}</p>
      <ul style="margin: 0 0 8px 18px; padding: 0;">
        ${renderItems(order.items ?? [])}
      </ul>
      <p style="margin: 0;"><strong>Total:</strong> ${formatCurrency(order.total ?? 0)}</p>
      <p style="margin: 16px 0 0 0;">
        <a href="${siteUrl}/orders">View your order status</a>
      </p>
      <p style="margin: 16px 0 0 0; font-size: 12px; color: #777;">
        Need help? Contact <a href="mailto:${supportEmail}">${escapeHtml(supportEmail)}</a>
      </p>
    </div>
  </div>
  `;

  const textLines = [
    HEADLINES[eventType],
    DESCRIPTIONS[eventType],
    trackingUrl ? `Tracking: ${trackingUrl}` : trackingNumber ? `Tracking: ${trackingNumber}` : "",
    trackingCarrier ? `Carrier: ${trackingCarrier}` : "",
    `Order #${orderNumber}`,
    `Total: ${formatCurrency(order.total ?? 0)}`,
    `Order status: ${siteUrl}/orders`,
    `Support: ${supportEmail}`,
  ].filter(Boolean);

  return {
    subject: SUBJECTS[eventType],
    html,
    text: textLines.join("\n"),
  };
}

async function sendResendEmail(payload: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<{ id?: string; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required");
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: buildFromAddress(),
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      reply_to: payload.replyTo,
    }),
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.message ?? data?.error ?? "Resend request failed";
    return { error: message };
  }

  return { id: data?.id };
}

export async function sendOrderEmail(
  supabaseClient: any,
  eventType: OrderEmailEvent,
  order: OrderRecord,
  options?: SendOrderEmailOptions,
): Promise<{ sent: boolean; skipped: boolean }> {
  if (!order?.id) {
    return { sent: false, skipped: true };
  }

  const recipientEmail = order.customer_email ?? "";
  if (!recipientEmail) {
    return { sent: false, skipped: true };
  }

  const { data: existing, error: lookupError } = await supabaseClient
    .from("order_notifications")
    .select("id, status")
    .eq("order_id", order.id)
    .eq("event_type", eventType)
    .maybeSingle();

  if (lookupError) {
    console.error("[EMAIL] Failed to check notification state:", lookupError);
  }

  if (existing?.status === "sent") {
    return { sent: false, skipped: true };
  }

  let notificationId = existing?.id ?? null;
  if (!notificationId) {
    const { data: inserted, error: insertError } = await supabaseClient
      .from("order_notifications")
      .insert({
        order_id: order.id,
        event_type: eventType,
        recipient_email: recipientEmail,
        status: "pending",
        provider: "resend",
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return { sent: false, skipped: true };
      }
      console.error("[EMAIL] Failed to create notification record:", insertError);
      return { sent: false, skipped: true };
    }
    notificationId = inserted?.id ?? null;
  } else if (existing?.status && existing.status !== "pending") {
    await supabaseClient
      .from("order_notifications")
      .update({ status: "pending", error_message: null })
      .eq("id", notificationId);
  }

  const rendered = renderOrderEmail(eventType, order, options);
  const sendResult = await sendResendEmail({
    to: recipientEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    replyTo: getSupportEmail(options),
  });

  if (sendResult.error) {
    if (notificationId) {
      await supabaseClient
        .from("order_notifications")
        .update({
          status: "failed",
          error_message: sendResult.error,
        })
        .eq("id", notificationId);
    }
    console.error("[EMAIL] Resend send failed:", sendResult.error);
    return { sent: false, skipped: false };
  }

  if (notificationId) {
    await supabaseClient
      .from("order_notifications")
      .update({
        status: "sent",
        provider_message_id: sendResult.id ?? null,
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", notificationId);
  }

  return { sent: true, skipped: false };
}
