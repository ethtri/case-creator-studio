import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AlertCircle,
  CreditCard,
  Loader2,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteMenu } from "@/components/SiteMenu";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const REQUIRED_FIELDS = [
  "order_no",
  "out_trade_no",
  "amount",
  "goods_name",
  "currency",
  "machine_sn",
  "timestamp",
  "nonce",
  "sign",
];

const KexiaozhanCheckout = () => {
  const location = useLocation();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handoffParams = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return Object.fromEntries(searchParams.entries());
  }, [location.search]);

  const missingFields = REQUIRED_FIELDS.filter((field) =>
    !handoffParams[field]
  );
  const hasRequiredParams = missingFields.length === 0;
  const displayName = handoffParams.goods_name || "Custom phone case";
  const vendorAmount = handoffParams.amount && handoffParams.currency
    ? `${handoffParams.currency.toUpperCase()} ${handoffParams.amount}`
    : "Unavailable";

  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
  }, [user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasRequiredParams) {
      setSubmitError("This checkout link is missing required order details.");
      return;
    }

    setIsProcessing(true);
    setSubmitError(null);

    try {
      const { data, error } = await supabase.functions.invoke(
        "kexiaozhan-create-checkout",
        {
          body: {
            customerEmail: user?.email ?? email,
            params: handoffParams,
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
              "Unable to parse Kexiaozhan checkout error:",
              parseError,
            );
          }
        }
        throw new Error(message);
      }

      if (typeof data?.url !== "string" || !data.url) {
        throw new Error("No Stripe Checkout URL was returned.");
      }

      window.location.href = data.url;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Unable to start checkout.";
      setSubmitError(message);
      toast.error(message);
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-sunken">
      <nav className="bg-card border-b border-border">
        <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="-ml-2 inline-flex min-h-11 items-center px-2 font-display font-bold text-lg text-foreground"
          >
            Snapcase
          </Link>
          <SiteMenu showBrowse={false} />
        </div>
      </nav>

      <main className="w-full px-4 sm:px-6 py-10">
        <div className="max-w-4xl mx-auto grid min-w-0 lg:grid-cols-[minmax(0,1fr)_360px] gap-8">
          <section className="min-w-0 bg-card rounded-2xl p-6 shadow-soft">
            <div className="flex items-start gap-3 mb-6">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary-emphasis flex items-center justify-center">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Continue to secure checkout
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Review the order handoff and enter your email to continue to
                  Stripe.
                </p>
              </div>
            </div>

            {!hasRequiredParams && (
              <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-emphasis flex gap-3" role="alert">
                <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">This checkout link is incomplete.</p>
                  <p className="mt-1">Missing: {missingFields.join(", ")}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Label htmlFor="kexiaozhan-email">Email</Label>
                <Input
                  id="kexiaozhan-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={isProcessing || Boolean(user?.email)}
                  placeholder="you@example.com"
                  className="mt-1"
                  aria-describedby="kexiaozhan-email-help"
                />
                <p id="kexiaozhan-email-help" className="text-xs text-muted-foreground mt-2">
                  Shipping details are collected securely in Stripe Checkout.
                </p>
              </div>

              {submitError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-emphasis" role="alert">
                  {submitError}
                </div>
              )}

              <Button
                type="submit"
                size="xl"
                className="w-full bg-cta hover:bg-cta/90 text-cta-foreground"
                disabled={!hasRequiredParams || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Redirecting to Stripe...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Continue to Stripe Checkout
                  </>
                )}
              </Button>
            </form>
          </section>

          <aside className="min-w-0 bg-card rounded-2xl p-6 shadow-soft h-fit">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <PackageCheck className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Order handoff</h2>
                <p className="text-xs text-muted-foreground">
                  Signed by Kexiaozhan
                </p>
              </div>
            </div>

            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Item</dt>
                <dd className="font-medium text-foreground break-words">
                  {displayName}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Vendor order</dt>
                <dd className="font-medium text-foreground break-all">
                  {handoffParams.order_no || "Unavailable"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Payment reference</dt>
                <dd className="font-medium text-foreground break-all">
                  {handoffParams.out_trade_no || "Unavailable"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  Vendor amount reference
                </dt>
                <dd className="font-medium text-foreground">{vendorAmount}</dd>
              </div>
            </dl>

            <div className="mt-5 space-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
              <p>
                Final Snapcase price and shipping are confirmed in Stripe before
                payment. Automatic sales tax is not currently added.
              </p>
              <p>
                Promo codes are not available for this vendor-handoff checkout.
              </p>
              <p>
                Carrier transit begins after production. No delivery date is
                promised on this page.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default KexiaozhanCheckout;
