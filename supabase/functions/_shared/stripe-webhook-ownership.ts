type CheckoutSessionOwnershipInput = {
  client_reference_id?: string | null;
  metadata?: Record<string, string | null | undefined> | null;
};

export function isSnapcaseCheckoutSession(
  session: CheckoutSessionOwnershipInput,
): boolean {
  const metadata = session.metadata ?? {};
  const source = metadata.source?.trim().toLowerCase();

  if (source === "snapcase_site" || source === "kexiaozhan") {
    return true;
  }

  if (metadata.itemsJson) {
    return true;
  }

  if (metadata.outTradeNo && metadata.machineSn) {
    return true;
  }

  return false;
}

export function isMissingSupabaseRowError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (error as { code?: unknown }).code === "PGRST116";
}
