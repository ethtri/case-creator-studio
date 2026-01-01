import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { PhoneVariant, getVariantById } from "@/data/phoneVariants";

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
const CART_PREVIEW_PREFIX = "snapcase_cart_preview:";
const MAX_INLINE_PREVIEW_LENGTH = 2000;

type StoredCartItem = {
  id: string;
  variantId: string;
  quantity: number;
  designPreview?: string | null;
  designPreviewKey?: string | null;
  edmTemplateId?: number | null;
  designId?: string | null;
  externalProductId?: string | null;
};

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

const isStoredCartItem = (value: unknown): value is StoredCartItem => {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.variantId !== "string") return false;
  if (typeof value.quantity !== "number") return false;
  return true;
};

const buildPreviewKey = (id: string) => `${CART_PREVIEW_PREFIX}${id}`;

const shouldInlinePreview = (preview: string) =>
  !preview.startsWith("data:") && preview.length <= MAX_INLINE_PREVIEW_LENGTH;

const getStoredPreview = (item: StoredCartItem): string | null => {
  if (typeof window === "undefined") return null;
  if (item.designPreview) return item.designPreview;
  if (item.designPreviewKey) {
    return window.sessionStorage.getItem(item.designPreviewKey);
  }
  if (item.designId) {
    return window.sessionStorage.getItem(`edmDesign:${item.designId}:preview`);
  }
  return null;
};

const loadStoredCart = (): CartItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (isCartItem(item)) {
        return [item];
      }
      if (!isStoredCartItem(item)) {
        return [];
      }
      const variant = getVariantById(item.variantId);
      if (!variant) return [];
      const preview = getStoredPreview(item) ?? "";
      return [
        {
          id: item.id,
          variant,
          designPreview: preview,
          edmTemplateId: item.edmTemplateId ?? null,
          designId: item.designId ?? null,
          externalProductId: item.externalProductId ?? null,
          quantity: item.quantity,
        },
      ];
    });
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
        Object.keys(window.sessionStorage)
          .filter((key) => key.startsWith(CART_PREVIEW_PREFIX))
          .forEach((key) => window.sessionStorage.removeItem(key));
        return;
      }

      const storedItems: StoredCartItem[] = items.map((item) => {
        const previewKey = buildPreviewKey(item.id);
        const preview = item.designPreview ?? "";
        const inlinePreview = preview && shouldInlinePreview(preview) ? preview : null;
        let storedPreviewKey = inlinePreview ? null : previewKey;

        if (preview && !inlinePreview) {
          try {
            window.sessionStorage.setItem(previewKey, preview);
          } catch (error) {
            console.warn("[CART] Unable to cache preview:", error);
            storedPreviewKey = null;
          }
        } else {
          window.sessionStorage.removeItem(previewKey);
        }

        return {
          id: item.id,
          variantId: item.variant.id,
          quantity: item.quantity,
          designPreview: inlinePreview,
          designPreviewKey: storedPreviewKey,
          edmTemplateId: item.edmTemplateId ?? null,
          designId: item.designId ?? null,
          externalProductId: item.externalProductId ?? null,
        };
      });

      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(storedItems));

      const previewKeys = new Set(items.map((item) => buildPreviewKey(item.id)));
      Object.keys(window.sessionStorage).forEach((key) => {
        if (key.startsWith(CART_PREVIEW_PREFIX) && !previewKeys.has(key)) {
          window.sessionStorage.removeItem(key);
        }
      });
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
