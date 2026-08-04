import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { SOCIAL_PROFILES } from "../src/lib/social-profiles.ts";

const EXPECTED_PROFILES = [
  {
    id: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/snapcaseai/",
  },
  {
    id: "tiktok",
    label: "TikTok",
    href: "https://www.tiktok.com/@snapcaseai",
  },
  {
    id: "threads",
    label: "Threads",
    href: "https://www.threads.com/@snapcaseai",
  },
  {
    id: "pinterest",
    label: "Pinterest",
    href: "https://www.pinterest.com/snapcaseai/",
  },
];

test("social profile data exposes the four canonical destinations and names", () => {
  assert.deepEqual(SOCIAL_PROFILES, EXPECTED_PROFILES);
  for (const profile of SOCIAL_PROFILES) {
    const destination = new URL(profile.href);
    assert.equal(destination.protocol, "https:");
    assert.equal(destination.username, "");
    assert.equal(destination.password, "");
    assert.equal(destination.search, "");
    assert.equal(destination.hash, "");
  }
});

test("the homepage footer renders a labelled, measurable, keyboard-visible external link group", async () => {
  const [component, homepage, analytics] = await Promise.all([
    readFile("src/components/SocialProfileLinks.tsx", "utf8"),
    readFile("src/pages/Index.tsx", "utf8"),
    readFile("src/lib/marketing.ts", "utf8"),
  ]);

  assert.match(component, /aria-label="Snapcase social profiles"/);
  assert.match(
    component,
    /aria-label={`Snapcase on \$\{profile\.label\} \(opens in a new tab\)`}/,
  );
  assert.match(component, /href={profile\.href}/);
  assert.match(component, />\s*{profile\.label}\s*<\/a>/);
  assert.match(component, /target="_blank"/);
  assert.match(component, /rel="noopener noreferrer"/);
  assert.match(component, /min-h-11/);
  assert.match(component, /focus-visible:ring-2/);
  assert.match(component, /data-social-platform={profile\.id}/);
  assert.match(component, /trackMarketingEvent\("primary_cta_click"/);
  assert.match(component, /placement: "homepage_footer_social_profile"/);
  assert.match(component, /platform: profile\.id/);
  assert.match(component, /destination: profile\.href/);
  assert.match(analytics, /\| "primary_cta_click"/);
  assert.match(
    homepage,
    /<footer[\s\S]*<SocialProfileLinks \/>[\s\S]*<\/footer>/,
  );
  assert.match(homepage, /aria-label="Snapcase links"/);
});
