export type StripeCheckoutPaymentState = {
  checkoutStatus: unknown;
  paymentStatus: unknown;
  amountTotal: unknown;
};

export function isStripeCheckoutPaymentFulfilled(
  state: StripeCheckoutPaymentState,
): boolean {
  if (state.checkoutStatus !== "complete") return false;
  if (state.paymentStatus === "paid") return true;

  return state.paymentStatus === "no_payment_required" &&
    state.amountTotal === 0;
}
