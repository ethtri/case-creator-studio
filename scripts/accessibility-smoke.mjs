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
      VITE_GA_MEASUREMENT_ID: "G-TEST",
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

const installAppState = async (
  context,
  theme,
  storedCartItem = cartItem,
  analyticsConsent = "denied",
) => {
  await context.addInitScript(
    ({
      expectedOrigin,
      storedCartItem,
      storedPreviewUrl,
      selectedTheme,
      analyticsConsent,
    }) => {
      if (window.location.origin !== expectedOrigin) return;
      window.localStorage.setItem("theme", selectedTheme);
      window.localStorage.setItem(
        "snapcase_analytics_consent_v1",
        analyticsConsent,
      );
      window.localStorage.setItem(
        "snapcase_cart_v1",
        JSON.stringify([storedCartItem]),
      );
      window.sessionStorage.setItem(
        `snapcase_cart_preview:${storedCartItem.id}`,
        storedPreviewUrl,
      );
    },
    {
      expectedOrigin: origin,
      storedCartItem,
      storedPreviewUrl: previewUrl,
      selectedTheme: theme,
      analyticsConsent,
    },
  );
};

const mockExternalServices = async (context) => {
  let mockupStatusCalls = 0;

  await context.route(
    "https://files.cdn.printful.com/embed/embed.js",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `
          window.PFDesignMaker = class {
            constructor(config) {
              this.config = config;
              const host = document.getElementById(config.elemId);
              const frame = document.createElement("iframe");
              frame.title = "Design editor for Apple iPhone 17 Pro Max";
              frame.srcdoc = "<!doctype html><html lang='en'><head><title>Mock design editor</title></head><body><main aria-label='Mock design canvas'></main></body></html>";
              host.appendChild(frame);
              setTimeout(() => {
                config.onIframeLoaded?.();
                config.onDesignStatusUpdate?.({
                  hasDesign: true,
                  designValid: true,
                  designChange: true,
                });
              }, 0);
            }
            sendMessage(message) {
              if (message?.event === "saveDesign") {
                setTimeout(() => this.config.onTemplateSaved?.(12345), 0);
              }
            }
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
        const payload = request.postDataJSON();
        if (payload?.code === "SAVE5") {
          await route.fulfill({
            status: 200,
            headers,
            body: JSON.stringify({
              promo: {
                code: "SAVE5",
                discountAmount: 5,
              },
            }),
          });
          return;
        }

        await route.fulfill({
          status: 400,
          headers,
          body: JSON.stringify({ error: "Promo code is invalid or expired." }),
        });
        return;
      }

      if (request.url().endsWith("/create-checkout")) {
        await route.fulfill({
          status: 400,
          headers,
          body: JSON.stringify({
            error: "Checkout is temporarily unavailable.",
          }),
        });
        return;
      }

      if (request.url().endsWith("/edm-mockup")) {
        const payload = request.postDataJSON();
        if (payload?.action === "create") {
          await route.fulfill({
            status: 200,
            headers,
            body: JSON.stringify({ taskId: "accessibility-mockup-task" }),
          });
          return;
        }

        mockupStatusCalls += 1;
        await route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify(
            mockupStatusCalls <= 3
              ? { status: "pending" }
              : { status: "completed", mockupUrl: previewUrl },
          ),
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

  await context.route("https://www.googletagmanager.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    });
  });
};

const assertCheckoutReviewLayout = async (
  page,
  expectedLayout,
  expectedQuantity = 2,
) => {
  const summary = page.locator('[data-checkout-region="summary"]');
  const details = page.locator('[data-checkout-region="details"]');

  await summary.waitFor({ state: "attached" });
  await details.waitFor({ state: "attached" });
  assert.equal(
    await summary.evaluate(
      (element, detailsElement) =>
        Boolean(
          element.compareDocumentPosition(detailsElement) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      await details.elementHandle(),
    ),
    true,
    "Order summary must precede checkout details in DOM and assistive-technology order.",
  );

  const summaryBox = await summary.boundingBox();
  const detailsBox = await details.boundingBox();
  assert.ok(summaryBox, "Checkout summary must have a visible bounding box.");
  assert.ok(detailsBox, "Checkout details must have a visible bounding box.");

  if (expectedLayout === "stacked") {
    assert.ok(
      summaryBox.y < detailsBox.y,
      "Order summary must appear above checkout details at stacked widths.",
    );
  } else {
    assert.ok(
      detailsBox.x < summaryBox.x,
      "Checkout details must remain in the left desktop column.",
    );
    assert.equal(
      await summary
        .locator(":scope > div")
        .evaluate((element) => getComputedStyle(element).position),
      "sticky",
      "Desktop order summary must remain sticky.",
    );
  }

  await page
    .getByText(
      `${expectedQuantity} ${expectedQuantity === 1 ? "item" : "items"}`,
      { exact: true },
    )
    .waitFor();
  await page.getByText("Unit price $29.99", { exact: true }).waitFor();
  await page
    .getByText(`Quantity ${expectedQuantity}`, { exact: true })
    .waitFor();
  await page
    .getByText(`Line total $${(29.99 * expectedQuantity).toFixed(2)}`, {
      exact: true,
    })
    .waitFor();

  const ctaGroup = page.locator("[data-checkout-cta-group]");
  await ctaGroup.getByRole("link", { name: "Terms", exact: true }).waitFor();
  await ctaGroup
    .getByRole("link", { name: "Privacy Policy", exact: true })
    .waitFor();
};

const installVerificationState = async (context, theme = "light") => {
  await context.addInitScript(
    ({ expectedOrigin, storedCartItem, storedPreviewUrl, selectedTheme }) => {
      if (window.location.origin !== expectedOrigin) return;
      window.localStorage.setItem("theme", selectedTheme);
      window.localStorage.setItem("snapcase_analytics_consent_v1", "granted");
      window.localStorage.setItem("snapcase_cart_v1", JSON.stringify([storedCartItem]));
      window.sessionStorage.setItem(
        `snapcase_cart_preview:${storedCartItem.id}`,
        storedPreviewUrl,
      );
      window.gtag = (...args) => {
        const key = "snapcase_a11y_analytics_events";
        const events = JSON.parse(window.sessionStorage.getItem(key) ?? "[]");
        events.push(args);
        window.sessionStorage.setItem(key, JSON.stringify(events));
      };
    },
    {
      expectedOrigin: origin,
      storedCartItem: cartItem,
      storedPreviewUrl: previewUrl,
      selectedTheme: theme,
    },
  );
};

const mockVerificationService = async (context, responses) => {
  let verificationCalls = 0;

  await context.route("https://www.googletagmanager.com/gtag/js**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    });
  });

  await context.route(
    "https://placeholder.supabase.co/functions/v1/verify-payment",
    async (route) => {
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "content-type": "application/json",
      };
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers, body: "{}" });
        return;
      }

      const response = responses[Math.min(verificationCalls, responses.length - 1)];
      verificationCalls += 1;
      if (response.delay) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, response.delay));
      }
      await route.fulfill({
        status: response.status ?? 200,
        headers,
        body: JSON.stringify(response.body),
      });
    },
  );

  return () => verificationCalls;
};

const waitForStableUi = async (page) => {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(650);
};

const assertNoSeriousAxeViolations = async (page, label) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = results.violations.filter(
    (violation) =>
      violation.impact === "critical" || violation.impact === "serious",
  );
  assert.equal(
    blocking.length,
    0,
    `${label} has critical/serious axe violations:\n${blocking
      .map(
        (violation) =>
          `${violation.id}: ${violation.help}\n${violation.nodes
            .map(
              (node) =>
                `  ${node.target.join(" ")}: ${node.failureSummary ?? node.html}`,
            )
            .join("\n")}`,
      )
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
      const channels = value.match(/[\d.]+/g)?.map(Number);
      if (!channels || channels.length < 3) {
        throw new Error(`Unable to parse color: ${value}`);
      }
      return {
        rgb: channels.slice(0, 3),
        alpha: channels[3] ?? 1,
      };
    };
    const composite = (foreground, background) =>
      foreground.rgb.map(
        (channel, index) =>
          channel * foreground.alpha +
          background[index] * (1 - foreground.alpha),
      );
    const effectiveBackground = () => {
      const layers = [];
      for (let current = element; current; current = current.parentElement) {
        layers.push(parseRgb(getComputedStyle(current).backgroundColor));
      }
      return layers
        .reverse()
        .reduce(
          (background, layer) => composite(layer, background),
          [255, 255, 255],
        );
    };
    const luminance = (channels) =>
      channels
        .map((channel) => channel / 255)
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
    const backgroundRgb = effectiveBackground();
    const foregroundRgb = composite(parseRgb(style.color), backgroundRgb);
    const foreground = luminance(foregroundRgb);
    const background = luminance(backgroundRgb);
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

const assertFocusIndicator = async (page, locator, label) => {
  await locator.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const focusStyle = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
    };
  });
  const hasOutline =
    focusStyle.outlineStyle !== "none" &&
    focusStyle.outlineWidth >= 2 &&
    !focusStyle.outlineColor.endsWith(", 0)");
  const hasFocusRing =
    focusStyle.boxShadow !== "none" &&
    !focusStyle.boxShadow.includes("rgba(0, 0, 0, 0)");
  assert.ok(
    hasOutline || hasFocusRing,
    `${label} does not expose a clear focus outline or ring.`,
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

const assertFullyOpaqueFrames = async (page, locators, label) => {
  const frameDelays = [0, 50, 50, 100, 200];
  let elapsedMs = 0;

  for (const delayMs of frameDelays) {
    if (delayMs > 0) {
      await page.waitForTimeout(delayMs);
      elapsedMs += delayMs;
    }

    for (const locator of locators) {
      assert.equal(
        await locator.evaluate((element) => getComputedStyle(element).opacity),
        "1",
        `${label} must remain fully opaque at ${elapsedMs} ms.`,
      );
    }
  }
};

const waitForImage = async (locator, label) => {
  await locator.waitFor({ state: "visible" });
  const dimensions = await locator.evaluate(
    (image) =>
      new Promise((resolveImage, rejectImage) => {
        const finish = () =>
          image.naturalWidth > 0
            ? resolveImage({
                width: image.naturalWidth,
                height: image.naturalHeight,
              })
            : rejectImage(
                new Error("Image loaded without intrinsic dimensions."),
              );
        if (image.complete) {
          finish();
          return;
        }
        image.addEventListener("load", finish, { once: true });
        image.addEventListener(
          "error",
          () => rejectImage(new Error("Image failed to load.")),
          {
            once: true,
          },
        );
      }),
  );
  assert.ok(
    dimensions.width > 0 && dimensions.height > 0,
    `${label} did not load.`,
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
  await waitForImage(page.locator("picture img").first(), "Desktop hero image");
  await assertTargetSize(
    page.getByRole("link", { name: "Snapcase", exact: true }),
    "Home logo",
  );
  await assertTargetSize(
    page.getByRole("button", { name: "Open cart, 2 items" }),
    "Home cart",
  );
  await assertTargetSize(
    page.getByRole("button", { name: "Open site menu" }),
    "Home menu",
  );
  await assertTargetSize(
    page.getByRole("link", { name: /Start designing/ }),
    "Home primary CTA",
  );
  const homePrimaryCta = page.getByRole("link", { name: /Start designing/ });
  await assertTextContrast(homePrimaryCta, "Home primary CTA default");
  await homePrimaryCta.hover();
  await page.waitForTimeout(20);
  await assertTextContrast(homePrimaryCta, "Home primary CTA hover");
  await homePrimaryCta.focus();
  await assertTextContrast(homePrimaryCta, "Home primary CTA focus");
  await assertFocusIndicator(page, homePrimaryCta, "Home primary CTA");
  assert.equal(
    await page.getByRole("main").count(),
    1,
    "Home must expose one main landmark.",
  );
  auditResults.push(
    await assertNoSeriousAxeViolations(page, "home-light-desktop"),
  );
  await page.screenshot({
    path: resolve(outputDir, "home-light-desktop.png"),
    fullPage: true,
  });

  const startDesigning = page.getByRole("link", { name: /Start designing/ });
  await startDesigning.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(`${origin}/catalog`);
  await waitForStableUi(page);
  await page
    .getByRole("heading", { level: 1, name: "Choose Your Phone" })
    .waitFor();
  await page.getByRole("textbox", { name: "Search phone models" }).waitFor();
  auditResults.push(
    await assertNoSeriousAxeViolations(page, "catalog-light-desktop"),
  );

  await page.getByRole("button", { name: "Open cart, 2 items" }).click();
  const seededCartDialog = page.getByRole("dialog", {
    name: "Your Cart (2 items)",
  });
  await seededCartDialog.waitFor();
  await page
    .getByRole("button", { name: /Remove Apple iPhone 17 Pro Max/ })
    .click();
  await page.getByRole("button", { name: "Close" }).click();
  await seededCartDialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Open cart, empty" }).waitFor();

  const modelDetailsLink = page.getByRole("link", {
    name: "View details for iPhone 17 Pro Max",
  });
  const modelDesignLink = page.getByRole("link", {
    name: "Start designing for iPhone 17 Pro Max",
  });
  await assertTargetSize(modelDetailsLink, "Catalog model details");
  await assertTargetSize(modelDesignLink, "Catalog model design");
  await assertFocusIndicator(
    page,
    modelDetailsLink,
    "Catalog model details",
  );
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/phone-cases\/iphone-17-pro-max/);
  await page
    .getByRole("heading", {
      level: 1,
      name: "Design your own iPhone 17 Pro Max phone case.",
    })
    .waitFor();
  await page.getByText("$29.99 USD", { exact: true }).waitFor();
  auditResults.push(
    await assertNoSeriousAxeViolations(page, "product-offer-light-desktop"),
  );

  await page.goBack();
  await page.waitForURL(`${origin}/catalog`);
  await waitForStableUi(page);
  await assertFocusIndicator(
    page,
    modelDesignLink,
    "Catalog model design",
  );
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/design\/iphone-17-pro-max/);
  await page
    .getByRole("heading", {
      level: 1,
      name: "Design a case for Apple iPhone 17 Pro Max",
    })
    .waitFor();
  await page
    .locator('iframe[title="Design editor for Apple iPhone 17 Pro Max"]')
    .waitFor();
  auditResults.push(
    await assertNoSeriousAxeViolations(page, "editor-light-desktop"),
  );

  const continueToPreview = page.getByRole("button", {
    name: "Continue to Preview",
  });
  await assertTargetSize(continueToPreview, "Editor continue");
  await continueToPreview.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/preview\/iphone-17-pro-max/);
  await page
    .getByRole("heading", { level: 1, name: "Apple iPhone 17 Pro Max" })
    .waitFor();

  const addToCart = page.getByRole("button", { name: /Add to Cart/ });
  await addToCart.waitFor();
  assert.equal(
    await addToCart.isDisabled(),
    true,
    "Add to Cart must remain disabled while the production preview is not ready.",
  );
  assert.equal(
    await addToCart.getAttribute("aria-describedby"),
    "preview-cart-help",
    "The disabled Add to Cart control must reference its persistent explanation.",
  );
  await page
    .getByText(/Add to Cart becomes available after your preview finishes/)
    .waitFor();
  await page.waitForTimeout(650);
  auditResults.push(
    await assertNoSeriousAxeViolations(page, "preview-loading-light-desktop"),
  );
  await addToCart.click();
  await page.getByRole("button", { name: /Added to Cart/ }).waitFor();
  await page.getByRole("button", { name: "Open cart, 1 item" }).waitFor();
  const previewSecondaryCta = page.getByRole("button", {
    name: "Proceed to Checkout",
  });
  await assertTextContrast(
    previewSecondaryCta,
    "Preview secondary CTA default",
  );
  await previewSecondaryCta.hover();
  await page.waitForTimeout(20);
  await assertTextContrast(previewSecondaryCta, "Preview secondary CTA hover");
  await previewSecondaryCta.focus();
  await assertTextContrast(previewSecondaryCta, "Preview secondary CTA focus");
  await assertFocusIndicator(
    page,
    previewSecondaryCta,
    "Preview secondary CTA",
  );
  auditResults.push(
    await assertNoSeriousAxeViolations(page, "preview-ready-light-desktop"),
  );
  await page.screenshot({
    path: resolve(outputDir, "preview-light-desktop.png"),
    fullPage: true,
  });

  const cartTrigger = page.getByRole("button", { name: "Open cart, 1 item" });
  await cartTrigger.focus();
  await page.keyboard.press("Enter");
  const cartDialog = page.getByRole("dialog", { name: "Your Cart (1 item)" });
  await cartDialog.waitFor();
  await cartDialog
    .getByRole("heading", { level: 3, name: "Apple iPhone 17 Pro Max" })
    .waitFor();
  await assertTargetSize(
    page.getByRole("button", { name: /Decrease quantity/ }),
    "Cart decrease",
  );
  await assertTargetSize(
    page.getByRole("button", { name: /Increase quantity/ }),
    "Cart increase",
  );
  await assertTargetSize(
    page.getByRole("button", { name: /Remove Apple iPhone 17 Pro Max/ }),
    "Cart remove",
  );
  await assertTargetSize(
    page.getByRole("button", { name: "Close" }),
    "Cart close",
  );
  const cartFocusable = cartDialog.locator(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  const firstCartControl = cartFocusable.first();
  const lastCartControl = cartFocusable.last();
  await lastCartControl.focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await firstCartControl.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "Tab from the final cart control must wrap to the first control.",
  );
  await firstCartControl.focus();
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await lastCartControl.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "Shift+Tab from the first cart control must wrap to the final control.",
  );
  auditResults.push(
    await assertNoSeriousAxeViolations(page, "cart-light-desktop"),
  );

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
  await waitForStableUi(page);
  await page.getByRole("heading", { level: 1, name: "Checkout" }).waitFor();
  await page.getByText("Apple iPhone 17 Pro Max", { exact: true }).waitFor();
  await page.getByLabel("Email").waitFor();
  await assertCheckoutReviewLayout(page, "desktop", 1);
  await assertTargetSize(
    page.getByRole("button", {
      name: "Remove Apple iPhone 17 Pro Max from order",
    }),
    "Checkout remove",
  );
  auditResults.push(
    await assertNoSeriousAxeViolations(page, "checkout-light-desktop"),
  );
  await page.screenshot({
    path: resolve(outputDir, "checkout-light-desktop.png"),
    fullPage: true,
  });

  await page.getByLabel("Promo code").fill("NOTVALID");
  await page.getByRole("button", { name: "Apply" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Promo code is invalid or expired." })
    .waitFor();
  assert.equal(
    await page.getByLabel("Promo code").getAttribute("aria-invalid"),
    "true",
    "Invalid promo feedback must be programmatically connected to the input.",
  );
  auditResults.push(
    await assertNoSeriousAxeViolations(page, "checkout-error-light-desktop"),
  );
  await desktop.close();

  const invalidState = await browser.newContext({
    viewport: { width: 1024, height: 900 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  await installAppState(invalidState, "light", {
    ...cartItem,
    id: "accessibility-invalid-cart-item",
    edmTemplateId: null,
  });
  await mockExternalServices(invalidState);
  const invalidPage = await invalidState.newPage();
  await invalidPage.goto(origin);
  await waitForStableUi(invalidPage);
  await invalidPage.getByRole("button", { name: "Open cart, 2 items" }).click();
  const invalidCartCheckout = invalidPage.getByRole("button", {
    name: "Checkout",
  });
  assert.equal(
    await invalidCartCheckout.isDisabled(),
    true,
    "Invalid cart checkout must be disabled.",
  );
  assert.equal(
    await invalidCartCheckout.getAttribute("aria-describedby"),
    "cart-checkout-help",
    "Disabled cart checkout must reference its explanation.",
  );
  await invalidPage
    .getByText(
      "Checkout becomes available after every design preview finishes saving.",
    )
    .waitFor();
  auditResults.push(
    await assertNoSeriousAxeViolations(
      invalidPage,
      "invalid-cart-light-desktop",
    ),
  );

  await invalidPage.goto(`${origin}/checkout`);
  await waitForStableUi(invalidPage);
  const invalidPayment = invalidPage.getByRole("button", {
    name: /Continue to Stripe/,
  });
  assert.equal(
    await invalidPayment.isDisabled(),
    true,
    "Invalid checkout payment must be disabled.",
  );
  assert.equal(
    await invalidPayment.getAttribute("aria-describedby"),
    "checkout-payment-help checkout-stripe-help checkout-legal-copy",
    "Disabled payment must reference its explanation and Stripe/legal context.",
  );
  await invalidPage
    .getByText(
      "Checkout becomes available after every design preview finishes saving.",
    )
    .waitFor();
  auditResults.push(
    await assertNoSeriousAxeViolations(
      invalidPage,
      "invalid-checkout-light-desktop",
    ),
  );
  await invalidState.close();

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
  await waitForImage(
    mobilePage.locator("picture img").first(),
    "Mobile hero image",
  );
  await assertNoHorizontalOverflow(mobilePage, "Mobile home");
  await assertTargetSize(
    mobilePage.getByRole("link", { name: "Snapcase", exact: true }),
    "Mobile home logo",
  );
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
  auditResults.push(
    await assertNoSeriousAxeViolations(mobilePage, "home-dark-mobile"),
  );
  await mobilePage.screenshot({
    path: resolve(outputDir, "home-dark-mobile.png"),
    fullPage: true,
  });

  await mobilePage.goto(`${origin}/catalog`);
  await waitForStableUi(mobilePage);
  await assertNoHorizontalOverflow(mobilePage, "Mobile catalog");
  auditResults.push(
    await assertNoSeriousAxeViolations(mobilePage, "catalog-dark-mobile"),
  );
  await mobilePage.screenshot({
    path: resolve(outputDir, "catalog-dark-mobile.png"),
    fullPage: true,
  });

  await mobilePage.getByRole("button", { name: "Open cart, 2 items" }).click();
  await mobilePage
    .getByRole("dialog", { name: "Your Cart (2 items)" })
    .waitFor();
  await assertTargetSize(
    mobilePage.getByRole("button", { name: /Decrease quantity/ }),
    "Mobile cart decrease",
  );
  await assertTargetSize(
    mobilePage.getByRole("button", { name: /Increase quantity/ }),
    "Mobile cart increase",
  );
  await assertTargetSize(
    mobilePage.getByRole("button", { name: /Remove Apple iPhone 17 Pro Max/ }),
    "Mobile cart remove",
  );
  await assertTargetSize(
    mobilePage.getByRole("button", { name: "Checkout" }),
    "Mobile cart checkout",
  );
  await assertTargetSize(
    mobilePage.getByRole("button", { name: "Close" }),
    "Mobile cart close",
  );
  await assertNoHorizontalOverflow(mobilePage, "Mobile cart");
  auditResults.push(
    await assertNoSeriousAxeViolations(mobilePage, "cart-dark-mobile"),
  );
  await mobilePage.screenshot({
    path: resolve(outputDir, "cart-dark-mobile.png"),
    fullPage: false,
  });

  await mobilePage.getByRole("button", { name: "Checkout" }).click();
  await mobilePage.waitForURL(`${origin}/checkout`);
  await waitForStableUi(mobilePage);
  await mobilePage
    .getByRole("heading", { level: 1, name: "Checkout" })
    .waitFor();
  await assertCheckoutReviewLayout(mobilePage, "stacked");
  await assertNoHorizontalOverflow(mobilePage, "Mobile checkout");
  await assertTargetSize(
    mobilePage.getByRole("button", {
      name: "Remove Apple iPhone 17 Pro Max from order",
    }),
    "Mobile checkout remove",
  );
  await assertTargetSize(
    mobilePage.getByRole("button", { name: /Continue to Stripe/ }),
    "Mobile checkout payment",
  );
  const promoTrigger = mobilePage.getByRole("button", {
    name: "Add a promo code",
  });
  await promoTrigger.focus();
  await mobilePage.keyboard.press("Enter");
  await mobilePage.getByLabel("Promo code").fill("SAVE5");
  await mobilePage.getByRole("button", { name: "Apply" }).click();
  await mobilePage.getByText("Applied SAVE5", { exact: true }).waitFor();
  await mobilePage.getByText("$59.97 USD", { exact: true }).waitFor();
  await mobilePage.getByRole("button", { name: "Remove", exact: true }).focus();
  await mobilePage.keyboard.press("Tab");
  assert.equal(
    await mobilePage
      .getByLabel("Email")
      .evaluate((element) => element === document.activeElement),
    true,
    "Promo controls must not trap focus before the checkout form.",
  );
  auditResults.push(
    await assertNoSeriousAxeViolations(mobilePage, "checkout-dark-mobile"),
  );
  await mobilePage.screenshot({
    path: resolve(outputDir, "checkout-dark-mobile.png"),
    fullPage: true,
  });

  await mobilePage.getByRole("link", { name: "Terms", exact: true }).focus();
  await mobilePage.keyboard.press("Enter");
  await mobilePage.waitForURL(`${origin}/terms`);
  await mobilePage.goBack();
  await mobilePage.waitForURL(`${origin}/checkout`);
  await mobilePage.getByText("2 items", { exact: true }).waitFor();
  await mobilePage.goForward();
  await mobilePage.waitForURL(`${origin}/terms`);
  await mobilePage.goBack();
  await mobilePage.waitForURL(`${origin}/checkout`);
  await mobilePage.getByText("2 items", { exact: true }).waitFor();
  await mobile.close();

  const checkoutEvidenceScenarios = [
    {
      name: "checkout-light-mobile",
      viewport: { width: 390, height: 844 },
      theme: "light",
      layout: "stacked",
    },
    {
      name: "checkout-light-tablet",
      viewport: { width: 768, height: 1024 },
      theme: "light",
      layout: "stacked",
    },
    {
      name: "checkout-dark-tablet",
      viewport: { width: 768, height: 1024 },
      theme: "dark",
      layout: "stacked",
    },
    {
      name: "checkout-dark-desktop",
      viewport: { width: 1440, height: 1000 },
      theme: "dark",
      layout: "desktop",
    },
  ];

  for (const scenario of checkoutEvidenceScenarios) {
    const evidenceContext = await browser.newContext({
      viewport: scenario.viewport,
      reducedMotion: "reduce",
      colorScheme: scenario.theme,
    });
    await installAppState(evidenceContext, scenario.theme);
    await mockExternalServices(evidenceContext);
    const evidencePage = await evidenceContext.newPage();
    await evidencePage.goto(`${origin}/checkout`);
    await waitForStableUi(evidencePage);
    await evidencePage
      .getByRole("heading", { level: 1, name: "Checkout" })
      .waitFor();
    await assertCheckoutReviewLayout(evidencePage, scenario.layout);
    await assertNoHorizontalOverflow(evidencePage, scenario.name);
    auditResults.push(
      await assertNoSeriousAxeViolations(evidencePage, scenario.name),
    );
    await evidencePage.screenshot({
      path: resolve(outputDir, `${scenario.name}.png`),
      fullPage: true,
    });
    await evidenceContext.close();
  }

  const quantityOneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  await installAppState(quantityOneContext, "light", {
    ...cartItem,
    id: "quantity-one-cart-item",
    quantity: 1,
  });
  await mockExternalServices(quantityOneContext);
  const quantityOnePage = await quantityOneContext.newPage();
  await quantityOnePage.goto(`${origin}/checkout`);
  await waitForStableUi(quantityOnePage);
  await quantityOnePage.getByText("1 item", { exact: true }).waitFor();
  await quantityOnePage.getByText("Quantity 1", { exact: true }).waitFor();
  await quantityOnePage
    .getByText("Line total $29.99", { exact: true })
    .waitFor();
  await quantityOnePage.getByText("$34.98 USD", { exact: true }).waitFor();
  await quantityOneContext.close();

  const declinedCheckoutContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  await installAppState(declinedCheckoutContext, "light", cartItem, "granted");
  await mockExternalServices(declinedCheckoutContext);
  const declinedCheckoutPage = await declinedCheckoutContext.newPage();
  await declinedCheckoutPage.goto(`${origin}/checkout`);
  await waitForStableUi(declinedCheckoutPage);
  await declinedCheckoutPage.evaluate(() => {
    window.__checkoutAnalyticsEvents = [];
    const existingGtag = window.gtag;
    window.gtag = (command, ...args) => {
      if (command === "get") {
        const callback = args.at(-1);
        if (typeof callback === "function") callback("123.456");
        return;
      }
      if (command === "event") {
        window.__checkoutAnalyticsEvents.push({
          name: args[0],
          params: args[1],
        });
      }
      existingGtag?.(command, ...args);
    };
  });
  await declinedCheckoutPage.getByLabel("Email").fill("shopper@example.com");
  await declinedCheckoutPage
    .getByRole("button", { name: /Continue to Stripe/ })
    .click();
  await declinedCheckoutPage
    .getByText("Checkout is temporarily unavailable.", { exact: true })
    .waitFor();
  assert.equal(
    declinedCheckoutPage.url(),
    `${origin}/checkout`,
    "A declined Checkout creation must keep the shopper on checkout.",
  );
  const beginCheckoutEvents = await declinedCheckoutPage.evaluate(() =>
    window.__checkoutAnalyticsEvents.filter(
      (event) => event.name === "begin_checkout",
    ),
  );
  assert.equal(
    beginCheckoutEvents.length,
    1,
    "One checkout attempt must emit begin_checkout exactly once.",
  );
  assert.deepEqual(beginCheckoutEvents[0].params, {
    value: 59.98,
    currency: "USD",
    shipping: 4.99,
    items: [
      {
        item_id: "iphone-17-pro-max",
        item_name: "Apple iPhone 17 Pro Max Custom Case",
        item_brand: "Apple",
        item_category: "Custom Phone Case",
        item_variant: "iPhone 17 Pro Max",
        price: 29.99,
        quantity: 2,
        discount: 0,
      },
    ],
    analytics_contract_version: "1.0.0",
  });
  await declinedCheckoutContext.close();

  const emptyCartContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  await emptyCartContext.addInitScript(
    ({ expectedOrigin }) => {
      if (window.location.origin !== expectedOrigin) return;
      window.localStorage.setItem("theme", "light");
      window.localStorage.setItem("snapcase_analytics_consent_v1", "denied");
      window.localStorage.removeItem("snapcase_cart_v1");
    },
    { expectedOrigin: origin },
  );
  await mockExternalServices(emptyCartContext);
  const emptyCartPage = await emptyCartContext.newPage();
  await emptyCartPage.goto(`${origin}/checkout`);
  await waitForStableUi(emptyCartPage);
  await emptyCartPage
    .getByText("Your cart is empty", { exact: true })
    .waitFor();
  await emptyCartPage.getByRole("button", { name: "Browse Cases" }).waitFor();
  await emptyCartContext.close();
  const missingSessionContext = await browser.newContext({
    viewport: { width: 1024, height: 800 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  await installAppState(missingSessionContext, "light");
  const missingSessionPage = await missingSessionContext.newPage();
  await missingSessionPage.goto(`${origin}/order-success`);
  await waitForStableUi(missingSessionPage);
  await missingSessionPage
    .getByRole("heading", { level: 1, name: "We can’t verify this return page" })
    .waitFor();
  await missingSessionPage.getByRole("link", { name: "View My Orders" }).waitFor();
  await missingSessionPage.getByRole("link", { name: "Contact support" }).waitFor();
  await missingSessionPage.getByRole("link", { name: "Browse cases" }).waitFor();
  assert.equal(
    await missingSessionPage.getByRole("button", { name: "Retry verification" }).count(),
    0,
    "A missing secure return reference must not make a verification request available.",
  );
  auditResults.push(
    await assertNoSeriousAxeViolations(
      missingSessionPage,
      "order-verification-missing-session-desktop",
    ),
  );
  await missingSessionContext.close();

  const verificationDesktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  await verificationDesktop.grantPermissions(
    ["clipboard-read", "clipboard-write"],
    { origin },
  );
  await installVerificationState(verificationDesktop, "light");
  const getVerificationCalls = await mockVerificationService(
    verificationDesktop,
    [
      {
        status: 503,
        body: {
          error: "Unable to verify payment.",
          code: "verification_unavailable",
          retryable: true,
          supportReference: "SC-111111111111",
        },
      },
      {
        delay: 350,
        body: {
          success: true,
          supportReference: "SC-111111111111",
          order: {
            id: "11111111-1111-4111-8111-111111111111",
            items: [{ quantity: 2 }, { quantity: 1 }],
            total: 94.97,
            status: "paid",
          },
        },
      },
      {
        body: {
          success: true,
          supportReference: "SC-111111111111",
          order: {
            id: "11111111-1111-4111-8111-111111111111",
            items: [{ quantity: 2 }, { quantity: 1 }],
            total: 94.97,
            status: "paid",
          },
        },
      },
    ],
  );
  const verificationPage = await verificationDesktop.newPage();
  await verificationPage.goto(
    `${origin}/order-success?session_id=test-session-existing`,
  );
  const retryableHeading = verificationPage.getByRole("heading", {
    level: 1,
    name: "We’re still confirming your order",
  });
  await retryableHeading.waitFor();
  assert.equal(
    await retryableHeading.evaluate((heading) =>
      document.activeElement === heading
    ),
    true,
    "The retryable result heading should receive focus after verification.",
  );
  assert.equal(
    getVerificationCalls(),
    1,
    "Initial verification should make exactly one existing-session request.",
  );
  await verificationPage
    .getByRole("button", { name: "Open cart, 2 items" })
    .waitFor();
  await verificationPage
    .getByText("SC-111111111111", { exact: true })
    .waitFor();
  const retryVerification = verificationPage.getByRole("button", {
    name: "Retry verification",
  });
  await assertTargetSize(retryVerification, "Order verification retry");
  await assertFocusIndicator(
    verificationPage,
    retryVerification,
    "Order verification retry",
  );
  auditResults.push(
    await assertNoSeriousAxeViolations(
      verificationPage,
      "order-verification-retryable-desktop",
    ),
  );
  await verificationPage.screenshot({
    path: resolve(outputDir, "order-verification-retryable-desktop.png"),
    fullPage: true,
  });

  await retryVerification.evaluate((button) => {
    button.click();
    button.click();
  });
  await verificationPage
    .getByRole("button", { name: "Checking again…" })
    .waitFor();
  assert.equal(
    await verificationPage.getByRole("button", { name: "Checking again…" }).isDisabled(),
    true,
    "Retry must be disabled while verification is active.",
  );
  const verifiedHeading = verificationPage.getByRole("heading", {
    level: 1,
    name: "Thank you for your order!",
  });
  await verifiedHeading.waitFor();
  assert.equal(
    await verifiedHeading.evaluate((heading) =>
      document.activeElement === heading
    ),
    true,
    "The verified result heading should receive focus after retry.",
  );
  const orderDetailsSurface = verificationPage
    .getByRole("heading", { level: 2, name: "Order details" })
    .locator("xpath=..");
  await assertFullyOpaqueFrames(
    verificationPage,
    [verifiedHeading.locator("xpath=.."), orderDetailsSurface],
    "Order verification success surfaces",
  );
  assert.equal(
    getVerificationCalls(),
    2,
    "Repeated retry clicks must coalesce into one verification request.",
  );
  await verificationPage.getByText("3 cases", { exact: true }).waitFor();
  await verificationPage
    .getByRole("button", { name: "Open cart, empty" })
    .waitFor();
  auditResults.push(
    await assertNoSeriousAxeViolations(
      verificationPage,
      "order-verification-success-desktop",
    ),
  );
  await verificationPage.screenshot({
    path: resolve(outputDir, "order-verification-success-desktop.png"),
    fullPage: true,
  });

  const analyticsBeforeRefresh = await verificationPage.evaluate(() => {
    const events = JSON.parse(
      window.sessionStorage.getItem("snapcase_a11y_analytics_events") ?? "[]",
    );
    return events.filter(
      (entry) => entry[0] === "event" && entry[1] === "order_verification",
    ).length;
  });
  assert.equal(
    analyticsBeforeRefresh,
    2,
    "Retryable and verified outcomes should each be tracked once.",
  );

  await verificationPage.reload();
  await verificationPage
    .getByRole("heading", { level: 1, name: "Thank you for your order!" })
    .waitFor();
  assert.equal(
    getVerificationCalls(),
    3,
    "A refresh may safely re-check the existing session.",
  );
  const analyticsAfterRefresh = await verificationPage.evaluate(() => {
    const events = JSON.parse(
      window.sessionStorage.getItem("snapcase_a11y_analytics_events") ?? "[]",
    );
    return {
      verification: events.filter(
        (entry) => entry[0] === "event" && entry[1] === "order_verification",
      ).length,
      purchase: events.filter(
        (entry) => entry[0] === "event" && entry[1] === "purchase",
      ).length,
    };
  });
  assert.deepEqual(
    analyticsAfterRefresh,
    { verification: 2, purchase: 0 },
    "Refresh must not duplicate verification outcomes or emit browser purchase events.",
  );
  await verificationDesktop.close();

  const verificationMobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    colorScheme: "dark",
  });
  await verificationMobile.grantPermissions(
    ["clipboard-read", "clipboard-write"],
    { origin },
  );
  await installVerificationState(verificationMobile, "dark");
  await mockVerificationService(verificationMobile, [{
    body: {
      success: false,
      retryable: false,
      code: "order_requires_review",
      supportReference: "SC-222222222222",
      order: {
        id: "22222222-2222-4222-8222-222222222222",
        items: [{ quantity: 2 }],
        total: 59.98,
        status: "payment_review",
      },
    },
  }]);
  const verificationMobilePage = await verificationMobile.newPage();
  await verificationMobilePage.goto(
    `${origin}/order-success?session_id=test-session-review`,
  );
  const supportReviewHeading = verificationMobilePage.getByRole("heading", {
    level: 1,
    name: "Your order needs support review",
  });
  await supportReviewHeading.waitFor();
  assert.equal(
    await supportReviewHeading.evaluate((heading) =>
      document.activeElement === heading
    ),
    true,
    "The support-review result heading should receive focus.",
  );
  await assertNoHorizontalOverflow(
    verificationMobilePage,
    "Mobile order verification review",
  );
  const copyReference = verificationMobilePage.getByRole("button", {
    name: "Copy support reference SC-222222222222",
  });
  await assertTargetSize(copyReference, "Mobile support reference copy");
  await copyReference.focus();
  await verificationMobilePage.keyboard.press("Enter");
  await verificationMobilePage.getByText("Support reference copied.").waitFor();
  await assertTargetSize(
    verificationMobilePage.getByRole("link", { name: "View My Orders" }),
    "Mobile verification orders",
  );
  await assertTargetSize(
    verificationMobilePage.getByRole("link", { name: "Contact support" }),
    "Mobile verification contact",
  );
  await assertTargetSize(
    verificationMobilePage.getByRole("link", { name: "Browse cases" }),
    "Mobile verification browse",
  );
  assert.equal(
    await verificationMobilePage
      .getByRole("button", { name: "Retry verification" })
      .count(),
    0,
    "A confirmed support-review state must not offer blind retry.",
  );
  auditResults.push(
    await assertNoSeriousAxeViolations(
      verificationMobilePage,
      "order-verification-review-dark-mobile",
    ),
  );
  await verificationMobilePage.screenshot({
    path: resolve(outputDir, "order-verification-review-dark-mobile.png"),
    fullPage: true,
  });
  await verificationMobile.close();
  console.log(
    JSON.stringify(
      {
        result: "Accessibility smoke passed",
        audited: auditResults,
        evidence: [
          "output/playwright/home-light-desktop.png",
          "output/playwright/preview-light-desktop.png",
          "output/playwright/checkout-light-desktop.png",
          "output/playwright/home-dark-mobile.png",
          "output/playwright/catalog-dark-mobile.png",
          "output/playwright/cart-dark-mobile.png",
          "output/playwright/checkout-dark-mobile.png",
          "output/playwright/checkout-light-mobile.png",
          "output/playwright/checkout-light-tablet.png",
          "output/playwright/checkout-dark-tablet.png",
          "output/playwright/checkout-dark-desktop.png",
          "output/playwright/order-verification-retryable-desktop.png",
          "output/playwright/order-verification-success-desktop.png",
          "output/playwright/order-verification-review-dark-mobile.png",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
