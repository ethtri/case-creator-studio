export type KexiaozhanCheckoutRedirectConfig = {
  targetUrl: string;
  vercelBypassSecret?: string | null;
  setBypassCookie?: string | null;
};

const RESERVED_QUERY_PARAMS = new Set([
  "x-vercel-protection-bypass",
  "x-vercel-set-bypass-cookie",
]);

function requireHttpUrl(rawUrl: string, label: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${label} must be an http(s) URL`);
  }
  return url;
}

export function buildKexiaozhanCheckoutRedirectUrl(
  requestUrl: string,
  config: KexiaozhanCheckoutRedirectConfig,
): string {
  const target = requireHttpUrl(config.targetUrl.trim(), "targetUrl");
  const source = requireHttpUrl(requestUrl, "requestUrl");

  source.searchParams.forEach((value, key) => {
    if (!RESERVED_QUERY_PARAMS.has(key)) {
      target.searchParams.append(key, value);
    }
  });

  const vercelBypassSecret = config.vercelBypassSecret?.trim();
  if (vercelBypassSecret) {
    target.searchParams.set("x-vercel-protection-bypass", vercelBypassSecret);
    target.searchParams.set(
      "x-vercel-set-bypass-cookie",
      config.setBypassCookie?.trim() || "true",
    );
  }

  return target.toString();
}
