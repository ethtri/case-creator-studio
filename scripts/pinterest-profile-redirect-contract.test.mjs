import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const EXPECTED_SOURCE = "/go/pinterest";
const EXPECTED_PATH = "/gifts/custom-phone-case";
const EXPECTED_ATTRIBUTION = {
  utm_source: "pinterest",
  utm_medium: "organic_social",
  utm_campaign: "pinterest_profile",
};

test("Pinterest profile redirect is temporary, first-party, and attribution-stable", async () => {
  const configuration = JSON.parse(await readFile("vercel.json", "utf8"));
  assert.equal(configuration.bulkRedirectsPath, "redirects.json");
  assert.equal(
    configuration.redirects,
    undefined,
    "The route must not fall back to static redirects that preserve inbound query parameters.",
  );
  const redirects = JSON.parse(await readFile(configuration.bulkRedirectsPath, "utf8"));
  const matches = redirects.filter((redirect) => redirect.source === EXPECTED_SOURCE);

  assert.equal(matches.length, 1, "Expected exactly one Pinterest profile redirect.");
  const redirect = matches[0];
  assert.equal(redirect.status, 307, "Campaign redirect must remain temporary and method-safe.");
  assert.equal(
    redirect.preserveQueryParams,
    false,
    "Inbound query parameters must not be copied to the fixed campaign destination.",
  );
  assert.equal(redirect.caseSensitive, false);
  assert.deepEqual(
    Object.keys(redirect).sort(),
    [
      "caseSensitive",
      "destination",
      "preserveQueryParams",
      "source",
      "status",
    ],
    "Redirect must not depend on request headers, cookies, or query parameters.",
  );

  const destination = new URL(redirect.destination, "https://www.snapcase.ai");
  assert.equal(destination.origin, "https://www.snapcase.ai");
  assert.equal(destination.pathname, EXPECTED_PATH);
  assert.equal(destination.hash, "");
  assert.deepEqual(
    Object.fromEntries(destination.searchParams),
    EXPECTED_ATTRIBUTION,
  );
  assert.equal(
    [...destination.searchParams.keys()].length,
    Object.keys(EXPECTED_ATTRIBUTION).length,
    "Destination must contain only the fixed attribution contract.",
  );
  assert.doesNotMatch(
    redirect.destination,
    /[:*{}]/,
    "Destination must not interpolate attacker-controlled route input.",
  );
});

test("Pinterest redirect runs before the SPA catch-all rewrite", async () => {
  const configuration = JSON.parse(await readFile("vercel.json", "utf8"));
  const catchAll = configuration.rewrites?.find(
    (rewrite) => rewrite.source === "/(.*)",
  );
  assert.ok(catchAll, "SPA catch-all rewrite must remain configured.");
  assert.equal(catchAll.destination, "/app.html");
  const redirects = JSON.parse(
    await readFile(configuration.bulkRedirectsPath, "utf8"),
  );
  assert.equal(redirects[0]?.source, EXPECTED_SOURCE);
});
