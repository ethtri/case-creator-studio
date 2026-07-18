import {
  ANALYTICS_CONTRACT_VERSION,
  trackMarketingEvent,
  type MarketingEventPayload,
  type MarketingViewEventName,
} from "./marketing.ts";

const VIEW_EVENT_NAMES = new Set<MarketingViewEventName>([
  "view_item_list",
  "view_item",
]);
const SAFE_CONTRACT_ID = /^[a-z0-9][a-z0-9._:-]{0,99}$/i;
const MAX_NORMALIZED_ROUTE_LENGTH = 200;
const MAX_TRACKED_VIEW_KEYS = 64;

export type MarketingViewDescriptor = {
  eventName: MarketingViewEventName;
  normalizedRoute: string;
  contractId: string;
  payload: MarketingEventPayload;
};

export const buildMarketingViewKey = ({
  eventName,
  normalizedRoute,
  contractId,
}: Omit<MarketingViewDescriptor, "payload">) => {
  if (
    !VIEW_EVENT_NAMES.has(eventName) ||
    !normalizedRoute.startsWith("/") ||
    normalizedRoute.length > MAX_NORMALIZED_ROUTE_LENGTH ||
    [...normalizedRoute].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    }) ||
    !SAFE_CONTRACT_ID.test(contractId)
  ) {
    return null;
  }

  return [
    ANALYTICS_CONTRACT_VERSION,
    eventName,
    normalizedRoute,
    contractId,
  ].join("\u001f");
};

export class BoundedMarketingViewRegistry {
  readonly #capacity: number;
  readonly #keys = new Map<string, true>();

  constructor(capacity = MAX_TRACKED_VIEW_KEYS) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new TypeError("Marketing view registry capacity must be a positive integer.");
    }
    this.#capacity = capacity;
  }

  has(key: string) {
    return this.#keys.has(key);
  }

  remember(key: string) {
    if (this.#keys.has(key)) return;
    this.#keys.set(key, true);

    while (this.#keys.size > this.#capacity) {
      const oldestKey = this.#keys.keys().next().value;
      if (typeof oldestKey !== "string") break;
      this.#keys.delete(oldestKey);
    }
  }

  get size() {
    return this.#keys.size;
  }
}

const trackedMarketingViews = new BoundedMarketingViewRegistry();

export const trackMarketingViewOnce = (
  descriptor: MarketingViewDescriptor,
) => {
  const key = buildMarketingViewKey(descriptor);
  if (!key || trackedMarketingViews.has(key)) return false;

  if (!trackMarketingEvent(descriptor.eventName, descriptor.payload)) {
    return false;
  }

  trackedMarketingViews.remember(key);
  return true;
};
