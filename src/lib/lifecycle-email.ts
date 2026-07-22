import { supabase } from "@/integrations/supabase/client";
import { getMarketingAttribution } from "@/lib/marketing";

export const LIFECYCLE_CONSENT_COPY_VERSION = "lifecycle_marketing_home_v1";
export const LIFECYCLE_PRIVACY_POLICY_VERSION = "2026-07-22";

export type LifecycleSignupStatus =
  | "subscribed"
  | "preference_preserved";

export type LifecyclePreferenceStatus =
  | "subscribed"
  | "suppressed"
  | "invalid"
  | "unsubscribed"
  | "already_unsubscribed";

const safeCampaign = (value: string | undefined) => {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^[a-z0-9][a-z0-9_.-]{0,99}$/.test(normalized)
    ? normalized
    : null;
};

export const getLifecycleCampaign = () => safeCampaign(
  getMarketingAttribution()?.lastTouch.utm_campaign,
);

const requestId = () => crypto.randomUUID();

export async function submitLifecycleSignup(input: {
  consentGranted: boolean;
  email: string;
  honeypot: string;
  placement: string;
  source: string;
}): Promise<LifecycleSignupStatus> {
  const campaign = getLifecycleCampaign();
  const { data, error } = await supabase.functions.invoke(
    "lifecycle-email-preferences",
    {
      body: {
        action: "subscribe",
        campaign,
        consentCopyVersion: LIFECYCLE_CONSENT_COPY_VERSION,
        consentGranted: input.consentGranted,
        email: input.email,
        honeypot: input.honeypot,
        placement: input.placement,
        policyVersion: LIFECYCLE_PRIVACY_POLICY_VERSION,
        requestId: requestId(),
        source: input.source,
      },
    },
  );
  if (error || !data || typeof data.status !== "string") {
    throw new Error("signup_unavailable");
  }
  if (
    data.status !== "subscribed" &&
    data.status !== "preference_preserved"
  ) {
    throw new Error("signup_unavailable");
  }
  return data.status;
}

export async function loadLifecyclePreference(
  token: string,
): Promise<LifecyclePreferenceStatus> {
  const { data, error } = await supabase.functions.invoke(
    "lifecycle-email-preferences",
    { body: { action: "status", token } },
  );
  if (error || !data || typeof data.status !== "string") {
    throw new Error("preference_unavailable");
  }
  return data.status as LifecyclePreferenceStatus;
}

export async function unsubscribeLifecycleMarketing(
  token: string,
): Promise<LifecyclePreferenceStatus> {
  const { data, error } = await supabase.functions.invoke(
    "lifecycle-email-preferences",
    { body: { action: "unsubscribe", requestId: requestId(), token } },
  );
  if (error || !data || typeof data.status !== "string") {
    throw new Error("preference_unavailable");
  }
  return data.status as LifecyclePreferenceStatus;
}
