import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Exercise the production CSS, including classes generated from reusable UI
// components. No application requests, credentials, customer data or server.
const assets = new URL("../dist/assets/", import.meta.url);
const filename = (await readdir(assets)).find((name) => /^index-.*\.css$/.test(name));
assert.ok(filename, "Build production CSS before running compatibility smoke.");
const css = await readFile(new URL(filename, assets), "utf8");
const sheet = await readFile(new URL("../src/components/ui/sheet.tsx", import.meta.url), "utf8");
const headerClasses = sheet.match(/const SheetHeader[\s\S]*?cn\("([^"]+)"/)?.[1];
assert.ok(headerClasses);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route("**/*", (route) => route.abort());
  await page.setContent(`<style>${css}</style>
    <div id="container" class="container"></div>
    <div id="sidebar" class="w-[var(--sidebar-width)]" style="--sidebar-width:16rem"></div>
    <div id="skeleton" class="max-w-[var(--skeleton-width)]" style="--skeleton-width:80px"></div>
    <div id="chart" class="bg-[var(--color-bg)] border-[var(--color-border)]" style="--color-bg:#123456;--color-border:#654321"></div>
    <button id="button" class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Focus</button>
    <button id="disabled" disabled>Disabled</button><input id="input" placeholder="Photo">
    <div id="hidden" class="flex" hidden>Hidden</div>
    <div id="animation" class="animate-in fade-in-0"></div>
    <div id="shadow" class="shadow-sm"></div>
    <div id="header" class="${headerClasses}"><div style="height:24px">Title</div><div style="height:24px">Description</div></div>
    <div id="accessible-header" class="${headerClasses}"><div style="height:24px">Title</div><div class="sr-only">Description</div></div>`);
  const widths = [];
  for (const width of [390, 640, 768, 1024, 1280, 1399, 1400, 1440, 1536, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    const result = await page.locator("#container").evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: element.getBoundingClientRect().width, padding: style.paddingLeft };
    });
    assert.equal(result.width, Math.min(width, 1400), `v3 container width at ${width}`);
    assert.equal(result.padding, "32px");
    widths.push({ viewport: width, ...result });
  }
  const styles = await page.evaluate(() => {
    const style = (id) => getComputedStyle(document.getElementById(id));
    return {
      sidebar: style("sidebar").width, skeleton: style("skeleton").maxWidth,
      chartBackground: style("chart").backgroundColor, chartBorder: style("chart").borderColor,
      buttonCursor: style("button").cursor, disabledCursor: style("disabled").cursor,
      placeholder: getComputedStyle(document.getElementById("input"), "::placeholder").color,
      hidden: style("hidden").display, animation: style("animation").animationName,
      shadow: style("shadow").boxShadow,
      headerGap: document.querySelector("#header > :last-child").getBoundingClientRect().top - document.querySelector("#header > :first-child").getBoundingClientRect().bottom,
      accessibleHeaderHeight: document.getElementById("accessible-header").getBoundingClientRect().height,
    };
  });
  assert.equal(styles.sidebar, "256px");
  assert.equal(styles.skeleton, "80px");
  assert.equal(styles.chartBackground, "rgb(18, 52, 86)");
  assert.equal(styles.chartBorder, "rgb(101, 67, 33)");
  assert.equal(styles.buttonCursor, "pointer");
  assert.notEqual(styles.disabledCursor, "pointer");
  assert.equal(styles.placeholder, "rgb(156, 163, 175)");
  assert.equal(styles.hidden, "none");
  assert.equal(styles.animation, "enter");
  assert.equal(styles.headerGap, 8);
  assert.equal(styles.accessibleHeaderHeight, 24);
  assert.match(styles.shadow, /rgba\(0, 0, 0, 0\.05\) 0px 1px 2px 0px/);
  await page.emulateMedia({ forcedColors: "active" });
  await page.locator("#button").focus();
  const focus = await page.locator("#button").evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
  });
  assert.equal(focus.style, "solid");
  assert.equal(focus.width, "2px");
  assert.notEqual(focus.color, "rgba(0, 0, 0, 0)");
  await page.emulateMedia({ forcedColors: "none" });
  // Sonner's real runtime stylesheet is injected after application CSS.
  await page.addStyleTag({ content: await readFile(new URL("../node_modules/sonner/dist/styles.css", import.meta.url), "utf8") });
  const sonnerSource = await readFile(new URL("../src/components/ui/sonner.tsx", import.meta.url), "utf8");
  const toastClasses = sonnerSource.match(/toast:\s*"([^"]+)"/)?.[1];
  assert.ok(toastClasses);
  await page.locator("body").evaluate((body, classes) => {
    const fixture = document.createElement("div");
    fixture.innerHTML = `<div id="theme-reference" style="background:hsl(var(--background));color:hsl(var(--foreground));border-color:hsl(var(--border))"></div>
      <ol data-sonner-toaster class="toaster group" data-theme="dark">
        ${["normal", "success", "error"].map((type) => `<li data-sonner-toast data-styled="true" data-type="${type}" class="${classes}"><span data-description>Description</span><button data-button>Action</button><button data-button data-cancel>Cancel</button></li>`).join("")}
      </ol>`;
    body.append(fixture);
  }, toastClasses);
  const toastThemes = [];
  for (const theme of ["light", "dark"]) {
    await page.locator("html").evaluate((html, selected) => html.classList.toggle("dark", selected === "dark"), theme);
    const result = await page.evaluate(() => {
      const reference = getComputedStyle(document.getElementById("theme-reference"));
      return { reference: { background: reference.backgroundColor, color: reference.color, border: reference.borderColor }, toasts: Array.from(document.querySelectorAll("[data-sonner-toast]")).map((toast) => {
        const style = getComputedStyle(toast);
        return { type: toast.getAttribute("data-type"), background: style.backgroundColor, color: style.color, border: style.borderColor, borderWidth: style.borderWidth };
      }) };
    });
    for (const toast of result.toasts) {
      assert.equal(toast.background, result.reference.background, `${theme} ${toast.type} toast background`);
      assert.equal(toast.color, result.reference.color, `${theme} ${toast.type} toast text`);
      assert.equal(toast.border, result.reference.border, `${theme} ${toast.type} toast border`);
      assert.equal(toast.borderWidth, "0px", `${theme} ${toast.type} toast retains baseline reset`);
    }
    toastThemes.push({ theme, ...result });
  }
  const output = new URL("../output/playwright/", import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL("tailwind-compatibility.json", output), JSON.stringify({ result: "passed", widths, styles, forcedColorsFocus: focus, toastThemes }, null, 2));
  console.log("Production CSS compatibility passed: container, custom variables, focus, controls, animation and shadows.");
} finally {
  await browser.close();
}
