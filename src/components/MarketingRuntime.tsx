import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  captureMarketingAttribution,
  loadGoogleAnalytics,
  trackMarketingEvent,
} from "@/lib/marketing";

export const MarketingRuntime = () => {
  const location = useLocation();

  useEffect(() => {
    loadGoogleAnalytics();
  }, []);

  useEffect(() => {
    captureMarketingAttribution();
    trackMarketingEvent("page_view", {
      page_path: location.pathname,
      page_title: document.title,
    });
  }, [location.pathname]);

  return null;
};
