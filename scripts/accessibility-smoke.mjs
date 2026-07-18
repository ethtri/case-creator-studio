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

const installAnalyticsRecorder = async (
  context,
  analyticsConsent = "unset",
) => {
  let scriptRequests = 0;

  await context.addInitScript(
    ({ expectedOrigin, analyticsConsent }) => {
      if (window.location.origin !== expectedOrigin) return;

      window.localStorage.setItem("theme", "light");
      if (analyticsConsent === "unset") {
        window.localStorage.removeItem("snapcase_analytics_consent_v1");
      } else {
        window.localStorage.setItem(
          "snapcase_analytics_consent_v1",
          analyticsConsent,
        );
      }
      window.__snapcaseAnalyticsCommands = [];
      window.gtag = (...args) => {
        window.__snapcaseAnalyticsCommands.push(args);
      };
    },
    { expectedOrigin: origin, analyticsConsent },
  );

  await context.route(
    "https://www.googletagmanager.com/gtag/js**",
    async (route) => {
      scriptRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "",
      });
    },
  );

  return {
    getScriptRequests: () => scriptRequests,
  };
};

const getAnalyticsCommands = (page) =>
  page.evaluate(() => window.__snapcaseAnalyticsCommands ?? []);

const getAnalyticsEvents = async (page, eventName) =>
  (await getAnalyticsCommands(page))
    .filter(
      (command) =>
        command[0] === "event" &&
        (eventName === undefined || command[1] === eventName),
    )
    .map((command) => ({
      name: command[1],
      payload: command[2],
    }));

const clearInteractionPresentation = async (page) => {
  await page.mouse.move(1, 1);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.evaluate(
    () => new Promise((resolveFrame) => requestAnimationFrame(resolveFrame)),
  );
};

const waitForAnalyticsEvents = async (page, eventName, count) => {
  try {
    await page.waitForFunction(
      ({ eventName, count }) =>
        (window.__snapcaseAnalyticsCommands ?? []).filter(
          (command) => command[0] === "event" && command[1] === eventName,
        ).length >= count,
      { eventName, count },
    );
  } catch (error) {
    const commands = await getAnalyticsCommands(page);
    throw new Error(
      `Timed out waiting for ${count} ${eventName} event(s). Commands: ${JSON.stringify(commands)}`,
      { cause: error },
    );
  }
};

const assertCompleteAnalyticsItems = (event, expectedCount, label) => {
  assert.equal(event.payload.currency, "USD", `${label} must use USD.`);
  assert.equal(
    event.payload.items?.length,
    expectedCount,
    `${label} must include every visible catalog item.`,
  );
  for (const item of event.payload.items) {
    assert.deepEqual(
      Object.keys(item).sort(),
      [
        "discount",
        "item_brand",
        "item_category",
        "item_id",
        "item_name",
        "item_variant",
        "price",
        "quantity",
      ],
      `${label} contains an incomplete ecommerce item.`,
    );
  }
  assert.doesNotMatch(
    JSON.stringify(event.payload),
    /artwork|preview_url|customer_|shipping_address|designId|session_id/i,
    `${label} contains a blocked analytics field.`,
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

const getFrameStyle = (locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      color: style.color,
      transform: style.transform,
    };
  });

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
    async (image) => {
      const loadedDimensions = await new Promise((resolveImage, rejectImage) => {
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
      });
      await image.decode();
      await new Promise((resolveFrame) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(resolveFrame),
        ),
      );
      return loadedDimensions;
    },
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
  const homeHero = page.locator('[data-home-design-bench="true"]');
  const homeHeroHeading = homeHero.getByRole("heading", {
    level: 1,
    name: "Print your story.",
  });
  const lightHeroSignature = await homeHero.evaluate((element) => {
    const style = getComputedStyle(element);
    const headingStyle = getComputedStyle(element.querySelector("h1"));
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      headingColor: headingStyle.color,
    };
  });
  const desktopHeroArtwork = await homeHero
    .locator('[data-hero-artwork="true"]')
    .evaluate((image) => ({
      currentSrc: image.currentSrc,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      opacity: Number.parseFloat(getComputedStyle(image).opacity),
    }));
  assert.match(
    desktopHeroArtwork.currentSrc,
    /hero-wide-(?:960|1536)\.(?:avif|webp|jpg)/,
    "Desktop hero must render a wide responsive artwork candidate.",
  );
  assert.ok(
    desktopHeroArtwork.naturalWidth >= 900 &&
      desktopHeroArtwork.naturalHeight >= 600,
    "Desktop hero artwork must decode at a useful intrinsic size.",
  );
  assert.ok(
    desktopHeroArtwork.opacity >= 0.85,
    "Desktop hero artwork must remain visibly composited.",
  );
  const desktopHeroScrim = await homeHero
    .locator('[data-hero-desktop-scrim="true"]')
    .evaluate((element) => ({
      display: getComputedStyle(element).display,
      backgroundImage: getComputedStyle(element).backgroundImage,
    }));
  assert.equal(desktopHeroScrim.display, "block");
  assert.match(
    desktopHeroScrim.backgroundImage,
    /rgba\(8, 5, 15, 0\.02\) 100%\)/,
    "Desktop hero scrim must preserve the low-alpha artwork reveal on the right.",
  );
  assert.equal(
    await homeHero.getAttribute("data-hero-theme"),
    "fixed-dark",
    "The home hero must declare its theme-independent dark surface.",
  );
  await assertTextContrast(homeHeroHeading, "Home hero heading");
  await homeHero
    .getByText("Cases $29.99 USD", { exact: true })
    .waitFor();
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
    page.getByRole("link", { name: "Choose your phone", exact: true }),
    "Home primary CTA",
  );
  const homePrimaryCta = page.getByRole("link", {
    name: "Choose your phone",
    exact: true,
  });
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
  await clearInteractionPresentation(page);
  await page.screenshot({
    path: resolve(outputDir, "home-light-desktop.png"),
    fullPage: false,
  });

  const chooseYourPhone = page.getByRole("link", {
    name: "Choose your phone",
    exact: true,
  });
  await chooseYourPhone.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(`${origin}/catalog`);
  await waitForStableUi(page);
  await page
    .getByRole("heading", { level: 1, name: "Choose Your Phone" })
    .waitFor();
  await page.getByRole("textbox", { name: "Search phone models" }).waitFor();
  const catalogResultCount = page.locator(
    '[data-catalog-result-count="true"]',
  );
  await catalogResultCount
    .getByText("18 phone models shown.", { exact: true })
    .waitFor();
  assert.equal(
    await catalogResultCount.getAttribute("role"),
    "status",
    "The visible result count must be the polite status region.",
  );

  const firstCatalogCard = page.locator(
    '[data-catalog-card="iphone-17-pro-max"]',
  );
  assert.equal(
    await firstCatalogCard.locator("a").count(),
    2,
    "Each catalog card must expose exactly two links.",
  );
  assert.equal(
    await firstCatalogCard.locator("a a").count(),
    0,
    "Catalog links must never be nested.",
  );
  assert.equal(
    await firstCatalogCard.locator(
      ':scope > .pointer-events-none.absolute.inset-0',
    ).count(),
    0,
    "Catalog cards must not include a selected-ring overlay.",
  );
  assert.equal(
    await firstCatalogCard.getAttribute("aria-selected"),
    null,
    "Catalog articles must not imply a persistent selected state.",
  );
  const defaultCatalogFrame = await getFrameStyle(firstCatalogCard);
  assert.equal(
    await firstCatalogCard.evaluate((element) =>
      element.matches(":focus-within"),
    ),
    false,
    "Default catalog cards must not begin in a focus or selected state.",
  );
  await firstCatalogCard.hover();
  await page.waitForTimeout(30);
  const hoverCatalogFrame = await getFrameStyle(firstCatalogCard);
  assert.notEqual(
    hoverCatalogFrame.borderColor,
    defaultCatalogFrame.borderColor,
    "Catalog hover must change the card border.",
  );

  const allFilter = page.getByRole("button", { name: "All", exact: true });
  const appleFilter = page.getByRole("button", {
    name: "Apple",
    exact: true,
  });
  const samsungFilter = page.getByRole("button", {
    name: "Samsung",
    exact: true,
  });
  assert.equal(await allFilter.getAttribute("aria-pressed"), "true");
  await appleFilter.focus();
  await page.keyboard.press("Enter");
  await catalogResultCount
    .getByText("15 phone models shown.", { exact: true })
    .waitFor();
  assert.equal(await appleFilter.getAttribute("aria-pressed"), "true");
  await samsungFilter.focus();
  await page.keyboard.press("Enter");
  await catalogResultCount
    .getByText("3 phone models shown.", { exact: true })
    .waitFor();
  assert.equal(await samsungFilter.getAttribute("aria-pressed"), "true");
  const catalogSearch = page.getByRole("textbox", {
    name: "Search phone models",
  });
  await catalogSearch.fill("  S24  ");
  await catalogResultCount
    .getByText("3 phone models shown.", { exact: true })
    .waitFor();
  await catalogSearch.fill("no matching model");
  await catalogResultCount
    .getByText("0 phone models shown.", { exact: true })
    .waitFor();
  await page
    .getByText(
      "No phone models match your search. Try another model or brand.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page.locator("[data-catalog-card]").count(),
    0,
    "An empty filter state must not leave stale model cards.",
  );
  auditResults.push(
    await assertNoSeriousAxeViolations(page, "catalog-empty-light-desktop"),
  );
  await page.screenshot({
    path: resolve(outputDir, "catalog-empty-light-desktop.png"),
    fullPage: true,
  });
  await catalogSearch.fill("");
  await allFilter.focus();
  await page.keyboard.press("Enter");
  await catalogResultCount
    .getByText("18 phone models shown.", { exact: true })
    .waitFor();
  assert.equal(await allFilter.getAttribute("aria-pressed"), "true");
  await clearInteractionPresentation(page);
  auditResults.push(
    await assertNoSeriousAxeViolations(page, "catalog-light-desktop"),
  );
  await page.screenshot({
    path: resolve(outputDir, "catalog-light-desktop.png"),
    fullPage: true,
  });

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
    name: "Choose model for iPhone 17 Pro Max",
  });
  await assertTargetSize(modelDetailsLink, "Catalog model details");
  await assertTargetSize(modelDesignLink, "Catalog model design");
  const detailsDefaultStyle = await getFrameStyle(modelDetailsLink);
  await modelDetailsLink.hover();
  await page.waitForTimeout(10);
  const detailsHoverStyle = await getFrameStyle(modelDetailsLink);
  assert.notEqual(
    detailsHoverStyle.backgroundColor,
    detailsDefaultStyle.backgroundColor,
    "Catalog details hover must change the action background.",
  );
  const detailsBox = await modelDetailsLink.boundingBox();
  assert.ok(detailsBox, "Catalog details link must have a visible box.");
  await page.mouse.move(
    detailsBox.x + detailsBox.width / 2,
    detailsBox.y + detailsBox.height / 2,
  );
  await page.mouse.down();
  assert.equal(
    await modelDetailsLink.evaluate((element) => element.matches(":active")),
    true,
    "Catalog details link must enter the active pseudo-class while pressed.",
  );
  assert.equal(
    await modelDetailsLink.evaluate((element) => element.matches(":hover")),
    true,
    "Catalog details link must remain hovered while pressed.",
  );
  await page.waitForTimeout(10);
  const detailsActiveStyle = await getFrameStyle(modelDetailsLink);
  assert.notEqual(
    detailsActiveStyle.backgroundColor,
    detailsHoverStyle.backgroundColor,
    "Catalog details pressed background must be distinct from hover.",
  );
  assert.notEqual(
    detailsActiveStyle.color,
    detailsHoverStyle.color,
    "Catalog details pressed text must be distinct from hover.",
  );
  assert.equal(
    detailsActiveStyle.transform,
    "none",
    "Catalog details pressed feedback must not move the target.",
  );
  await page.mouse.move(0, 0);
  await page.mouse.up();

  const designDefaultStyle = await getFrameStyle(modelDesignLink);
  await modelDesignLink.hover();
  await page.waitForTimeout(10);
  const designHoverStyle = await getFrameStyle(modelDesignLink);
  assert.notEqual(
    designHoverStyle.backgroundColor,
    designDefaultStyle.backgroundColor,
    "Catalog model-action hover must change the background.",
  );
  const designBox = await modelDesignLink.boundingBox();
  assert.ok(designBox, "Catalog model action must have a visible box.");
  await page.mouse.move(
    designBox.x + designBox.width / 2,
    designBox.y + designBox.height / 2,
  );
  await page.mouse.down();
  assert.equal(
    await modelDesignLink.evaluate((element) => element.matches(":active")),
    true,
    "Catalog model action must enter the active pseudo-class while pressed.",
  );
  assert.equal(
    await modelDesignLink.evaluate((element) => element.matches(":hover")),
    true,
    "Catalog model action must remain hovered while pressed.",
  );
  await page.waitForTimeout(10);
  const designActiveStyle = await getFrameStyle(modelDesignLink);
  assert.notEqual(
    designActiveStyle.backgroundColor,
    designHoverStyle.backgroundColor,
    "Catalog model-action pressed background must be distinct from hover.",
  );
  assert.ok(
    designActiveStyle.transform === "none" ||
      designActiveStyle.transform === "matrix(1, 0, 0, 1, 0, 0)",
    "Catalog model pressed feedback must not move the target.",
  );
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await assertFocusIndicator(
    page,
    modelDetailsLink,
    "Catalog model details",
  );
  const focusCatalogFrame = await getFrameStyle(firstCatalogCard);
  assert.notEqual(
    focusCatalogFrame.borderColor,
    defaultCatalogFrame.borderColor,
    "Catalog focus-within must change the card border.",
  );
  await modelDetailsLink.evaluate((element) => element.blur());
  await page.waitForTimeout(30);
  const blurCatalogFrame = await getFrameStyle(firstCatalogCard);
  assert.equal(
    blurCatalogFrame.borderColor,
    defaultCatalogFrame.borderColor,
    "Catalog card border must return to default after blur.",
  );
  await modelDetailsLink.focus();
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
  await page.screenshot({
    path: resolve(outputDir, "product-offer-light-desktop.png"),
    fullPage: true,
  });

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
  const mobileHero = mobilePage.locator('[data-home-design-bench="true"]');
  const mobileHeroArtwork = await mobileHero
    .locator('[data-hero-artwork="true"]')
    .evaluate((image) => ({
      currentSrc: image.currentSrc,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      opacity: Number.parseFloat(getComputedStyle(image).opacity),
    }));
  assert.match(
    mobileHeroArtwork.currentSrc,
    /hero-narrow-(?:640|1024)\.(?:avif|webp|jpg)/,
    "Mobile hero must render a narrow responsive artwork candidate.",
  );
  assert.ok(
    mobileHeroArtwork.naturalWidth >= 390 &&
      mobileHeroArtwork.naturalHeight >= 390,
    "Mobile hero artwork must decode at a useful intrinsic size.",
  );
  assert.ok(
    mobileHeroArtwork.opacity >= 0.85,
    "Mobile hero artwork must remain visibly composited.",
  );
  const mobileHeroScrim = await mobileHero
    .locator('[data-hero-mobile-scrim="true"]')
    .evaluate((element) => ({
      display: getComputedStyle(element).display,
      backgroundImage: getComputedStyle(element).backgroundImage,
    }));
  assert.equal(mobileHeroScrim.display, "block");
  assert.match(
    mobileHeroScrim.backgroundImage,
    /rgba\(8, 5, 15, 0\.15\)/,
    "Mobile hero scrim must retain its translucent artwork reveal.",
  );
  const darkMobileHeroSignature = await mobileHero.evaluate((element) => {
    const style = getComputedStyle(element);
    const headingStyle = getComputedStyle(element.querySelector("h1"));
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      headingColor: headingStyle.color,
    };
  });
  assert.deepEqual(
    darkMobileHeroSignature,
    lightHeroSignature,
    "The design-bench hero colors must remain fixed across themes.",
  );
  await mobileHero
    .getByText("Cases $29.99 USD", { exact: true })
    .waitFor();
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
    mobilePage.getByRole("link", {
      name: "Choose your phone",
      exact: true,
    }),
    "Mobile dark primary CTA",
  );
  auditResults.push(
    await assertNoSeriousAxeViolations(mobilePage, "home-dark-mobile"),
  );
  await clearInteractionPresentation(mobilePage);
  await mobilePage.screenshot({
    path: resolve(outputDir, "home-dark-mobile.png"),
    fullPage: false,
  });

  await mobilePage.goto(`${origin}/catalog`);
  await waitForStableUi(mobilePage);
  await mobilePage
    .locator('[data-catalog-result-count="true"]')
    .getByText("18 phone models shown.", { exact: true })
    .waitFor();
  await assertTargetSize(
    mobilePage.getByRole("link", {
      name: "Choose model for iPhone 17 Pro Max",
    }),
    "Mobile catalog model action",
  );
  await assertNoHorizontalOverflow(mobilePage, "Mobile catalog");
  auditResults.push(
    await assertNoSeriousAxeViolations(mobilePage, "catalog-dark-mobile"),
  );
  await mobilePage.screenshot({
    path: resolve(outputDir, "catalog-dark-mobile.png"),
    fullPage: true,
  });

  await mobilePage
    .getByRole("link", {
      name: "View details for iPhone 17 Pro Max",
    })
    .click();
  await mobilePage.waitForURL(/\/phone-cases\/iphone-17-pro-max/);
  await mobilePage
    .getByRole("heading", {
      level: 1,
      name: "Design your own iPhone 17 Pro Max phone case.",
    })
    .waitFor();
  await mobilePage
    .locator('[data-product-offer="true"]')
    .getByText("$29.99 USD", { exact: true })
    .waitFor();
  await assertNoHorizontalOverflow(mobilePage, "Mobile product offer");
  auditResults.push(
    await assertNoSeriousAxeViolations(
      mobilePage,
      "product-offer-dark-mobile",
    ),
  );
  await mobilePage.screenshot({
    path: resolve(outputDir, "product-offer-dark-mobile.png"),
    fullPage: true,
  });
  await mobilePage.goBack();
  await mobilePage.waitForURL(`${origin}/catalog`);
  await waitForStableUi(mobilePage);

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

  const entryEvidenceScenarios = [
    {
      name: "dark-desktop",
      viewport: { width: 1440, height: 1000 },
      theme: "dark",
    },
    {
      name: "light-mobile",
      viewport: { width: 390, height: 844 },
      theme: "light",
    },
    {
      name: "dark-tablet",
      viewport: { width: 768, height: 1024 },
      theme: "dark",
    },
  ];

  for (const scenario of entryEvidenceScenarios) {
    const entryContext = await browser.newContext({
      viewport: scenario.viewport,
      reducedMotion: "reduce",
      colorScheme: scenario.theme,
    });
    await installAppState(entryContext, scenario.theme);
    await mockExternalServices(entryContext);
    const entryPage = await entryContext.newPage();

    await entryPage.goto(origin);
    await waitForStableUi(entryPage);
    await waitForImage(
      entryPage.locator("picture img").first(),
      `${scenario.name} hero image`,
    );
    const scenarioHero = entryPage.locator(
      '[data-home-design-bench="true"]',
    );
    const scenarioHeroSignature = await scenarioHero.evaluate((element) => {
      const style = getComputedStyle(element);
      const headingStyle = getComputedStyle(element.querySelector("h1"));
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
        headingColor: headingStyle.color,
      };
    });
    assert.deepEqual(
      scenarioHeroSignature,
      lightHeroSignature,
      `${scenario.name} hero must keep the fixed design-bench palette.`,
    );
    await scenarioHero
      .getByRole("link", { name: "Choose your phone", exact: true })
      .waitFor();
    await scenarioHero
      .getByText("Cases $29.99 USD", { exact: true })
      .waitFor();
    await assertNoHorizontalOverflow(
      entryPage,
      `${scenario.name} home`,
    );
    auditResults.push(
      await assertNoSeriousAxeViolations(
        entryPage,
        `home-${scenario.name}`,
      ),
    );
    await clearInteractionPresentation(entryPage);
    await entryPage.screenshot({
      path: resolve(outputDir, `home-${scenario.name}.png`),
      fullPage: false,
    });

    await entryPage.goto(`${origin}/catalog`);
    await waitForStableUi(entryPage);
    await entryPage
      .locator('[data-catalog-result-count="true"]')
      .getByText("18 phone models shown.", { exact: true })
      .waitFor();
    const reducedMotionDuration = await entryPage
      .locator('[data-catalog-card="iphone-17-pro-max"]')
      .evaluate((element) =>
        getComputedStyle(element)
          .transitionDuration.split(",")
          .map((duration) =>
            duration.trim().endsWith("ms")
              ? Number.parseFloat(duration)
              : Number.parseFloat(duration) * 1000,
          ),
      );
    assert.ok(
      reducedMotionDuration.every((duration) => duration <= 1),
      `${scenario.name} catalog transitions must honor reduced motion.`,
    );
    await assertNoHorizontalOverflow(
      entryPage,
      `${scenario.name} catalog`,
    );
    await clearInteractionPresentation(entryPage);
    auditResults.push(
      await assertNoSeriousAxeViolations(
        entryPage,
        `catalog-${scenario.name}`,
      ),
    );
    await entryPage.screenshot({
      path: resolve(outputDir, `catalog-${scenario.name}.png`),
      fullPage: true,
    });
    await entryContext.close();
  }

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

  const homeAnalyticsContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  await installAnalyticsRecorder(homeAnalyticsContext, "granted");
  const homeAnalyticsPage = await homeAnalyticsContext.newPage();
  await homeAnalyticsPage.goto(origin);
  await homeAnalyticsPage
    .getByRole("link", { name: "Choose your phone", exact: true })
    .click();
  await homeAnalyticsPage.waitForURL(`${origin}/catalog`);
  await waitForAnalyticsEvents(
    homeAnalyticsPage,
    "primary_cta_click",
    1,
  );
  const homeCtaEvents = await getAnalyticsEvents(
    homeAnalyticsPage,
    "primary_cta_click",
  );
  assert.equal(
    homeCtaEvents.length,
    1,
    "The home primary CTA must fire exactly once.",
  );
  assert.deepEqual(
    {
      placement: homeCtaEvents[0].payload.placement,
      destination: homeCtaEvents[0].payload.destination,
      label: homeCtaEvents[0].payload.label,
    },
    {
      placement: "home_hero",
      destination: "/catalog",
      label: "Choose your phone",
    },
  );

  await homeAnalyticsPage.goBack();
  await homeAnalyticsPage.waitForURL(origin);
  await homeAnalyticsPage
    .locator('[data-home-starting-model="iphone-17-pro-max"]')
    .click();
  await homeAnalyticsPage.waitForURL(/\/design\/iphone-17-pro-max/);
  await waitForAnalyticsEvents(homeAnalyticsPage, "select_item", 1);
  const homeStartingSelections = (
    await getAnalyticsEvents(homeAnalyticsPage, "select_item")
  ).filter(
    (event) =>
      event.payload.item_list_id === "home_starting_models",
  );
  assert.equal(
    homeStartingSelections.length,
    1,
    "The home starting-model selection must fire exactly once.",
  );
  assert.deepEqual(
    {
      itemListName: homeStartingSelections[0].payload.item_list_name,
      placement: homeStartingSelections[0].payload.placement,
    },
    {
      itemListName: "Starting models",
      placement: "home_starting_models",
    },
  );
  assertCompleteAnalyticsItems(
    homeStartingSelections[0],
    1,
    "Home starting-model selection",
  );
  await homeAnalyticsContext.close();

  const catalogSelectionScenarios = [
    {
      actionName: "View details for iPhone 17 Pro Max",
      destination: /\/phone-cases\/iphone-17-pro-max/,
      placement: "catalog_view_details",
    },
    {
      actionName: "Choose model for iPhone 17 Pro Max",
      destination: /\/design\/iphone-17-pro-max/,
      placement: "catalog_start_design",
    },
  ];

  for (const scenario of catalogSelectionScenarios) {
    const selectionContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
      colorScheme: "light",
    });
    await mockExternalServices(selectionContext);
    await installAnalyticsRecorder(selectionContext, "granted");
    const selectionPage = await selectionContext.newPage();
    await selectionPage.goto(`${origin}/catalog`);
    await selectionPage
      .getByRole("heading", { level: 1, name: "Choose Your Phone" })
      .waitFor();
    await selectionPage
      .getByRole("link", { name: scenario.actionName })
      .click();
    await selectionPage.waitForURL(scenario.destination);
    await waitForAnalyticsEvents(selectionPage, "select_item", 1);
    await selectionPage.waitForTimeout(50);
    const selectionEvents = await getAnalyticsEvents(
      selectionPage,
      "select_item",
    );
    assert.equal(
      selectionEvents.length,
      1,
      `${scenario.placement} must emit exactly one selection event.`,
    );
    assert.deepEqual(
      {
        placement: selectionEvents[0].payload.placement,
        itemListId: selectionEvents[0].payload.item_list_id,
        currency: selectionEvents[0].payload.currency,
      },
      {
        placement: scenario.placement,
        itemListId: "phone_models",
        currency: "USD",
      },
      `${scenario.placement} must retain its exact catalog analytics context.`,
    );
    assertCompleteAnalyticsItems(
      selectionEvents[0],
      1,
      `${scenario.placement} selection`,
    );
    await selectionContext.close();
  }

  const lateGrantContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  const lateGrantRecorder = await installAnalyticsRecorder(
    lateGrantContext,
    "unset",
  );
  const lateGrantPage = await lateGrantContext.newPage();
  await lateGrantPage.goto(
    `${origin}/catalog/?utm_source=launch&foo=first`,
  );
  await lateGrantPage
    .getByRole("heading", { level: 1, name: "Choose Your Phone" })
    .waitFor();
  assert.equal(lateGrantRecorder.getScriptRequests(), 0);
  assert.equal((await getAnalyticsEvents(lateGrantPage)).length, 0);

  await lateGrantPage
    .getByRole("button", { name: "Allow analytics" })
    .click();
  await waitForAnalyticsEvents(lateGrantPage, "view_item_list", 1);
  assert.equal(lateGrantRecorder.getScriptRequests(), 1);
  const lateCatalogViews = await getAnalyticsEvents(
    lateGrantPage,
    "view_item_list",
  );
  assert.equal(lateCatalogViews.length, 1);
  assert.equal(lateCatalogViews[0].payload.item_list_id, "phone_models");
  assertCompleteAnalyticsItems(
    lateCatalogViews[0],
    18,
    "Late-grant catalog view",
  );

  await lateGrantPage.evaluate(async () => {
    const { setAnalyticsConsent } = await import("/src/lib/marketing.ts");
    setAnalyticsConsent("granted");
    setAnalyticsConsent("granted");
  });
  await lateGrantPage.waitForTimeout(50);
  assert.equal(
    (await getAnalyticsEvents(lateGrantPage, "view_item_list")).length,
    1,
    "Repeated grant updates must not duplicate the catalog view.",
  );

  await lateGrantPage.evaluate(() => {
    history.pushState({ rerender: 1 }, "", "/catalog?foo=second&utm_medium=email");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await lateGrantPage.waitForURL(/\/catalog\?foo=second/);
  await lateGrantPage.evaluate(() => {
    history.pushState({ rerender: 2 }, "", "/catalog/?foo=third&gclid=ignored");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await lateGrantPage.waitForURL(/\/catalog\/\?foo=third/);
  assert.equal(
    (await getAnalyticsEvents(lateGrantPage, "view_item_list")).length,
    1,
    "Query strings, trailing slashes, and new history keys must share one ecommerce view identity.",
  );

  const strictModeViewCount = await lateGrantPage.evaluate(async () => {
    const reactModule = await import("/@id/react");
    const React = reactModule.default ?? reactModule;
    const reactDomClientModule = await import("/@id/react-dom/client");
    const createRoot =
      reactDomClientModule.createRoot ??
      reactDomClientModule.default?.createRoot;
    const { trackMarketingViewOnce } = await import(
      "/src/lib/consent-aware-marketing-view.ts"
    );
    const Probe = () => {
      React.useEffect(() => {
        trackMarketingViewOnce({
          eventName: "view_item_list",
          normalizedRoute: "/catalog",
          contractId: "strict_mode_probe",
          payload: {
            currency: "USD",
            item_list_id: "strict_mode_probe",
            item_list_name: "Strict mode probe",
            items: [],
          },
        });
      }, []);
      return React.createElement("span", null, "Strict mode analytics probe");
    };
    const renderProbe = async () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      root.render(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(Probe),
        ),
      );
      await new Promise((resolveWait) => setTimeout(resolveWait, 75));
      root.unmount();
      host.remove();
    };

    await renderProbe();
    await renderProbe();
    return (window.__snapcaseAnalyticsCommands ?? []).filter(
      (command) =>
        command[0] === "event" &&
        command[1] === "view_item_list" &&
        command[2]?.item_list_id === "strict_mode_probe",
    ).length;
  });
  assert.equal(
    strictModeViewCount,
    1,
    "Strict Mode effect replay and a true remount must emit one view.",
  );

  const lateModelDetails = lateGrantPage.getByRole("link", {
    name: "View details for iPhone 17 Pro Max",
  });
  await lateModelDetails.click();
  await lateGrantPage.waitForURL(/\/phone-cases\/iphone-17-pro-max/);
  await waitForAnalyticsEvents(lateGrantPage, "view_item", 1);
  assert.equal(
    (await getAnalyticsEvents(lateGrantPage, "select_item")).length,
    1,
  );
  const lateProductViews = await getAnalyticsEvents(
    lateGrantPage,
    "view_item",
  );
  assert.equal(lateProductViews.length, 1);
  assertCompleteAnalyticsItems(
    lateProductViews[0],
    1,
    "Late-grant product view",
  );
  await lateGrantPage.screenshot({
    path: resolve(outputDir, "analytics-allow-product-desktop.png"),
    fullPage: true,
  });
  await lateGrantPage.goBack();
  await lateGrantPage
    .getByRole("heading", { level: 1, name: "Choose Your Phone" })
    .waitFor();
  await lateGrantPage.goForward();
  await lateGrantPage.waitForURL(/\/phone-cases\/iphone-17-pro-max/);
  assert.equal(
    (await getAnalyticsEvents(lateGrantPage, "view_item_list"))
      .filter((event) => event.payload.item_list_id === "phone_models")
      .length,
    1,
  );
  assert.equal(
    (await getAnalyticsEvents(lateGrantPage, "view_item")).length,
    1,
    "Back and forward must not duplicate product views.",
  );
  await lateGrantContext.close();

  const remountContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  await installAnalyticsRecorder(remountContext, "unset");
  const remountPage = await remountContext.newPage();
  await remountPage.goto(`${origin}/catalog`);
  await remountPage
    .getByRole("link", {
      name: "View details for iPhone 17 Pro Max",
    })
    .click();
  await remountPage.waitForURL(/\/phone-cases\/iphone-17-pro-max/);
  await remountPage.goBack();
  await remountPage
    .getByRole("heading", { level: 1, name: "Choose Your Phone" })
    .waitFor();
  await remountPage
    .getByRole("button", { name: "Allow analytics" })
    .click();
  await waitForAnalyticsEvents(remountPage, "view_item_list", 1);
  assert.equal(
    (await getAnalyticsEvents(remountPage, "view_item_list")).length,
    1,
    "The remounted current route must emit after grant.",
  );
  assert.equal(
    (await getAnalyticsEvents(remountPage, "select_item")).length,
    0,
    "The pre-consent model selection must not replay.",
  );
  assert.equal(
    (await getAnalyticsEvents(remountPage, "view_item")).length,
    0,
    "The unmounted pre-consent product view must not replay.",
  );
  await remountContext.close();

  const seoAnalyticsContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  await installAnalyticsRecorder(seoAnalyticsContext, "granted");
  const seoAnalyticsPage = await seoAnalyticsContext.newPage();
  await seoAnalyticsPage.goto(`${origin}/custom-iphone-case`);
  await waitForAnalyticsEvents(seoAnalyticsPage, "view_item_list", 1);
  const iphoneSeoList = (
    await getAnalyticsEvents(seoAnalyticsPage, "view_item_list")
  ).find(
    (event) =>
      event.payload.item_list_id === "seo_landing_custom_iphone_case",
  );
  assert.ok(iphoneSeoList, "The iPhone SEO landing list view is missing.");
  assertCompleteAnalyticsItems(iphoneSeoList, 6, "iPhone SEO landing view");
  auditResults.push(
    await assertNoSeriousAxeViolations(
      seoAnalyticsPage,
      "analytics-seo-allow-desktop",
    ),
  );

  await seoAnalyticsPage
    .getByRole("link", { name: "Design an iPhone case" })
    .click();
  await seoAnalyticsPage.waitForURL(`${origin}/catalog`);
  await seoAnalyticsPage
    .getByRole("heading", { level: 1, name: "Choose Your Phone" })
    .waitFor();
  await waitForAnalyticsEvents(seoAnalyticsPage, "view_item_list", 2);
  await seoAnalyticsPage.goBack();
  await seoAnalyticsPage.waitForURL(`${origin}/custom-iphone-case`);
  await seoAnalyticsPage.getByRole("link", { name: "Gift ideas" }).click();
  await seoAnalyticsPage.waitForURL(`${origin}/gifts/custom-phone-case`);
  await waitForAnalyticsEvents(seoAnalyticsPage, "view_item_list", 3);
  const giftListCountBeforeSelfNavigation = (
    await getAnalyticsEvents(seoAnalyticsPage, "view_item_list")
  ).filter(
    (event) =>
      event.payload.item_list_id === "seo_landing_gifts_custom_phone_case",
  ).length;
  await seoAnalyticsPage.getByRole("link", { name: "Gift ideas" }).click();
  await seoAnalyticsPage.waitForTimeout(50);
  assert.equal(
    (
      await getAnalyticsEvents(seoAnalyticsPage, "view_item_list")
    ).filter(
      (event) =>
        event.payload.item_list_id ===
        "seo_landing_gifts_custom_phone_case",
    ).length,
    giftListCountBeforeSelfNavigation,
    "A self-navigation must not duplicate the SEO landing view.",
  );
  await seoAnalyticsPage.goBack();
  if (new URL(seoAnalyticsPage.url()).pathname !== "/custom-iphone-case") {
    await seoAnalyticsPage.goBack();
  }
  await seoAnalyticsPage.waitForURL(`${origin}/custom-iphone-case`);
  await seoAnalyticsPage
    .getByRole("link", { name: "Browse all cases" })
    .click();
  await seoAnalyticsPage.waitForURL(`${origin}/catalog`);
  await seoAnalyticsPage.goBack();
  await seoAnalyticsPage.waitForURL(`${origin}/custom-iphone-case`);

  const seoCtaEvents = await getAnalyticsEvents(
    seoAnalyticsPage,
    "primary_cta_click",
  );
  for (const expected of [
    {
      placement: "seo_landing_hero_primary",
      destination: "/catalog",
      label: "Design an iPhone case",
    },
    {
      placement: "seo_landing_hero_secondary",
      destination: "/gifts/custom-phone-case",
      label: "Gift ideas",
    },
    {
      placement: "seo_landing_models_header",
      destination: "/catalog",
      label: "Browse all cases",
    },
  ]) {
    assert.ok(
      seoCtaEvents.some(
        (event) =>
          event.payload.placement === expected.placement &&
          event.payload.destination === expected.destination &&
          event.payload.label === expected.label,
      ),
      `Missing SEO CTA event ${expected.placement}.`,
    );
  }

  await seoAnalyticsPage
    .getByRole("link", { name: /iPhone 17 Pro Max custom case/ })
    .click();
  await seoAnalyticsPage.waitForURL(/\/phone-cases\/iphone-17-pro-max/);
  const seoSelections = await getAnalyticsEvents(
    seoAnalyticsPage,
    "select_item",
  );
  assert.ok(
    seoSelections.some(
      (event) =>
        event.payload.item_list_id ===
          "seo_landing_custom_iphone_case" &&
        event.payload.placement === "seo_landing_popular_models" &&
        event.payload.items?.length === 1,
    ),
    "SEO model selection must retain its list and placement context.",
  );
  await seoAnalyticsContext.close();

  const declineContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  const declineRecorder = await installAnalyticsRecorder(
    declineContext,
    "unset",
  );
  const declinePage = await declineContext.newPage();
  await declinePage.goto(origin);
  await declinePage.getByRole("button", { name: "Decline" }).click();
  await declinePage
    .getByRole("link", { name: "Choose your phone", exact: true })
    .click();
  await declinePage.waitForURL(`${origin}/catalog`);
  await declinePage
    .getByRole("link", {
      name: "View details for iPhone 17 Pro Max",
    })
    .click();
  await declinePage.waitForURL(/\/phone-cases\/iphone-17-pro-max/);
  await declinePage.evaluate(() => {
    history.pushState({}, "", "/custom-iphone-case");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await declinePage.waitForURL(`${origin}/custom-iphone-case`);
  await declinePage.getByRole("link", { name: "Gift ideas" }).click();
  await declinePage.waitForURL(`${origin}/gifts/custom-phone-case`);
  assert.equal(declineRecorder.getScriptRequests(), 0);
  assert.equal(
    (await getAnalyticsEvents(declinePage)).length,
    0,
    "Decline must suppress page, ecommerce, selection, and CTA events.",
  );
  const declinedPersistence = await declinePage.evaluate(() => ({
    localKeys: Object.keys(localStorage),
    localValues: Object.values(localStorage),
    sessionKeys: Object.keys(sessionStorage),
    sessionValues: Object.values(sessionStorage),
  }));
  assert.doesNotMatch(
    JSON.stringify(declinedPersistence),
    /view_item|view_item_list|select_item|primary_cta_click/,
    "Decline must not persist an analytics event queue or payload.",
  );
  auditResults.push(
    await assertNoSeriousAxeViolations(
      declinePage,
      "analytics-seo-decline-desktop",
    ),
  );
  await declinePage.screenshot({
    path: resolve(outputDir, "analytics-decline-seo-desktop.png"),
    fullPage: true,
  });
  await declineContext.close();

  const crossTabContext = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  const crossTabRecorder = await installAnalyticsRecorder(
    crossTabContext,
    "denied",
  );
  const crossTabPageA = await crossTabContext.newPage();
  const crossTabPageB = await crossTabContext.newPage();
  await Promise.all([
    crossTabPageA.goto(
      `${origin}/phone-cases/iphone-17-pro-max`,
    ),
    crossTabPageB.goto(`${origin}/phone-cases/galaxy-s24-ultra`),
  ]);
  assert.equal((await getAnalyticsEvents(crossTabPageA)).length, 0);
  assert.equal((await getAnalyticsEvents(crossTabPageB)).length, 0);
  await crossTabPageA.evaluate(async () => {
    const { setAnalyticsConsent } = await import("/src/lib/marketing.ts");
    setAnalyticsConsent("granted");
  });
  await Promise.all([
    waitForAnalyticsEvents(crossTabPageA, "view_item", 1),
    waitForAnalyticsEvents(crossTabPageB, "view_item", 1),
  ]);
  assert.equal(
    crossTabRecorder.getScriptRequests(),
    2,
    "Each document should load analytics once after a cross-tab grant.",
  );
  await crossTabPageA.evaluate(async () => {
    const { setAnalyticsConsent } = await import("/src/lib/marketing.ts");
    setAnalyticsConsent("denied");
  });
  await crossTabPageB.waitForFunction(
    () =>
      (window.__snapcaseAnalyticsCommands ?? []).some(
        (command) =>
          command[0] === "consent" &&
          command[1] === "update" &&
          command[2]?.analytics_storage === "denied",
      ),
  );
  await crossTabPageB.evaluate(() => {
    history.pushState({}, "", "/phone-cases/galaxy-s25-ultra");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await crossTabPageB.waitForURL(/\/phone-cases\/galaxy-s25-ultra/);
  await crossTabPageB.waitForTimeout(50);
  assert.equal(
    (await getAnalyticsEvents(crossTabPageB, "view_item")).length,
    1,
    "Cross-tab denial must suppress later product views.",
  );
  await crossTabContext.close();

  console.log(
    JSON.stringify(
      {
        result: "Accessibility smoke passed",
        audited: auditResults,
        evidence: [
          "output/playwright/home-light-desktop.png",
          "output/playwright/catalog-light-desktop.png",
          "output/playwright/catalog-empty-light-desktop.png",
          "output/playwright/home-dark-desktop.png",
          "output/playwright/catalog-dark-desktop.png",
          "output/playwright/home-light-mobile.png",
          "output/playwright/catalog-light-mobile.png",
          "output/playwright/home-dark-tablet.png",
          "output/playwright/catalog-dark-tablet.png",
          "output/playwright/product-offer-light-desktop.png",
          "output/playwright/preview-light-desktop.png",
          "output/playwright/checkout-light-desktop.png",
          "output/playwright/home-dark-mobile.png",
          "output/playwright/catalog-dark-mobile.png",
          "output/playwright/product-offer-dark-mobile.png",
          "output/playwright/cart-dark-mobile.png",
          "output/playwright/checkout-dark-mobile.png",
          "output/playwright/checkout-light-mobile.png",
          "output/playwright/checkout-light-tablet.png",
          "output/playwright/checkout-dark-tablet.png",
          "output/playwright/checkout-dark-desktop.png",
          "output/playwright/order-verification-retryable-desktop.png",
          "output/playwright/order-verification-success-desktop.png",
          "output/playwright/order-verification-review-dark-mobile.png",
          "output/playwright/analytics-allow-product-desktop.png",
          "output/playwright/analytics-decline-seo-desktop.png",
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
