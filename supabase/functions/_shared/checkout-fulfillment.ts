export const ONSHORE_MAX_UNITS_PER_CHECKOUT = 1;

export type CheckoutFulfillmentProvider = "printful" | "onshore_manual";

export function assertCheckoutQuantityAllowed(
  provider: CheckoutFulfillmentProvider,
  totalQuantity: number,
): void {
  if (!Number.isSafeInteger(totalQuantity) || totalQuantity < 1) {
    throw new Error("Cart must contain at least one case.");
  }

  if (
    provider === "onshore_manual" &&
    totalQuantity > ONSHORE_MAX_UNITS_PER_CHECKOUT
  ) {
    throw new Error(
      "Onshore production currently supports one case per checkout. Please place separate orders for additional cases.",
    );
  }
}
