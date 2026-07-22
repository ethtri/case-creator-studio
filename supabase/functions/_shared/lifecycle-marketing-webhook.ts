const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type LifecycleProviderEventType =
  | "contact.subscribed"
  | "contact.unsubscribed"
  | "email.bounced"
  | "email.complained"
  | "contact.suppressed";

export type LifecycleProviderEvent = {
  eventId: string;
  eventType: LifecycleProviderEventType;
  occurredAt: string;
  providerContactId: string;
};

const hexToBytes = (value: string): Uint8Array | null => {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null;
  return new Uint8Array(
    value.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? [],
  );
};

const toArrayBuffer = (value: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
};

export async function verifyLifecycleWebhook(input: {
  eventId: string | null;
  nowMs?: number;
  rawBody: string;
  secret: string | null | undefined;
  signature: string | null;
  timestamp: string | null;
}): Promise<boolean> {
  const secret = input.secret?.trim() ?? "";
  const signature = input.signature ? hexToBytes(input.signature) : null;
  if (!secret || !signature || !input.eventId || !input.timestamp) return false;
  if (!/^\d+$/.test(input.timestamp)) return false;
  const timestamp = Number(input.timestamp);
  if (!Number.isSafeInteger(timestamp)) return false;
  const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(now - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signed = `${input.eventId}.${input.timestamp}.${input.rawBody}`;
  return crypto.subtle.verify(
    "HMAC",
    key,
    toArrayBuffer(signature),
    new TextEncoder().encode(signed),
  );
}

const clean = (value: unknown, maximum: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum ? trimmed : null;
};

export function parseLifecycleProviderEvent(
  rawBody: string,
  eventId: string,
): LifecycleProviderEvent | null {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }
  const eventType = clean(body.type, 64) as LifecycleProviderEventType | null;
  const providerContactId = clean(body.contact_id, 255);
  const occurredAt = clean(body.occurred_at, 64);
  if (
    !eventType ||
    ![
      "contact.subscribed",
      "contact.unsubscribed",
      "email.bounced",
      "email.complained",
      "contact.suppressed",
    ].includes(eventType) ||
    !providerContactId ||
    !occurredAt ||
    Number.isNaN(Date.parse(occurredAt))
  ) {
    return null;
  }
  return {
    eventId,
    eventType,
    occurredAt: new Date(occurredAt).toISOString(),
    providerContactId,
  };
}
