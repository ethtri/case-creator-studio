export const KEXIAOZHAN_DESIGNER_CONTRACT_VERSION = "2026-07-19";
export const KEXIAOZHAN_DESIGNER_SESSION_MAX_AGE_SECONDS = 30 * 60;

export type KexiaozhanDesignerMode =
  | "disabled"
  | "preselected_sku"
  | "vendor_selector";

export type KexiaozhanDesignerDisabledReason =
  | "public_flag_off"
  | "mode_disabled"
  | "unsupported_mode"
  | "contract_version_mismatch"
  | "missing_session_endpoint"
  | "unsafe_session_endpoint"
  | "missing_return_origin"
  | "unsafe_return_origin";

export type KexiaozhanDesignerContractResolution =
  | {
    enabled: false;
    mode: "disabled";
    selectorOwner: "snapcase";
    reason: KexiaozhanDesignerDisabledReason;
  }
  | {
    enabled: true;
    mode: "preselected_sku";
    selectorOwner: "snapcase";
    contractVersion: typeof KEXIAOZHAN_DESIGNER_CONTRACT_VERSION;
    sessionEndpoint: string;
    returnOrigin: string;
  }
  | {
    enabled: true;
    mode: "vendor_selector";
    selectorOwner: "vendor";
    contractVersion: typeof KEXIAOZHAN_DESIGNER_CONTRACT_VERSION;
    sessionEndpoint: string;
    returnOrigin: string;
  };

export type KexiaozhanDesignerConfigInput = {
  publicEnabled?: string | null;
  mode?: string | null;
  contractVersion?: string | null;
  sessionEndpoint?: string | null;
  returnOrigin?: string | null;
};

export type KexiaozhanDesignerEntryInput = {
  variantId?: string | null;
  trustedGoodsSkuId?: string | null;
  attributionToken: string;
  state: string;
  returnPath?: string | null;
};

export type KexiaozhanDesignerSessionRequest = {
  contractVersion: typeof KEXIAOZHAN_DESIGNER_CONTRACT_VERSION;
  selectorOwner: "snapcase" | "vendor";
  state: string;
  attributionToken: string;
  returnUrl: string;
  selection:
    | {
      variantId: string;
      goodsSkuId: string;
    }
    | null;
};

export type KexiaozhanDesignerEntryResolution =
  | {
    kind: "snapcase_native";
    selectorOwner: "snapcase";
    reason: KexiaozhanDesignerDisabledReason;
  }
  | {
    kind: "vendor_session";
    endpoint: string;
    request: KexiaozhanDesignerSessionRequest;
  };

export type KexiaozhanDesignerSession = {
  sessionCode: string;
  designerUrl: string;
  expiresAt: string;
};

export type KexiaozhanDesignerReturn =
  | {
    status: "complete";
    exchangeCode: string;
    state: string;
  }
  | {
    status: "cancel";
    state: string;
  }
  | {
    status: "error";
    state: string;
    errorCode: string;
  };

export type KexiaozhanDesignerExchangeResult = {
  exchangeCode: string;
  state: string;
  attributionToken: string;
  resultId: string;
  goodsSkuId: string;
  caseType: "ordinary" | "magnetic";
  materialIds: string[];
  filePath: string;
  previewUrl: string;
  expiresAt: string;
  integrity: {
    scheme: string;
    keyId: string;
    value: string;
  };
};

export interface KexiaozhanDesignerAdapter {
  createSession(
    request: KexiaozhanDesignerSessionRequest,
  ): Promise<KexiaozhanDesignerSession>;
  exchangeOneTimeCode(
    exchangeCode: string,
  ): Promise<KexiaozhanDesignerExchangeResult>;
}

const TRUE_VALUES = new Set(["1", "true", "yes"]);
const OPAQUE_CODE_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SAFE_ERROR_CODE_PATTERN = /^[a-z0-9][a-z0-9_:-]{0,99}$/;
const FORBIDDEN_PUBLIC_QUERY_NAME =
  /(?:^|[_-])(access[_-]?)?token(?:$|[_-])|auth(?:orization)?|bearer|jwt|api[_-]?key|secret|machine[_-]?key/i;
const SECRET_LIKE_VALUE = /bearer\s|sk_(?:test|live)_|whsec_/i;

function disabled(
  reason: KexiaozhanDesignerDisabledReason,
): KexiaozhanDesignerContractResolution {
  return {
    enabled: false,
    mode: "disabled",
    selectorOwner: "snapcase",
    reason,
  };
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function isExplicitlyEnabled(value: string | null | undefined): boolean {
  return TRUE_VALUES.has(normalize(value).toLowerCase());
}

function parseHttpsUrl(
  value: string,
  options: {
    allowQuery: boolean;
    originOnly: boolean;
  },
): URL | null {
  if (!value || value.length > 2048) return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.hash
    ) {
      return null;
    }
    if (!options.allowQuery && url.search) return null;
    if (
      options.originOnly &&
      (url.pathname !== "/" || url.search || url.hash)
    ) {
      return null;
    }
    if (SECRET_LIKE_VALUE.test(url.toString())) return null;

    for (const [name, queryValue] of url.searchParams) {
      if (
        FORBIDDEN_PUBLIC_QUERY_NAME.test(name) ||
        queryValue.length > 300 ||
        SECRET_LIKE_VALUE.test(queryValue)
      ) {
        return null;
      }
    }

    return url;
  } catch {
    return null;
  }
}

function requireBoundedIdentifier(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new Error(`${field} is required`);
  }
  const normalized = value.trim();
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw new Error(`${field} is invalid`);
  }
  return normalized;
}

function requireOpaqueCode(value: unknown, field: string): string {
  if (typeof value !== "string" || !OPAQUE_CODE_PATTERN.test(value)) {
    throw new Error(`${field} must be an opaque one-time code`);
  }
  return value;
}

function requireRecord(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} is invalid`);
  }
  return value as Record<string, unknown>;
}

function requireOnlyKeys(
  record: Record<string, unknown>,
  allowed: string[],
  field: string,
): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(record).some((key) => !allowedSet.has(key))) {
    throw new Error(`${field} contains unsupported fields`);
  }
}

function requireFutureExpiry(
  value: unknown,
  now: Date,
  field: string,
): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const expiryMs = Date.parse(value);
  const nowMs = now.getTime();
  const maximumMs = nowMs + KEXIAOZHAN_DESIGNER_SESSION_MAX_AGE_SECONDS * 1000;
  if (
    !Number.isFinite(expiryMs) ||
    expiryMs <= nowMs ||
    expiryMs > maximumMs
  ) {
    throw new Error(`${field} is expired or outside the allowed window`);
  }
  return new Date(expiryMs).toISOString();
}

function requireReturnPath(value: string | null | undefined): string {
  const path = normalize(value) || "/designer/complete";
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.length > 500
  ) {
    throw new Error("returnPath must be a same-origin path");
  }
  return path;
}

export function resolveKexiaozhanDesignerContract(
  input: KexiaozhanDesignerConfigInput,
): KexiaozhanDesignerContractResolution {
  if (!isExplicitlyEnabled(input.publicEnabled)) {
    return disabled("public_flag_off");
  }

  const rawMode = normalize(input.mode).toLowerCase();
  if (!rawMode || rawMode === "disabled") return disabled("mode_disabled");
  if (rawMode !== "preselected_sku" && rawMode !== "vendor_selector") {
    return disabled("unsupported_mode");
  }

  if (
    normalize(input.contractVersion) !==
      KEXIAOZHAN_DESIGNER_CONTRACT_VERSION
  ) {
    return disabled("contract_version_mismatch");
  }

  const rawEndpoint = normalize(input.sessionEndpoint);
  if (!rawEndpoint) return disabled("missing_session_endpoint");
  const sessionEndpoint = parseHttpsUrl(rawEndpoint, {
    allowQuery: false,
    originOnly: false,
  });
  if (!sessionEndpoint) return disabled("unsafe_session_endpoint");

  const rawReturnOrigin = normalize(input.returnOrigin);
  if (!rawReturnOrigin) return disabled("missing_return_origin");
  const returnOrigin = parseHttpsUrl(rawReturnOrigin, {
    allowQuery: false,
    originOnly: true,
  });
  if (!returnOrigin) return disabled("unsafe_return_origin");

  if (rawMode === "preselected_sku") {
    return {
      enabled: true,
      mode: rawMode,
      selectorOwner: "snapcase",
      contractVersion: KEXIAOZHAN_DESIGNER_CONTRACT_VERSION,
      sessionEndpoint: sessionEndpoint.toString(),
      returnOrigin: returnOrigin.origin,
    };
  }

  return {
    enabled: true,
    mode: rawMode,
    selectorOwner: "vendor",
    contractVersion: KEXIAOZHAN_DESIGNER_CONTRACT_VERSION,
    sessionEndpoint: sessionEndpoint.toString(),
    returnOrigin: returnOrigin.origin,
  };
}

export function buildKexiaozhanDesignerEntry(
  contract: KexiaozhanDesignerContractResolution,
  input: KexiaozhanDesignerEntryInput,
): KexiaozhanDesignerEntryResolution {
  if (!contract.enabled) {
    return {
      kind: "snapcase_native",
      selectorOwner: "snapcase",
      reason: contract.reason,
    };
  }

  const variantId = normalize(input.variantId);
  const goodsSkuId = normalize(input.trustedGoodsSkuId);
  const state = requireOpaqueCode(input.state, "state");
  const attributionToken = requireOpaqueCode(
    input.attributionToken,
    "attributionToken",
  );
  const returnPath = requireReturnPath(input.returnPath);
  const returnUrl = new URL(returnPath, `${contract.returnOrigin}/`);
  const safeReturnUrl = parseHttpsUrl(returnUrl.toString(), {
    allowQuery: true,
    originOnly: false,
  });
  if (!safeReturnUrl || safeReturnUrl.origin !== contract.returnOrigin) {
    throw new Error("returnPath must stay on the configured return origin");
  }

  let selection: KexiaozhanDesignerSessionRequest["selection"];
  if (contract.mode === "preselected_sku") {
    selection = {
      variantId: requireBoundedIdentifier(variantId, "variantId"),
      goodsSkuId: requireBoundedIdentifier(goodsSkuId, "trustedGoodsSkuId"),
    };
  } else {
    if (variantId || goodsSkuId) {
      throw new Error(
        "vendor_selector mode cannot receive a Snapcase phone or SKU selection",
      );
    }
    selection = null;
  }

  return {
    kind: "vendor_session",
    endpoint: contract.sessionEndpoint,
    request: {
      contractVersion: contract.contractVersion,
      selectorOwner: contract.selectorOwner,
      state,
      attributionToken,
      returnUrl: safeReturnUrl.toString(),
      selection,
    },
  };
}

export function parseKexiaozhanDesignerSession(
  input: unknown,
  now = new Date(),
): KexiaozhanDesignerSession {
  const record = requireRecord(input, "designer session");
  requireOnlyKeys(
    record,
    ["sessionCode", "designerUrl", "expiresAt"],
    "designer session",
  );
  const sessionCode = requireOpaqueCode(record.sessionCode, "sessionCode");
  if (typeof record.designerUrl !== "string") {
    throw new Error("designerUrl is required");
  }
  const designerUrl = parseHttpsUrl(record.designerUrl, {
    allowQuery: true,
    originOnly: false,
  });
  if (!designerUrl) {
    throw new Error("designerUrl is not safe for a public redirect");
  }

  return {
    sessionCode,
    designerUrl: designerUrl.toString(),
    expiresAt: requireFutureExpiry(record.expiresAt, now, "expiresAt"),
  };
}

export function parseKexiaozhanDesignerReturn(
  input: unknown,
): KexiaozhanDesignerReturn {
  const record = requireRecord(input, "designer return");
  const status = normalize(
    typeof record.status === "string" ? record.status : "",
  ).toLowerCase();
  const state = requireOpaqueCode(record.state, "state");

  if (status === "complete") {
    requireOnlyKeys(
      record,
      ["status", "exchangeCode", "state"],
      "designer return",
    );
    return {
      status,
      exchangeCode: requireOpaqueCode(record.exchangeCode, "exchangeCode"),
      state,
    };
  }
  if (status === "cancel") {
    requireOnlyKeys(record, ["status", "state"], "designer return");
    return { status, state };
  }
  if (status === "error") {
    requireOnlyKeys(
      record,
      ["status", "state", "errorCode"],
      "designer return",
    );
    if (
      typeof record.errorCode !== "string" ||
      !SAFE_ERROR_CODE_PATTERN.test(record.errorCode)
    ) {
      throw new Error("errorCode is invalid");
    }
    return { status, state, errorCode: record.errorCode };
  }

  throw new Error("designer return status is invalid");
}

export function parseKexiaozhanDesignerExchangeResult(
  input: unknown,
  now = new Date(),
): KexiaozhanDesignerExchangeResult {
  const record = requireRecord(input, "designer exchange");
  requireOnlyKeys(
    record,
    [
      "exchangeCode",
      "state",
      "attributionToken",
      "resultId",
      "goodsSkuId",
      "caseType",
      "materialIds",
      "filePath",
      "previewUrl",
      "expiresAt",
      "integrity",
    ],
    "designer exchange",
  );

  if (record.caseType !== "ordinary" && record.caseType !== "magnetic") {
    throw new Error("caseType is invalid");
  }
  if (
    !Array.isArray(record.materialIds) ||
    record.materialIds.length > 20
  ) {
    throw new Error("materialIds is invalid");
  }
  const materialIds = record.materialIds.map((value) =>
    requireBoundedIdentifier(value, "materialId")
  );
  if (new Set(materialIds).size !== materialIds.length) {
    throw new Error("materialIds contains duplicates");
  }

  if (typeof record.filePath !== "string") {
    throw new Error("filePath is required");
  }
  const filePath = record.filePath.trim();
  if (
    !filePath ||
    filePath.length > 1000 ||
    filePath.includes("..") ||
    /^[a-z][a-z0-9+.-]*:/i.test(filePath) ||
    filePath.startsWith("/") ||
    filePath.includes("\\") ||
    SECRET_LIKE_VALUE.test(filePath)
  ) {
    throw new Error("filePath is invalid");
  }

  if (typeof record.previewUrl !== "string") {
    throw new Error("previewUrl is required");
  }
  const previewUrl = parseHttpsUrl(record.previewUrl, {
    allowQuery: true,
    originOnly: false,
  });
  if (!previewUrl) throw new Error("previewUrl is invalid");

  const integrity = requireRecord(record.integrity, "integrity");
  requireOnlyKeys(integrity, ["scheme", "keyId", "value"], "integrity");
  const scheme = requireBoundedIdentifier(integrity.scheme, "integrity.scheme");
  const keyId = requireBoundedIdentifier(integrity.keyId, "integrity.keyId");
  const integrityValue = requireOpaqueCode(
    integrity.value,
    "integrity.value",
  );

  return {
    exchangeCode: requireOpaqueCode(record.exchangeCode, "exchangeCode"),
    state: requireOpaqueCode(record.state, "state"),
    attributionToken: requireOpaqueCode(
      record.attributionToken,
      "attributionToken",
    ),
    resultId: requireBoundedIdentifier(record.resultId, "resultId"),
    goodsSkuId: requireBoundedIdentifier(record.goodsSkuId, "goodsSkuId"),
    caseType: record.caseType,
    materialIds,
    filePath,
    previewUrl: previewUrl.toString(),
    expiresAt: requireFutureExpiry(record.expiresAt, now, "expiresAt"),
    integrity: {
      scheme,
      keyId,
      value: integrityValue,
    },
  };
}

export function assertKexiaozhanDesignerExchangeBinding(
  request: KexiaozhanDesignerSessionRequest,
  result: KexiaozhanDesignerExchangeResult,
): void {
  if (
    request.state !== result.state ||
    request.attributionToken !== result.attributionToken
  ) {
    throw new Error(
      "designer exchange is not bound to the originating session",
    );
  }
  if (
    request.selection &&
    request.selection.goodsSkuId !== result.goodsSkuId
  ) {
    throw new Error("designer exchange returned a different SKU");
  }
}
