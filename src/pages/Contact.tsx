import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CartSheet } from "@/components/CartSheet";

const Contact = () => {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-display font-bold text-xl text-foreground">Snapcase</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/catalog" className="hidden md:block">
              <Button variant="ghost">Browse Cases</Button>
            </Link>
            <Link to="/orders" className="hidden md:block">
              <Button variant="ghost">My Orders</Button>
            </Link>
            <ThemeToggle />
            <CartSheet />
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
                . Include your order number for the fastest response.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">Response time</h2>
              <p>
                We typically respond within 1 to 2 business days. During peak seasons, response
                times may be slightly longer.
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
    </div>
  );
};

export default Contact;
