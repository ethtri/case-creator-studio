import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getVariantById, PhoneVariant } from "@/data/phoneVariants";
import { toast } from "sonner";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  CreditCard,
  Package,
  Tag,
  Trash2,
} from "lucide-react";
import { SiteMenu } from "@/components/SiteMenu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isPreviewUrl } from "@/utils/preview";
import {
  formatCheckoutItemCount,
  getCheckoutLineTotal,
  getCheckoutUnitCount,
} from "@/lib/checkout-review";
import {
  getAnalyticsClientId,
  getAnalyticsConsent,
  getMarketingAttribution,
  trackMarketingEvent,
} from "@/lib/marketing";
import {
  asMarketingItems,
  buildAnalyticsItems,
} from "@/lib/analytics-commerce";

const SHIPPING_COST = 4.99;

type PromoDetails = {
  code: string;
  discountAmount: number;
};

const Checkout = () => {
  const { variantId } = useParams();
  const navigate = useNavigate();
  const { items, removeFromCart, totalPrice } = useCart();
  const { user } = useAuth();
  const [variant, setVariant] = useState<PhoneVariant | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [email, setEmail] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<PromoDetails | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);

  useEffect(() => {
    const foundVariant = getVariantById(variantId || "");
    if (foundVariant) {
      setVariant(foundVariant);
    }
  }, [variantId]);

  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
  }, [user]);

  useEffect(() => {
    setAppliedPromo(null);
    setPromoError(null);
  }, [items, email]);

  const hasInvalidItems = items.some(
    (item) =>
      typeof item.edmTemplateId !== "number" ||
      !isPreviewUrl(item.designPreview),
  );
  const discountTotal = appliedPromo?.discountAmount ?? 0;
  const total = Math.max(
    totalPrice + SHIPPING_COST - discountTotal,
    SHIPPING_COST,
  );
  const totalQuantity = getCheckoutUnitCount(items);
  const checkoutHelpIds = [
    items.length === 0 || hasInvalidItems ? "checkout-payment-help" : null,
    "checkout-stripe-help",
    "checkout-legal-copy",
  ]
    .filter(Boolean)
    .join(" ");

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) {
      setPromoError("Enter a promo code.");
      return;
    }

    setPromoLoading(true);
    setPromoError(null);

    try {
      const cartItems = items.map((item) => ({
        variantId: item.variant.id,
        quantity: item.quantity,
      }));
      const trimmedEmail = email.trim();

      const { data, error } = await supabase.functions.invoke(
        "validate-promo",
        {
          body: {
            code: promoCode.trim(),
            items: cartItems,
            ...(trimmedEmail ? { customerEmail: trimmedEmail } : {}),
          },
        },
      );

      if (error) {
        let message = error.message;
        const context = (error as { context?: Response }).context;
        if (context) {
          try {
            const errorBody = await context.json();
            if (errorBody?.error) {
              message = errorBody.error as string;
            }
          } catch (parseError) {
            console.warn("Unable to parse promo error response:", parseError);
          }
        }
        throw new Error(message);
      }

      if (!data?.promo) {
        throw new Error("Promo code is invalid or expired.");
      }

      setAppliedPromo({
        code: data.promo.code,
        discountAmount: data.promo.discountAmount,
      });
      trackMarketingEvent("promo_applied", {
        code: data.promo.code,
        discount_amount: data.promo.discountAmount,
      });
      setPromoCode(data.promo.code);
    } catch (error) {
      console.error("Promo code error:", error);
      setPromoError(
        error instanceof Error ? error.message : "Unable to apply promo code.",
      );
    } finally {
      setPromoLoading(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    if (hasInvalidItems) {
      toast.error("Wait for the preview to finish before checking out.");
      return;
    }

    setIsProcessing(true);

    try {
      // Prepare cart items for checkout
      const cartItems = items.map((item) => ({
        variantId: item.variant.id,
        brand: item.variant.brand,
        model: item.variant.model,
        price: item.variant.price,
        quantity: item.quantity,
        designPreview: item.designPreview,
        edmTemplateId: item.edmTemplateId as number,
        designId: item.designId ?? null,
        externalProductId: item.externalProductId ?? null,
      }));
      const marketingAttribution = getMarketingAttribution();
      const analyticsConsent = getAnalyticsConsent();
      const analyticsClientId = await getAnalyticsClientId();
      const analyticsItems = buildAnalyticsItems(
        items.map((item) => ({
          variant: item.variant,
          quantity: item.quantity,
          discount:
            item.quantity > 0
              ? discountTotal /
                items.reduce((sum, cartItem) => sum + cartItem.quantity, 0)
              : 0,
        })),
      );

      trackMarketingEvent("begin_checkout", {
        value: Math.max(0, total - SHIPPING_COST),
        currency: "USD",
        shipping: SHIPPING_COST,
        items: asMarketingItems(analyticsItems),
        ...(appliedPromo ? { coupon: appliedPromo.code } : {}),
      });

      const { data, error } = await supabase.functions.invoke(
        "create-checkout",
        {
          body: {
            items: cartItems,
            customerEmail: user?.email ?? email,
            promoCode: appliedPromo ? { code: appliedPromo.code } : undefined,
            marketingAttribution,
            analyticsConsent,
            analyticsClientId,
          },
        },
      );

      if (error) {
        let message = error.message;
        const context = (error as { context?: Response }).context;
        if (context) {
          try {
            const errorBody = await context.json();
            if (errorBody?.error) {
              message = errorBody.error as string;
            }
          } catch (parseError) {
            console.warn(
              "Unable to parse checkout error response:",
              parseError,
            );
          }
        }
        throw new Error(message);
      }

      if (data?.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      const message =
        error instanceof Error ? error.message : "Failed to start checkout.";
      trackMarketingEvent("checkout_error", {
        error_code: message.toLowerCase().includes("promo")
          ? "promotion_rejected"
          : "checkout_start_failed",
        stage: "create_checkout",
      });
      if (message.toLowerCase().includes("promo")) {
        setAppliedPromo(null);
        setPromoError(message);
      }
      toast.error(message);
      setIsProcessing(false);
    }
  };

  if (items.length === 0 && !variant) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Your cart is empty</p>
        <Button onClick={() => navigate("/catalog")}>Browse Cases</Button>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-surface-sunken">
      {/* Navigation */}
      <nav className="bg-card border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2"
            >
              <span className="font-display font-bold text-lg text-foreground">
                Snapcase
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <SiteMenu showBrowse={false} />
            <Button variant="ghost" onClick={() => navigate("/catalog")}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Continue Shopping
            </Button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-3xl font-bold mb-2">Checkout</h1>
            <p className="text-muted-foreground mb-8">
              Complete your order to get your custom case
            </p>
          </motion.div>

          <div className="grid gap-8 lg:grid-cols-3">
            {/* Order Summary */}
            <motion.aside
              data-checkout-region="summary"
              aria-labelledby="order-summary-heading"
              className="order-1 lg:order-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div className="bg-card rounded-2xl p-5 shadow-soft sm:p-6 lg:sticky lg:top-24">
                <div className="mb-4 flex items-baseline justify-between gap-4">
                  <h2
                    id="order-summary-heading"
                    className="text-lg font-semibold"
                  >
                    Order summary
                  </h2>
                  <p className="shrink-0 text-sm text-muted-foreground">
                    {formatCheckoutItemCount(totalQuantity)}
                  </p>
                </div>

                {/* Cart items */}
                <div className="space-y-4 border-b border-border pb-4 lg:max-h-64 lg:overflow-y-auto">
                  {items.map((item) => {
                    const lineTotal = getCheckoutLineTotal(
                      item.variant.price,
                      item.quantity,
                    );

                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-[3rem_minmax(0,1fr)_auto] gap-3"
                      >
                        <img
                          src={item.designPreview}
                          alt=""
                          aria-hidden="true"
                          className="h-16 w-12 rounded-lg bg-muted object-cover"
                        />
                        <div className="min-w-0">
                          <h3 className="text-sm font-medium">
                            {item.variant.brand} {item.variant.model}
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Unit price ${item.variant.price.toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Quantity {item.quantity}
                          </p>
                          <p className="mt-1 text-sm font-medium">
                            Line total ${lineTotal.toFixed(2)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-mr-2 shrink-0 text-destructive-emphasis"
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          aria-label={`Remove ${item.variant.brand} ${item.variant.model} from order`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {/* Totals */}
                <div className="space-y-2 py-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>${totalPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Package className="h-3 w-3" aria-hidden="true" />
                      Shipping
                    </span>
                    <span>${SHIPPING_COST.toFixed(2)}</span>
                  </div>
                  {appliedPromo && (
                    <div className="flex justify-between text-sm text-success-emphasis">
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3" aria-hidden="true" />
                        Promo ({appliedPromo.code})
                      </span>
                      <span>- ${discountTotal.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between border-t border-border pt-4 font-semibold">
                  <span>Total</span>
                  <span>${total.toFixed(2)} USD</span>
                </div>

                <Collapsible
                  open={promoOpen || Boolean(appliedPromo)}
                  onOpenChange={setPromoOpen}
                  className="mt-4 border-t border-border pt-4"
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="group w-full justify-between px-0 lg:hidden"
                    >
                      {appliedPromo
                        ? `Promo ${appliedPromo.code} applied`
                        : "Add a promo code"}
                      <ChevronDown
                        className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180"
                        aria-hidden="true"
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent
                    forceMount
                    className="hidden data-[state=open]:block lg:block"
                  >
                    <div className="space-y-2 pt-2 lg:pt-0">
                      <Label htmlFor="promo">Promo code</Label>
                      <div className="flex gap-2">
                        <Input
                          id="promo"
                          value={promoCode}
                          onChange={(e) => setPromoCode(e.target.value)}
                          placeholder="Enter code"
                          disabled={promoLoading || isProcessing}
                          aria-invalid={Boolean(promoError)}
                          aria-describedby={
                            promoError ? "promo-error promo-help" : "promo-help"
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleApplyPromo}
                          disabled={
                            promoLoading || isProcessing || !promoCode.trim()
                          }
                        >
                          {promoLoading ? "Applying..." : "Apply"}
                        </Button>
                      </div>
                      {promoError && (
                        <p
                          id="promo-error"
                          className="text-xs text-destructive-emphasis"
                          role="alert"
                        >
                          {promoError}
                        </p>
                      )}
                      {appliedPromo && (
                        <div
                          className="flex items-center justify-between text-xs text-success-emphasis"
                          role="status"
                          aria-live="polite"
                        >
                          <span>Applied {appliedPromo.code}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleRemovePromo}
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                      <p
                        id="promo-help"
                        className="text-xs text-muted-foreground"
                      >
                        Final total is confirmed in Stripe Checkout.
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </motion.aside>

            {/* Checkout details */}
            <div
              data-checkout-region="details"
              className="order-2 lg:order-1 lg:col-span-2"
            >
              <motion.form
                onSubmit={handleSubmit}
                className="space-y-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                {/* Contact */}
                <div className="bg-card rounded-2xl p-6 shadow-soft">
                  <h2 className="text-lg font-semibold mb-4">Contact Email</h2>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="mt-1"
                      disabled={isProcessing || !!user?.email}
                      aria-describedby="checkout-email-help"
                    />
                  </div>
                  <p
                    id="checkout-email-help"
                    className="text-xs text-muted-foreground mt-3"
                  >
                    Use the email where you want to receive order updates.
                  </p>
                </div>

                {/* Payment info */}
                <div className="bg-card rounded-2xl p-6 shadow-soft">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    Payment
                  </h2>
                  <div className="rounded-lg bg-muted p-4">
                    <p
                      id="checkout-stripe-help"
                      className="text-sm text-muted-foreground"
                    >
                      Payment and shipping details are entered and submitted in
                      Stripe Checkout after you continue.
                    </p>
                  </div>
                </div>

                <div data-checkout-cta-group className="space-y-3">
                  <Button
                    type="submit"
                    size="xl"
                    className="w-full bg-cta text-cta-foreground hover:bg-cta/90"
                    disabled={
                      isProcessing || items.length === 0 || hasInvalidItems
                    }
                    aria-describedby={checkoutHelpIds}
                  >
                    {isProcessing ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-accent-foreground border-t-transparent" />
                        Opening Stripe Checkout...
                      </>
                    ) : (
                      <>
                        Continue to Stripe
                        <span aria-hidden="true">&nbsp;—&nbsp;</span>
                        <span className="sr-only">for </span>${total.toFixed(2)}
                        <ArrowRight
                          className="ml-2 h-4 w-4"
                          aria-hidden="true"
                        />
                      </>
                    )}
                  </Button>
                  {(items.length === 0 || hasInvalidItems) && (
                    <p
                      id="checkout-payment-help"
                      className="text-sm text-muted-foreground"
                      role="status"
                    >
                      {items.length === 0
                        ? "Add a completed design to your cart before continuing."
                        : "Checkout becomes available after every design preview finishes saving."}
                    </p>
                  )}
                  <p
                    id="checkout-legal-copy"
                    className="text-center text-xs text-muted-foreground"
                  >
                    By continuing, you agree to the{" "}
                    <Link
                      to="/terms"
                      className="rounded-sm underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Terms
                    </Link>{" "}
                    and acknowledge the{" "}
                    <Link
                      to="/privacy"
                      className="rounded-sm underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Privacy Policy
                    </Link>
                    .
                  </p>
                </div>
              </motion.form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Checkout;
