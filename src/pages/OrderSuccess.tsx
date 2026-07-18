import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle,
  Clipboard,
  Clock3,
  Loader2,
  Package,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import {
  countPurchasedUnits,
  createOrderVerificationRunner,
  formatPurchasedUnits,
  trackVerificationOutcomeOnce,
  type OrderVerificationResult,
  type VisibleVerificationState,
} from "@/lib/order-verification";
import { getAnalyticsConsent, trackMarketingEvent } from "@/lib/marketing";

const orderProgressCopy = {
  summary:
    "Your payment is confirmed. Check My Orders for status updates and tracking when it becomes available.",
  steps: [
    "Payment is confirmed and your order is recorded",
    "Order status changes appear in My Orders",
    "Tracking is added when it becomes available",
  ],
};

const PageShell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-background">
    <nav className="border-b border-border bg-card">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <Link
          to="/"
          className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2"
        >
          <span className="font-display text-lg font-bold text-foreground">
            Snapcase
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <CartSheet />
          <SiteMenu />
        </div>
      </div>
    </nav>
    {children}
  </div>
);

const SupportReference = ({ reference }: { reference: string }) => {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4 text-left">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-foreground">
        Support reference
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <code className="text-sm font-semibold text-foreground">
          {reference}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copyReference}
          aria-label={`Copy support reference ${reference}`}
        >
          {copyStatus === "copied" ? (
            <Check aria-hidden="true" />
          ) : (
            <Clipboard aria-hidden="true" />
          )}
          {copyStatus === "copied" ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-foreground" aria-live="polite">
        {copyStatus === "copied"
          ? "Support reference copied."
          : copyStatus === "failed"
            ? `Copy was unavailable. Select ${reference} to copy it manually.`
            : "Share this reference with Snapcase support. It is not a payment credential."}
      </p>
    </div>
  );
};

const SafeActions = ({
  includeRetry = false,
  isRetrying = false,
  onRetry,
}: {
  includeRetry?: boolean;
  isRetrying?: boolean;
  onRetry?: () => void;
}) => (
  <div className="grid gap-3 sm:grid-cols-2">
    {includeRetry && (
      <Button
        type="button"
        variant="cta"
        size="lg"
        className="hover:bg-cta"
        disabled={isRetrying}
        onClick={onRetry}
      >
        {isRetrying ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw aria-hidden="true" />
        )}
        {isRetrying ? "Checking again…" : "Retry verification"}
      </Button>
    )}
    <Button asChild variant="outline" size="lg">
      <Link
        to="/orders"
        onClick={() =>
          trackMarketingEvent("primary_cta_click", {
            placement: "order_verification_recovery",
            label: "view_orders",
            destination: "/orders",
          })
        }
      >
        View My Orders
      </Link>
    </Button>
    <Button asChild variant="outline" size="lg">
      <Link
        to="/contact"
        onClick={() =>
          trackMarketingEvent("primary_cta_click", {
            placement: "order_verification_recovery",
            label: "contact_support",
            destination: "/contact",
          })
        }
      >
        Contact support
      </Link>
    </Button>
    <Button asChild variant="ghost" size="lg">
      <Link
        to="/catalog"
        onClick={() =>
          trackMarketingEvent("primary_cta_click", {
            placement: "order_verification_recovery",
            label: "browse_cases",
            destination: "/catalog",
          })
        }
      >
        Browse cases
      </Link>
    </Button>
  </div>
);

const RecoveryPanel = ({
  state,
  isRetrying,
  onRetry,
  headingRef,
}: {
  state: Extract<
    VisibleVerificationState,
    { kind: "missing_session" | "retryable" | "confirmed_failure" }
  >;
  isRetrying: boolean;
  onRetry: () => void;
  headingRef: React.RefObject<HTMLHeadingElement>;
}) => {
  const isMissing = state.kind === "missing_session";
  const isConfirmed = state.kind === "confirmed_failure";
  const isExpired = isConfirmed && state.errorCode === "checkout_expired";
  const supportReference =
    state.kind === "retryable" || state.kind === "confirmed_failure"
      ? state.supportReference
      : undefined;

  const title = isMissing
    ? "We can’t verify this return page"
    : isConfirmed
      ? isExpired
        ? "This checkout is no longer active"
        : "Your order needs support review"
      : "We’re still confirming your order";
  const description = isMissing
    ? "The secure return reference is missing. This does not tell us whether a payment was completed, so please check My Orders or contact support before trying to buy again."
    : isConfirmed
      ? isExpired
        ? "Stripe reports that this checkout ended without a confirmed payment. If you see a charge or are unsure, contact us with the support reference before placing another order."
        : "We found the order, but automated processing stopped and a support review is required. Your cart has not been cleared."
      : "Payment confirmation can take a moment or the verification service may be temporarily unavailable. Your cart is saved, and retrying only checks the existing order.";

  return (
    <PageShell>
      <main className="container mx-auto px-6 py-12 sm:py-20">
        <motion.section
          className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-9"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          aria-labelledby="verification-heading"
        >
          <div
            className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl ${
              isConfirmed
                ? "bg-destructive/10 text-destructive-emphasis"
                : "bg-accent/10 text-accent-emphasis"
            }`}
          >
            {isConfirmed ? (
              <AlertCircle className="h-7 w-7" aria-hidden="true" />
            ) : (
              <Clock3 className="h-7 w-7" aria-hidden="true" />
            )}
          </div>
          <p className="mb-2 text-sm font-semibold text-foreground">
            Order verification
          </p>
          <h1
            ref={headingRef}
            id="verification-heading"
            tabIndex={-1}
            className="text-2xl font-bold tracking-tight sm:text-3xl"
          >
            {title}
          </h1>
          <p
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {title}. {description}
          </p>
          <p className="mt-3 text-muted-foreground">{description}</p>

          {isRetrying && (
            <p
              className="mt-4 text-sm font-medium text-foreground"
              role="status"
              aria-live="polite"
            >
              Checking the existing order now. Please keep this page open.
            </p>
          )}

          {supportReference && (
            <div className="mt-6">
              <SupportReference reference={supportReference} />
            </div>
          )}

          <div className="mt-7">
            <SafeActions
              includeRetry={!isMissing && !isConfirmed}
              isRetrying={isRetrying}
              onRetry={onRetry}
            />
          </div>
        </motion.section>
      </main>
    </PageShell>
  );
};

const OrderSuccess = () => {
  const [searchParams] = useSearchParams();
  const { clearCart } = useCart();
  const sessionId = searchParams.get("session_id");
  const initialState: VisibleVerificationState = sessionId
    ? { kind: "verifying" }
    : { kind: "missing_session", errorCode: "missing_session" };
  const [state, setState] = useState<VisibleVerificationState>(initialState);
  const [isRetrying, setIsRetrying] = useState(false);
  const autoStartedSessionRef = useRef<string | null>(null);
  const clearedOrderRef = useRef<string | null>(null);
  const activeRequestRef = useRef(0);
  const trackedStatesRef = useRef(new Set<string>());
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const runnerRef = useRef(
    createOrderVerificationRunner((candidateSessionId) =>
      supabase.functions.invoke("verify-payment", {
        body: { sessionId: candidateSessionId },
      }),
    ),
  );

  const verifyPayment = useCallback(async () => {
    if (!sessionId) return;

    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    setIsRetrying(true);
    const result: OrderVerificationResult =
      await runnerRef.current.verify(sessionId);
    if (activeRequestRef.current !== requestId) return;

    setState(result);
    setIsRetrying(false);

    if (
      result.kind === "verified" &&
      clearedOrderRef.current !== result.supportReference
    ) {
      clearedOrderRef.current = result.supportReference;
      clearCart();
    }
  }, [clearCart, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setState({ kind: "missing_session", errorCode: "missing_session" });
      return;
    }
    if (autoStartedSessionRef.current === sessionId) return;

    autoStartedSessionRef.current = sessionId;
    setState({ kind: "verifying" });
    void verifyPayment();
  }, [sessionId, verifyPayment]);

  useEffect(() => {
    if (state.kind === "verifying" || getAnalyticsConsent() !== "granted") {
      return;
    }

    const localKey = `${sessionId ?? "missing"}:${state.kind}:${
      "errorCode" in state ? state.errorCode : "none"
    }`;
    if (trackedStatesRef.current.has(localKey)) return;
    trackedStatesRef.current.add(localKey);

    void trackVerificationOutcomeOnce({
      sessionId,
      state,
      storage: window.sessionStorage,
      track: (payload) => trackMarketingEvent("order_verification", payload),
    });
  }, [sessionId, state]);

  useEffect(() => {
    if (state.kind !== "verifying") {
      resultHeadingRef.current?.focus();
    }
  }, [state]);

  if (state.kind === "verifying") {
    return (
      <PageShell>
        <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6">
          <div
            className="max-w-sm text-center"
            role="status"
            aria-live="polite"
          >
            <Loader2
              className="mx-auto mb-4 h-12 w-12 animate-spin text-accent-emphasis"
              aria-hidden="true"
            />
            <h1 className="text-xl font-semibold">Confirming your order</h1>
            <p className="mt-2 text-muted-foreground">
              We’re checking the existing payment and order record. This will
              not start another payment.
            </p>
          </div>
        </main>
      </PageShell>
    );
  }

  if (
    state.kind === "missing_session" ||
    state.kind === "retryable" ||
    state.kind === "confirmed_failure"
  ) {
    return (
      <RecoveryPanel
        state={state}
        isRetrying={isRetrying}
        headingRef={resultHeadingRef}
        onRetry={() => {
          trackMarketingEvent("primary_cta_click", {
            placement: "order_verification_recovery",
            label: "retry_verification",
            destination: "/order-success",
          });
          void verifyPayment();
        }}
      />
    );
  }

  const purchasedUnits = countPurchasedUnits(state.order.items);

  return (
    <PageShell>
      <main className="container mx-auto px-6 py-12 sm:py-16">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success/10"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
          >
            <CheckCircle
              className="h-10 w-10 text-success-emphasis"
              aria-hidden="true"
            />
          </motion.div>

          <h1
            ref={resultHeadingRef}
            tabIndex={-1}
            className="mb-4 text-3xl font-bold md:text-4xl"
          >
            Thank you for your order!
          </h1>
          <p
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            Order verified. Thank you for your order.
          </p>
          <p className="mb-8 text-lg text-muted-foreground">
            {orderProgressCopy.summary}
          </p>

          <motion.div
            className="mb-6 rounded-2xl bg-card p-6 text-left shadow-soft"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <h2 className="mb-4 flex items-center gap-2 font-semibold">
              <Package className="h-5 w-5" aria-hidden="true" />
              Order details
            </h2>

            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-foreground">Cases</dt>
                <dd>{formatPurchasedUnits(purchasedUnits)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-border pt-3 font-semibold">
                <dt>Total</dt>
                <dd>${state.order.total.toFixed(2)} USD</dd>
              </div>
            </dl>
          </motion.div>

          <div className="mb-8">
            <SupportReference reference={state.supportReference} />
          </div>

          <div className="mb-8 rounded-xl bg-muted/50 p-6">
            <h2 className="mb-2 font-medium">What happens next?</h2>
            <ol className="mx-auto max-w-sm space-y-2 text-left text-sm text-muted-foreground">
              {orderProgressCopy.steps.map((step, index) => (
                <li key={step} className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs text-accent-emphasis">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Button asChild size="lg" variant="cta" className="hover:bg-cta">
              <Link to="/catalog">
                Design another case
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/orders">View My Orders</Link>
            </Button>
          </div>
        </motion.div>
      </main>
    </PageShell>
  );
};

export default OrderSuccess;
