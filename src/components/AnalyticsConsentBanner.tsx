import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import { setAnalyticsConsent } from "@/lib/marketing";

export const AnalyticsConsentBanner = () => {
  const consent = useAnalyticsConsent();

  if (consent !== "unset") return null;

  return (
    <aside
      aria-label="Analytics preferences"
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-3xl rounded-2xl border border-border bg-card p-5 shadow-strong"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <h2 className="font-semibold text-foreground">Help us improve Snapcase</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            With your permission, we use Google Analytics to understand site usage and
            purchases. We do not send artwork or checkout contact details.{" "}
            <Link className="underline hover:text-foreground" to="/privacy">
              Privacy details
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setAnalyticsConsent("denied")}
          >
            Decline
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
    </aside>
  );
};
