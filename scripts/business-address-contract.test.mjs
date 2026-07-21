import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const identitySource = await readFile("src/lib/email-identities.ts", "utf8");
const contactSource = await readFile("src/pages/Contact.tsx", "utf8");
const privacySource = await readFile("src/pages/Privacy.tsx", "utf8");
const termsSource = await readFile("src/pages/Terms.tsx", "utf8");

test("the verified commercial address is centralized and shown on public contact and legal pages", () => {
  assert.match(identitySource, /street: "1401 21st Street"/);
  assert.match(identitySource, /cityRegionPostal: "Sacramento, CA 95811"/);

  for (const source of [contactSource, privacySource, termsSource]) {
    assert.match(source, /SNAPCASE_COMMERCIAL_ADDRESS\.street/);
    assert.match(source, /SNAPCASE_COMMERCIAL_ADDRESS\.cityRegionPostal/);
  }
});
