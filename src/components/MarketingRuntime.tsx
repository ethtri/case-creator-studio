import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  captureMarketingAttribution,
  getAnalyticsConsent,
  loadGoogleAnalytics,
  subscribeToAnalyticsConsent,
  trackMarketingEvent,
} from "@/lib/marketing";
import {
  getMarketingPagePath,
} from "@/lib/marketing-routing";

export const MarketingRuntime = () => {
  const location = useLocation();
  const [consent, setConsent] = useState(getAnalyticsConsent);
  const pagePath = useMemo(
    () => getMarketingPagePath(location.pathname, location.search),
    [location.pathname, location.search],
  );
  useEffect(() => subscribeToAnalyticsConsent(setConsent), []);

  useEffect(() => {
    captureMarketingAttribution();

    if (consent === "granted") {
      loadGoogleAnalytics();
      trackMarketingEvent("page_view", {
        page_path: pagePath,
        page_location: `${window.location.origin}${pagePath}`,
        page_title: document.title,
      });
    }
  }, [consent, pagePath]);

  return null;
};
