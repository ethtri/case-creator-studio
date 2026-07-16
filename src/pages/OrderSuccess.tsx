import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CheckCircle, Package, ArrowRight, Loader2 } from "lucide-react";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { trackMarketingEvent } from "@/lib/marketing";

interface OrderDetails {
  id: string;
  customer_email: string;
  items: any[];
  total: number;
  status: string;
  fulfillment_provider?: string | null;
}

const getOrderProgressCopy = (isManualProduction: boolean) =>
  isManualProduction
    ? {
        summary:
          "Your order is confirmed and queued for printing. Our production team will release it when the equipment is ready.",
        steps: [
          "Your order is added to the production queue",
          "Our production team releases your case for printing",
          "Your finished case ships within 2-4 business days",
        ],
      }
    : {
        summary:
          "We've received your order and will start producing your custom case right away.",
        steps: [
          "Your custom design is sent to production",
          "Your case is printed with high-quality UV printing",
          "Ships within 2-4 business days",
        ],
      };

const OrderSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const verifiedSessionRef = useRef<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    const verifyPayment = async () => {
      if (!sessionId) {
        setError("No session ID found");
        setIsVerifying(false);
        return;
      }
      if (verifiedSessionRef.current === sessionId) {
        return;
      }

      verifiedSessionRef.current = sessionId;

      try {
        const { data, error: verifyError } = await supabase.functions.invoke("verify-payment", {
          body: { sessionId },
        });

        if (verifyError) {
          throw new Error(verifyError.message);
        }

        if (data?.success) {
          setOrderDetails(data.order);
          const trackingKey = `snapcase_purchase_tracked:${sessionId}`;
          if (!window.sessionStorage.getItem(trackingKey)) {
            trackMarketingEvent("purchase", {
              transaction_id: data.order?.id ?? sessionId,
              value: Number(data.order?.total ?? 0),
              currency: "USD",
              item_count: Array.isArray(data.order?.items) ? data.order.items.length : 0,
            });
            window.sessionStorage.setItem(trackingKey, "true");
          }
          clearCart(); // Clear cart after successful payment
        } else {
          setError(data?.message || "Payment verification failed");
        }
      } catch (err) {
        console.error("Verification error:", err);
        setError("Failed to verify payment");
      } finally {
        setIsVerifying(false);
      }
    };

    verifyPayment();
  }, [sessionId, clearCart]);

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-accent mx-auto mb-4" />
          <p className="text-muted-foreground">Verifying your payment...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-destructive text-2xl">!</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => navigate("/catalog")}>
            Return to Shop
          </Button>
        </div>
      </div>
    );
  }

  const progressCopy = getOrderProgressCopy(
    orderDetails?.fulfillment_provider === "onshore_manual",
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="bg-card border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-display font-bold text-lg text-foreground">Snapcase</span>
          </Link>
          <div className="flex items-center gap-3">
            <CartSheet />
            <SiteMenu />
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-16">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
          >
            <CheckCircle className="w-10 h-10 text-success" />
          </motion.div>

          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Thank you for your order!
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            {progressCopy.summary}
          </p>

          {orderDetails && (
            <motion.div
              className="bg-card rounded-2xl p-6 shadow-soft mb-8 text-left"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Order Details
              </h2>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order ID</span>
                  <span className="font-mono">{orderDetails.id.slice(0, 8)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span>{orderDetails.customer_email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Items</span>
                  <span>{orderDetails.items?.length || 0} case(s)</span>
                </div>
                <div className="flex justify-between pt-3 border-t border-border font-semibold">
                  <span>Total</span>
                  <span>${Number(orderDetails.total).toFixed(2)} USD</span>
                </div>
              </div>
            </motion.div>
          )}

          <div className="bg-muted/50 rounded-xl p-6 mb-8">
            <h3 className="font-medium mb-2">What happens next?</h3>
            <ol className="text-sm text-muted-foreground space-y-2 text-left max-w-sm mx-auto">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
                {progressCopy.steps[0]}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
                {progressCopy.steps[1]}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
                {progressCopy.steps[2]}
              </li>
            </ol>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              onClick={() => navigate("/catalog")}
              className="bg-cta hover:bg-cta/90 text-cta-foreground"
            >
              Design Another Case
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate("/orders")}
            >
              View My Orders
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default OrderSuccess;
