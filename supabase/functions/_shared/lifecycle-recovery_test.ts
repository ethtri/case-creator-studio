import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  buildRecoveryCartItems,
  recoveryAuthorizationNeedsUserVerification,
  safeRecoveryAnalytics,
  validateRecoveryToken,
} from "./lifecycle-recovery.ts";

Deno.test("recovery tokens are exact opaque 256-bit hex values", () => {
  assertEquals(validateRecoveryToken("a".repeat(64)), "a".repeat(64));
  assertEquals(validateRecoveryToken("A".repeat(64)), "a".repeat(64));
  assertEquals(validateRecoveryToken("a".repeat(63)), null);
  assertEquals(validateRecoveryToken("customer@example.com"), null);
  assertEquals(validateRecoveryToken("../design/known-id"), null);
});

Deno.test("project API authorization is anonymous while user bearer tokens are verified", () => {
  const anonKey = "project-anon-key";
  const publishableKey = "sb_publishable_project-key";
  assertEquals(recoveryAuthorizationNeedsUserVerification(null, publishableKey, anonKey), false);
  assertEquals(recoveryAuthorizationNeedsUserVerification(`Bearer ${anonKey}`, anonKey, anonKey), false);
  assertEquals(
    recoveryAuthorizationNeedsUserVerification(`Bearer ${publishableKey}`, publishableKey, anonKey),
    false,
  );
  assertEquals(recoveryAuthorizationNeedsUserVerification("Bearer signed-user-jwt", publishableKey, anonKey), true);
  assertEquals(recoveryAuthorizationNeedsUserVerification("Basic invalid", publishableKey, anonKey), true);
});

Deno.test("cart restoration rejects unsupported and malformed state", () => {
  assertEquals(buildRecoveryCartItems([]), null);
  assertEquals(buildRecoveryCartItems([{ variantId: "pixel-unknown" }]), null);
  assertEquals(buildRecoveryCartItems([{
    variantId: "galaxy-s24",
    edmTemplateId: 42,
    quantity: 0,
    designPreview: "https://example.invalid/private-preview",
    price: 29.99,
  }]), null);
});

Deno.test("cart restoration reprices server-side and preserves safe state", () => {
  const result = buildRecoveryCartItems([{
    variantId: "iphone-17-pro-max",
    edmTemplateId: 42,
    quantity: 2,
    designId: "design-safe-reference",
    designPreview: "https://example.invalid/private-preview",
    externalProductId: "683",
    price: 9.99,
  }]);
  assertEquals(result?.repriced, true);
  assertEquals(result?.items[0].unitPrice, 29.99);
  assertEquals(result?.items[0].quantity, 2);
});

Deno.test("analytics projection contains no token, identity, artwork, or design fields", () => {
  assertEquals(safeRecoveryAnalytics({
    flow: "abandoned_cart",
    outcome: "repriced",
    repriced: true,
  }), {
    flow: "abandoned_cart",
    outcome: "repriced",
    repriced: true,
  });
});
