import { useSyncExternalStore } from "react";
import {
  getAnalyticsConsent,
  subscribeToAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/marketing";

const getServerAnalyticsConsent = (): AnalyticsConsent => "unset";

export const useAnalyticsConsent = () =>
  useSyncExternalStore(
    subscribeToAnalyticsConsent,
    getAnalyticsConsent,
    getServerAnalyticsConsent,
  );
