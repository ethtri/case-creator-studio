import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import {
  captureMarketingAttribution,
  loadGoogleAnalytics,
  trackMarketingEvent,
} from "@/lib/marketing";
import {
  getMarketingPageLocation,
  getMarketingPagePath,
} from "@/lib/marketing-routing";

export const MarketingRuntime = () => {
  const location = useLocation();
  const consent = useAnalyticsConsent();
  const lastTrackedPagePathRef = useRef<string | null>(null);
  const pagePath = getMarketingPagePath(location.pathname, location.search);

  useEffect(() => {
    if (
      consent === "granted" &&
      lastTrackedPagePathRef.current !== pagePath
    ) {
      captureMarketingAttribution();
      loadGoogleAnalytics();
      trackMarketingEvent("page_view", {
        page_path: pagePath,
        page_location: getMarketingPageLocation(
          window.location.origin,
          location.pathname,
          location.search,
        ),
        page_title: document.title,
      });
      lastTrackedPagePathRef.current = pagePath;
    }
  }, [consent, location.pathname, location.search, pagePath]);

  return null;
};
