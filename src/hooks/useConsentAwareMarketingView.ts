import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import {
  trackMarketingViewOnce,
  type MarketingViewDescriptor,
} from "@/lib/consent-aware-marketing-view";
import { normalizeRoutePath } from "@/lib/route-path";

type ConsentAwareMarketingViewOptions = Omit<
  MarketingViewDescriptor,
  "normalizedRoute"
> & {
  enabled?: boolean;
};

export const useConsentAwareMarketingView = ({
  enabled = true,
  eventName,
  contractId,
  payload,
}: ConsentAwareMarketingViewOptions) => {
  const consent = useAnalyticsConsent();
  const { pathname } = useLocation();
  const normalizedRoute = normalizeRoutePath(pathname);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  useEffect(() => {
    if (!enabled || consent !== "granted") return;

    trackMarketingViewOnce({
      eventName,
      normalizedRoute,
      contractId,
      payload: payloadRef.current,
    });
  }, [consent, contractId, enabled, eventName, normalizedRoute]);
};
