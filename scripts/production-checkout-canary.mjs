import assert from "node:assert/strict";
import { chromium } from "playwright";

const siteUrl = (
  process.env.CHECKOUT_CANARY_SITE_URL ?? "https://www.snapcase.ai"
).replace(/\/$/, "");
const secret = process.env.CHECKOUT_CANARY_AUTH_SECRET ?? "";
assert(
  secret.length >= 32,
  "CHECKOUT_CANARY_AUTH_SECRET must be at least 32 characters",
);

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  await context.route("**/functions/v1/create-checkout", async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        "x-snapcase-checkout-canary": secret,
      },
    });
  });
  await context.addInitScript(
    ({ origin }) => {
      if (window.location.origin !== origin) return;
      const item = {
        id: "production-checkout-canary",
        variantId: "iphone-17-pro-max",
        quantity: 1,
        edmTemplateId: 12345,
        designId: null,
        externalProductId: "production-checkout-canary",
      };
      localStorage.setItem("snapcase_analytics_consent_v1", "denied");
      localStorage.setItem("snapcase_cart_v1", JSON.stringify([item]));
      sessionStorage.setItem(
        `snapcase_cart_preview:${item.id}`,
        `${origin}/placeholder.svg`,
      );
    },
    { origin: siteUrl },
  );

  const page = await context.newPage();
  await page.goto(`${siteUrl}/checkout/iphone-17-pro-max`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.locator("#email").fill("support@snapcase.ai");
  await page.getByRole("button", { name: /Continue to Stripe/i }).click();
  await page.waitForURL(
    (url) =>
      url.protocol === "https:" &&
      url.hostname === "checkout.stripe.com" &&
      /^\/(?:c|f)\/pay\/cs_live_[A-Za-z0-9]+$/.test(url.pathname),
    { timeout: 45_000 },
  );
  console.log(
    "Production checkout canary passed: Stripe hosted checkout opened without payment.",
  );
} finally {
  await browser.close();
}
