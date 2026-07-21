export const SHIPPING_LABEL_BUCKET = "shipping-labels";
export const MAX_MANUAL_LABEL_BYTES = 10 * 1024 * 1024;
export const LABEL_FORMATS = ["pdf_4x6", "pdf_letter"] as const;

export type ShippingLabelFormat = typeof LABEL_FORMATS[number];

export function isShippingLabelFormat(
  value: unknown,
): value is ShippingLabelFormat {
  return typeof value === "string" &&
    LABEL_FORMATS.includes(value as ShippingLabelFormat);
}

export function buildManualLabelPath(
  jobId: string,
  labelId: string,
): string {
  return `manual/${jobId}/${labelId}.pdf`;
}

export function isPdfFile(
  file: { name: string; type: string; size: number },
): boolean {
  return file.type.toLowerCase() === "application/pdf" &&
    file.name.toLowerCase().endsWith(".pdf") &&
    file.size > 0 &&
    file.size <= MAX_MANUAL_LABEL_BYTES;
}

export function hasPdfMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d;
}

export function parseSignedUrlTtlSeconds(raw: string | undefined): number {
  if (!raw) return 60;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 30 && parsed <= 300
    ? parsed
    : 60;
}

export function toSafeShippingLabel(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: row.id,
    productionJobId: row.production_job_id,
    provider: row.provider,
    state: row.state,
    carrier: row.carrier,
    service: row.service,
    quotedAmountCents: row.quoted_amount_cents,
    purchasedAmountCents: row.purchased_amount_cents,
    currency: row.currency,
    deliveryDays: row.delivery_days,
    addressPolicyOutcome: row.address_policy_outcome,
    ratePolicyOutcome: row.rate_policy_outcome,
    safeRateSummary: row.safe_rate_summary,
    purchaseAttemptCount: row.purchase_attempt_count,
    refundStatus: row.refund_status,
    refundAttemptCount: row.refund_attempt_count,
    recoveryState: row.recovery_state,
    lastErrorCode: row.last_error_code,
    trackingNumber: row.tracking_number,
    trackingStatus: row.tracking_status,
    labelFormat: row.label_format,
    purchasedAt: row.purchased_at,
    printAccessedAt: row.print_accessed_at,
    refundRequestedAt: row.refund_requested_at,
    refundedAt: row.refunded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
