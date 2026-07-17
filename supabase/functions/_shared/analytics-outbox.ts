import {
  buildGa4OrderItems,
  buildGa4PurchaseParams,
  buildGa4RefundParams,
  Ga4DeliveryError,
  type Ga4EventParams,
  type Ga4MeasurementPayload,
  type Ga4Order,
} from "./ga4-measurement.ts";

export const ANALYTICS_OUTBOX_LEASE_MS = 5 * 60 * 1000;
export const ANALYTICS_OUTBOX_MAX_ATTEMPTS = 5;
export const ANALYTICS_OUTBOX_BACKOFF_SECONDS = [60, 300, 900, 3600] as const;

export type AnalyticsOutboxClaim = {
  attempts: number;
  claim_token: string;
  event_key: string;
  event_name: string;
  id: string;
  max_attempts: number;
  payload: unknown;
  source_amount: number | string | null;
  source_order_id: string | null;
};

export type AnalyticsOutboxStatus =
  | "failed"
  | "dead_letter";

export type AnalyticsOutboxFailure = {
  failureKind: string;
  httpStatus: number | null;
  message: string;
};

export type AnalyticsOutboxDependencies = {
  claimBatch: (
    limit: number,
    workerId: string,
    now: string,
  ) => Promise<AnalyticsOutboxClaim[]>;
  complete: (
    claim: AnalyticsOutboxClaim,
    httpStatus: number,
    now: string,
  ) => Promise<boolean>;
  deliver: (
    payload: Ga4MeasurementPayload,
  ) => Promise<{ httpStatus: number }>;
  fail: (
    claim: AnalyticsOutboxClaim,
    failure: AnalyticsOutboxFailure,
    now: string,
  ) => Promise<AnalyticsOutboxStatus>;
  finalizeWithoutDelivery: (
    claim: AnalyticsOutboxClaim,
    status: "suppressed" | "dead_letter",
    reason: string,
    failureKind: string,
    now: string,
  ) => Promise<boolean>;
  loadOrder: (orderId: string) => Promise<Ga4Order | null>;
  markAmbiguous: (
    claim: AnalyticsOutboxClaim,
    reason: string,
    httpStatus: number,
    now: string,
  ) => Promise<boolean>;
  now?: () => Date;
  workerId?: string;
};

export type AnalyticsOutboxSummary = {
  ambiguous: number;
  claimed: number;
  deadLetter: number;
  failed: number;
  sent: number;
  splitBrainPersistenceFailures: number;
  suppressed: number;
  transitionErrors: number;
  workerId: string;
};

type RetryEligibilityRow = {
  attempts: number;
  claimedAt?: string | null;
  createdAt: string;
  leaseExpiresAt?: string | null;
  maxAttempts?: number;
  nextAttemptAt?: string | null;
  status: string;
};

const APPROVED_CHECKOUT_ERROR_CODES = new Set([
  "checkout_session_expired",
  "payment_declined",
]);

export const analyticsOutboxBackoffSeconds = (attempts: number) => {
  if (attempts <= 1) return ANALYTICS_OUTBOX_BACKOFF_SECONDS[0];
  if (attempts === 2) return ANALYTICS_OUTBOX_BACKOFF_SECONDS[1];
  if (attempts === 3) return ANALYTICS_OUTBOX_BACKOFF_SECONDS[2];
  return ANALYTICS_OUTBOX_BACKOFF_SECONDS[3];
};

const parseTime = (value: string | null | undefined) => {
  if (!value) return Number.NaN;
  return Date.parse(value);
};

export const isAnalyticsOutboxRetryEligible = (
  row: RetryEligibilityRow,
  now: Date,
) => {
  const maxAttempts = row.maxAttempts ?? ANALYTICS_OUTBOX_MAX_ATTEMPTS;
  if (row.attempts >= maxAttempts) return false;

  if (row.status === "pending" || row.status === "failed") {
    const readyAt = parseTime(row.nextAttemptAt) || parseTime(row.createdAt);
    return Number.isFinite(readyAt) && readyAt <= now.getTime();
  }

  if (row.status === "sending") {
    const explicitLease = parseTime(row.leaseExpiresAt);
    const claimedAt = parseTime(row.claimedAt);
    const leaseEnd = Number.isFinite(explicitLease)
      ? explicitLease
      : claimedAt + ANALYTICS_OUTBOX_LEASE_MS;
    return Number.isFinite(leaseEnd) && leaseEnd <= now.getTime();
  }

  return false;
};

const persistedParams = (
  payload: unknown,
): Record<string, unknown> | null => {
  if (!payload || typeof payload !== "object") return null;
  const events = (payload as { events?: unknown }).events;
  if (!Array.isArray(events) || events.length !== 1) return null;
  const event = events[0];
  if (!event || typeof event !== "object") return null;
  const params = (event as { params?: unknown }).params;
  return params && typeof params === "object" && !Array.isArray(params)
    ? params as Record<string, unknown>
    : null;
};

const readSourceAmount = (claim: AnalyticsOutboxClaim) => {
  if (
    claim.source_amount === null ||
    (typeof claim.source_amount === "string" &&
      claim.source_amount.trim() === "")
  ) {
    throw new Error("Outbox source amount is missing or invalid");
  }
  const amount = Number(claim.source_amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Outbox source amount is missing or invalid");
  }
  return amount;
};

const buildCheckoutSignalParams = (
  claim: AnalyticsOutboxClaim,
  order: Ga4Order,
): Ga4EventParams => {
  const params = persistedParams(claim.payload);
  const errorCode = params?.error_code;
  if (
    typeof errorCode !== "string" ||
    !APPROVED_CHECKOUT_ERROR_CODES.has(errorCode)
  ) {
    throw new Error("Outbox checkout error code is not approved");
  }
  if (
    claim.event_name === "checkout_abandoned" &&
    errorCode !== "checkout_session_expired"
  ) {
    throw new Error("Checkout abandonment source does not match its event");
  }
  if (
    claim.event_name === "checkout_error" &&
    errorCode !== "payment_declined"
  ) {
    throw new Error("Checkout error source does not match its event");
  }

  return {
    transaction_id: order.id,
    currency: "USD",
    value: Number(order.total) || 0,
    error_code: errorCode,
    stage: "stripe_checkout",
    items: buildGa4OrderItems(order.items, order.discount_total ?? 0),
    analytics_contract_version: "1.0.0",
  };
};

export const buildGa4RetryPayload = (
  claim: AnalyticsOutboxClaim,
  order: Ga4Order,
): Ga4MeasurementPayload => {
  if (!claim.source_order_id || claim.source_order_id !== order.id) {
    throw new Error("Outbox event is not linked to its authoritative order");
  }

  let params: Ga4EventParams;
  if (claim.event_name === "purchase") {
    if (claim.event_key !== `purchase:${order.id}`) {
      throw new Error("Purchase event key does not match its order");
    }
    params = buildGa4PurchaseParams(order);
  } else if (claim.event_name === "refund") {
    if (!claim.event_key.startsWith("refund:") || claim.event_key.length <= 7) {
      throw new Error("Refund event key is invalid");
    }
    params = buildGa4RefundParams(order, readSourceAmount(claim));
  } else if (
    claim.event_name === "checkout_error" ||
    claim.event_name === "checkout_abandoned"
  ) {
    if (!claim.event_key.startsWith(`${claim.event_name}:`)) {
      throw new Error("Checkout event key is invalid");
    }
    params = buildCheckoutSignalParams(claim, order);
  } else {
    throw new Error(`Outbox event name is not approved: ${claim.event_name}`);
  }

  return {
    client_id: order.analytics_client_id || `server.${order.id}`,
    events: [{ name: claim.event_name, params }],
  };
};

const describeFailure = (error: unknown): AnalyticsOutboxFailure => {
  if (error instanceof Ga4DeliveryError) {
    return {
      failureKind: error.failureKind,
      httpStatus: error.httpStatus,
      message: error.message,
    };
  }
  return {
    failureKind: "delivery_error",
    httpStatus: null,
    message: error instanceof Error ? error.message : String(error),
  };
};

const createSummary = (workerId: string): AnalyticsOutboxSummary => ({
  ambiguous: 0,
  claimed: 0,
  deadLetter: 0,
  failed: 0,
  sent: 0,
  splitBrainPersistenceFailures: 0,
  suppressed: 0,
  transitionErrors: 0,
  workerId,
});

export const drainAnalyticsOutbox = async (
  dependencies: AnalyticsOutboxDependencies,
  limit: number,
): Promise<AnalyticsOutboxSummary> => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Analytics outbox limit must be between 1 and 100");
  }

  const now = dependencies.now ?? (() => new Date());
  const workerId = dependencies.workerId ?? crypto.randomUUID();
  const summary = createSummary(workerId);
  const claims = await dependencies.claimBatch(
    limit,
    workerId,
    now().toISOString(),
  );
  summary.claimed = claims.length;

  for (const claim of claims) {
    let order: Ga4Order | null;
    try {
      if (!claim.source_order_id) {
        throw new Error("Outbox event has no source order");
      }
      order = await dependencies.loadOrder(claim.source_order_id);
    } catch (error) {
      const failure = {
        failureKind: "database_lookup",
        httpStatus: null,
        message: error instanceof Error ? error.message : String(error),
      };
      try {
        const status = await dependencies.fail(
          claim,
          failure,
          now().toISOString(),
        );
        summary[status === "dead_letter" ? "deadLetter" : "failed"] += 1;
      } catch {
        summary.transitionErrors += 1;
      }
      continue;
    }

    if (!order) {
      const finalized = await dependencies.finalizeWithoutDelivery(
        claim,
        "dead_letter",
        "Authoritative order was not found",
        "source_order_missing",
        now().toISOString(),
      );
      summary[finalized ? "deadLetter" : "transitionErrors"] += 1;
      continue;
    }

    if (order.analytics_consent !== "granted") {
      const finalized = await dependencies.finalizeWithoutDelivery(
        claim,
        "suppressed",
        "Analytics consent is denied or unset",
        "consent_not_granted",
        now().toISOString(),
      );
      summary[finalized ? "suppressed" : "transitionErrors"] += 1;
      continue;
    }

    let payload: Ga4MeasurementPayload;
    try {
      payload = buildGa4RetryPayload(claim, order);
    } catch (error) {
      const finalized = await dependencies.finalizeWithoutDelivery(
        claim,
        "dead_letter",
        error instanceof Error ? error.message : String(error),
        "invalid_source_payload",
        now().toISOString(),
      );
      summary[finalized ? "deadLetter" : "transitionErrors"] += 1;
      continue;
    }

    let delivery: { httpStatus: number };
    try {
      delivery = await dependencies.deliver(payload);
    } catch (error) {
      try {
        const status = await dependencies.fail(
          claim,
          describeFailure(error),
          now().toISOString(),
        );
        summary[status === "dead_letter" ? "deadLetter" : "failed"] += 1;
      } catch {
        summary.transitionErrors += 1;
      }
      continue;
    }

    const completedAt = now().toISOString();
    let completed = false;
    let completionError = "";
    try {
      completed = await dependencies.complete(
        claim,
        delivery.httpStatus,
        completedAt,
      );
      if (!completed) completionError = "claim ownership was lost";
    } catch (error) {
      completionError = error instanceof Error ? error.message : String(error);
    }

    if (completed) {
      summary.sent += 1;
      continue;
    }

    const reason =
      `GA accepted the event but the sent-state update failed: ${completionError}`;
    try {
      const marked = await dependencies.markAmbiguous(
        claim,
        reason,
        delivery.httpStatus,
        completedAt,
      );
      if (marked) {
        summary.ambiguous += 1;
      } else {
        summary.splitBrainPersistenceFailures += 1;
      }
    } catch {
      summary.splitBrainPersistenceFailures += 1;
    }
  }

  return summary;
};
