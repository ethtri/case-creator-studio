export type MarketingEventName =
  | "page_view"
  | "view_catalog"
  | "model_select"
  | "design_start"
  | "preview_generate"
  | "design_save"
  | "add_to_cart"
  | "checkout_start"
  | "purchase"
  | "promo_applied";

type MarketingEventPayload = Record<string, string | number | boolean | null | undefined>;

export type MarketingAttribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  ttclid?: string;
  referrer?: string;
  landingPath: string;
  capturedAt: string;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const SNAPCASE_GA_MEASUREMENT_ID = "G-MV7NDH4KTK";
const CONFIGURED_GA_MEASUREMENT_ID = (
  import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined
)?.trim();
const SNAPCASE_PRODUCTION_HOSTS = new Set(["snapcase.ai", "www.snapcase.ai"]);
const ATTRIBUTION_STORAGE_KEY = "snapcase_marketing_attribution";
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "ttclid",
] as const;

let analyticsLoaded = false;

const isBrowser = () => typeof window !== "undefined";

const getGaMeasurementId = () => {
  if (CONFIGURED_GA_MEASUREMENT_ID) return CONFIGURED_GA_MEASUREMENT_ID;
  if (!isBrowser()) return undefined;

  return SNAPCASE_PRODUCTION_HOSTS.has(window.location.hostname.toLowerCase())
    ? SNAPCASE_GA_MEASUREMENT_ID
    : undefined;
};

const hasAnalytics = () => Boolean(getGaMeasurementId());

const cleanString = (value: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : undefined;
};

const isInternalReferrer = (referrer: string) => {
  if (!isBrowser() || !referrer) return false;

  try {
    return new URL(referrer).hostname === window.location.hostname;
  } catch {
    return false;
  }
};

const sanitizePayload = (payload: MarketingEventPayload = {}) =>
  Object.fromEntries(
    Object.entries(payload)
      .filter(([key, value]) => {
        const loweredKey = key.toLowerCase();
        if (
          loweredKey.includes("email") ||
          loweredKey.includes("name") ||
          loweredKey.includes("address") ||
          loweredKey.includes("customer")
        ) {
          return false;
        }

        return ["string", "number", "boolean"].includes(typeof value) || value === null;
      })
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value.slice(0, 500) : value ?? null,
      ])
  );

export const loadGoogleAnalytics = () => {
  const measurementId = getGaMeasurementId();
  if (!isBrowser() || !measurementId || analyticsLoaded) return;

  analyticsLoaded = true;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: false });
};

export const trackMarketingEvent = (
  eventName: MarketingEventName,
  payload: MarketingEventPayload = {}
) => {
  if (!isBrowser() || !hasAnalytics()) return;

  loadGoogleAnalytics();
  window.gtag?.("event", eventName, sanitizePayload(payload));
};

export const captureMarketingAttribution = () => {
  if (!isBrowser()) return null;

  const params = new URLSearchParams(window.location.search);
  const hasTrackingParam = TRACKING_PARAMS.some((param) => params.has(param));
  const externalReferrer = document.referrer && !isInternalReferrer(document.referrer)
    ? cleanString(document.referrer)
    : undefined;

  if (!hasTrackingParam && !externalReferrer) {
    return getMarketingAttribution();
  }

  const attribution: MarketingAttribution = {
    landingPath: window.location.pathname,
    capturedAt: new Date().toISOString(),
  };

  TRACKING_PARAMS.forEach((param) => {
    const value = cleanString(params.get(param));
    if (value) {
      attribution[param] = value;
    }
  });

  if (externalReferrer) {
    attribution.referrer = externalReferrer;
  }

  window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
  return attribution;
};

export const getMarketingAttribution = (): MarketingAttribution | null => {
  if (!isBrowser()) return null;

  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MarketingAttribution>;
    if (!parsed || typeof parsed.landingPath !== "string" || typeof parsed.capturedAt !== "string") {
      return null;
    }

    return {
      ...parsed,
      landingPath: parsed.landingPath,
      capturedAt: parsed.capturedAt,
    };
  } catch {
    return null;
  }
};
