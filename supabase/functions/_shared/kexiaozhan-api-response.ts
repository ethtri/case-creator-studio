export const KEXIAOZHAN_API_RESPONSE_MAX_BYTES = 4096;
const KEXIAOZHAN_API_MESSAGE_MAX_LENGTH = 240;

export type KexiaozhanApiResponseResult = {
  ok: boolean;
  status: number;
  code: number | null;
  message: string | null;
  error: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readVendorCode(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    const code = Number(value);
    return Number.isSafeInteger(code) ? code : null;
  }
  return null;
}

function readBoundedMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const withoutControlCharacters = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  }).join("");
  const message = withoutControlCharacters
    .replace(/\s+/g, " ")
    .trim();
  return message ? message.slice(0, KEXIAOZHAN_API_MESSAGE_MAX_LENGTH) : null;
}

export function evaluateKexiaozhanApiResponse(
  status: number,
  httpOk: boolean,
  rawBody: string,
): KexiaozhanApiResponseResult {
  if (
    !Number.isSafeInteger(status) ||
    status < 100 ||
    status > 599 ||
    typeof rawBody !== "string"
  ) {
    return {
      ok: false,
      status: Number.isSafeInteger(status) ? status : 500,
      code: null,
      message: null,
      error: "invalid_response_metadata",
    };
  }

  if (
    new TextEncoder().encode(rawBody).byteLength >
      KEXIAOZHAN_API_RESPONSE_MAX_BYTES
  ) {
    return {
      ok: false,
      status,
      code: null,
      message: null,
      error: "response_too_large",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return {
      ok: false,
      status,
      code: null,
      message: null,
      error: httpOk ? "invalid_json_response" : "http_error",
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      status,
      code: null,
      message: null,
      error: httpOk ? "invalid_json_response" : "http_error",
    };
  }

  const code = readVendorCode(parsed.code);
  const message = readBoundedMessage(parsed.msg ?? parsed.message);
  if (!httpOk) {
    return { ok: false, status, code, message, error: "http_error" };
  }
  if (code === null) {
    return {
      ok: false,
      status,
      code: null,
      message,
      error: "missing_or_invalid_vendor_code",
    };
  }
  if (code !== 0) {
    return {
      ok: false,
      status,
      code,
      message,
      error: "vendor_business_error",
    };
  }

  return { ok: true, status, code, message, error: null };
}
