import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getVariantById, PhoneVariant } from "@/data/phoneVariants";
import { toast } from "sonner";
import { ChevronLeft, Lock, CreditCard, Package, Trash2, Tag } from "lucide-react";
import { SiteMenu } from "@/components/SiteMenu";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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

  const hasInvalidItems = items.some((item) => typeof item.edmTemplateId !== "number");
  const discountTotal = appliedPromo?.discountAmount ?? 0;
  const total = Math.max(totalPrice + SHIPPING_COST - discountTotal, SHIPPING_COST);

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) {
      setPromoError("Enter a promo code.");
      return;
    }
    if (!email.trim()) {
      setPromoError("Enter your email to validate this promo code.");
      return;
    }

    setPromoLoading(true);
    setPromoError(null);

    try {
      const cartItems = items.map((item) => ({
        variantId: item.variant.id,
        quantity: item.quantity,
      }));

      const { data, error } = await supabase.functions.invoke("validate-promo", {
        body: {
          code: promoCode.trim(),
          items: cartItems,
          customerEmail: email.trim(),
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.promo) {
        throw new Error("Promo code is invalid or expired.");
      }

      setAppliedPromo({
        code: data.promo.code,
        discountAmount: data.promo.discountAmount,
      });
      setPromoCode(data.promo.code);
    } catch (error) {
      console.error("Promo code error:", error);
      setPromoError(error instanceof Error ? error.message : "Unable to apply promo code.");
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
      toast.error("Finish saving your design before checking out.");
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

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          items: cartItems,
          customerEmail: user?.email ?? email,
          promoCode: appliedPromo ? { code: appliedPromo.code } : undefined,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      const message = error instanceof Error ? error.message : "Failed to start checkout.";
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Your cart is empty</p>
        <Button onClick={() => navigate("/catalog")}>Browse Cases</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-sunken">
      {/* Navigation */}
      <nav className="bg-card border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <span className="font-display font-bold text-lg text-foreground">Snapcase</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <SiteMenu showBrowse={false} />
            <Button
              variant="ghost"
              onClick={() => navigate("/catalog")}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Continue Shopping
            </Button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-12">
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

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Form */}
            <div className="lg:col-span-2">
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
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Shipping details will be collected securely in Stripe checkout.
                  </p>
                </div>

                {/* Payment info */}
                <div className="bg-card rounded-2xl p-6 shadow-soft">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    Payment
                  </h2>
                  <div className="bg-muted rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      You'll be redirected to Stripe's secure checkout to complete your payment
                    </p>
                  </div>
                </div>

                <Button
                  type="submit"
                  size="xl"
                  className="w-full bg-cta hover:bg-cta/90 text-cta-foreground"
                  disabled={isProcessing || items.length === 0 || hasInvalidItems}
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-accent-foreground border-t-transparent rounded-full mr-2" />
                      Redirecting to payment...
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 mr-2" />
                      Pay ${total.toFixed(2)} with Stripe
                    </>
                  )}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Your payment information is secured with SSL encryption
                </p>
              </motion.form>
            </div>

            {/* Order Summary */}
            <div>
              <motion.div
                className="bg-card rounded-2xl p-6 shadow-soft sticky top-24"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <h2 className="text-lg font-semibold mb-4">Order Summary ({items.length} items)</h2>

                {/* Cart items */}
                <div className="space-y-4 pb-4 border-b border-border max-h-64 overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.id} className="flex gap-3">
                      <div
                        className="w-12 h-18 rounded-lg flex-shrink-0 overflow-hidden bg-muted"
                        style={{
                          backgroundImage: `url(${item.designPreview})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">
                          {item.variant.brand} {item.variant.model}
                        </h3>
                        <p className="text-xs text-muted-foreground">Custom Design</p>
                        <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <p className="font-medium text-sm">${(item.variant.price * item.quantity).toFixed(2)}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => removeFromCart(item.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="py-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>${totalPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Package className="w-3 h-3" />
                      Standard shipping (2-4 business days)
                    </span>
                    <span>${SHIPPING_COST.toFixed(2)}</span>
                  </div>
                  {appliedPromo && (
                    <div className="flex justify-between text-sm text-success">
                      <span className="flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        Promo ({appliedPromo.code})
                      </span>
                      <span>- ${discountTotal.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between font-semibold pt-4 border-t border-border">
                  <span>Total</span>
                  <span>${total.toFixed(2)} USD</span>
                </div>

                <div className="pt-4 border-t border-border mt-4 space-y-2">
                  <Label htmlFor="promo">Promo code</Label>
                  <div className="flex gap-2">
                    <Input
                      id="promo"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      placeholder="Enter code"
                      disabled={promoLoading || isProcessing}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleApplyPromo}
                      disabled={promoLoading || isProcessing || !promoCode.trim()}
                    >
                      {promoLoading ? "Applying..." : "Apply"}
                    </Button>
                  </div>
                  {promoError && <p className="text-xs text-destructive">{promoError}</p>}
                  {appliedPromo && (
                    <div className="flex items-center justify-between text-xs text-success">
                      <span>Applied {appliedPromo.code}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={handleRemovePromo}>
                        Remove
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Final total is confirmed in Stripe at checkout.
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
