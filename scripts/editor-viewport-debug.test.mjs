import test from "node:test";
import assert from "node:assert/strict";
import { buildViewportSnapshot, describeDebugBrowser, isViewportDebugEnabled } from "../src/lib/editor-viewport-debug.ts";

test("diagnostic requires the exact explicit flag", () => {
  for (const query of ["", "viewportDebug=0", "viewportDebug=true", "designId=private"]) {
    assert.equal(isViewportDebugEnabled(new URLSearchParams(query)), false);
  }
  assert.equal(isViewportDebugEnabled(new URLSearchParams("viewportDebug=1&designId=private")), true);
});

test("snapshot includes viewport offsets and only approved geometry fields", () => {
  const rect = { x: 0, y: 89, top: 89, left: 0, right: 390, bottom: 744, width: 390, height: 655, designId: "private", url: "private-url" };
  const snapshot = buildViewportSnapshot({ timestamp: "2026-10-03T22:00:00Z", innerHeight: 844, clientHeight: 844, scrollY: 5, dynamicViewportHeight: 844,
    viewport: { height: 744.1234, width: 390, offsetTop: 100, offsetLeft: 0, scale: 1, artwork: "private" },
    rects: { shell: rect, area: rect, container: rect, iframe: rect },
    designId: "private", url: "private-url", artwork: "private",
  });
  assert.equal(snapshot.visualViewport.height, 744.12);
  assert.equal(snapshot.visualViewport.offsetTop, 100);
  assert.equal(snapshot.rects.iframe.bottom, 744);
  assert.equal(snapshot.dynamicViewportHeight, 844);
  assert.equal(snapshot.scrollY, 5);
  assert.doesNotMatch(JSON.stringify(snapshot), /private|designId|url|artwork/i);
});

test("missing viewport and iframe are explicit, not fabricated zero measurements", () => {
  const snapshot = buildViewportSnapshot({ timestamp: "now", innerHeight: 844, clientHeight: 844,
    viewport: null, rects: { shell: null, area: null, container: null, iframe: null } });
  assert.equal(snapshot.visualViewport, null);
  assert.equal(snapshot.rects.iframe, null);
});

test("browser summary retains version while excluding raw user-agent data", () => {
  const summary = describeDebugBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) private-marker Version/26.0 Mobile/15E148 Safari/604.1");
  assert.equal(summary.browser, "Safari 26.0");
  assert.equal(summary.os, "iOS 26.0");
  assert.doesNotMatch(JSON.stringify(summary), /private-marker|15E148|Mozilla/);
});

test("Edge tokens take priority over compatible Chrome tokens; in-app context stays unknown", () => {
  assert.equal(describeDebugBrowser("Chrome/140.0 Safari/537.36 Edg/140.1").browser, "Edg 140.1");
  assert.equal(describeDebugBrowser("CriOS/140.2 Mobile/15E148 Safari/604.1").browser, "CriOS 140.2");
  assert.equal(describeDebugBrowser("AppleWebKit/605.1.15 Mobile/15E148 CustomApp").browser, "Unidentified browser");
});
