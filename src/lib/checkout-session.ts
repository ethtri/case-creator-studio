import {
  asMarketingItems,
  buildAnalyticsItems,
} from "./analytics-commerce.ts";
import type {
  MarketingEventPayload,
  MarketingEventValue,
} from "./marketing.ts";

const STRIPE_CHECKOUT_HOST = "checkout.stripe.com";
const STRIPE_CHECKOUT_SESSION_PATH =
  /^\/c\/pay\/cs_(?:test|live)_[A-Za-z0-9]+$/;
const SAFE_COUPON_CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const EMAIL_LIKE_VALUE =
  /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/i;
const PHONE_LIKE_VALUE = /\+?\d[\d\s().-]{5,}\d/;
const DEFAULT_CHECKOUT_ERROR = "Failed to start checkout.";
const INVALID_CHECKOUT_URL_ERROR = "Checkout is temporarily unavailable.";
const MAX_PROVIDER_MESSAGE_LENGTH = 240;

type CheckoutEventName = "begin_checkout" | "checkout_error";

export type BeginCheckoutItemInput = {
  variantId: string;
  brand: string;
  model: string;
  price: number;
  quantity: number;
  discount: number;
};

export type BeginCheckoutPayload = {
  value: number;
  currency: "USD";
  shipping: number;
  items: MarketingEventValue[];
  coupon?: string;
};

export type CheckoutStartFailure = {
  kind: "failed";
  message: string;
  errorCode: "promotion_rejected" | "checkout_start_failed";
};

export type CheckoutStartResult =
  | { kind: "redirected"; url: string }
  | CheckoutStartFailure;

type CheckoutInvocationResult = {
  data: unknown;
  error: unknown;
};

type CheckoutRunnerDependencies = {
  invoke: (body: unknown) => Promise<CheckoutInvocationResult>;
  track: (
    eventName: CheckoutEventName,
    payload: MarketingEventPayload,
  ) => unknown;
  redirect: (url: string) => void;
};

type CheckoutAttempt = {
  buildRequestBody: () => unknown | Promise<unknown>;
  beginCheckoutPayload: BeginCheckoutPayload;
  onFailure?: (failure: CheckoutStartFailure) => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeAmount = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

const isPrivacySafeLabel = (value: string, maximumLength: number) => {
  const normalized = value.trim();
  const containsControlCharacter = Array.from(normalized).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  return (
    normalized.length > 0 &&
    normalized.length <= maximumLength &&
    !EMAIL_LIKE_VALUE.test(normalized) &&
    !PHONE_LIKE_VALUE.test(normalized) &&
    !containsControlCharacter
  );
};

const normalizeProviderMessage = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const message = value.trim();
  return message ? message.slice(0, MAX_PROVIDER_MESSAGE_LENGTH) : null;
};

const readProviderErrorMessage = async (error: unknown) => {
  const fallback = isRecord(error)
    ? normalizeProviderMessage(error.message)
    : error instanceof Error
      ? normalizeProviderMessage(error.message)
      : null;
  const context = isRecord(error) ? error.context : undefined;

  if (typeof Response === "undefined" || !(context instanceof Response)) {
    return fallback ?? DEFAULT_CHECKOUT_ERROR;
  }

  try {
    const payload = await context.clone().json();
    return isRecord(payload)
      ? normalizeProviderMessage(payload.error) ??
          fallback ??
          DEFAULT_CHECKOUT_ERROR
      : fallback ?? DEFAULT_CHECKOUT_ERROR;
  } catch {
    return fallback ?? DEFAULT_CHECKOUT_ERROR;
  }
};

const classifyFailure = (message: string): CheckoutStartFailure => ({
  kind: "failed",
  message,
  errorCode: message.toLowerCase().includes("promo")
    ? "promotion_rejected"
    : "checkout_start_failed",
});

const emitBestEffort = (
  track: CheckoutRunnerDependencies["track"],
  eventName: CheckoutEventName,
  payload: MarketingEventPayload,
) => {
  try {
    track(eventName, payload);
  } catch {
    // Analytics must never block checkout or recovery.
  }
};

export const normalizeHostedStripeCheckoutUrl = (
  value: unknown,
): string | null => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  try {
    const rawUrl = value.trim();
    const preFragment = rawUrl.split("#", 1)[0];
    if (preFragment.includes("?")) return null;

    const url = new URL(rawUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname !== STRIPE_CHECKOUT_HOST ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      !STRIPE_CHECKOUT_SESSION_PATH.test(url.pathname)
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
};

export const buildBeginCheckoutPayload = ({
  subtotal,
  shipping,
  items,
  coupon,
}: {
  subtotal: number;
  shipping: number;
  items: BeginCheckoutItemInput[];
  coupon?: string | null;
}): BeginCheckoutPayload => {
  const normalizedCoupon =
    typeof coupon === "string" &&
    SAFE_COUPON_CODE.test(coupon.trim()) &&
    isPrivacySafeLabel(coupon, 64)
      ? coupon.trim()
      : undefined;
  const privacySafeItems = items.filter(
    (item) =>
      isPrivacySafeLabel(item.variantId, 100) &&
      isPrivacySafeLabel(item.brand, 100) &&
      isPrivacySafeLabel(item.model, 160),
  );

  return {
    value: normalizeAmount(subtotal),
    currency: "USD",
    shipping: normalizeAmount(shipping),
    items: asMarketingItems(
      buildAnalyticsItems(
        privacySafeItems.map((item) => ({
          variantId: item.variantId,
          brand: item.brand,
          model: item.model,
          price: item.price,
          quantity: item.quantity,
          discount: item.discount,
        })),
      ),
    ),
    ...(normalizedCoupon ? { coupon: normalizedCoupon } : {}),
  };
};

export const createHostedCheckoutRunner = ({
  invoke,
  track,
  redirect,
}: CheckoutRunnerDependencies) => {
  let inFlight: Promise<CheckoutStartResult> | null = null;

  const fail = (
    message: string,
    onFailure?: CheckoutAttempt["onFailure"],
  ): CheckoutStartFailure => {
    const failure = classifyFailure(message);
    emitBestEffort(track, "checkout_error", {
      error_code: failure.errorCode,
      stage: "create_checkout",
    });
    try {
      onFailure?.(failure);
    } catch {
      // A rendering callback must not change the runner's bounded result.
    }
    return failure;
  };

  const execute = async ({
    buildRequestBody,
    beginCheckoutPayload,
    onFailure,
  }: CheckoutAttempt): Promise<CheckoutStartResult> => {
    try {
      const response = await invoke(await buildRequestBody());
      if (!isRecord(response)) {
        return fail(DEFAULT_CHECKOUT_ERROR, onFailure);
      }
      if (response.error) {
        return fail(await readProviderErrorMessage(response.error), onFailure);
      }

      const checkoutUrl = normalizeHostedStripeCheckoutUrl(
        isRecord(response.data) ? response.data.url : undefined,
      );
      if (!checkoutUrl) {
        return fail(INVALID_CHECKOUT_URL_ERROR, onFailure);
      }

      emitBestEffort(track, "begin_checkout", beginCheckoutPayload);
      redirect(checkoutUrl);
      return { kind: "redirected", url: checkoutUrl };
    } catch (error) {
      return fail(await readProviderErrorMessage(error), onFailure);
    }
  };

  return {
    start(attempt: CheckoutAttempt): Promise<CheckoutStartResult> {
      if (inFlight) return inFlight;

      const request = Promise.resolve().then(() => execute(attempt));
      inFlight = request;
      void request.then(
        (result) => {
          if (result.kind === "failed" && inFlight === request) {
            inFlight = null;
          }
        },
        () => {
          if (inFlight === request) inFlight = null;
        },
      );
      return request;
    },
  };
};
