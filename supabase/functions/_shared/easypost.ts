const EASYPOST_API_BASE_URL = "https://api.easypost.com/v2";
const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_LABEL_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_SAFE_ERROR_LENGTH = 240;

const EASYPOST_FILE_HOST_PATTERN =
  /^easypost-files\.s3(?:[.-][a-z]{2}(?:-gov)?-[a-z]+-\d)?\.amazonaws\.com$/;
const EASYPOST_ID_PATTERNS = {
  address: /^adr_[A-Za-z0-9]+$/,
  rate: /^rate_[A-Za-z0-9]+$/,
  shipment: /^shp_[A-Za-z0-9]+$/,
} as const;

export interface EasyPostAddressMappingInput {
  name?: unknown;
  company?: unknown;
  address?: unknown;
  address2?: unknown;
  street1?: unknown;
  street2?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
  country?: unknown;
  phone?: unknown;
  email?: unknown;
  residential?: unknown;
}

export interface EasyPostAddressInput {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
  residential?: boolean;
}

export interface EasyPostAddress
  extends EasyPostAddressInput, Record<string, unknown> {
  id: string;
  object: "Address";
  mode?: "test" | "production";
  corrected: boolean;
  verifications?: Record<string, unknown>;
}

export interface EasyPostParcelConfig {
  length: number;
  width: number;
  height: number;
  weight: number;
}

export interface EasyPostParcelConfigInput {
  length: string | number | undefined;
  width: string | number | undefined;
  height: string | number | undefined;
  weight: string | number | undefined;
}

export interface EasyPostRatePolicy {
  allowedCarriers: string[];
  allowedServices: string[];
  maxRateCents: number;
  maxDeliveryDays?: number;
  currency: string;
}

export interface EasyPostRatePolicyInput {
  allowedCarriers: string | string[] | undefined;
  allowedServices: string | string[] | undefined;
  maxRateCents: string | number | undefined;
  maxDeliveryDays?: string | number | undefined;
  currency?: string | undefined;
}

export interface EasyPostRate extends Record<string, unknown> {
  id: string;
  carrier: string;
  service: string;
  rate: string;
  currency: string;
  delivery_days?: number | null;
  est_delivery_days?: number | null;
  carrier_account_id?: string | null;
  shipment_id?: string;
}

export interface EasyPostSelectedRate extends EasyPostRate {
  amountCents: number;
  deliveryDays: number | null;
  eligibleRateCount: number;
}

export interface EasyPostPostageLabel {
  label_file_type?: string | null;
  label_pdf_url?: string | null;
  label_size?: string | null;
  label_url?: string | null;
}

export interface EasyPostShipment extends Record<string, unknown> {
  id: string;
  object: "Shipment";
  mode?: "test" | "production";
  rates: EasyPostRate[];
  selected_rate?: EasyPostRate | null;
  postage_label?: EasyPostPostageLabel | null;
  tracking_code?: string | null;
  status?: string | null;
  refund_status?: string | null;
  tracker?: Record<string, unknown> | null;
  messages?: unknown[];
}

export interface EasyPostCreateShipmentInput {
  toAddressId: string;
  fromAddressId: string;
  returnAddressId?: string;
  parcel: EasyPostParcelConfig;
  reference?: string;
  carrierAccountIds?: string[];
}

export interface EasyPostSafeError {
  code: string;
  message: string;
  status?: number;
}

export type EasyPostWebhookFailureReason =
  | "invalid_configuration"
  | "missing_header"
  | "invalid_signature";

export type EasyPostWebhookValidation =
  | { valid: true }
  | { valid: false; reason: EasyPostWebhookFailureReason };

export interface EasyPostWebhookValidationInput {
  secret: string;
  headers: Headers | Record<string, string | undefined>;
  rawBody: string | Uint8Array;
}

export interface EasyPostClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxLabelBytes?: number;
}

export class EasyPostApiError extends Error {
  readonly safeError: EasyPostSafeError;

  constructor(safeError: EasyPostSafeError) {
    super(safeError.message);
    this.name = "EasyPostApiError";
    this.safeError = safeError;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  }).join("");
}

function parseConfigObject(
  raw: string | Record<string, unknown> | undefined,
  configName: string,
) {
  if (raw === undefined || (typeof raw === "string" && !raw.trim())) {
    throw new Error(`${configName} is required`);
  }

  let parsed: unknown;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`${configName} must be valid JSON`);
    }
  } else {
    parsed = raw;
  }

  if (!isRecord(parsed)) {
    throw new Error(`${configName} must be a JSON object`);
  }
  return parsed;
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  configName: string,
) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new Error(`${configName} contains unsupported fields`);
  }
}

function requireFiniteNumber(
  value: unknown,
  field: string,
  max: number,
): number {
  const normalized = typeof value === "string" &&
      /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
    ? Number(value)
    : value;
  if (
    typeof normalized !== "number" || !Number.isFinite(normalized) ||
    normalized <= 0 || normalized > max
  ) {
    throw new Error(
      `${field} must be a positive number no greater than ${max}`,
    );
  }
  return normalized;
}

function requireInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const normalized = typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value)
    ? Number(value)
    : value;
  if (
    typeof normalized !== "number" || !Number.isInteger(normalized) ||
    normalized < minimum || normalized > maximum
  ) {
    throw new Error(
      `${field} must be an integer from ${minimum} through ${maximum}`,
    );
  }
  return normalized;
}

function requireStringList(value: unknown, field: string): string[] {
  const values = typeof value === "string" ? value.split(",") : value;
  if (!Array.isArray(values) || values.length === 0 || values.length > 50) {
    throw new Error(`${field} must be a non-empty string array`);
  }

  const normalized = values.map((item) => {
    if (
      typeof item !== "string" || item.trim().length === 0 ||
      item.trim().length > 80 || hasControlCharacters(item)
    ) {
      throw new Error(`${field} contains an invalid value`);
    }
    return item.trim();
  });

  if (
    new Set(normalized.map((item) => item.toLowerCase())).size !==
      normalized.length
  ) {
    throw new Error(`${field} contains duplicate values`);
  }
  return normalized;
}

export function parseEasyPostParcelConfig(
  raw: string | EasyPostParcelConfigInput | undefined,
): EasyPostParcelConfig {
  const parsed = parseConfigObject(
    raw as string | Record<string, unknown> | undefined,
    "EasyPost parcel config",
  );
  assertExactKeys(
    parsed,
    ["length", "width", "height", "weight"],
    "EasyPost parcel config",
  );

  return {
    length: requireFiniteNumber(parsed.length, "parcel length", 120),
    width: requireFiniteNumber(parsed.width, "parcel width", 120),
    height: requireFiniteNumber(parsed.height, "parcel height", 120),
    weight: requireFiniteNumber(parsed.weight, "parcel weight", 2_400),
  };
}

export function parseEasyPostRatePolicy(
  raw: string | EasyPostRatePolicyInput | undefined,
): EasyPostRatePolicy {
  const parsed = parseConfigObject(
    raw as string | Record<string, unknown> | undefined,
    "EasyPost rate policy",
  );
  assertExactKeys(
    parsed,
    [
      "allowedCarriers",
      "allowedServices",
      "maxRateCents",
      "maxDeliveryDays",
      "currency",
    ],
    "EasyPost rate policy",
  );

  const currency = parsed.currency ?? "USD";
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error(
      "rate policy currency must be a three-letter uppercase code",
    );
  }

  return {
    allowedCarriers: requireStringList(
      parsed.allowedCarriers,
      "allowedCarriers",
    ),
    allowedServices: requireStringList(
      parsed.allowedServices,
      "allowedServices",
    ),
    maxRateCents: requireInteger(
      parsed.maxRateCents,
      "maxRateCents",
      1,
      1_000_000,
    ),
    ...(parsed.maxDeliveryDays === undefined ? {} : {
      maxDeliveryDays: requireInteger(
        parsed.maxDeliveryDays,
        "maxDeliveryDays",
        1,
        365,
      ),
    }),
    currency,
  };
}

function rateAmountCents(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,5})?$/.test(value)
  ) {
    return null;
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.ceil(amount * 100);
}

function effectiveDeliveryDays(rate: EasyPostRate): number | null {
  for (const value of [rate.delivery_days, rate.est_delivery_days]) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      return value;
    }
  }
  return null;
}

export function selectEasyPostRate(
  rates: readonly EasyPostRate[],
  policy: EasyPostRatePolicy,
): EasyPostSelectedRate {
  const allowedCarriers = new Set(
    policy.allowedCarriers.map((value) => value.toLowerCase()),
  );
  const allowedServices = new Set(
    policy.allowedServices.map((value) => value.toLowerCase()),
  );

  const eligible = rates.flatMap((rate) => {
    if (
      !EASYPOST_ID_PATTERNS.rate.test(rate.id) ||
      typeof rate.carrier !== "string" ||
      typeof rate.service !== "string" ||
      rate.currency !== policy.currency ||
      !allowedCarriers.has(rate.carrier.toLowerCase()) ||
      !allowedServices.has(rate.service.toLowerCase())
    ) {
      return [];
    }

    const amountCents = rateAmountCents(rate.rate);
    if (amountCents === null || amountCents > policy.maxRateCents) return [];

    const deliveryDays = effectiveDeliveryDays(rate);
    if (
      policy.maxDeliveryDays !== undefined &&
      (deliveryDays === null || deliveryDays > policy.maxDeliveryDays)
    ) {
      return [];
    }
    return [{ rate, amountCents, deliveryDays }];
  });

  eligible.sort((left, right) =>
    left.amountCents - right.amountCents ||
    (left.deliveryDays ?? Number.MAX_SAFE_INTEGER) -
      (right.deliveryDays ?? Number.MAX_SAFE_INTEGER) ||
    left.rate.carrier.localeCompare(right.rate.carrier) ||
    left.rate.service.localeCompare(right.rate.service) ||
    left.rate.id.localeCompare(right.rate.id)
  );
  const selected = eligible[0];
  if (!selected) {
    throw new EasyPostApiError({
      code: "EASYPOST_NO_ELIGIBLE_RATE",
      message: "No shipping rate satisfies the configured policy",
    });
  }
  return {
    ...selected.rate,
    amountCents: selected.amountCents,
    deliveryDays: selected.deliveryDays,
    eligibleRateCount: eligible.length,
  };
}

function requireMappedString(
  value: unknown,
  field: string,
  maximum: number,
): string {
  if (
    typeof value !== "string" || value.trim() !== value || value.length === 0 ||
    value.length > maximum || hasControlCharacters(value)
  ) {
    throw new Error(`Shipping ${field} is invalid`);
  }
  return value;
}

function optionalMappedString(
  value: unknown,
  field: string,
  maximum: number,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireMappedString(value, field, maximum);
}

export function mapEasyPostAddress(
  input: EasyPostAddressMappingInput | Record<string, unknown>,
): EasyPostAddressInput {
  const country = requireMappedString(input.country, "country", 2)
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new Error("Shipping country must be a two-letter ISO code");
  }

  const email = optionalMappedString(input.email, "email", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Shipping email is invalid");
  }
  const company = optionalMappedString(input.company, "company", 80);
  const street2 = optionalMappedString(
    input.street2 ?? input.address2,
    "address2",
    120,
  );
  const phone = optionalMappedString(input.phone, "phone", 40);
  if (
    input.residential !== undefined &&
    typeof input.residential !== "boolean"
  ) {
    throw new Error("Shipping residential flag is invalid");
  }

  return {
    name: requireMappedString(input.name, "name", 80),
    ...(company ? { company } : {}),
    street1: requireMappedString(
      input.street1 ?? input.address,
      "address",
      120,
    ),
    ...(street2 ? { street2 } : {}),
    city: requireMappedString(input.city, "city", 80),
    state: requireMappedString(input.state, "state", 80),
    zip: requireMappedString(input.zip, "zip", 32),
    country,
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(typeof input.residential === "boolean"
      ? { residential: input.residential }
      : {}),
  };
}

function safeCode(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.:-]{1,80}$/.test(value)) {
    return "EASYPOST_REQUEST_FAILED";
  }
  return value;
}

function redactProviderMessage(value: unknown): string {
  if (typeof value !== "string") return "EasyPost request failed";

  const sanitized = replaceControlCharacters(value)
    .replace(
      /(["']?(?:api[_-]?key|secret|token|street1|street2|phone|email|name)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[redacted]",
    )
    .replace(/\bEZ[A-Z]K[A-Za-z0-9_=-]+\b/g, "[redacted]")
    .replace(/\b(?:Basic|Bearer)\s+[A-Za-z0-9+/=._-]+/gi, "[redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted]")
    .replace(/\+?\d[\d().\s-]{7,}\d/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SAFE_ERROR_LENGTH);

  return sanitized || "EasyPost request failed";
}

export function extractEasyPostSafeError(error: unknown): EasyPostSafeError {
  if (error instanceof EasyPostApiError) return error.safeError;

  const source = isRecord(error) && isRecord(error.error)
    ? error.error
    : isRecord(error)
    ? error
    : null;

  return {
    code: safeCode(source?.code),
    message: redactProviderMessage(
      source?.message ??
        (error instanceof Error ? error.message : undefined),
    ),
    ...(typeof source?.status === "number" ? { status: source.status } : {}),
  };
}

function validateEasyPostFileUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("EasyPost label URL is invalid");
  }

  if (
    url.protocol !== "https:" || url.username || url.password ||
    (url.port && url.port !== "443") ||
    !EASYPOST_FILE_HOST_PATTERN.test(url.hostname.toLowerCase()) ||
    !url.pathname.startsWith("/files/postage_label/") ||
    !url.pathname.toLowerCase().endsWith(".pdf") ||
    url.hash
  ) {
    throw new Error("EasyPost label URL is not an approved PDF location");
  }
  return url;
}

export function extractPdfLabelUrl(
  shipment: EasyPostShipment | Record<string, unknown>,
): string {
  const label = isRecord(shipment.postage_label)
    ? shipment.postage_label
    : null;
  if (
    !label ||
    (typeof label.label_size === "string" && label.label_size !== "4x6")
  ) {
    throw new Error("EasyPost shipment does not contain a 4x6 label");
  }

  const candidate = typeof label.label_pdf_url === "string" &&
      label.label_pdf_url.length > 0
    ? label.label_pdf_url
    : typeof label.label_file_type === "string" &&
        label.label_file_type.toLowerCase() === "application/pdf" &&
        typeof label.label_url === "string"
    ? label.label_url
    : null;

  if (!candidate) {
    throw new Error("EasyPost shipment does not contain a PDF label");
  }
  return validateEasyPostFileUrl(candidate).toString();
}

function headerValue(
  headers: Headers | Record<string, string | undefined>,
  name: string,
): string | null {
  if (headers instanceof Headers) return headers.get(name);
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && typeof value === "string") return value;
  }
  return null;
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function hmacSha256Hex(
  secret: string,
  value: string | Uint8Array,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret.normalize("NFKD")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes: Uint8Array<ArrayBuffer> = typeof value === "string"
    ? encoder.encode(value)
    : Uint8Array.from(value);
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, bytes),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function validateEasyPostWebhook(
  input: EasyPostWebhookValidationInput,
): Promise<EasyPostWebhookValidation> {
  if (
    !input.secret || input.secret.trim() !== input.secret ||
    !(typeof input.rawBody === "string" || input.rawBody instanceof Uint8Array)
  ) {
    return { valid: false, reason: "invalid_configuration" };
  }

  const signature = headerValue(input.headers, "x-hmac-signature");
  if (!signature) {
    return { valid: false, reason: "missing_header" };
  }

  const signatureMatch = /^hmac-sha256-hex=([0-9a-f]{64})$/.exec(signature);
  if (!signatureMatch) {
    return { valid: false, reason: "invalid_signature" };
  }

  const expected = await hmacSha256Hex(input.secret, input.rawBody);
  return timingSafeEqual(expected, signatureMatch[1])
    ? { valid: true }
    : { valid: false, reason: "invalid_signature" };
}

async function readBoundedBytes(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength && /^\d+$/.test(contentLength) &&
    Number(contentLength) > maximumBytes
  ) {
    throw new Error("EasyPost response exceeds the allowed size");
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error("EasyPost response exceeds the allowed size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

function assertProviderId(
  value: string,
  type: keyof typeof EASYPOST_ID_PATTERNS,
) {
  if (!EASYPOST_ID_PATTERNS[type].test(value)) {
    throw new Error(`Invalid EasyPost ${type} ID`);
  }
}

function normalizeAddressResponse(
  raw: unknown,
  requested: EasyPostAddressInput,
): EasyPostAddress {
  if (
    !isRecord(raw) || typeof raw.id !== "string" ||
    !EASYPOST_ID_PATTERNS.address.test(raw.id) || raw.object !== "Address"
  ) {
    throw new EasyPostApiError({
      code: "EASYPOST_INVALID_RESPONSE",
      message: "EasyPost returned an invalid address",
    });
  }

  const normalized: EasyPostAddressInput = {
    name: requireMappedString(raw.name, "name", 80),
    ...(optionalMappedString(raw.company, "company", 80)
      ? { company: optionalMappedString(raw.company, "company", 80) }
      : {}),
    street1: requireMappedString(raw.street1, "address", 120),
    ...(optionalMappedString(raw.street2, "address2", 120)
      ? { street2: optionalMappedString(raw.street2, "address2", 120) }
      : {}),
    city: requireMappedString(raw.city, "city", 80),
    state: requireMappedString(raw.state, "state", 80),
    zip: requireMappedString(raw.zip, "zip", 32),
    country: requireMappedString(raw.country, "country", 2).toUpperCase(),
    ...(optionalMappedString(raw.phone, "phone", 40)
      ? { phone: optionalMappedString(raw.phone, "phone", 40) }
      : {}),
    ...(optionalMappedString(raw.email, "email", 254)
      ? { email: optionalMappedString(raw.email, "email", 254) }
      : {}),
    ...(typeof raw.residential === "boolean"
      ? { residential: raw.residential }
      : {}),
  };
  const comparableFields: (keyof EasyPostAddressInput)[] = [
    "street1",
    "street2",
    "city",
    "state",
    "zip",
    "country",
  ];

  return {
    ...raw,
    ...normalized,
    id: raw.id,
    object: "Address",
    corrected: comparableFields.some((field) =>
      (normalized[field] ?? "") !== (requested[field] ?? "")
    ),
    ...(isRecord(raw.verifications)
      ? { verifications: raw.verifications }
      : {}),
  };
}

function normalizeRateResponse(raw: unknown): EasyPostRate {
  if (
    !isRecord(raw) || typeof raw.id !== "string" ||
    !EASYPOST_ID_PATTERNS.rate.test(raw.id) ||
    typeof raw.carrier !== "string" || raw.carrier.length === 0 ||
    typeof raw.service !== "string" || raw.service.length === 0 ||
    typeof raw.rate !== "string" || rateAmountCents(raw.rate) === null ||
    typeof raw.currency !== "string" || !/^[A-Z]{3}$/.test(raw.currency)
  ) {
    throw new EasyPostApiError({
      code: "EASYPOST_INVALID_RESPONSE",
      message: "EasyPost returned an invalid shipping rate",
    });
  }

  return {
    ...raw,
    id: raw.id,
    carrier: raw.carrier,
    service: raw.service,
    rate: raw.rate,
    currency: raw.currency,
    ...(typeof raw.delivery_days === "number"
      ? { delivery_days: raw.delivery_days }
      : {}),
    ...(typeof raw.est_delivery_days === "number"
      ? { est_delivery_days: raw.est_delivery_days }
      : {}),
  };
}

function normalizeShipmentResponse(raw: unknown): EasyPostShipment {
  if (
    !isRecord(raw) || typeof raw.id !== "string" ||
    !EASYPOST_ID_PATTERNS.shipment.test(raw.id) || raw.object !== "Shipment" ||
    !Array.isArray(raw.rates)
  ) {
    throw new EasyPostApiError({
      code: "EASYPOST_INVALID_RESPONSE",
      message: "EasyPost returned an invalid shipment",
    });
  }

  const rates = raw.rates.map(normalizeRateResponse);
  const selectedRate = raw.selected_rate === null ||
      raw.selected_rate === undefined
    ? null
    : normalizeRateResponse(raw.selected_rate);
  const postageLabel = isRecord(raw.postage_label)
    ? {
      ...(typeof raw.postage_label.label_file_type === "string"
        ? { label_file_type: raw.postage_label.label_file_type }
        : {}),
      ...(typeof raw.postage_label.label_pdf_url === "string"
        ? { label_pdf_url: raw.postage_label.label_pdf_url }
        : {}),
      ...(typeof raw.postage_label.label_size === "string"
        ? { label_size: raw.postage_label.label_size }
        : {}),
      ...(typeof raw.postage_label.label_url === "string"
        ? { label_url: raw.postage_label.label_url }
        : {}),
    }
    : null;

  return {
    ...raw,
    id: raw.id,
    object: "Shipment",
    rates,
    selected_rate: selectedRate,
    postage_label: postageLabel,
    ...(typeof raw.tracking_code === "string"
      ? { tracking_code: raw.tracking_code }
      : {}),
    ...(typeof raw.status === "string" ? { status: raw.status } : {}),
    ...(typeof raw.refund_status === "string"
      ? { refund_status: raw.refund_status }
      : {}),
    ...(isRecord(raw.tracker) ? { tracker: raw.tracker } : {}),
  };
}

function normalizeTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (
    !Number.isInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS
  ) {
    throw new Error("EasyPost timeout is outside the allowed range");
  }
  return value;
}

function normalizeByteLimit(
  value: number | undefined,
  fallback: number,
): number {
  if (
    value === undefined
  ) return fallback;
  if (!Number.isInteger(value) || value < 1_024 || value > 20 * 1024 * 1024) {
    throw new Error(
      "EasyPost response size limit is outside the allowed range",
    );
  }
  return value;
}

function parseApiError(body: unknown, status: number): EasyPostSafeError {
  const safe = extractEasyPostSafeError(body);
  return { ...safe, status };
}

export class EasyPostClient {
  readonly #authorization: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #maxResponseBytes: number;
  readonly #maxLabelBytes: number;

  constructor(options: EasyPostClientOptions) {
    if (
      typeof options.apiKey !== "string" || options.apiKey.length < 8 ||
      options.apiKey.trim() !== options.apiKey ||
      /[^\x21-\x7e]/.test(options.apiKey) || options.apiKey.includes(":")
    ) {
      throw new Error("EasyPost API key is invalid");
    }
    this.#authorization = `Basic ${btoa(`${options.apiKey}:`)}`;
    this.#fetch = options.fetch ?? fetch;
    this.#timeoutMs = normalizeTimeout(options.timeoutMs);
    this.#maxResponseBytes = normalizeByteLimit(
      options.maxResponseBytes,
      DEFAULT_MAX_RESPONSE_BYTES,
    );
    this.#maxLabelBytes = normalizeByteLimit(
      options.maxLabelBytes,
      DEFAULT_MAX_LABEL_BYTES,
    );
  }

  async #request<T>(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(`${EASYPOST_API_BASE_URL}${path}`, {
        method,
        headers: {
          "Accept": "application/json",
          "Authorization": this.#authorization,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
        signal: controller.signal,
      });
      const bytes = await readBoundedBytes(response, this.#maxResponseBytes);
      let parsed: unknown = null;
      if (bytes.length > 0) {
        try {
          parsed = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          throw new EasyPostApiError({
            code: "EASYPOST_INVALID_RESPONSE",
            message: "EasyPost returned an invalid response",
            status: response.status,
          });
        }
      }
      if (!response.ok) {
        throw new EasyPostApiError(parseApiError(parsed, response.status));
      }
      if (!isRecord(parsed)) {
        throw new EasyPostApiError({
          code: "EASYPOST_INVALID_RESPONSE",
          message: "EasyPost returned an invalid response",
          status: response.status,
        });
      }
      return parsed as T;
    } catch (error) {
      if (error instanceof EasyPostApiError) throw error;
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        throw new EasyPostApiError({
          code: "EASYPOST_TIMEOUT",
          message: "EasyPost request timed out",
        });
      }
      throw new EasyPostApiError({
        code: "EASYPOST_UNAVAILABLE",
        message: "EasyPost request failed",
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async createVerifiedAddress(
    address: EasyPostAddressMappingInput | Record<string, unknown>,
  ): Promise<EasyPostAddress> {
    const mapped = mapEasyPostAddress(address);
    const response = await this.#request<Record<string, unknown>>(
      "POST",
      "/addresses",
      {
        address: mapped,
        verify_strict: true,
      },
    );
    return normalizeAddressResponse(response, mapped);
  }

  createShipment(
    input: EasyPostCreateShipmentInput,
  ): Promise<EasyPostShipment> {
    assertProviderId(input.toAddressId, "address");
    assertProviderId(input.fromAddressId, "address");
    if (input.returnAddressId) {
      assertProviderId(input.returnAddressId, "address");
    }
    if (
      input.reference !== undefined &&
      (input.reference.length === 0 || input.reference.length > 100 ||
        hasControlCharacters(input.reference))
    ) {
      throw new Error("EasyPost shipment reference is invalid");
    }
    if (
      input.carrierAccountIds?.some((id) => !/^ca_[A-Za-z0-9]+$/.test(id))
    ) {
      throw new Error("EasyPost carrier account ID is invalid");
    }

    const parcel = parseEasyPostParcelConfig(input.parcel);
    return this.#request<Record<string, unknown>>("POST", "/shipments", {
      shipment: {
        to_address: { id: input.toAddressId },
        from_address: { id: input.fromAddressId },
        ...(input.returnAddressId
          ? { return_address: { id: input.returnAddressId } }
          : {}),
        parcel,
        options: {
          label_format: "PDF",
          label_size: "4x6",
        },
        ...(input.reference ? { reference: input.reference } : {}),
        ...(input.carrierAccountIds
          ? { carrier_accounts: input.carrierAccountIds }
          : {}),
      },
    }).then(normalizeShipmentResponse);
  }

  async retrieveShipment(shipmentId: string): Promise<EasyPostShipment> {
    assertProviderId(shipmentId, "shipment");
    const response = await this.#request<Record<string, unknown>>(
      "GET",
      `/shipments/${encodeURIComponent(shipmentId)}`,
    );
    return normalizeShipmentResponse(response);
  }

  async buyShipment(
    shipmentId: string,
    rateId: string,
  ): Promise<EasyPostShipment> {
    assertProviderId(shipmentId, "shipment");
    assertProviderId(rateId, "rate");
    const response = await this.#request<Record<string, unknown>>(
      "POST",
      `/shipments/${encodeURIComponent(shipmentId)}/buy`,
      { rate: { id: rateId } },
    );
    return normalizeShipmentResponse(response);
  }

  async refundShipment(shipmentId: string): Promise<EasyPostShipment> {
    assertProviderId(shipmentId, "shipment");
    const response = await this.#request<Record<string, unknown>>(
      "POST",
      `/shipments/${encodeURIComponent(shipmentId)}/refund`,
      {},
    );
    return normalizeShipmentResponse(response);
  }

  async downloadPdfLabel(labelUrl: string): Promise<Uint8Array> {
    let currentUrl = validateEasyPostFileUrl(labelUrl);

    for (
      let redirectCount = 0;
      redirectCount <= MAX_REDIRECTS;
      redirectCount++
    ) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
      try {
        let response: Response;
        try {
          response = await this.#fetch(currentUrl, {
            method: "GET",
            headers: { "Accept": "application/pdf" },
            redirect: "manual",
            signal: controller.signal,
          });
        } catch (error) {
          if (
            controller.signal.aborted ||
            (error instanceof DOMException && error.name === "AbortError")
          ) {
            throw new EasyPostApiError({
              code: "EASYPOST_LABEL_TIMEOUT",
              message: "EasyPost label download timed out",
            });
          }
          throw new EasyPostApiError({
            code: "EASYPOST_LABEL_UNAVAILABLE",
            message: "EasyPost label download failed",
          });
        }

        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (redirectCount === MAX_REDIRECTS) {
            throw new Error("EasyPost label download exceeded redirect limit");
          }
          const location = response.headers.get("location");
          if (!location) throw new Error("EasyPost label redirect is invalid");
          currentUrl = validateEasyPostFileUrl(
            new URL(location, currentUrl).toString(),
          );
          await response.body?.cancel();
          continue;
        }

        if (!response.ok) {
          throw new EasyPostApiError({
            code: "EASYPOST_LABEL_UNAVAILABLE",
            message: "EasyPost label download failed",
            status: response.status,
          });
        }
        const contentType = response.headers.get("content-type")
          ?.split(";", 1)[0]
          .trim()
          .toLowerCase();
        if (contentType !== "application/pdf") {
          throw new Error("EasyPost label response is not a PDF");
        }

        let bytes: Uint8Array;
        try {
          bytes = await readBoundedBytes(response, this.#maxLabelBytes);
        } catch (error) {
          if (
            controller.signal.aborted ||
            (error instanceof DOMException && error.name === "AbortError")
          ) {
            throw new EasyPostApiError({
              code: "EASYPOST_LABEL_TIMEOUT",
              message: "EasyPost label download timed out",
            });
          }
          throw error;
        }
        if (
          bytes.length < 5 ||
          bytes[0] !== 0x25 ||
          bytes[1] !== 0x50 ||
          bytes[2] !== 0x44 ||
          bytes[3] !== 0x46 ||
          bytes[4] !== 0x2d
        ) {
          throw new Error("EasyPost label response is not a valid PDF");
        }
        return bytes;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error("EasyPost label download failed");
  }
}
