import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  assertKexiaozhanDesignerExchangeBinding,
  buildKexiaozhanDesignerEntry,
  KEXIAOZHAN_DESIGNER_CONTRACT_VERSION,
  parseKexiaozhanDesignerExchangeResult,
  parseKexiaozhanDesignerReturn,
  parseKexiaozhanDesignerSession,
  resolveKexiaozhanDesignerContract,
} from "./kexiaozhan-designer-contract.ts";

const now = new Date("2026-07-19T20:00:00.000Z");
const future = "2026-07-19T20:15:00.000Z";
const state = "state_0123456789abcdef";
const attributionToken = "attr_0123456789abcdef";
const exchangeCode = "exchange_0123456789abcdef";

function enabledConfig(mode: "preselected_sku" | "vendor_selector") {
  return resolveKexiaozhanDesignerContract({
    publicEnabled: "true",
    mode,
    contractVersion: KEXIAOZHAN_DESIGNER_CONTRACT_VERSION,
    sessionEndpoint: "https://designer-api.vendor.example/v1/sessions",
    returnOrigin: "https://snapcase.ai",
  });
}

function validExchange() {
  return {
    exchangeCode,
    state,
    attributionToken,
    resultId: "result-001",
    goodsSkuId: "sku-iphone-17-pro",
    caseType: "ordinary",
    materialIds: ["material-clear"],
    filePath: "tenant/designs/result-001.png",
    previewUrl: "https://cdn.vendor.example/previews/result-001.png",
    expiresAt: future,
    integrity: {
      scheme: "hmac-sha256",
      keyId: "vendor-key-1",
      value: "signature_0123456789abcdef",
    },
  };
}

Deno.test("designer contract is disabled by default and needs independent gates", () => {
  assertEquals(resolveKexiaozhanDesignerContract({}), {
    enabled: false,
    mode: "disabled",
    selectorOwner: "snapcase",
    reason: "public_flag_off",
  });
  assertEquals(
    resolveKexiaozhanDesignerContract({
      publicEnabled: "true",
      mode: "preselected_sku",
    }),
    {
      enabled: false,
      mode: "disabled",
      selectorOwner: "snapcase",
      reason: "contract_version_mismatch",
    },
  );
});

Deno.test("preselected mode sends one trusted Snapcase selection", () => {
  const entry = buildKexiaozhanDesignerEntry(
    enabledConfig("preselected_sku"),
    {
      variantId: "iphone-17-pro",
      trustedGoodsSkuId: "sku-iphone-17-pro",
      state,
      attributionToken,
      returnPath: "/designer/complete",
    },
  );

  assertEquals(entry.kind, "vendor_session");
  if (entry.kind !== "vendor_session") return;
  assertEquals(entry.request.selectorOwner, "snapcase");
  assertEquals(entry.request.selection, {
    variantId: "iphone-17-pro",
    goodsSkuId: "sku-iphone-17-pro",
  });
  assertEquals(
    entry.request.returnUrl,
    "https://snapcase.ai/designer/complete",
  );
});

Deno.test("vendor-selector fallback rejects a second Snapcase selection", () => {
  assertThrows(
    () =>
      buildKexiaozhanDesignerEntry(enabledConfig("vendor_selector"), {
        variantId: "iphone-17-pro",
        trustedGoodsSkuId: "sku-iphone-17-pro",
        state,
        attributionToken,
      }),
    Error,
    "cannot receive a Snapcase phone or SKU selection",
  );

  const entry = buildKexiaozhanDesignerEntry(
    enabledConfig("vendor_selector"),
    { state, attributionToken },
  );
  assertEquals(entry.kind, "vendor_session");
  if (entry.kind !== "vendor_session") return;
  assertEquals(entry.request.selectorOwner, "vendor");
  assertEquals(entry.request.selection, null);
});

Deno.test("unsafe configured and returned URLs fail closed", () => {
  assertEquals(
    resolveKexiaozhanDesignerContract({
      publicEnabled: "true",
      mode: "vendor_selector",
      contractVersion: KEXIAOZHAN_DESIGNER_CONTRACT_VERSION,
      sessionEndpoint:
        "https://designer.vendor.example/session?token=permanent-secret",
      returnOrigin: "https://snapcase.ai",
    }),
    {
      enabled: false,
      mode: "disabled",
      selectorOwner: "snapcase",
      reason: "unsafe_session_endpoint",
    },
  );

  assertThrows(
    () =>
      parseKexiaozhanDesignerSession({
        sessionCode: "session_0123456789abcdef",
        designerUrl:
          "https://designer.vendor.example/start?access_token=secret-value",
        expiresAt: future,
      }, now),
    Error,
    "not safe for a public redirect",
  );

  assertThrows(
    () =>
      buildKexiaozhanDesignerEntry(enabledConfig("preselected_sku"), {
        variantId: "iphone-17-pro",
        trustedGoodsSkuId: "sku-iphone-17-pro",
        state,
        attributionToken,
        returnPath: "/designer/complete?token=permanent-secret",
      }),
    Error,
    "must stay on the configured return origin",
  );
});

Deno.test("session and return contracts bound one-time codes and expiry", () => {
  assertEquals(
    parseKexiaozhanDesignerSession({
      sessionCode: "session_0123456789abcdef",
      designerUrl:
        "https://designer.vendor.example/start?session=session_0123456789abcdef",
      expiresAt: future,
    }, now),
    {
      sessionCode: "session_0123456789abcdef",
      designerUrl:
        "https://designer.vendor.example/start?session=session_0123456789abcdef",
      expiresAt: future,
    },
  );
  assertEquals(
    parseKexiaozhanDesignerReturn({
      status: "complete",
      exchangeCode,
      state,
    }),
    { status: "complete", exchangeCode, state },
  );
  assertThrows(
    () =>
      parseKexiaozhanDesignerSession({
        sessionCode: "session_0123456789abcdef",
        designerUrl: "https://designer.vendor.example/start",
        expiresAt: "2026-07-19T19:59:59.000Z",
      }, now),
    Error,
    "expired or outside the allowed window",
  );
});

Deno.test("server exchange validates production fields and request binding", () => {
  const entry = buildKexiaozhanDesignerEntry(
    enabledConfig("preselected_sku"),
    {
      variantId: "iphone-17-pro",
      trustedGoodsSkuId: "sku-iphone-17-pro",
      state,
      attributionToken,
    },
  );
  if (entry.kind !== "vendor_session") {
    throw new Error("Expected a vendor session");
  }

  const result = parseKexiaozhanDesignerExchangeResult(validExchange(), now);
  assertKexiaozhanDesignerExchangeBinding(entry.request, result);
  assertEquals(result.filePath, "tenant/designs/result-001.png");

  assertThrows(
    () =>
      assertKexiaozhanDesignerExchangeBinding(entry.request, {
        ...result,
        goodsSkuId: "different-sku",
      }),
    Error,
    "different SKU",
  );
  assertThrows(
    () =>
      parseKexiaozhanDesignerExchangeResult({
        ...validExchange(),
        filePath: "https://attacker.example/artwork.png",
      }, now),
    Error,
    "filePath is invalid",
  );
});
