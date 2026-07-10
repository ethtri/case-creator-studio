export type KexiaozhanPaymentTransactionInput = {
  orderId: string;
  orderStatus: unknown;
  orderTotal: unknown;
  stripeSessionId: unknown;
  stripePaymentIntentId: unknown;
};

export type KexiaozhanPaymentTransaction = {
  transactionId: string;
  source: "stripe_payment_intent" | "snapcase_zero_amount";
  stripePaymentIntentId: string | null;
};

const UUID_WITHOUT_HYPHENS = /^[0-9a-f]{32}$/i;

function getString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function isZeroAmount(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value) && value === 0;
  }

  if (typeof value === "string") {
    return /^(?:0|0\.0+)$/.test(value.trim());
  }

  return false;
}

export function resolveKexiaozhanPaymentTransaction(
  input: KexiaozhanPaymentTransactionInput,
): KexiaozhanPaymentTransaction | null {
  const stripePaymentIntentId = getString(input.stripePaymentIntentId);
  if (stripePaymentIntentId) {
    return {
      transactionId: stripePaymentIntentId,
      source: "stripe_payment_intent",
      stripePaymentIntentId,
    };
  }

  const orderId = input.orderId.replaceAll("-", "");
  const orderStatus = getString(input.orderStatus)?.toLowerCase();
  const stripeSessionId = getString(input.stripeSessionId);
  if (
    orderStatus !== "paid" ||
    !isZeroAmount(input.orderTotal) ||
    !stripeSessionId ||
    !UUID_WITHOUT_HYPHENS.test(orderId)
  ) {
    return null;
  }

  return {
    transactionId: `SC${orderId.toUpperCase()}`,
    source: "snapcase_zero_amount",
    stripePaymentIntentId: null,
  };
}
