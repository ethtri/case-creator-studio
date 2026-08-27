import { useEffect, useLayoutEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Clock3, RotateCcw, ShieldCheck, ShoppingBag, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SnapcaseLogo } from "@/components/SnapcaseLogo";
import { useCart } from "@/contexts/CartContext";
import {
  normalizeRecoveryToken,
  recoveryAnalyticsPayload,
  recoveryRequest,
  type RecoveryResult,
  type RecoveryStatus,
} from "@/lib/lifecycle-recovery";
import { trackMarketingEvent } from "@/lib/marketing";

type PageState = RecoveryStatus | "loading" | "restoring" | "missing";

const stateCopy: Record<Exclude<PageState, "loading" | "restoring">, { title: string; body: string }> = {
  ready: {
    title: "Your design is ready to pick up",
    body: "We found the exact saved version. Review the details, then continue when you’re ready.",
  },
  repriced: {
    title: "Your cart is ready with today’s price",
    body: "We refreshed the cart against the current catalog before restoring it. You’ll review the total before checkout.",
  },
  already_purchased: {
    title: "This order is already complete",
    body: "There’s nothing to recover from this link. You can view your orders or start another design.",
  },
  already_used: {
    title: "This private link has already been used",
    body: "Recovery links are single-use for your protection. Your restored design or cart may already be available on this device.",
  },
  deleted: {
    title: "This design was removed",
    body: "We won’t restore deleted artwork. Start a new design if you’d like to make another case.",
  },
  expired: {
    title: "This private link has expired",
    body: "Recovery links expire automatically. Open your saved designs or start again from the catalog.",
  },
  revoked: {
    title: "This private link is no longer active",
    body: "The design changed, the request was canceled, or your email preference made it ineligible. No data was restored.",
  },
  stale_revision: {
    title: "A newer design version is available",
    body: "We did not restore an older revision over your newer work. Open My Designs to continue safely.",
  },
  unavailable_model: {
    title: "That model is not available right now",
    body: "We left your current cart unchanged. Browse the catalog to choose a supported model.",
  },
  invalid: {
    title: "Use the private link from your Snapcase email",
    body: "This link is missing or invalid. For privacy, we can’t reveal whether a design exists.",
  },
  missing: {
    title: "Use the private link from your Snapcase email",
    body: "This page needs an opaque recovery link. No account or design information has been exposed.",
  },
  generic_failure: {
    title: "We couldn’t check this link",
    body: "Your current cart is unchanged. Try again in a moment or contact support if the problem continues.",
  },
};

const Recovery = () => {
  const navigate = useNavigate();
  const { restoreCart } = useCart();
  const [token] = useState(() => typeof window === "undefined"
    ? ""
    : normalizeRecoveryToken(new URLSearchParams(window.location.search).get("token")) ?? "");
  const [result, setResult] = useState<RecoveryResult | null>(null);
  const [state, setState] = useState<PageState>(token ? "loading" : "missing");

  useLayoutEffect(() => {
    if (!token) return;
    const sanitized = new URL(window.location.href);
    sanitized.searchParams.delete("token");
    window.history.replaceState(window.history.state, "", `${sanitized.pathname}${sanitized.search}${sanitized.hash}`);
  }, [token]);

  useEffect(() => {
    document.title = "Resume your Snapcase design";
    if (!token) return;
    let active = true;
    recoveryRequest(token, "inspect").then((next) => {
      if (!active) return;
      setResult(next);
      setState(next.status);
      trackMarketingEvent("recovery_view", recoveryAnalyticsPayload(next));
    });
    return () => { active = false; };
  }, [token]);

  const restore = async () => {
    if (!token || (state !== "ready" && state !== "repriced")) return;
    setState("restoring");
    const restored = await recoveryRequest(token, "restore");
    if (restored.status !== "ready" && restored.status !== "repriced") {
      setResult(restored);
      setState(restored.status);
      return;
    }

    if (restored.flow === "abandoned_design" && restored.design && restored.variantId) {
      const design = restored.design;
      sessionStorage.setItem("edmDesign:last", design.designId);
      sessionStorage.setItem(`edmDesign:${design.designId}:variantId`, restored.variantId);
      sessionStorage.setItem(`edmDesign:${design.designId}:templateId`, String(design.edmTemplateId));
      sessionStorage.setItem(`edmDesign:${design.designId}:preview`, design.previewUrl);
      if (design.externalProductId) sessionStorage.setItem(`edmDesign:${design.designId}:externalProductId`, design.externalProductId);
      if (design.previewUrlAngled) sessionStorage.setItem(`edmDesign:${design.designId}:previewAngled`, design.previewUrlAngled);
      trackMarketingEvent("recovery_resume", recoveryAnalyticsPayload(restored));
      navigate(`/design/${restored.variantId}?designId=${encodeURIComponent(design.designId)}&recovered=1`, { replace: true });
      return;
    }

    if (restored.flow === "abandoned_cart" && restored.items && restoreCart(restored.items)) {
      trackMarketingEvent("recovery_resume", recoveryAnalyticsPayload(restored));
      navigate(restored.repriced ? "/checkout?recovered=1&repriced=1" : "/checkout?recovered=1", { replace: true });
      return;
    }
    setResult({ contractVersion: "1.0.0", status: "unavailable_model" });
    setState("unavailable_model");
  };

  const stableState = state === "loading" || state === "restoring" ? null : state;
  const copy = stableState ? stateCopy[stableState] : null;
  const recoverable = state === "ready" || state === "repriced";
  const icon = recoverable ? CheckCircle2 : state === "expired" ? Clock3 : TriangleAlert;
  const StateIcon = icon;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--accent)/0.18),transparent_34%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.45))]" data-recovery-state={state}>
      <header className="border-b border-border/50 bg-background/85 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <Link to="/" className="-ml-2 inline-flex min-h-11 items-center px-2"><SnapcaseLogo className="text-xl" /></Link>
          <p className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Private recovery</p>
        </div>
      </header>
      <main className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 pt-12 pb-64 sm:py-16 md:py-20">
        <section className="relative w-full max-w-3xl overflow-hidden rounded-[2rem] border border-border bg-card shadow-strong">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-[linear-gradient(180deg,hsl(var(--cta)),hsl(var(--accent)),hsl(var(--primary-emphasis)))]" aria-hidden="true" />
          <div className="p-7 sm:p-10 md:p-14">
            <p className="mb-6 text-xs font-semibold uppercase tracking-[0.2em] text-cta-emphasis">Saved securely · checked live</p>
            {state === "loading" || state === "restoring" ? (
              <div role="status" aria-live="polite" className="py-8">
                <RotateCcw className="mb-6 h-9 w-9 animate-spin text-cta-emphasis" aria-hidden="true" />
                <h1 className="font-display text-3xl font-bold text-foreground md:text-5xl">{state === "loading" ? "Checking your private link" : "Restoring the latest valid state"}</h1>
                <p className="mt-4 max-w-xl text-lg leading-8 text-muted-foreground">We’re verifying ownership, purchase state, model availability, and current pricing before anything changes.</p>
              </div>
            ) : copy ? (
              <div aria-live="polite">
                <StateIcon className={`mb-6 h-10 w-10 ${recoverable ? "text-cta-emphasis" : "text-muted-foreground"}`} aria-hidden="true" />
                <h1 className="max-w-2xl font-display text-3xl font-bold tracking-tight text-foreground md:text-5xl">{copy.title}</h1>
                <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">{copy.body}</p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  {recoverable ? (
                    <Button type="button" size="lg" className="min-h-12 bg-cta px-7 text-cta-foreground hover:bg-cta/90" onClick={restore}>
                      <ShoppingBag className="mr-2 h-4 w-4" aria-hidden="true" />{result?.flow === "abandoned_cart" ? "Restore cart" : "Resume design"}
                    </Button>
                  ) : (
                    <Button asChild size="lg" className="min-h-12 bg-cta px-7 text-cta-foreground hover:bg-cta/90"><Link to="/catalog">Browse phone models</Link></Button>
                  )}
                  <Button asChild size="lg" variant="outline" className="min-h-12 px-7"><Link to="/designs">Open My Designs</Link></Button>
                </div>
                {recoverable && result?.flow && (
                  <div className="mt-8 grid gap-3 rounded-2xl border border-border bg-muted/40 p-5 sm:grid-cols-2">
                    <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Recovery type</p><p className="mt-1 font-semibold text-foreground">{result.flow === "abandoned_cart" ? "Saved cart" : "Saved design"}</p></div>
                    <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Current case price</p><p className="mt-1 font-semibold text-foreground">${result.currentUnitPrice?.toFixed(2) ?? "29.99"} each</p></div>
                  </div>
                )}
              </div>
            ) : null}
            <p className="mt-10 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">This page never displays your email address or puts artwork, customer details, or a reusable record ID in the URL.</p>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Recovery;
