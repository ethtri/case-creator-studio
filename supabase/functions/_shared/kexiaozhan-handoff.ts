import {
  buildKexiaozhanSigningString,
  type KexiaozhanSignableRecord,
  verifyKexiaozhanSignature,
} from "./kexiaozhan-payment.ts";

export type KexiaozhanRedirectParams = {
  order_no: string;
  out_trade_no: string;
  amount: string;
  goods_name: string;
  currency: string;
  machine_sn: string;
  timestamp: string;
  nonce: string;
  sign: string;
};

export type KexiaozhanHandoffFreshness = {
  handoffTimestamp: Date;
  expiresAt: Date;
};

export type KexiaozhanPaymentContext = {
  orderNo: string;
  outTradeNo: string;
  amount: string;
  goodsName: string;
  currency: string;
  machineSn: string;
  timestamp: string;
  nonce: string;
  sign: string;
};

const REQUIRED_FIELDS = [
  "order_no",
  "out_trade_no",
  "amount",
  "goods_name",
  "currency",
  "machine_sn",
  "timestamp",
  "nonce",
  "sign",
] as const;

const MAX_FIELD_LENGTHS: Record<keyof KexiaozhanRedirectParams, number> = {
  order_no: 200,
  out_trade_no: 200,
  amount: 50,
  goods_name: 500,
  currency: 3,
  machine_sn: 200,
  timestamp: 20,
  nonce: 200,
  sign: 128,
};

function readStringField(
  input: Record<string, unknown>,
  field: keyof KexiaozhanRedirectParams,
): string {
  const value = input[field];
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`Missing Kexiaozhan field: ${field}`);
  }

  const text = String(value).trim();
  if (!text) {
    throw new Error(`Missing Kexiaozhan field: ${field}`);
  }

  const maxLength = MAX_FIELD_LENGTHS[field];
  if (text.length > maxLength) {
    throw new Error(`Kexiaozhan field is too long: ${field}`);
  }

  return text;
}

export function normalizeKexiaozhanRedirectParams(
  input: Record<string, unknown>,
): KexiaozhanRedirectParams {
  const params = Object.fromEntries(
    REQUIRED_FIELDS.map((field) => [field, readStringField(input, field)]),
  ) as KexiaozhanRedirectParams;

  params.sign = params.sign.toLowerCase();

  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(params.amount)) {
    throw new Error("Invalid Kexiaozhan amount");
  }

  if (!/^[A-Za-z]{3}$/.test(params.currency)) {
    throw new Error("Invalid Kexiaozhan currency");
  }

  if (!/^\d+$/.test(params.timestamp)) {
    throw new Error("Invalid Kexiaozhan timestamp");
  }

  if (!/^[a-f0-9]{64}$/.test(params.sign)) {
    throw new Error("Invalid Kexiaozhan sign");
  }

  return params;
}

export function parseKexiaozhanTimestampSeconds(timestamp: string): number {
  const seconds = Number(timestamp);
  if (
    !Number.isSafeInteger(seconds) || seconds <= 0 ||
    seconds > 9_999_999_999
  ) {
    throw new Error("Invalid Kexiaozhan timestamp");
  }
  return seconds;
}

export function validateKexiaozhanHandoffFreshness(
  params: Pick<KexiaozhanRedirectParams, "timestamp">,
  now = new Date(),
  maxAgeSeconds = 15 * 60,
  futureSkewSeconds = 5 * 60,
): KexiaozhanHandoffFreshness {
  const timestampSeconds = parseKexiaozhanTimestampSeconds(params.timestamp);
  const handoffTimestamp = new Date(timestampSeconds * 1000);
  const ageMs = now.getTime() - handoffTimestamp.getTime();

  if (ageMs > maxAgeSeconds * 1000) {
    throw new Error("Kexiaozhan handoff has expired");
  }

  if (ageMs < -futureSkewSeconds * 1000) {
    throw new Error("Kexiaozhan handoff timestamp is in the future");
  }

  return {
    handoffTimestamp,
    expiresAt: new Date(handoffTimestamp.getTime() + maxAgeSeconds * 1000),
  };
}

export function kexiaozhanRedirectParamsToSignableRecord(
  params: KexiaozhanRedirectParams,
): KexiaozhanSignableRecord {
  return { ...params };
}

export function buildKexiaozhanRedirectSigningString(
  params: KexiaozhanRedirectParams,
): string {
  return buildKexiaozhanSigningString(
    kexiaozhanRedirectParamsToSignableRecord(params),
  );
}

export async function verifyKexiaozhanRedirectSignature(
  params: KexiaozhanRedirectParams,
  machineKey: string,
): Promise<boolean> {
  return await verifyKexiaozhanSignature(
    kexiaozhanRedirectParamsToSignableRecord(params),
    machineKey,
    params.sign,
  );
}

export function isAllowedKexiaozhanMachineSn(
  machineSn: string,
  configuredMachineSn: string,
): boolean {
  const allowed = configuredMachineSn
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return allowed.length === 0 || allowed.includes(machineSn);
}

export function toKexiaozhanPaymentContext(
  params: KexiaozhanRedirectParams,
): KexiaozhanPaymentContext {
  return {
    orderNo: params.order_no,
    outTradeNo: params.out_trade_no,
    amount: params.amount,
    goodsName: params.goods_name,
    currency: params.currency,
    machineSn: params.machine_sn,
    timestamp: params.timestamp,
    nonce: params.nonce,
    sign: params.sign,
  };
}

export function sameKexiaozhanSignedPayload(
  left: unknown,
  right: KexiaozhanRedirectParams,
): boolean {
  if (typeof left !== "object" || left === null || Array.isArray(left)) {
    return false;
  }

  const record = left as Record<string, unknown>;
  return REQUIRED_FIELDS.every((field) => record[field] === right[field]);
}

export function buildKexiaozhanSignedPayload(
  params: KexiaozhanRedirectParams,
): Record<string, string> {
  return Object.fromEntries(
    REQUIRED_FIELDS.map((field) => [field, params[field]]),
  );
}
