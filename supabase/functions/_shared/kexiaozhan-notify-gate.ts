const TRUE_VALUES = new Set(["1", "true", "yes"]);

export type KexiaozhanNotifyGateConfig = {
  enabled?: string | null;
  requireAllowlist?: string | null;
  allowedOutTradeNos?: string | null;
  allowedPrefixes?: string | null;
};

export type KexiaozhanNotifyGateResult = {
  allowed: boolean;
  reason: string | null;
};

function splitCsv(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isTrue(value: string | null | undefined): boolean {
  return TRUE_VALUES.has((value ?? "").trim().toLowerCase());
}

export function resolveKexiaozhanLiveNotifyGate(
  outTradeNo: string,
  config: KexiaozhanNotifyGateConfig,
): KexiaozhanNotifyGateResult {
  if (!isTrue(config.enabled)) {
    return {
      allowed: false,
      reason: "KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED is not true",
    };
  }

  const exactValues = splitCsv(config.allowedOutTradeNos);
  const prefixes = splitCsv(config.allowedPrefixes);
  const allowlistRequired = isTrue(config.requireAllowlist);

  if (exactValues.length === 0 && prefixes.length === 0) {
    if (allowlistRequired) {
      return {
        allowed: false,
        reason: "live Kexiaozhan notify requires an allowlist",
      };
    }

    return { allowed: true, reason: null };
  }

  if (exactValues.includes(outTradeNo)) {
    return { allowed: true, reason: null };
  }

  if (prefixes.some((prefix) => outTradeNo.startsWith(prefix))) {
    return { allowed: true, reason: null };
  }

  return {
    allowed: false,
    reason: "outTradeNo is not allowlisted for live Kexiaozhan notify",
  };
}
