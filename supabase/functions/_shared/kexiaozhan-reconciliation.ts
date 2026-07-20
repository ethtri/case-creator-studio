export const KEXIAOZHAN_VENDOR_NOTIFY_FAILED_STATUS = "vendor_notify_failed";
export const KEXIAOZHAN_ONSHORE_QUEUED_STATUS = "onshore_manual_queued";

export type KexiaozhanNotificationState =
  | "succeeded"
  | "failed"
  | "in_progress"
  | "dry_run";

export type KexiaozhanNotificationSummary = {
  state: KexiaozhanNotificationState;
  reason: string | null;
  vendorCode: number | null;
  message: string | null;
  attemptedAt: string | null;
  canRetry: boolean;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSafeCode(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    const code = Number(value);
    return Number.isSafeInteger(code) ? code : null;
  }
  return null;
}

function readSafeReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.trim();
  return /^[a-z0-9][a-z0-9_:-]{0,79}$/i.test(reason) ? reason : null;
}

function readSafeMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  }).join("").replace(/\s+/g, " ").trim();
  return message ? message.slice(0, 160) : null;
}

function readIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = value.trim();
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) return null;
  return new Date(timestamp).toISOString();
}

export function getKexiaozhanNotificationSummary(
  metadata: unknown,
): KexiaozhanNotificationSummary | null {
  if (!isRecord(metadata) || !isRecord(metadata.kexiaozhan)) return null;
  const notification = metadata.kexiaozhan.paymentNotification;
  if (!isRecord(notification)) return null;

  const mode = readSafeReason(notification.mode);
  const response = isRecord(notification.response)
    ? notification.response
    : null;
  const responseOk = response?.ok === true;
  const responseReason = readSafeReason(response?.error);
  const notificationReason = readSafeReason(notification.reason);
  const attemptedAt = readIsoTimestamp(
    notification.completedAt ?? notification.generatedAt,
  );

  if (mode === "live" && responseOk) {
    return {
      state: "succeeded",
      reason: null,
      vendorCode: readSafeCode(response?.code),
      message: readSafeMessage(response?.message),
      attemptedAt,
      canRetry: false,
    };
  }

  if (mode === "in_progress") {
    return {
      state: "in_progress",
      reason: "notification_in_progress",
      vendorCode: null,
      message: null,
      attemptedAt,
      canRetry: false,
    };
  }

  if (mode === "dry_run") {
    return {
      state: "dry_run",
      reason: notificationReason ?? "live_notification_disabled",
      vendorCode: null,
      message: null,
      attemptedAt,
      canRetry: false,
    };
  }

  return {
    state: "failed",
    reason: notificationReason ?? responseReason ?? "unknown_failure",
    vendorCode: readSafeCode(response?.code),
    message: readSafeMessage(response?.message),
    attemptedAt,
    canRetry: true,
  };
}

export function fulfillmentStatusForKexiaozhanNotification(
  currentStatus: string | null | undefined,
  summary: KexiaozhanNotificationSummary | null,
): string | null {
  const current = currentStatus ?? null;
  if (!summary) return current;
  if (summary.state === "failed") {
    return KEXIAOZHAN_VENDOR_NOTIFY_FAILED_STATUS;
  }
  if (
    summary.state === "succeeded" &&
    current === KEXIAOZHAN_VENDOR_NOTIFY_FAILED_STATUS
  ) {
    return KEXIAOZHAN_ONSHORE_QUEUED_STATUS;
  }
  return current;
}

export function kexiaozhanNotificationLastError(
  summary: KexiaozhanNotificationSummary | null,
): string | null {
  if (!summary || summary.state !== "failed") return null;
  return `Kexiaozhan vendor notification failed: ${
    summary.reason ?? "unknown_failure"
  }`;
}
