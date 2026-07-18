export type OrderItem = {
  quantity?: unknown;
};

export type VerifiedOrder = {
  items: OrderItem[];
  total: number;
  status: string;
};

export type VerificationErrorCode =
  | "checkout_expired"
  | "missing_session"
  | "order_record_pending"
  | "order_requires_review"
  | "payment_pending"
  | "verification_unavailable";

export type OrderVerificationResult =
  | {
      kind: "verified";
      order: VerifiedOrder;
      supportReference: string;
    }
  | {
      kind: "retryable";
      errorCode: VerificationErrorCode;
      supportReference?: string;
    }
  | {
      kind: "confirmed_failure";
      errorCode: VerificationErrorCode;
      supportReference?: string;
    };

export type VisibleVerificationState =
  | { kind: "missing_session"; errorCode: "missing_session" }
  | { kind: "verifying" }
  | OrderVerificationResult;

type VerificationResponse = {
  code?: unknown;
  order?: unknown;
  retryable?: unknown;
  success?: unknown;
  supportReference?: unknown;
};

type InvocationError = {
  context?: Response;
};

type VerificationInvocation = (
  sessionId: string,
) => Promise<{ data: unknown; error: unknown }>;

const ORDER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORT_REFERENCE_PATTERN = /^SC-[0-9A-F]{12}$/;
const CONFIRMED_FAILURE_STATUSES = new Set([
  "cancelled",
  "canceled",
  "failed",
  "payment_review",
]);
const ALLOWED_ERROR_CODES = new Set<VerificationErrorCode>([
  "checkout_expired",
  "order_record_pending",
  "order_requires_review",
  "payment_pending",
  "verification_unavailable",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asFiniteNumber = (value: unknown): number | null => {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatSupportReference = (
  orderId: unknown,
): string | undefined => {
  if (typeof orderId !== "string" || !ORDER_ID_PATTERN.test(orderId)) {
    return undefined;
  }

  return `SC-${orderId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
};

const normalizeSupportReference = (
  value: unknown,
  orderId?: unknown,
): string | undefined => {
  if (typeof value === "string" && SUPPORT_REFERENCE_PATTERN.test(value)) {
    return value;
  }
  return formatSupportReference(orderId);
};

const normalizeOrder = (value: unknown): VerifiedOrder | null => {
  if (!isRecord(value)) return null;

  const total = asFiniteNumber(value.total);
  if (
    !Array.isArray(value.items) ||
    total === null ||
    typeof value.status !== "string"
  ) {
    return null;
  }

  return {
    items: value.items.map((item) => ({
      quantity: isRecord(item) ? item.quantity : undefined,
    })),
    total,
    status: value.status,
  };
};

const normalizeErrorCode = (
  value: unknown,
  fallback: VerificationErrorCode,
): VerificationErrorCode =>
  typeof value === "string" &&
  ALLOWED_ERROR_CODES.has(value as VerificationErrorCode)
    ? (value as VerificationErrorCode)
    : fallback;

export const countPurchasedUnits = (items: OrderItem[] | null | undefined) =>
  (items ?? []).reduce((total, item) => {
    if (item.quantity === undefined || item.quantity === null) return total + 1;
    const quantity = asFiniteNumber(item.quantity);
    return total + (quantity === null ? 0 : Math.max(0, Math.trunc(quantity)));
  }, 0);

export const formatPurchasedUnits = (unitCount: number) =>
  `${unitCount} ${unitCount === 1 ? "case" : "cases"}`;

export const normalizeVerificationResponse = (
  value: unknown,
): OrderVerificationResult => {
  const response = isRecord(value) ? (value as VerificationResponse) : {};
  const order = normalizeOrder(response.order);
  const rawOrderId = isRecord(response.order) ? response.order.id : undefined;
  const supportReference = normalizeSupportReference(
    response.supportReference,
    rawOrderId,
  );

  if (response.success === true && order && supportReference) {
    return {
      kind: "verified",
      order,
      supportReference,
    };
  }

  if (response.success === true) {
    return {
      kind: "retryable",
      errorCode: "order_record_pending",
      supportReference,
    };
  }

  const statusRequiresReview = order
    ? CONFIRMED_FAILURE_STATUSES.has(order.status.toLowerCase())
    : false;
  if (response.retryable === false || statusRequiresReview) {
    return {
      kind: "confirmed_failure",
      errorCode: normalizeErrorCode(
        response.code,
        statusRequiresReview ? "order_requires_review" : "checkout_expired",
      ),
      supportReference,
    };
  }

  return {
    kind: "retryable",
    errorCode: normalizeErrorCode(response.code, "verification_unavailable"),
    supportReference,
  };
};

const readInvocationError = async (error: unknown): Promise<unknown> => {
  const context = isRecord(error)
    ? (error as InvocationError).context
    : undefined;
  if (!(context instanceof Response)) return null;

  try {
    return await context.clone().json();
  } catch {
    return null;
  }
};

export const createOrderVerificationRunner = (
  invoke: VerificationInvocation,
) => {
  const inFlight = new Map<string, Promise<OrderVerificationResult>>();

  return {
    verify(sessionId: string): Promise<OrderVerificationResult> {
      const existingRequest = inFlight.get(sessionId);
      if (existingRequest) return existingRequest;

      const request = (async () => {
        try {
          const { data, error } = await invoke(sessionId);
          if (error) {
            const errorPayload = await readInvocationError(error);
            return normalizeVerificationResponse(errorPayload);
          }
          return normalizeVerificationResponse(data);
        } catch {
          return {
            kind: "retryable",
            errorCode: "verification_unavailable",
          };
        }
      })();

      inFlight.set(sessionId, request);
      void request.finally(() => {
        if (inFlight.get(sessionId) === request) inFlight.delete(sessionId);
      });
      return request;
    },
  };
};

export const buildVerificationAnalyticsPayload = (
  state: Exclude<VisibleVerificationState, { kind: "verifying" }>,
) => ({
  stage: state.kind,
  error_code: state.kind === "verified" ? "none" : state.errorCode,
});

const fingerprintSession = async (sessionId: string) => {
  const bytes = new TextEncoder().encode(sessionId);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).slice(0, 12))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

export const trackVerificationOutcomeOnce = async ({
  sessionId,
  state,
  storage,
  track,
}: {
  sessionId: string | null;
  state: Exclude<VisibleVerificationState, { kind: "verifying" }>;
  storage: Pick<Storage, "getItem" | "setItem">;
  track: (
    payload: ReturnType<typeof buildVerificationAnalyticsPayload>,
  ) => void;
}) => {
  const payload = buildVerificationAnalyticsPayload(state);
  let fingerprint = "missing-session";
  if (sessionId) {
    try {
      fingerprint = await fingerprintSession(sessionId);
    } catch {
      track(payload);
      return true;
    }
  }
  const storageKey = `snapcase_order_verification_outcome:${fingerprint}:${payload.stage}`;

  try {
    if (storage.getItem(storageKey) === "1") return false;
    storage.setItem(storageKey, "1");
  } catch {
    // Analytics can still be emitted when storage is unavailable.
  }

  track(payload);
  return true;
};
