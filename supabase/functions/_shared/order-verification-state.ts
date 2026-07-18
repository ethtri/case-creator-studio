export const PAYMENT_PENDING_ORDER_STATUS = "pending";

const VERIFIED_ORDER_STATUSES = new Set([
  "paid",
  "processing",
  "shipped",
  "delivered",
]);

const REVIEW_ORDER_STATUSES = new Set([
  "canceled",
  "cancelled",
  "failed",
  "payment_review",
]);

export type PaymentVerificationOrderState =
  | "pending_payment"
  | "verified"
  | "confirmed_failure"
  | "unknown";

export const classifyPaymentVerificationOrder = (
  status: unknown,
): PaymentVerificationOrderState => {
  if (typeof status !== "string") return "unknown";

  const normalizedStatus = status.trim().toLowerCase();
  if (normalizedStatus === PAYMENT_PENDING_ORDER_STATUS) {
    return "pending_payment";
  }
  if (VERIFIED_ORDER_STATUSES.has(normalizedStatus)) return "verified";
  if (REVIEW_ORDER_STATUSES.has(normalizedStatus)) {
    return "confirmed_failure";
  }
  return "unknown";
};
