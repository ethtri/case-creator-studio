import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertKexiaozhanDesignerExchangeBinding,
  buildKexiaozhanDesignerEntry,
  parseKexiaozhanDesignerExchangeResult,
  parseKexiaozhanDesignerReturn,
  parseKexiaozhanDesignerSession,
  resolveKexiaozhanDesignerContract,
} from "../supabase/functions/_shared/kexiaozhan-designer-contract.ts";

const fixture = JSON.parse(
  await readFile(
    new URL("./fixtures/kexiaozhan-designer-contract.json", import.meta.url),
    "utf8",
  ),
);

test("sanitized fixture exercises the complete one-selection contract", () => {
  const contract = resolveKexiaozhanDesignerContract(fixture.config);
  assert.equal(contract.enabled, true);
  const entry = buildKexiaozhanDesignerEntry(contract, fixture.entry);
  assert.equal(entry.kind, "vendor_session");
  assert.deepEqual(entry.request.selection, {
    variantId: fixture.entry.variantId,
    goodsSkuId: fixture.entry.trustedGoodsSkuId,
  });

  const now = new Date("2099-01-01T00:00:00.000Z");
  const session = parseKexiaozhanDesignerSession(fixture.session, now);
  const browserReturn = parseKexiaozhanDesignerReturn(fixture.browserReturn);
  const exchange = parseKexiaozhanDesignerExchangeResult(
    fixture.serverExchange,
    now,
  );
  assert.equal(session.sessionCode, "session_0123456789abcdef");
  assert.equal(browserReturn.status, "complete");
  assertKexiaozhanDesignerExchangeBinding(entry.request, exchange);
});

test("frontend remains free of public Kexiaozhan designer URLs and flags", async () => {
  const appSources = await Promise.all([
    readFile("src/AppRoutes.tsx", "utf8"),
    readFile("src/pages/Catalog.tsx", "utf8"),
    readFile("src/pages/Index.tsx", "utf8"),
  ]);
  const combined = appSources.join("\n");
  assert.doesNotMatch(combined, /KEXIAOZHAN_DESIGNER_PUBLIC_ENABLED/);
  assert.doesNotMatch(combined, /designer-api\.vendor\.example/);
  assert.doesNotMatch(combined, /kexiaozhan\.com\/.*(?:token|auth|key)=/i);
});
