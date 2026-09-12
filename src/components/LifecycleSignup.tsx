import { FormEvent, useId, useState } from "react";
import { Check, Mail, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getLifecycleCampaign,
  submitLifecycleSignup,
  type LifecycleSignupStatus,
} from "@/lib/lifecycle-email";
import { trackMarketingEvent } from "@/lib/marketing";

type FormState = "idle" | "submitting" | LifecycleSignupStatus | "error";

const messageByState: Partial<Record<FormState, string>> = {
  subscribed: "You’re on the list. Your preferences are saved.",
  preference_preserved: "If this address has a Snapcase email preference, we kept it unchanged. Use the private link in a Snapcase email to manage it.",
  error: "We couldn’t save your preference right now. Please try again later.",
};

export function LifecycleSignup() {
  const emailId = useId();
  const consentId = useId();
  const descriptionId = useId();
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [consentGranted, setConsentGranted] = useState(false);
  const [state, setState] = useState<FormState>("idle");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!consentGranted || state === "submitting") return;
    setState("submitting");
    try {
      const result = await submitLifecycleSignup({
        consentGranted,
        email,
        honeypot,
        placement: "homepage_email_card",
        source: "website",
      });
      setState(result);
      if (result === "subscribed") {
        const campaign = getLifecycleCampaign();
        trackMarketingEvent("email_signup", {
          placement: "homepage_email_card",
          source: "website",
          ...(campaign ? { campaign } : {}),
        });
        setEmail("");
        setConsentGranted(false);
      }
    } catch {
      setState("error");
    }
  };

  const message = messageByState[state];
  const isSuccess = state === "subscribed" || state === "preference_preserved";

  return (
    <section
      className="relative overflow-hidden border-y border-border/50 bg-card py-20"
      aria-labelledby="lifecycle-signup-title"
      data-lifecycle-signup="true"
    >
      <div
        className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-cta/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="container relative mx-auto grid gap-10 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div className="max-w-xl">
          <p className="mb-4 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-cta-emphasis">
            <span className="h-px w-8 bg-cta" aria-hidden="true" />
            Notes from the design bench
          </p>
          <h2
            id="lifecycle-signup-title"
            className="font-display text-3xl font-bold tracking-tight text-foreground md:text-5xl"
          >
            Ideas worth keeping.
          </h2>
          <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground md:text-lg">
            Get occasional design tips, photo-case inspiration, and gift ideas from Snapcase.
          </p>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-cta-emphasis" aria-hidden="true" />
              Separate from orders and account email
            </span>
            <span className="inline-flex items-center gap-2">
              <Mail className="h-4 w-4 text-cta-emphasis" aria-hidden="true" />
              Unsubscribe anytime
            </span>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="rounded-[1.75rem] border border-border bg-background/80 p-6 shadow-medium backdrop-blur-sm md:p-8"
          data-lifecycle-signup-form="true"
        >
          <label htmlFor={emailId} className="text-sm font-semibold text-foreground">
            Email address
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <Input
              id={emailId}
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby={descriptionId}
              className="min-h-12 flex-1 bg-card"
              placeholder="you@example.com"
              disabled={state === "submitting"}
            />
            <Button
              type="submit"
              className="min-h-12 bg-cta px-6 text-cta-foreground hover:bg-cta/90"
              disabled={!consentGranted || state === "submitting"}
            >
              {state === "submitting" ? "Saving…" : "Keep me inspired"}
            </Button>
          </div>

          <div hidden aria-hidden="true">
            <label htmlFor={`${emailId}-website`}>Website</label>
            <input
              id={`${emailId}-website`}
              type="text"
              hidden
              aria-hidden="true"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(event) => setHoneypot(event.target.value)}
            />
          </div>

          <div className="mt-5 flex items-start gap-3">
            <Checkbox
              id={consentId}
              checked={consentGranted}
              onCheckedChange={(checked) => setConsentGranted(checked === true)}
              disabled={state === "submitting"}
              aria-describedby={descriptionId}
              className="mt-0.5"
              data-marketing-consent="unchecked-by-default"
            />
            <div>
              <label htmlFor={consentId} className="text-sm leading-6 text-foreground">
                Yes, email me Snapcase design inspiration and occasional marketing updates.
              </label>
              <p id={descriptionId} className="mt-1 text-xs leading-5 text-muted-foreground">
                This choice is optional and is not required to design, order, or receive order updates. See our{" "}
                <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
                  privacy policy
                </Link>
                .
              </p>
            </div>
          </div>

          {message ? (
            <div
              className={`mt-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
                isSuccess
                  ? "border-cta/30 bg-cta/10 text-foreground"
                  : "border-destructive/30 bg-destructive/10 text-foreground"
              }`}
              role={state === "error" ? "alert" : "status"}
              aria-live={state === "error" ? "assertive" : "polite"}
              data-lifecycle-signup-state={state}
            >
              {isSuccess ? <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              <span>{message}</span>
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}
