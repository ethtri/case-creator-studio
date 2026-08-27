import { supabase } from "@/integrations/supabase/client";

export type RecoveryStatus =
  | "already_purchased"
  | "already_used"
  | "deleted"
  | "expired"
  | "generic_failure"
  | "invalid"
  | "ready"
  | "repriced"
  | "revoked"
  | "stale_revision"
  | "unavailable_model";

export type RecoveryDesign = {
  designId: string;
  designRevision: number;
  edmTemplateId: number;
  externalProductId: string | null;
  previewUrl: string;
  previewUrlAngled: string | null;
};

export type RecoveryCartItem = {
  designId: string | null;
  designPreview: string;
  edmTemplateId: number;
  externalProductId: string | null;
  quantity: number;
  unitPrice: number;
  variantId: string;
};

export type RecoveryResult = {
  contractVersion: "1.0.0";
  status: RecoveryStatus;
  flow?: "abandoned_design" | "abandoned_cart";
  variantId?: string;
  currentUnitPrice?: number;
  repriced?: boolean;
  design?: RecoveryDesign;
  items?: RecoveryCartItem[];
};

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const STATUSES = new Set<RecoveryStatus>([
  "already_purchased", "already_used", "deleted", "expired", "generic_failure",
  "invalid", "ready", "repriced", "revoked", "stale_revision", "unavailable_model",
]);

export const normalizeRecoveryToken = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase();
  return TOKEN_PATTERN.test(token) ? token : null;
};

export const recoveryRequest = async (
  token: string,
  action: "inspect" | "restore",
): Promise<RecoveryResult> => {
  const normalized = normalizeRecoveryToken(token);
  if (!normalized) return { contractVersion: "1.0.0", status: "invalid" };

  const { data, error } = await supabase.functions.invoke("lifecycle-recovery", {
    body: { action, token: normalized },
  });
  if (error || !data || data.contractVersion !== "1.0.0" || !STATUSES.has(data.status)) {
    return { contractVersion: "1.0.0", status: "generic_failure" };
  }
  return data as RecoveryResult;
};

export const recoveryAnalyticsPayload = (result: RecoveryResult) => ({
  flow: result.flow ?? "unknown",
  outcome: result.status,
  repriced: result.repriced === true,
});
