import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { requireServiceRequest } from "./service-auth.ts";

Deno.test("service auth rejects browsers and missing configuration", () => {
  const browser = new Request("https://example.test", {
    headers: {
      Origin: "https://snapcase.ai",
      Authorization: "Bearer internal-key",
    },
  });
  assertEquals(requireServiceRequest(browser, ["internal-key"])?.status, 403);

  const server = new Request("https://example.test");
  assertEquals(requireServiceRequest(server, [])?.status, 401);
});

Deno.test("service auth accepts bearer or apikey without an origin", () => {
  const bearer = new Request("https://example.test", {
    headers: { Authorization: "Bearer internal-key" },
  });
  assertEquals(requireServiceRequest(bearer, ["internal-key"]), null);

  const apiKey = new Request("https://example.test", {
    headers: { apikey: "internal-key" },
  });
  assertEquals(requireServiceRequest(apiKey, ["internal-key"]), null);
});
