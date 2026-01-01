import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { PhoneVariant } from "@/data/phoneVariants";

export interface CartItem {
  id: string;
  variant: PhoneVariant;
  designPreview: string;
  edmTemplateId?: number | null;
  designId?: string | null;
  externalProductId?: string | null;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (
    variant: PhoneVariant,
    designPreview: string,
    edmTemplateId?: number | null,
    designId?: string | null,
    externalProductId?: string | null
  ) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = "snapcase_cart_v1";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCartItem = (value: unknown): value is CartItem => {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (!isRecord(value.variant)) return false;
  if (typeof value.variant.id !== "string") return false;
  if (typeof value.variant.price !== "number") return false;
  if (typeof value.designPreview !== "string") return false;
  if (typeof value.quantity !== "number") return false;
  return true;
};

const loadStoredCart = (): CartItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartItem);
  } catch (error) {
    console.warn("[CART] Unable to read stored cart:", error);
    return [];
  }
};

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => loadStoredCart());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (items.length === 0) {
        window.localStorage.removeItem(CART_STORAGE_KEY);
      } else {
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
      }
    } catch (error) {
      console.warn("[CART] Unable to persist cart:", error);
    }
  }, [items]);

  const addToCart = (
    variant: PhoneVariant,
    designPreview: string,
    edmTemplateId?: number | null,
    designId?: string | null,
    externalProductId?: string | null
  ) => {
    const id = `${variant.id}-${Date.now()}`;
    setItems((prev) => [
      ...prev,
      {
        id,
        variant,
        designPreview,
        edmTemplateId: edmTemplateId ?? null,
        designId: designId ?? null,
        externalProductId: externalProductId ?? null,
        quantity: 1,
      },
    ]);
  };

  const removeFromCart = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity < 1) {
      removeFromCart(id);
      return;
    }
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + item.variant.price * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
