import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";

const Privacy = () => {
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
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Privacy Policy</h1>
            <p className="text-muted-foreground text-lg">
              We respect your privacy and keep data collection limited to what we need to fulfill
              your order and improve your experience.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="pb-24">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl space-y-10 text-muted-foreground">
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">Information we collect</h2>
              <p>
                We collect information you provide at checkout such as name, email, shipping
                address, and order details. We also collect design assets you upload so we can
                generate your custom case.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">How we use your data</h2>
              <p>
                We use your data to process payments, fulfill orders, provide support, and improve
                the product. We do not sell your personal information.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">Sharing</h2>
              <p>
                We share necessary order details with our production and shipping partners in
                order to make and deliver your case. These partners are only allowed to use the
                data to provide the service.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">Data retention</h2>
              <p>
                We retain order data for record keeping and support. Design assets are stored to
                fulfill your order and for limited reprint support.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">Contact</h2>
              <p>
                If you have questions or requests related to privacy, contact{" "}
                <a href="mailto:Support@bloomjoysweets.com" className="text-foreground underline">
                  Support@bloomjoysweets.com
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

export default Privacy;
