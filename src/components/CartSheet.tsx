import { ShoppingCart, Trash2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useCart } from "@/contexts/CartContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { isPreviewUrl } from "@/utils/preview";

export function CartSheet() {
  const { items, removeFromCart, updateQuantity, totalItems, totalPrice } = useCart();
  const navigate = useNavigate();
  const hasInvalidItems = items.some(
    (item) =>
      typeof item.edmTemplateId !== "number" || !isPreviewUrl(item.designPreview)
  );
  const cartLabel =
    totalItems === 0
      ? "Open cart, empty"
      : `Open cart, ${totalItems} ${totalItems === 1 ? "item" : "items"}`;

  const handleCheckout = () => {
    if (hasInvalidItems) {
      toast.error("Wait for the preview to finish before checking out.");
      return;
    }
    navigate("/checkout");
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={cartLabel}
        >
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          {totalItems > 0 && (
            <span
              className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full bg-cta px-1 text-cta-foreground text-xs flex items-center justify-center"
              aria-hidden="true"
            >
              {totalItems}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col overflow-hidden sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            Your Cart ({totalItems} {totalItems === 1 ? "item" : "items"})
          </SheetTitle>
          <SheetDescription className="sr-only">
            Review your custom phone cases, update quantities, or continue to checkout.
          </SheetDescription>
        </SheetHeader>
        
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto py-4">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mb-4 opacity-50" />
                <p>Your cart is empty</p>
                <Button
                  variant="link"
                  className="mt-2"
                  onClick={() => navigate("/catalog")}
                >
                  Browse models
                </Button>
              </div>
            ) : (
              <ul className="space-y-4" aria-label="Cart items">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex gap-4 p-3 rounded-lg bg-card border border-border"
                  >
                    <img
                      src={item.designPreview}
                      alt={`${item.variant.brand} ${item.variant.model} custom case preview`}
                      className="w-16 h-24 rounded-lg bg-muted flex-shrink-0 object-cover"
                    />
                    
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">
                        {item.variant.brand} {item.variant.model}
                      </h4>
                      <p className="text-xs text-muted-foreground mb-2">
                        Custom Design
                      </p>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            aria-label={`Decrease quantity for ${item.variant.brand} ${item.variant.model}, currently ${item.quantity}`}
                          >
                            <Minus className="h-3 w-3" aria-hidden="true" />
                          </Button>
                          <span
                            className="w-8 text-center text-sm"
                            aria-live="polite"
                            aria-atomic="true"
                          >
                            <span aria-hidden="true">{item.quantity}</span>
                            <span className="sr-only">{item.quantity} in cart</span>
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            aria-label={`Increase quantity for ${item.variant.brand} ${item.variant.model}, currently ${item.quantity}`}
                          >
                            <Plus className="h-3 w-3" aria-hidden="true" />
                          </Button>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive-emphasis"
                          onClick={() => removeFromCart(item.id)}
                          aria-label={`Remove ${item.variant.brand} ${item.variant.model} from cart`}
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <span className="font-medium">
                        ${(item.variant.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          {items.length > 0 && (
            <div className="border-t border-border pt-4 pb-6 space-y-4">
              <div className="flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span>${totalPrice.toFixed(2)}</span>
              </div>
              <Button
                className="w-full bg-cta hover:bg-cta/90 text-cta-foreground"
                size="lg"
                onClick={handleCheckout}
                disabled={hasInvalidItems}
              >
                Checkout
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
