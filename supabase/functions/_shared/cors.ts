const DEFAULT_ALLOWED_ORIGINS = [
  "https://snapcase.ai",
  "https://www.snapcase.ai",
  "https://snapcaseappv2.vercel.app",
];

function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.trim().replace(/\/+$/, "");
  }
}

function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function readConfiguredOrigins(): string[] {
  const raw = [
    Deno.env.get("ALLOWED_ORIGINS") ?? "",
    Deno.env.get("VERCEL_PREVIEW_ORIGINS") ?? "",
    Deno.env.get("ALLOWED_PREVIEW_ORIGINS") ?? "",
  ].filter(Boolean).join(",");

  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(normalizeOrigin);
}

export function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;

  const normalizedOrigin = normalizeOrigin(origin);
  if (isLocalDevelopmentOrigin(normalizedOrigin)) {
    return true;
  }

  const allowedOrigins = new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...readConfiguredOrigins(),
  ].map(normalizeOrigin));

  return allowedOrigins.has(normalizedOrigin);
}

export function resolveAllowedOrigin(origin: string): string {
  return isAllowedOrigin(origin)
    ? normalizeOrigin(origin)
    : DEFAULT_ALLOWED_ORIGINS[0];
}

export function requireAllowedOrigin(req: Request, context: string): string {
  const origin = req.headers.get("origin") || "";
  if (!origin) {
    return DEFAULT_ALLOWED_ORIGINS[0];
  }

  if (!isAllowedOrigin(origin)) {
    throw new Error(`[${context}] Origin is not allowed`);
  }

  return normalizeOrigin(origin);
}

export function getCorsHeaders(
  req: Request,
  methods = "POST, OPTIONS",
): Record<string, string> {
  const origin = req.headers.get("origin") || "";

  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(origin),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-vendor-signature, x-vendor-handoff-secret",
    "Access-Control-Allow-Methods": methods,
  };
}
