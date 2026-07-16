import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  captureMarketingAttribution,
  loadGoogleAnalytics,
  trackMarketingEvent,
} from "@/lib/marketing";
import { getMarketingPagePath } from "@/lib/marketing-routing";

export const MarketingRuntime = () => {
  const location = useLocation();
  const pagePath = getMarketingPagePath(location.pathname, location.search);

  useEffect(() => {
    loadGoogleAnalytics();
  }, []);

  useEffect(() => {
    captureMarketingAttribution();
    trackMarketingEvent("page_view", {
      page_path: pagePath,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pagePath]);

  return null;
};
