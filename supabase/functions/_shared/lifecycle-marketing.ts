import {
  SNAPCASE_COMMERCIAL_ADDRESS,
  SNAPCASE_EMAILS,
} from "./email-identities.ts";

export const LIFECYCLE_CONTRACT_VERSION = "1.0.0";
export const LIFECYCLE_CONSENT_COPY_VERSION = "lifecycle_marketing_home_v1";
export const LIFECYCLE_PRIVACY_POLICY_VERSION = "2026-07-22";
export const LIFECYCLE_PURPOSE = "lifecycle_marketing";
export const LIFECYCLE_SENDER = `Snapcase Team <${SNAPCASE_EMAILS.hello}>`;
export const LIFECYCLE_REPLY_TO = SNAPCASE_EMAILS.support;
export const LIFECYCLE_COMMERCIAL_ADDRESS =
  `${SNAPCASE_COMMERCIAL_ADDRESS.street}, ${SNAPCASE_COMMERCIAL_ADDRESS.cityRegionPostal}`;
export const LIFECYCLE_MAX_ATTEMPTS = 3;
export const LIFECYCLE_BACKOFF_SECONDS = [60, 300] as const;

export type LifecycleFlow =
  | "welcome"
  | "abandoned_design"
  | "abandoned_cart"
  | "post_purchase_receipt"
  | "post_purchase_promotion"
  | "review_ugc"
  | "gift_reminder";

export type LifecycleClassification = "marketing" | "transactional";

export const LIFECYCLE_FLOW_CLASSIFICATION: Record<
  LifecycleFlow,
  LifecycleClassification
> = {
  welcome: "marketing",
  abandoned_design: "marketing",
  abandoned_cart: "marketing",
  post_purchase_receipt: "transactional",
  post_purchase_promotion: "marketing",
  review_ugc: "marketing",
  gift_reminder: "marketing",
};

export type SignupInput = {
  action: "subscribe";
  campaign?: unknown;
  consentGranted?: unknown;
  consentCopyVersion?: unknown;
  email?: unknown;
  honeypot?: unknown;
  placement?: unknown;
  policyVersion?: unknown;
  requestId?: unknown;
  source?: unknown;
};

export type ValidatedSignup = {
  campaign: string | null;
  consentCopyVersion: string;
  email: string;
  placement: string;
  policyVersion: string;
  requestId: string;
  source: string;
};

export type SignupValidation =
  | { ok: true; value: ValidatedSignup }
  | { ok: false; code: "invalid_request" | "stale_consent" | "bot_rejected" };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_SLUG_PATTERN = /^[a-z0-9][a-z0-9_.-]*$/i;

const cleanSafeString = (
  value: unknown,
  maximumLength: number,
): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maximumLength ||
    !SAFE_SLUG_PATTERN.test(normalized)
  ) {
    return null;
  }
  return normalized.toLowerCase();
};

export const normalizeSubscriberEmail = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  return email;
};

export const validateSignupInput = (input: SignupInput): SignupValidation => {
  if (typeof input.honeypot === "string" && input.honeypot.trim()) {
    return { ok: false, code: "bot_rejected" };
  }
  const email = normalizeSubscriberEmail(input.email);
  const source = cleanSafeString(input.source, 64);
  const placement = cleanSafeString(input.placement, 64);
  const campaign = input.campaign == null || input.campaign === ""
    ? null
    : cleanSafeString(input.campaign, 100);
  const requestId = typeof input.requestId === "string"
    ? input.requestId.trim()
    : "";

  if (
    !email ||
    !source ||
    !placement ||
    !UUID_PATTERN.test(requestId) ||
    (input.campaign != null && input.campaign !== "" && !campaign) ||
    input.consentGranted !== true
  ) {
    return { ok: false, code: "invalid_request" };
  }

  if (
    input.consentCopyVersion !== LIFECYCLE_CONSENT_COPY_VERSION ||
    input.policyVersion !== LIFECYCLE_PRIVACY_POLICY_VERSION
  ) {
    return { ok: false, code: "stale_consent" };
  }

  return {
    ok: true,
    value: {
      campaign,
      consentCopyVersion: LIFECYCLE_CONSENT_COPY_VERSION,
      email,
      placement,
      policyVersion: LIFECYCLE_PRIVACY_POLICY_VERSION,
      requestId,
      source,
    },
  };
};

export const lifecycleBackoffSeconds = (attempts: number): number =>
  attempts <= 1
    ? LIFECYCLE_BACKOFF_SECONDS[0]
    : LIFECYCLE_BACKOFF_SECONDS[1];

export type ProviderFailureKind = "ambiguous" | "permanent" | "retryable";

export class LifecycleProviderError extends Error {
  readonly kind: ProviderFailureKind;
  readonly httpStatus: number | null;

  constructor(
    message: string,
    kind: ProviderFailureKind,
    httpStatus: number | null = null,
  ) {
    super(message);
    this.name = "LifecycleProviderError";
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

export type LifecycleOutboxClaim = {
  attempts: number;
  id: string;
  maxAttempts: number;
  operation: "subscribe" | "suppress" | "welcome";
  subscriberId: string;
};

export type LifecycleOutboxResult =
  | "dead_letter"
  | "disabled"
  | "dry_run"
  | "retry"
  | "sent"
  | "suppressed"
  | "uncertain";

export type LifecycleOutboxDependencies = {
  complete: (claim: LifecycleOutboxClaim) => Promise<void>;
  deliver: (claim: LifecycleOutboxClaim) => Promise<void>;
  dryRun: boolean;
  isEligible: (subscriberId: string) => Promise<boolean>;
  mark: (
    claim: LifecycleOutboxClaim,
    result: Exclude<LifecycleOutboxResult, "sent">,
    reason: string,
    retryAfterSeconds?: number,
  ) => Promise<void>;
  providerMode: "disabled" | "configured";
};

export async function processLifecycleOutboxClaim(
  claim: LifecycleOutboxClaim,
  dependencies: LifecycleOutboxDependencies,
): Promise<LifecycleOutboxResult> {
  if (dependencies.dryRun) {
    await dependencies.mark(claim, "dry_run", "preview_only");
    return "dry_run";
  }
  if (dependencies.providerMode !== "configured") {
    await dependencies.mark(claim, "disabled", "provider_not_configured");
    return "disabled";
  }
  if (!(await dependencies.isEligible(claim.subscriberId))) {
    await dependencies.mark(claim, "suppressed", "subscriber_not_eligible");
    return "suppressed";
  }

  try {
    await dependencies.deliver(claim);
    await dependencies.complete(claim);
    return "sent";
  } catch (error) {
    const providerError = error instanceof LifecycleProviderError
      ? error
      : new LifecycleProviderError("provider_mutation_uncertain", "ambiguous");

    if (providerError.kind === "ambiguous") {
      await dependencies.mark(claim, "uncertain", providerError.message);
      return "uncertain";
    }
    if (
      providerError.kind === "retryable" &&
      claim.attempts < claim.maxAttempts
    ) {
      await dependencies.mark(
        claim,
        "retry",
        providerError.message,
        lifecycleBackoffSeconds(claim.attempts),
      );
      return "retry";
    }
    await dependencies.mark(claim, "dead_letter", providerError.message);
    return "dead_letter";
  }
}

export const buildSafeSignupAnalytics = (input: {
  campaign: string | null;
  placement: string;
  source: string;
}) => ({
  source: input.source,
  placement: input.placement,
  ...(input.campaign ? { campaign: input.campaign } : {}),
});
