export type Ga4OrderItem = {
  variantId?: string | null;
  brand?: string | null;
  model?: string | null;
  price?: number | null;
  quantity?: number | null;
};

export type Ga4Order = {
  id: string;
  items?: Ga4OrderItem[] | null;
  total?: number | null;
  shipping_cost?: number | null;
  discount_total?: number | null;
  promotion_code?: string | null;
  analytics_client_id?: string | null;
  analytics_consent?: string | null;
};

export interface Ga4EventParams {
  [key: string]:
    | string
    | number
    | boolean
    | null
    | Ga4EventParams
    | Ga4EventParams[];
}

type AnalyticsEventClaim = {
  id: string;
  claim_token: string;
};

export type AnalyticsStore = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

type SendGa4EventOptions = {
  apiSecret?: string;
  clientId: string;
  eventKey: string;
  eventName: string;
  eventParams: Ga4EventParams;
  fetchImpl?: typeof fetch;
  measurementId?: string;
  store: AnalyticsStore;
};

export type Ga4MeasurementPayload = {
  client_id: string;
  events: Array<{
    name: string;
    params: Ga4EventParams;
  }>;
};

type PostGa4MeasurementOptions = {
  apiSecret?: string;
  fetchImpl?: typeof fetch;
  measurementId?: string;
  payload: Ga4MeasurementPayload;
  signal?: AbortSignal;
};

export class Ga4DeliveryError extends Error {
  failureKind: "credentials" | "http" | "network";
  httpStatus: number | null;

  constructor(
    message: string,
    failureKind: "credentials" | "http" | "network",
    httpStatus: number | null = null,
  ) {
    super(message);
    this.name = "Ga4DeliveryError";
    this.failureKind = failureKind;
    this.httpStatus = httpStatus;
  }
}

const ANALYTICS_CONTRACT_VERSION = "1.0.0";

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const buildGa4OrderItems = (
  items: Ga4OrderItem[] | null | undefined,
  discountTotal = 0,
) => {
  const orderItems = Array.isArray(items) ? items : [];
  const totalQuantity = orderItems.reduce(
    (sum, item) => sum + Math.max(1, Math.trunc(toFiniteNumber(item.quantity, 1))),
    0,
  );
  const perUnitDiscount = totalQuantity > 0
    ? Math.max(0, toFiniteNumber(discountTotal)) / totalQuantity
    : 0;

  return orderItems.flatMap((item) => {
    if (
      !item?.variantId ||
      !item?.brand ||
      !item?.model ||
      typeof item.price !== "number"
    ) {
      return [];
    }

    return [{
      item_id: item.variantId,
      item_name: `${item.brand} ${item.model} Custom Case`,
      item_brand: item.brand,
      item_category: "Custom Phone Case",
      item_variant: item.model,
      price: item.price,
      quantity: Math.max(1, Math.trunc(toFiniteNumber(item.quantity, 1))),
      discount: Number(perUnitDiscount.toFixed(2)),
    }];
  });
};

export const buildGa4PurchaseParams = (order: Ga4Order): Ga4EventParams => {
  const params: Ga4EventParams = {
    transaction_id: order.id,
    currency: "USD",
    value: Math.max(
      0,
      toFiniteNumber(order.total) - toFiniteNumber(order.shipping_cost),
    ),
    tax: 0,
    shipping: toFiniteNumber(order.shipping_cost),
    items: buildGa4OrderItems(order.items, order.discount_total ?? 0),
    analytics_contract_version: ANALYTICS_CONTRACT_VERSION,
  };
  if (order.promotion_code) {
    params.coupon = order.promotion_code;
  }
  return params;
};

export const buildGa4RefundParams = (
  order: Ga4Order,
  amount: number,
): Ga4EventParams => ({
  transaction_id: order.id,
  currency: "USD",
  value: toFiniteNumber(amount),
  items: buildGa4OrderItems(order.items, order.discount_total ?? 0),
  analytics_contract_version: ANALYTICS_CONTRACT_VERSION,
});

const firstClaim = (data: unknown): AnalyticsEventClaim | null => {
  if (!Array.isArray(data) || data.length === 0) return null;
  const value = data[0];
  return value &&
      typeof value === "object" &&
      typeof value.id === "string" &&
      typeof value.claim_token === "string"
    ? value as AnalyticsEventClaim
    : null;
};

const rpcSucceeded = (data: unknown) => data === true;

const failureDetails = (error: unknown) => {
  if (error instanceof Ga4DeliveryError) {
    return {
      failureKind: error.failureKind,
      httpStatus: error.httpStatus,
      message: error.message,
    };
  }
  return {
    failureKind: "network",
    httpStatus: null,
    message: error instanceof Error ? error.message : String(error),
  };
};

export const postGa4Measurement = async ({
  apiSecret,
  fetchImpl = fetch,
  measurementId,
  payload,
  signal,
}: PostGa4MeasurementOptions) => {
  if (!measurementId || !apiSecret) {
    throw new Ga4DeliveryError(
      "GA4 server credentials are not configured",
      "credentials",
    );
  }

  let response: Response;
  try {
    response = await fetchImpl(
      `https://www.google-analytics.com/mp/collect?measurement_id=${
        encodeURIComponent(measurementId)
      }&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      },
    );
  } catch (error) {
    throw new Ga4DeliveryError(
      error instanceof Error ? error.message : String(error),
      "network",
    );
  }

  if (!response.ok) {
    throw new Ga4DeliveryError(
      `GA4 Measurement Protocol returned ${response.status}`,
      "http",
      response.status,
    );
  }

  return { httpStatus: response.status };
};

export const sendGa4Event = async ({
  apiSecret,
  clientId,
  eventKey,
  eventName,
  eventParams,
  fetchImpl = fetch,
  measurementId,
  store,
}: SendGa4EventOptions) => {
  const payload: Ga4MeasurementPayload = {
    client_id: clientId,
    events: [{ name: eventName, params: eventParams }],
  };
  const { data, error: claimError } = await store.rpc("claim_analytics_event", {
    p_event_key: eventKey,
    p_event_name: eventName,
    p_payload: payload,
  });

  if (claimError) {
    throw new Error(claimError.message || "Unable to claim analytics event");
  }

  const claim = firstClaim(data);
  if (!claim) {
    return { status: "duplicate_or_inflight" as const };
  }

  let delivery: { httpStatus: number };
  try {
    delivery = await postGa4Measurement({
      apiSecret,
      fetchImpl,
      measurementId,
      payload,
    });
  } catch (error) {
    const failure = failureDetails(error);
    const { data: failed, error: failError } = await store.rpc(
      "fail_analytics_event",
      {
        p_claim_token: claim.claim_token,
        p_error: failure.message,
        p_event_id: claim.id,
        p_failure_kind: failure.failureKind,
        p_http_status: failure.httpStatus,
        p_now: new Date().toISOString(),
      },
    );
    if (failError || !Array.isArray(failed) || failed.length !== 1) {
      console.error(
        "[GA4] Unable to mark analytics event failed:",
        failError ?? "claim ownership was lost",
      );
    }
    throw error;
  }

  const completionTime = new Date().toISOString();
  const { data: completed, error: completionError } = await store.rpc(
    "complete_analytics_event",
    {
      p_claim_token: claim.claim_token,
      p_event_id: claim.id,
      p_http_status: delivery.httpStatus,
      p_now: completionTime,
    },
  );
  if (!completionError && rpcSucceeded(completed)) {
    return { status: "sent" as const };
  }

  const diagnostic =
    "GA accepted the event but the sent-state update was not confirmed";
  const { data: markedAmbiguous, error: ambiguousError } = await store.rpc(
    "mark_analytics_event_ambiguous",
    {
      p_claim_token: claim.claim_token,
      p_error: completionError?.message
        ? `${diagnostic}: ${completionError.message}`
        : diagnostic,
      p_event_id: claim.id,
      p_http_status: delivery.httpStatus,
      p_now: completionTime,
    },
  );
  if (ambiguousError || !rpcSucceeded(markedAmbiguous)) {
    console.error("[GA4] Split-brain state could not be persisted", {
      ambiguousError,
      claimId: claim.id,
      eventKey,
    });
  }

  throw new Error(`${diagnostic}; event_key=${eventKey}`);
};

export const sendGa4Purchase = (
  store: AnalyticsStore,
  order: Ga4Order,
  measurementId?: string,
  apiSecret?: string,
) =>
  sendGa4Event({
    store,
    measurementId,
    apiSecret,
    clientId: order.analytics_client_id || `server.${order.id}`,
    eventKey: `purchase:${order.id}`,
    eventName: "purchase",
    eventParams: buildGa4PurchaseParams(order),
  });

export const sendGa4Refund = (
  store: AnalyticsStore,
  order: Ga4Order,
  refundId: string,
  amount: number,
  measurementId?: string,
  apiSecret?: string,
) =>
  sendGa4Event({
    store,
    measurementId,
    apiSecret,
    clientId: order.analytics_client_id || `server.${order.id}`,
    eventKey: `refund:${refundId}`,
    eventName: "refund",
    eventParams: buildGa4RefundParams(order, amount),
  });

export const sendGa4CheckoutSignal = (
  store: AnalyticsStore,
  order: Ga4Order,
  stripeEventId: string,
  eventName: "checkout_error" | "checkout_abandoned",
  errorCode: string,
  measurementId?: string,
  apiSecret?: string,
) =>
  sendGa4Event({
    store,
    measurementId,
    apiSecret,
    clientId: order.analytics_client_id || `server.${order.id}`,
    eventKey: `${eventName}:${stripeEventId}`,
    eventName,
    eventParams: {
      transaction_id: order.id,
      currency: "USD",
      value: toFiniteNumber(order.total),
      error_code: errorCode,
      stage: "stripe_checkout",
      items: buildGa4OrderItems(order.items, order.discount_total ?? 0),
      analytics_contract_version: ANALYTICS_CONTRACT_VERSION,
    },
  });
