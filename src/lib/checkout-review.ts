type CheckoutQuantityItem = {
  quantity: number;
};

export const getCheckoutUnitCount = (
  items: readonly CheckoutQuantityItem[],
): number => items.reduce((total, item) => total + item.quantity, 0);

export const formatCheckoutItemCount = (quantity: number): string =>
  `${quantity} ${quantity === 1 ? "item" : "items"}`;

export const getCheckoutLineTotal = (
  unitPrice: number,
  quantity: number,
): number => unitPrice * quantity;
