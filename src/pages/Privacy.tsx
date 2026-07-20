import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";
import { Button } from "@/components/ui/button";
import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import { SNAPCASE_EMAILS } from "@/lib/email-identities";
import { setAnalyticsConsent } from "@/lib/marketing";

const Privacy = () => {
  const analyticsConsent = useAnalyticsConsent();

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
              <h2 className="text-xl font-semibold text-foreground mb-3">
                Analytics and your choices
              </h2>
              <p>
                We use Google Analytics only after you allow analytics. It helps us understand
                which pages and phone models lead to completed purchases. We send product,
                campaign, and order totals, but not uploaded artwork, contact information, or
                shipping addresses. Advertising storage and ad personalization remain disabled.
              </p>
              <p className="mt-3">
                Your current analytics preference is{" "}
                <strong className="text-foreground">
                  {analyticsConsent === "unset" ? "not selected" : analyticsConsent}
                </strong>
                . You can change it at any time on this device.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAnalyticsConsent("denied")}
                >
                  Decline analytics
                </Button>
                <Button
                  type="button"
                  className="bg-cta text-cta-foreground hover:bg-cta/90"
                  onClick={() => setAnalyticsConsent("granted")}
                >
                  Allow analytics
                </Button>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">Sharing</h2>
              <p>
                We share necessary order details with service providers to process payment,
                fulfill the order, and provide order-related support. These providers may use the
                data only for those services.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">Data retention</h2>
              <p>
                We retain order data for record keeping and support. Design assets are stored to
                fulfill your order and support order-related requests.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">Contact</h2>
              <p>
                If you have questions or requests related to privacy, contact{" "}
                <a
                  href={`mailto:${SNAPCASE_EMAILS.support}`}
                  className="text-foreground underline"
                >
                  {SNAPCASE_EMAILS.support}
                </a>
                .
              </p>
            </div>
          </div>
        </div>
        </section>
      </main>
    </div>
  );
};

export default Privacy;
