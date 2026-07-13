import { assertEquals, assertRejects } from "jsr:@std/assert";
import { buildKexiaozhanCheckoutRedirectUrl } from "./kexiaozhan-checkout-redirect.ts";

Deno.test("buildKexiaozhanCheckoutRedirectUrl preserves vendor params and adds bypass", () => {
  const url = buildKexiaozhanCheckoutRedirectUrl(
    "https://staging.example.com/functions/v1/kexiaozhan-checkout-redirect?order_no=ORDER1&goods_name=Photo%20Print&sign=abc",
    {
      targetUrl: "https://preview.example.com/kexiaozhan/checkout",
      vercelBypassSecret: "secret123",
    },
  );

  const parsed = new URL(url);
  assertEquals(parsed.origin, "https://preview.example.com");
  assertEquals(parsed.pathname, "/kexiaozhan/checkout");
  assertEquals(parsed.searchParams.get("order_no"), "ORDER1");
  assertEquals(parsed.searchParams.get("goods_name"), "Photo Print");
  assertEquals(parsed.searchParams.get("sign"), "abc");
  assertEquals(
    parsed.searchParams.get("x-vercel-protection-bypass"),
    "secret123",
  );
  assertEquals(parsed.searchParams.get("x-vercel-set-bypass-cookie"), "true");
});

Deno.test("buildKexiaozhanCheckoutRedirectUrl keeps existing target params", () => {
  const url = buildKexiaozhanCheckoutRedirectUrl(
    "https://staging.example.com/functions/v1/kexiaozhan-checkout-redirect?order_no=ORDER1",
    {
      targetUrl:
        "https://preview.example.com/kexiaozhan/checkout?target_param=1",
      vercelBypassSecret: null,
    },
  );

  const parsed = new URL(url);
  assertEquals(parsed.searchParams.get("target_param"), "1");
  assertEquals(parsed.searchParams.get("order_no"), "ORDER1");
  assertEquals(parsed.searchParams.has("x-vercel-protection-bypass"), false);
});

Deno.test("buildKexiaozhanCheckoutRedirectUrl ignores inbound bypass params", () => {
  const url = buildKexiaozhanCheckoutRedirectUrl(
    "https://staging.example.com/functions/v1/kexiaozhan-checkout-redirect?x-vercel-protection-bypass=attacker&x-vercel-set-bypass-cookie=false&order_no=ORDER1",
    {
      targetUrl: "https://preview.example.com/kexiaozhan/checkout",
      vercelBypassSecret: "server-secret",
    },
  );

  const parsed = new URL(url);
  assertEquals(parsed.searchParams.get("order_no"), "ORDER1");
  assertEquals(
    parsed.searchParams.get("x-vercel-protection-bypass"),
    "server-secret",
  );
  assertEquals(parsed.searchParams.get("x-vercel-set-bypass-cookie"), "true");
});

Deno.test("buildKexiaozhanCheckoutRedirectUrl rejects non-http urls", async () => {
  await assertRejects(
    async () =>
      buildKexiaozhanCheckoutRedirectUrl(
        "https://staging.example.com/functions/v1/kexiaozhan-checkout-redirect",
        { targetUrl: "javascript:alert(1)" },
      ),
    Error,
    "targetUrl must be an http(s) URL",
  );
});
