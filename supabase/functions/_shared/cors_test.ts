import { assertEquals, assertThrows } from "jsr:@std/assert";
import { isAllowedOrigin, requireAllowedOrigin } from "./cors.ts";

function withPreviewOrigins(value: string, test: () => void): void {
  const previous = Deno.env.get("VERCEL_PREVIEW_ORIGINS");
  Deno.env.set("VERCEL_PREVIEW_ORIGINS", value);
  try {
    test();
  } finally {
    if (previous === undefined) {
      Deno.env.delete("VERCEL_PREVIEW_ORIGINS");
    } else {
      Deno.env.set("VERCEL_PREVIEW_ORIGINS", previous);
    }
  }
}

Deno.test("CORS allows exact production origins", () => {
  assertEquals(isAllowedOrigin("https://snapcase.ai"), true);
  assertEquals(isAllowedOrigin("https://www.snapcase.ai"), true);
});

Deno.test("CORS allows exact configured preview origin", () => {
  withPreviewOrigins("https://snapcase-preview.vercel.app", () => {
    assertEquals(isAllowedOrigin("https://snapcase-preview.vercel.app"), true);
  });
});

Deno.test("CORS rejects malicious Vercel and localhost-like origins", () => {
  withPreviewOrigins("https://snapcase-preview.vercel.app", () => {
    assertEquals(
      isAllowedOrigin("https://evil-snapcaseappv2.vercel.app"),
      false,
    );
    assertEquals(isAllowedOrigin("http://localhost.evil.com"), false);
    assertEquals(isAllowedOrigin("http://localhost:5173"), true);
    assertEquals(isAllowedOrigin("http://127.0.0.1:5173"), true);
  });
});

Deno.test("requireAllowedOrigin rejects present but disallowed origin", () => {
  const request = new Request("https://example.test", {
    headers: { origin: "https://evil-snapcaseappv2.vercel.app" },
  });

  assertThrows(
    () => requireAllowedOrigin(request, "TEST"),
    Error,
    "Origin is not allowed",
  );
});

Deno.test("requireAllowedOrigin returns production fallback when origin is missing", () => {
  const request = new Request("https://example.test");
  assertEquals(requireAllowedOrigin(request, "TEST"), "https://snapcase.ai");
});
