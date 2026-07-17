import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";

const Contact = () => {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2">
            <span className="font-display font-bold text-xl text-foreground">Snapcase</span>
          </Link>
          <div className="flex items-center gap-3">
            <CartSheet />
            <SiteMenu />
          </div>
        </div>
      </nav>

      <main>
        <section className="pt-28 pb-16">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Contact</h1>
            <p className="text-muted-foreground text-lg">
              Need help with an order or a design? We are here to help.
            </p>
          </motion.div>
        </div>
        </section>

        <section className="pb-24">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl space-y-10 text-muted-foreground">
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">Email support</h2>
              <p>
                Email us at{" "}
                <a href="mailto:support@snapcase.ai" className="text-foreground underline">
                  support@snapcase.ai
                </a>
                . Include your order number so the support team can locate the order.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">What to include</h2>
              <p>
                Include your order number, the email used at checkout, and a short description of
                the issue. Add photos when they help explain an order problem.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">Order updates</h2>
              <p>
                You can also check your order status from the{" "}
                <Link to="/orders" className="text-foreground underline">
                  My Orders
                </Link>{" "}
                page.
              </p>
            </div>
          </div>
        </div>
        </section>
      </main>
    </div>
  );
};

export default Contact;
