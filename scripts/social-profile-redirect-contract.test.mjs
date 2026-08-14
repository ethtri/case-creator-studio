import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const FIRST_PARTY_ORIGIN = "https://www.snapcase.ai";
const EXPECTED_REDIRECTS = [
  {
    source: "/go/pinterest",
    path: "/gifts/custom-phone-case",
    attribution: {
      utm_source: "pinterest",
      utm_medium: "organic_social",
      utm_campaign: "pinterest_profile",
      utm_content: "pinterest_profile_link_v1",
    },
  },
  ...["instagram", "tiktok", "threads"].map((platform) => ({
    source: `/go/${platform}`,
    path: "/custom-phone-case",
    attribution: {
      utm_source: platform,
      utm_medium: "organic_social",
      utm_campaign: "2026q3_profile",
      utm_content: `${platform}_profile_link_v1`,
    },
  })),
];

const readConfiguration = async () => {
  const vercel = JSON.parse(await readFile("vercel.json", "utf8"));
  const redirects = JSON.parse(
    await readFile(vercel.bulkRedirectsPath, "utf8"),
  );
  return { redirects, vercel };
};

test("social profile routes use exact temporary first-party redirects", async () => {
  const { redirects, vercel } = await readConfiguration();

  assert.equal(vercel.bulkRedirectsPath, "redirects.json");
  assert.equal(
    vercel.redirects,
    undefined,
    "Static redirects would preserve hostile inbound query parameters.",
  );
  assert.equal(
    redirects.filter((redirect) => redirect.source.startsWith("/go/")).length,
    EXPECTED_REDIRECTS.length,
    "Only the four allowlisted profile routes may exist under /go/.",
  );

  for (const expected of EXPECTED_REDIRECTS) {
    const matches = redirects.filter(
      (redirect) => redirect.source === expected.source,
    );
    assert.equal(matches.length, 1, `Expected one ${expected.source} route.`);

    const redirect = matches[0];
    assert.deepEqual(Object.keys(redirect).sort(), [
      "caseSensitive",
      "destination",
      "preserveQueryParams",
      "source",
      "status",
    ]);
    assert.equal(redirect.status, 307);
    assert.equal(redirect.caseSensitive, false);
    assert.equal(
      redirect.preserveQueryParams,
      false,
      `${expected.source} must discard hostile or conflicting query parameters.`,
    );
    assert.doesNotMatch(
      redirect.destination,
      /[:*{}]/,
      `${expected.source} must not interpolate user-controlled input.`,
    );

    const destination = new URL(redirect.destination, FIRST_PARTY_ORIGIN);
    assert.equal(destination.origin, FIRST_PARTY_ORIGIN);
    assert.equal(destination.pathname, expected.path);
    assert.equal(destination.hash, "");
    assert.deepEqual(
      Object.fromEntries(destination.searchParams),
      expected.attribution,
    );
    assert.equal(
      [...destination.searchParams.keys()].length,
      Object.keys(expected.attribution).length,
    );
    const expectedLocation = new URL(expected.path, FIRST_PARTY_ORIGIN);
    expectedLocation.search = new URLSearchParams(
      expected.attribution,
    ).toString();
    assert.equal(
      destination.href,
      expectedLocation.href,
      `${expected.source} must return the exact fixed Location value.`,
    );
    const hostileRequest = new URL(expected.source, FIRST_PARTY_ORIGIN);
    hostileRequest.search = new URLSearchParams({
      utm_source: "attacker",
      utm_campaign: "override",
      next: "https://evil.example/phish",
      redirect: "https://evil.example/redirect",
    }).toString();
    const hostileResolvedLocation = redirect.preserveQueryParams
      ? new URL(
          `${redirect.destination}&${hostileRequest.searchParams}`,
          FIRST_PARTY_ORIGIN,
        )
      : new URL(redirect.destination, FIRST_PARTY_ORIGIN);
    assert.equal(
      hostileResolvedLocation.href,
      expectedLocation.href,
      `${expected.source} must ignore hostile query overrides.`,
    );
    assert.equal(hostileResolvedLocation.searchParams.has("next"), false);
    assert.equal(hostileResolvedLocation.searchParams.has("redirect"), false);
  }
});

test("unknown social routes retain the SPA fallback without becoming redirects", async () => {
  const { redirects, vercel } = await readConfiguration();
  assert.equal(
    redirects.some((redirect) => redirect.source === "/go/unknown"),
    false,
  );
  assert.deepEqual(vercel.rewrites?.at(-1), {
    source: "/(.*)",
    destination: "/app.html",
  });
});
