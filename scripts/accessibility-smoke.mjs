import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(root, "output", "playwright");
const host = "127.0.0.1";
const port = Number(process.env.A11Y_PORT ?? 4186);
const origin = `http://${host}:${port}`;
const viteBin = resolve(root, "node_modules", "vite", "bin", "vite.js");
const previewUrl = `${origin}/placeholder.svg`;
const cartItem = {
  id: "accessibility-cart-item",
  variantId: "iphone-17-pro-max",
  quantity: 2,
  edmTemplateId: 12345,
  designId: null,
  externalProductId: "accessibility-product",
};

await mkdir(outputDir, { recursive: true });

const server = spawn(
  process.execPath,
  [viteBin, "--host", host, "--port", String(port), "--strictPort"],
  {
    cwd: root,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: "https://placeholder.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "public-anon-key",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverLog = "";
server.stdout.on("data", (chunk) => {
  serverLog += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverLog += chunk.toString();
});

const waitForServer = async () => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Accessibility test server exited early.\n${serverLog}`);
    }
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Accessibility test server did not start.\n${serverLog}`);
};

const installAppState = async (context, theme) => {
  await context.addInitScript(
    ({ expectedOrigin, storedCartItem, storedPreviewUrl, selectedTheme }) => {
      if (window.location.origin !== expectedOrigin) return;
      window.localStorage.setItem("theme", selectedTheme);
      window.localStorage.setItem("snapcase_analytics_consent_v1", "denied");
      window.localStorage.setItem("snapcase_cart_v1", JSON.stringify([storedCartItem]));
      window.sessionStorage.setItem(
        `snapcase_cart_preview:${storedCartItem.id}`,
        storedPreviewUrl,
      );
    },
    {
      expectedOrigin: origin,
      storedCartItem: cartItem,
      storedPreviewUrl: previewUrl,
      selectedTheme: theme,
    },
  );
};

const mockExternalServices = async (context) => {
  await context.route(
    "https://files.cdn.printful.com/embed/embed.js",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `
          window.PFDesignMaker = class {
            constructor(config) {
              const host = document.getElementById(config.elemId);
              const frame = document.createElement("iframe");
              frame.title = "Design editor for Apple iPhone 17 Pro Max";
              frame.srcdoc = "<!doctype html><html lang='en'><head><title>Mock design editor</title></head><body><main aria-label='Mock design canvas'></main></body></html>";
              host.appendChild(frame);
              setTimeout(() => config.onIframeLoaded?.(), 0);
            }
            sendMessage() {}
          };
        `,
      });
    },
  );

  await context.route(
    "https://placeholder.supabase.co/functions/v1/**",
    async (route) => {
      const request = route.request();
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "content-type": "application/json",
      };

      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers, body: "{}" });
        return;
      }

      if (request.url().endsWith("/edm-nonce")) {
        await route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({ nonce: "accessibility-test-nonce" }),
        });
        return;
      }

      if (request.url().endsWith("/validate-promo")) {
        await route.fulfill({
          status: 400,
          headers,
          body: JSON.stringify({ error: "Promo code is invalid or expired." }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        headers,
        body: "{}",
      });
    },
  );
};

const waitForStableUi = async (page) => {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(150);
};

const assertNoSeriousAxeViolations = async (page, label) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  assert.equal(
    blocking.length,
    0,
    `${label} has critical/serious axe violations:\n${blocking
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join("\n")}`,
  );
  return {
    label,
    violations: results.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      count: nodes.length,
    })),
  };
};

const assertTargetSize = async (locator, label) => {
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  assert.ok(box, `${label} does not have a visible box.`);
  assert.ok(
    box.width >= 44 && box.height >= 44,
    `${label} is ${Math.round(box.width)}x${Math.round(box.height)}; expected at least 44x44.`,
  );
};

const assertTextContrast = async (locator, label) => {
  const contrast = await locator.evaluate((element) => {
    const parseRgb = (value) => {
      const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (!channels || channels.length !== 3) {
        throw new Error(`Unable to parse color: ${value}`);
      }
      return channels.map((channel) => channel / 255);
    };
    const luminance = (channels) =>
      channels
        .map((channel) =>
          channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4,
        )
        .reduce(
          (total, channel, index) =>
            total + channel * [0.2126, 0.7152, 0.0722][index],
          0,
        );
    const style = getComputedStyle(element);
    const foreground = luminance(parseRgb(style.color));
    const background = luminance(parseRgb(style.backgroundColor));
    return (
      (Math.max(foreground, background) + 0.05) /
      (Math.min(foreground, background) + 0.05)
    );
  });
  assert.ok(
    contrast >= 4.5,
    `${label} text contrast is ${contrast.toFixed(2)}:1; expected at least 4.5:1.`,
  );
};

const assertFocusIndicator = async (locator, label) => {
  await locator.focus();
  const focusStyle = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineColor: style.outlineColor,
    };
  });
  assert.ok(
    focusStyle.outlineStyle !== "none" &&
      focusStyle.outlineWidth >= 2 &&
      !focusStyle.outlineColor.endsWith(", 0)"),
    `${label} does not expose a clear focus outline.`,
  );
};

const assertNoHorizontalOverflow = async (page, label) => {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert.ok(
    widths.content <= widths.viewport,
    `${label} overflows horizontally (${widths.content}px content in ${widths.viewport}px viewport).`,
  );
};

let browser;
const auditResults = [];

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  await installAppState(desktop, "light");
  await mockExternalServices(desktop);
  const page = await desktop.newPage();

  await page.goto(origin);
  await waitForStableUi(page);
  await assertTargetSize(page.getByRole("button", { name: "Open cart, 2 items" }), "Home cart");
  await assertTargetSize(page.getByRole("button", { name: "Open site menu" }), "Home menu");
  await assertTargetSize(page.getByRole("link", { name: /Start designing/ }), "Home primary CTA");
  const homePrimaryCta = page.getByRole("link", { name: /Start designing/ });
  await assertTextContrast(homePrimaryCta, "Home primary CTA default");
  await homePrimaryCta.hover();
  await page.waitForTimeout(20);
  await assertTextContrast(homePrimaryCta, "Home primary CTA hover");
  await homePrimaryCta.focus();
  await assertTextContrast(homePrimaryCta, "Home primary CTA focus");
  await assertFocusIndicator(homePrimaryCta, "Home primary CTA");
  assert.equal(await page.getByRole("main").count(), 1, "Home must expose one main landmark.");
  auditResults.push(await assertNoSeriousAxeViolations(page, "home-light-desktop"));
  await page.screenshot({
    path: resolve(outputDir, "home-light-desktop.png"),
    fullPage: true,
  });

  const startDesigning = page.getByRole("link", { name: /Start designing/ });
  await startDesigning.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(`${origin}/catalog`);
  await waitForStableUi(page);
  await page.getByRole("heading", { level: 1, name: "Choose Your Phone" }).waitFor();
  await page.getByRole("textbox", { name: "Search phone models" }).waitFor();
  auditResults.push(await assertNoSeriousAxeViolations(page, "catalog-light-desktop"));

  const modelLink = page.getByRole("link", {
    name: /iPhone 17 Pro Max.*Apple.*\$29\.99/i,
  }).first();
  await assertFocusIndicator(modelLink, "Catalog model link");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/design\/iphone-17-pro-max/);
  await page.getByRole("heading", {
    level: 1,
    name: "Design a case for Apple iPhone 17 Pro Max",
  }).waitFor();
  await page.locator('iframe[title="Design editor for Apple iPhone 17 Pro Max"]').waitFor();
  auditResults.push(await assertNoSeriousAxeViolations(page, "editor-light-desktop"));

  const cartTrigger = page.getByRole("button", { name: "Open cart, 2 items" });
  await cartTrigger.focus();
  await page.keyboard.press("Enter");
  const cartDialog = page.getByRole("dialog", { name: "Your Cart (2 items)" });
  await cartDialog.waitFor();
  await page.getByText("Apple iPhone 17 Pro Max", { exact: true }).waitFor();
  await assertTargetSize(page.getByRole("button", { name: /Decrease quantity/ }), "Cart decrease");
  await assertTargetSize(page.getByRole("button", { name: /Increase quantity/ }), "Cart increase");
  await assertTargetSize(page.getByRole("button", { name: /Remove Apple iPhone 17 Pro Max/ }), "Cart remove");
  await assertTargetSize(page.getByRole("button", { name: "Close" }), "Cart close");
  await page.keyboard.press("Tab");
  assert.equal(
    await cartDialog.evaluate((dialog) => dialog.contains(document.activeElement)),
    true,
    "Tab focus must remain inside the open cart dialog.",
  );
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await cartDialog.evaluate((dialog) => dialog.contains(document.activeElement)),
    true,
    "Reverse-tab focus must remain inside the open cart dialog.",
  );
  auditResults.push(await assertNoSeriousAxeViolations(page, "cart-light-desktop"));

  await page.keyboard.press("Escape");
  await cartDialog.waitFor({ state: "hidden" });
  assert.equal(
    await cartTrigger.evaluate((element) => element === document.activeElement),
    true,
    "Closing the cart with Escape must restore focus to the cart trigger.",
  );

  await page.keyboard.press("Enter");
  const checkoutButton = page.getByRole("button", { name: "Checkout" });
  await checkoutButton.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(`${origin}/checkout`);
  await page.getByRole("heading", { level: 1, name: "Checkout" }).waitFor();
  await page.getByText("Apple iPhone 17 Pro Max", { exact: true }).waitFor();
  await page.getByLabel("Email").waitFor();
  await assertTargetSize(
    page.getByRole("button", { name: "Remove Apple iPhone 17 Pro Max from order" }),
    "Checkout remove",
  );
  auditResults.push(await assertNoSeriousAxeViolations(page, "checkout-light-desktop"));
  await page.screenshot({
    path: resolve(outputDir, "checkout-light-desktop.png"),
    fullPage: true,
  });

  await page.getByLabel("Promo code").fill("NOTVALID");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByRole("alert").filter({ hasText: "Promo code is invalid or expired." }).waitFor();
  assert.equal(
    await page.getByLabel("Promo code").getAttribute("aria-invalid"),
    "true",
    "Invalid promo feedback must be programmatically connected to the input.",
  );
  auditResults.push(await assertNoSeriousAxeViolations(page, "checkout-error-light-desktop"));
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    colorScheme: "dark",
  });
  await installAppState(mobile, "dark");
  await mockExternalServices(mobile);
  const mobilePage = await mobile.newPage();

  await mobilePage.goto(origin);
  await waitForStableUi(mobilePage);
  await assertNoHorizontalOverflow(mobilePage, "Mobile home");
  await assertTargetSize(
    mobilePage.getByRole("button", { name: "Open cart, 2 items" }),
    "Mobile home cart",
  );
  await assertTargetSize(
    mobilePage.getByRole("button", { name: "Open site menu" }),
    "Mobile home menu",
  );
  await assertTextContrast(
    mobilePage.getByRole("link", { name: /Start designing/ }),
    "Mobile dark primary CTA",
  );
  auditResults.push(await assertNoSeriousAxeViolations(mobilePage, "home-dark-mobile"));
  await mobilePage.screenshot({
    path: resolve(outputDir, "home-dark-mobile.png"),
    fullPage: true,
  });

  await mobilePage.goto(`${origin}/catalog`);
  await waitForStableUi(mobilePage);
  await assertNoHorizontalOverflow(mobilePage, "Mobile catalog");
  auditResults.push(await assertNoSeriousAxeViolations(mobilePage, "catalog-dark-mobile"));
  await mobilePage.screenshot({
    path: resolve(outputDir, "catalog-dark-mobile.png"),
    fullPage: true,
  });

  await mobilePage.getByRole("button", { name: "Open cart, 2 items" }).click();
  await mobilePage.getByRole("dialog", { name: "Your Cart (2 items)" }).waitFor();
  await assertNoHorizontalOverflow(mobilePage, "Mobile cart");
  auditResults.push(await assertNoSeriousAxeViolations(mobilePage, "cart-dark-mobile"));
  await mobilePage.screenshot({
    path: resolve(outputDir, "cart-dark-mobile.png"),
    fullPage: true,
  });
  await mobile.close();

  console.log(
    JSON.stringify(
      {
        result: "Accessibility smoke passed",
        audited: auditResults,
        evidence: [
          "output/playwright/home-light-desktop.png",
          "output/playwright/checkout-light-desktop.png",
          "output/playwright/home-dark-mobile.png",
          "output/playwright/catalog-dark-mobile.png",
          "output/playwright/cart-dark-mobile.png",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server.kill();
}
