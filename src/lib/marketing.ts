export type MarketingEventName =
  | "page_view"
  | "view_item_list"
  | "select_item"
  | "view_item"
  | "design_start"
  | "editor_first_action"
  | "preview_success"
  | "preview_failure"
  | "design_save"
  | "add_to_cart"
  | "begin_checkout"
  | "purchase"
  | "refund"
  | "primary_cta_click"
  | "editor_error"
  | "checkout_error"
  | "promo_applied";

export type MarketingEventValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | MarketingEventValue[]
  | { [key: string]: MarketingEventValue };

export type MarketingEventPayload = Record<string, MarketingEventValue>;

export type MarketingTouch = {
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

export type MarketingAttribution = {
  firstTouch: MarketingTouch;
  lastTouch: MarketingTouch;
};

export type AnalyticsConsent = "granted" | "denied" | "unset";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export const ANALYTICS_CONTRACT_VERSION = "1.0.0";

const SNAPCASE_GA_MEASUREMENT_ID = "G-MV7NDH4KTK";
const viteEnv = (
  import.meta as ImportMeta & { env?: Record<string, string | undefined> }
).env;
const CONFIGURED_GA_MEASUREMENT_ID = viteEnv?.VITE_GA_MEASUREMENT_ID?.trim();
const SNAPCASE_PRODUCTION_HOSTS = new Set(["snapcase.ai", "www.snapcase.ai"]);
const ATTRIBUTION_STORAGE_KEY = "snapcase_marketing_attribution_v2";
const LEGACY_ATTRIBUTION_STORAGE_KEY = "snapcase_marketing_attribution";
const CONSENT_STORAGE_KEY = "snapcase_analytics_consent_v1";
const CONSENT_EVENT_NAME = "snapcase:analytics-consent";
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
const BLOCKED_PAYLOAD_KEYS = new Set([
  "address",
  "artwork",
  "customer_email",
  "customer_name",
  "design_preview",
  "email",
  "free_text",
  "preview_url",
  "shipping_address",
]);

let analyticsLoaded = false;
let consentDefaultsInitialized = false;
let appliedAnalyticsConsent: Exclude<AnalyticsConsent, "unset"> | null = null;

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

const getGaMeasurementId = () => {
  if (CONFIGURED_GA_MEASUREMENT_ID) return CONFIGURED_GA_MEASUREMENT_ID;
  if (!isBrowser()) return undefined;

  return SNAPCASE_PRODUCTION_HOSTS.has(window.location.hostname.toLowerCase())
    ? SNAPCASE_GA_MEASUREMENT_ID
    : undefined;
};

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizeValue = (
  value: MarketingEventValue,
  key = "",
): MarketingEventValue | undefined => {
  if (BLOCKED_PAYLOAD_KEYS.has(key.toLowerCase())) return undefined;
  if (value === undefined) return undefined;
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) {
    return value
      .slice(0, 200)
      .map((entry) => sanitizeValue(entry))
      .filter((entry): entry is MarketingEventValue => entry !== undefined);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([nestedKey, nestedValue]) => [
          nestedKey,
          sanitizeValue(nestedValue as MarketingEventValue, nestedKey),
        ] as const)
        .filter((entry): entry is readonly [string, MarketingEventValue] =>
          entry[1] !== undefined
        ),
    );
  }
  return undefined;
};

export const sanitizeMarketingPayload = (
  payload: MarketingEventPayload = {},
): MarketingEventPayload =>
  Object.fromEntries(
    Object.entries(payload)
      .map(([key, value]) => [key, sanitizeValue(value, key)] as const)
      .filter((entry): entry is readonly [string, MarketingEventValue] =>
        entry[1] !== undefined
      ),
  );

const ensureGtag = () => {
  if (!isBrowser()) return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    function gtag() {
      // Google gtag requires the function's Arguments object, not a rest array.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    };

  if (!consentDefaultsInitialized) {
    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      wait_for_update: 500,
    });
    consentDefaultsInitialized = true;
  }
};

const applyAnalyticsConsent = (
  consent: Exclude<AnalyticsConsent, "unset">,
) => {
  ensureGtag();
  if (appliedAnalyticsConsent === consent) return;
  window.gtag?.("consent", "update", {
    analytics_storage: consent,
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  appliedAnalyticsConsent = consent;
};

export const getAnalyticsConsent = (): AnalyticsConsent => {
  if (!isBrowser()) return "unset";
  const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  return stored === "granted" || stored === "denied" ? stored : "unset";
};

export const setAnalyticsConsent = (consent: Exclude<AnalyticsConsent, "unset">) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(CONSENT_STORAGE_KEY, consent);
  if (consent === "denied") {
    window.localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_ATTRIBUTION_STORAGE_KEY);
  }
  applyAnalyticsConsent(consent);

  if (consent === "granted") {
    loadGoogleAnalytics();
  }

  window.dispatchEvent(new CustomEvent(CONSENT_EVENT_NAME, { detail: consent }));
};

export const subscribeToAnalyticsConsent = (
  listener: (consent: AnalyticsConsent) => void,
) => {
  if (!isBrowser()) return () => undefined;
  const handleConsent = (event: Event) => {
    const detail = (event as CustomEvent<AnalyticsConsent>).detail;
    listener(detail ?? getAnalyticsConsent());
  };
  window.addEventListener(CONSENT_EVENT_NAME, handleConsent);
  return () => window.removeEventListener(CONSENT_EVENT_NAME, handleConsent);
};

export const loadGoogleAnalytics = () => {
  const measurementId = getGaMeasurementId();
  if (!isBrowser() || !measurementId || analyticsLoaded) return;

  ensureGtag();
  if (getAnalyticsConsent() !== "granted") return;

  applyAnalyticsConsent("granted");
  analyticsLoaded = true;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  window.gtag?.("js", new Date());
  window.gtag?.("config", measurementId, { send_page_view: false });
};

export const getAnalyticsClientId = async (
  timeoutMs = 500,
): Promise<string | null> => {
  const measurementId = getGaMeasurementId();
  if (
    !isBrowser() ||
    !measurementId ||
    getAnalyticsConsent() !== "granted"
  ) {
    return null;
  }

  loadGoogleAnalytics();
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timeout = window.setTimeout(() => finish(null), timeoutMs);

    window.gtag?.("get", measurementId, "client_id", (value: unknown) => {
      window.clearTimeout(timeout);
      finish(typeof value === "string" && value.trim() ? value.slice(0, 200) : null);
    });
  });
};

export const trackMarketingEvent = (
  eventName: MarketingEventName,
  payload: MarketingEventPayload = {},
) => {
  if (!isBrowser() || !getGaMeasurementId() || getAnalyticsConsent() !== "granted") {
    return;
  }

  loadGoogleAnalytics();
  window.gtag?.("event", eventName, {
    ...sanitizeMarketingPayload(payload),
    analytics_contract_version: ANALYTICS_CONTRACT_VERSION,
  });
};

const normalizeStoredAttribution = (value: unknown): MarketingAttribution | null => {
  if (!isRecord(value)) return null;

  if (isRecord(value.firstTouch) && isRecord(value.lastTouch)) {
    const firstTouch = value.firstTouch as Partial<MarketingTouch>;
    const lastTouch = value.lastTouch as Partial<MarketingTouch>;
    if (
      typeof firstTouch.landingPath === "string" &&
      typeof firstTouch.capturedAt === "string" &&
      typeof lastTouch.landingPath === "string" &&
      typeof lastTouch.capturedAt === "string"
    ) {
      return {
        firstTouch: firstTouch as MarketingTouch,
        lastTouch: lastTouch as MarketingTouch,
      };
    }
  }

  if (
    typeof value.landingPath === "string" &&
    typeof value.capturedAt === "string"
  ) {
    const legacyTouch = value as unknown as MarketingTouch;
    return { firstTouch: legacyTouch, lastTouch: legacyTouch };
  }

  return null;
};

export const mergeMarketingAttribution = (
  existing: MarketingAttribution | null,
  touch: MarketingTouch,
): MarketingAttribution => ({
  firstTouch: existing?.firstTouch ?? touch,
  lastTouch: touch,
});

export const captureMarketingAttribution = () => {
  if (!isBrowser() || getAnalyticsConsent() !== "granted") return null;

  const params = new URLSearchParams(window.location.search);
  const hasTrackingParam = TRACKING_PARAMS.some((param) => params.has(param));
  const existing = getMarketingAttribution();
  const externalReferrer = !existing && document.referrer &&
      !isInternalReferrer(document.referrer)
    ? cleanString(document.referrer)
    : undefined;

  if (!hasTrackingParam && !externalReferrer) {
    return existing;
  }

  const touch: MarketingTouch = {
    landingPath: window.location.pathname,
    capturedAt: new Date().toISOString(),
  };

  TRACKING_PARAMS.forEach((param) => {
    const value = cleanString(params.get(param));
    if (value) {
      touch[param] = value;
    }
  });

  if (externalReferrer) {
    touch.referrer = externalReferrer;
  }

  const attribution = mergeMarketingAttribution(existing, touch);
  window.localStorage.setItem(
    ATTRIBUTION_STORAGE_KEY,
    JSON.stringify(attribution),
  );
  window.localStorage.removeItem(LEGACY_ATTRIBUTION_STORAGE_KEY);
  return attribution;
};

export const getMarketingAttribution = (): MarketingAttribution | null => {
  if (!isBrowser() || getAnalyticsConsent() !== "granted") return null;

  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_ATTRIBUTION_STORAGE_KEY);
    return raw ? normalizeStoredAttribution(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};
