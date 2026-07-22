import { useEffect, useLayoutEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, MailX, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SnapcaseLogo } from "@/components/SnapcaseLogo";
import {
  loadLifecyclePreference,
  unsubscribeLifecycleMarketing,
  type LifecyclePreferenceStatus,
} from "@/lib/lifecycle-email";

type PageState = LifecyclePreferenceStatus | "loading" | "error" | "missing";

const EmailPreferences = () => {
  const [token] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("token")?.trim() ?? "",
  );
  const [state, setState] = useState<PageState>(token ? "loading" : "missing");
  const [submitting, setSubmitting] = useState(false);

  useLayoutEffect(() => {
    if (!token) return;
    const sanitizedUrl = new URL(window.location.href);
    sanitizedUrl.searchParams.delete("token");
    window.history.replaceState(
      window.history.state,
      "",
      `${sanitizedUrl.pathname}${sanitizedUrl.search}${sanitizedUrl.hash}`,
    );
  }, [token]);

  useEffect(() => {
    document.title = "Email preferences | Snapcase";
    if (!token) return;
    let active = true;
    loadLifecyclePreference(token)
      .then((status) => active && setState(status))
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, [token]);

  const unsubscribe = async () => {
    if (!token || submitting) return;
    setSubmitting(true);
    try {
      const result = await unsubscribeLifecycleMarketing(token);
      setState(result === "unsubscribed" || result === "already_unsubscribed"
        ? "suppressed"
        : result);
    } catch {
      setState("error");
    } finally {
      setSubmitting(false);
    }
  };

  const subscribed = state === "subscribed";
  const suppressed = state === "suppressed" || state === "unsubscribed" || state === "already_unsubscribed";

  return (
    <div className="min-h-screen bg-background" data-email-preferences="no-login">
      <header className="border-b border-border/50">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <Link to="/" className="-ml-2 inline-flex min-h-11 items-center px-2">
            <SnapcaseLogo className="text-xl" />
          </Link>
          <Button asChild variant="ghost">
            <Link to="/">Back to Snapcase</Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-16">
        <section className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-border bg-card shadow-strong">
          <div className="h-2 bg-[linear-gradient(90deg,hsl(var(--cta)),hsl(var(--accent)),hsl(var(--primary-emphasis)))]" aria-hidden="true" />
          <div className="p-7 md:p-12">
            <p className="mb-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cta-emphasis">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Private, password-free preference link
            </p>
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-5xl">
              Email preferences
            </h1>

            <div className="mt-8" aria-live="polite" data-preference-state={state}>
              {state === "loading" ? (
                <p role="status" className="text-muted-foreground">Checking your preference…</p>
              ) : subscribed ? (
                <div>
                  <div className="flex items-start gap-4">
                    <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-cta-emphasis" aria-hidden="true" />
                    <div>
                      <h2 className="text-xl font-semibold text-foreground">Marketing email is on</h2>
                      <p className="mt-2 leading-7 text-muted-foreground">
                        You can turn it off immediately below. Your order and account messages are managed separately.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    className="mt-8 min-h-12 px-6"
                    onClick={unsubscribe}
                    disabled={submitting}
                  >
                    {submitting ? "Unsubscribing…" : "Unsubscribe from marketing email"}
                  </Button>
                </div>
              ) : suppressed ? (
                <div role="status" className="flex items-start gap-4">
                  <MailX className="mt-1 h-6 w-6 shrink-0 text-cta-emphasis" aria-hidden="true" />
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">You’re unsubscribed</h2>
                    <p className="mt-2 leading-7 text-muted-foreground">
                      Marketing email is off. This suppression stays in place and cannot be reversed by an automated signup.
                    </p>
                  </div>
                </div>
              ) : state === "invalid" || state === "missing" ? (
                <div role="alert">
                  <h2 className="text-xl font-semibold text-foreground">Use your personal preference link</h2>
                  <p className="mt-2 leading-7 text-muted-foreground">
                    This link is missing or no longer valid. Open the preference link from a Snapcase marketing email, or contact support for help.
                  </p>
                </div>
              ) : (
                <div role="alert">
                  <h2 className="text-xl font-semibold text-foreground">We couldn’t load this preference</h2>
                  <p className="mt-2 leading-7 text-muted-foreground">
                    Please try again. We won’t change an existing suppression while the service is unavailable.
                  </p>
                </div>
              )}
            </div>

            <p className="mt-10 border-t border-border pt-6 text-sm leading-6 text-muted-foreground">
              This page does not require an account. For privacy questions, visit our{" "}
              <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">privacy policy</Link>
              .
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};

export default EmailPreferences;
