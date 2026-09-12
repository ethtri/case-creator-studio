import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";
import { SNAPCASE_COMMERCIAL_ADDRESS, SNAPCASE_EMAILS } from "@/lib/email-identities";

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
            <div className="grid gap-8 sm:grid-cols-2">
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">Customer support</h2>
                <p>
                  For help with an order or design, email{" "}
                  <a
                    href={`mailto:${SNAPCASE_EMAILS.support}`}
                    className="text-foreground underline"
                  >
                    {SNAPCASE_EMAILS.support}
                  </a>
                  .
                </p>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">General inquiries</h2>
                <p>
                  For anything else, email{" "}
                  <a
                    href={`mailto:${SNAPCASE_EMAILS.hello}`}
                    className="text-foreground underline"
                  >
                    {SNAPCASE_EMAILS.hello}
                  </a>
                  .
                </p>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">Partnerships</h2>
                <p>
                  For retail, brand, and business opportunities, email{" "}
                  <a
                    href={`mailto:${SNAPCASE_EMAILS.partnerships}`}
                    className="text-foreground underline"
                  >
                    {SNAPCASE_EMAILS.partnerships}
                  </a>
                  .
                </p>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">Social and creators</h2>
                <p>
                  For creator collaborations and social media, email{" "}
                  <a
                    href={`mailto:${SNAPCASE_EMAILS.social}`}
                    className="text-foreground underline"
                  >
                    {SNAPCASE_EMAILS.social}
                  </a>
                  .
                </p>
              </div>
              <div className="sm:col-span-2">
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  Commercial mailing address
                </h2>
                <address className="not-italic">
                  {SNAPCASE_COMMERCIAL_ADDRESS.street}
                  <br />
                  {SNAPCASE_COMMERCIAL_ADDRESS.cityRegionPostal}
                </address>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                What to include for support
              </h2>
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
