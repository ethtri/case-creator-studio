import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  captureMarketingAttribution,
  getAnalyticsConsent,
  loadGoogleAnalytics,
  subscribeToAnalyticsConsent,
  trackMarketingEvent,
} from "@/lib/marketing";
import {
  getMarketingPageLocation,
  getMarketingPagePath,
} from "@/lib/marketing-routing";

export const MarketingRuntime = () => {
  const location = useLocation();
  const [consent, setConsent] = useState(getAnalyticsConsent);
  const lastTrackedPagePathRef = useRef<string | null>(null);
  const pagePath = getMarketingPagePath(location.pathname, location.search);
  useEffect(() => subscribeToAnalyticsConsent(setConsent), []);

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
