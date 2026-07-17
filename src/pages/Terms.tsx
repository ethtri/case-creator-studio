import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-display font-bold text-xl text-foreground">Snapcase</span>
          </Link>
          <div className="flex items-center gap-3">
            <CartSheet />
            <SiteMenu />
          </div>
        </div>
      </nav>

      <section className="pt-28 pb-16">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Terms of Service</h1>
            <p className="text-muted-foreground text-lg">
              These terms govern your use of Snapcase and the purchase of custom cases.
              By placing an order, you agree to the terms below.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="pb-24">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl space-y-10 text-muted-foreground">
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">Orders and production</h2>
              <p>
                Please review your design, device model, item count, and price before checkout.
                Contact support as soon as possible if an order detail appears incorrect.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">Pricing and payments</h2>
              <p>
                Prices are shown in USD unless otherwise noted. Taxes and shipping are calculated
                at checkout. Payment is collected at the time your order is placed.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">Shipping and delivery</h2>
              <p>
                Confirm your shipping details during checkout. Order status and tracking
                information appear in My Orders when they become available.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">Order problems</h2>
              <p>
                Contact support with your order number and a description of the problem.
                Photos can help the support team review the order details and available next steps.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">Intellectual property</h2>
              <p>
                You must own or have rights to the content you upload. You grant Snapcase a
                limited license to reproduce your design solely to fulfill your order.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">Contact</h2>
              <p>
                Questions about these terms? Reach us at{" "}
                <a href="mailto:support@snapcase.ai" className="text-foreground underline">
                  support@snapcase.ai
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Terms;
