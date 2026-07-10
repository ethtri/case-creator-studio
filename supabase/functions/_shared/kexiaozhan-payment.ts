export type KexiaozhanSignableValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export type KexiaozhanSignableRecord = Record<string, KexiaozhanSignableValue>;

export type KexiaozhanPaymentNotificationInput = {
  outTradeNo: string;
  transactionId: string;
  amount: string;
  extraInfo?: string;
  orderStatus: 0 | 1 | 2;
  payTime: string;
} & KexiaozhanSignableRecord;

export type KexiaozhanPaymentNotification =
  & { sign: string }
  & KexiaozhanPaymentNotificationInput;

export type KexiaozhanPaymentStatusQueryInput = {
  outTradeNo: string;
  machineSn: string;
};

export const KEXIAOZHAN_FULFILLMENT_METHODS = [
  "immediatePrint",
  "deferredPrint",
] as const;

export type KexiaozhanFulfillmentMethod =
  (typeof KEXIAOZHAN_FULFILLMENT_METHODS)[number];

const DEFAULT_EXCLUDED_FIELDS = new Set(["sign"]);
const RESERVED_PAYMENT_NOTIFICATION_FIELDS = new Set([
  "sign",
  "outTradeNo",
  "transactionId",
  "amount",
  "extraInfo",
  "orderStatus",
  "payTime",
]);

function compareAscii(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function stringifySignableValue(
  value: KexiaozhanSignableValue,
): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text === "" ? null : text;
}

export function buildKexiaozhanSigningString(
  fields: KexiaozhanSignableRecord,
  excludedFields: Iterable<string> = DEFAULT_EXCLUDED_FIELDS,
): string {
  const excluded = new Set(excludedFields);

  return Object.entries(fields)
    .filter(([key]) => !excluded.has(key))
    .map(([key, value]) => [key, stringifySignableValue(value)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null)
    .sort(([left], [right]) => compareAscii(left, right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  if (!secret.trim()) {
    throw new Error("Kexiaozhan machineKey is required");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function signKexiaozhanPayload(
  fields: KexiaozhanSignableRecord,
  machineKey: string,
): Promise<string> {
  return await hmacSha256Hex(
    machineKey,
    buildKexiaozhanSigningString(fields),
  );
}

export function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;

  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }
  return diff === 0;
}

export async function verifyKexiaozhanSignature(
  fields: KexiaozhanSignableRecord,
  machineKey: string,
  signature: string,
): Promise<boolean> {
  const expected = await signKexiaozhanPayload(fields, machineKey);
  return timingSafeEqual(expected, signature.trim().toLowerCase());
}

export async function buildKexiaozhanPaymentNotification(
  input: KexiaozhanPaymentNotificationInput,
  machineKey: string,
): Promise<KexiaozhanPaymentNotification> {
  const sign = await signKexiaozhanPayload(input, machineKey);
  return { sign, ...input };
}

export async function buildKexiaozhanPaymentStatusQuery(
  input: KexiaozhanPaymentStatusQueryInput,
  machineKey: string,
): Promise<URLSearchParams> {
  const sign = await signKexiaozhanPayload(input, machineKey);
  return new URLSearchParams({ ...input, sign });
}

export function parseKexiaozhanPaymentNotificationExtraFields(
  rawValue: string | null | undefined,
): KexiaozhanSignableRecord {
  const text = rawValue?.trim();
  if (!text) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (_error) {
    throw new Error(
      "KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON must be valid JSON",
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      "KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON must be a JSON object",
    );
  }

  const fields: KexiaozhanSignableRecord = {};
  for (const [key, value] of Object.entries(parsed)) {
    const field = key.trim();
    if (!field) {
      throw new Error(
        "KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON cannot contain an empty field name",
      );
    }
    if (RESERVED_PAYMENT_NOTIFICATION_FIELDS.has(field)) {
      throw new Error(
        `KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON cannot override ${field}`,
      );
    }
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new Error(
        `KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON field ${field} must be a string, number, or boolean`,
      );
    }
    fields[field] = value;
  }

  return fields;
}

export function getKexiaozhanFulfillmentMethod(
  fields: KexiaozhanSignableRecord,
): KexiaozhanFulfillmentMethod | null {
  const value = fields.fulfillmentMethod;
  if (value === "immediatePrint" || value === "deferredPrint") {
    return value;
  }
  return null;
}

export function formatKexiaozhanPayTimeUtc(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
