export type KexiaozhanCheckoutPricing = {
  unitAmountCents: number;
  shippingCents: number;
  totalCents: number;
  isNoCostCheckout: boolean;
};

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

export function resolveKexiaozhanCheckoutPricing(input: {
  unitAmountCents: number;
  shippingCents: number;
  vendorAmount: string;
  allowZeroTotalCheckout: boolean;
}): KexiaozhanCheckoutPricing {
  assertNonNegativeInteger(input.unitAmountCents, "unit amount");
  assertNonNegativeInteger(input.shippingCents, "shipping amount");

  const totalCents = input.unitAmountCents + input.shippingCents;
  const isNoCostCheckout = totalCents === 0;

  if (!isNoCostCheckout && input.unitAmountCents === 0) {
    throw new Error("unit amount must be greater than zero for paid checkout");
  }

  if (isNoCostCheckout) {
    if (!input.allowZeroTotalCheckout) {
      throw new Error("zero-total checkout is not enabled");
    }

    if (Number(input.vendorAmount) !== 0) {
      throw new Error("zero-total checkout requires a zero vendor amount");
    }
  }

  return {
    unitAmountCents: input.unitAmountCents,
    shippingCents: input.shippingCents,
    totalCents,
    isNoCostCheckout,
  };
}
