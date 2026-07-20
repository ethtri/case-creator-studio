import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SNAPCASE_EMAILS as SITE_SNAPCASE_EMAILS } from "../src/lib/email-identities.ts";
import {
  OFFICIAL_SNAPCASE_EMAILS,
  SNAPCASE_EMAILS,
  resolveOfficialSnapcaseEmail,
  resolveSnapcaseRoleEmail,
} from "../supabase/functions/_shared/email-identities.ts";
import { parseSvixSignatures } from "../supabase/functions/_shared/svix.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("official Snapcase email identities are complete and role-specific", () => {
  assert.deepEqual(OFFICIAL_SNAPCASE_EMAILS, [
    "hello@snapcase.ai",
    "partnerships@snapcase.ai",
    "support@snapcase.ai",
    "social@snapcase.ai",
  ]);
  assert.deepEqual(SITE_SNAPCASE_EMAILS, SNAPCASE_EMAILS);

  assert.equal(
    resolveOfficialSnapcaseEmail("  SUPPORT@SNAPCASE.AI ", SNAPCASE_EMAILS.hello, "EMAIL"),
    SNAPCASE_EMAILS.support,
  );
  assert.equal(
    resolveSnapcaseRoleEmail(undefined, SNAPCASE_EMAILS.hello, "RESEND_FROM_EMAIL"),
    SNAPCASE_EMAILS.hello,
  );
  assert.throws(
    () =>
      resolveSnapcaseRoleEmail(
        SNAPCASE_EMAILS.social,
        SNAPCASE_EMAILS.support,
        "SUPPORT_EMAIL",
      ),
    /SUPPORT_EMAIL must be support@snapcase\.ai/,
  );
  assert.throws(
    () =>
      resolveOfficialSnapcaseEmail(
        `legacy${"@"}snapcase.ai`,
        SNAPCASE_EMAILS.hello,
        "EMAIL",
      ),
    /must use an official Snapcase address/,
  );
});

test("tracked Snapcase email references use only official identities", () => {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  const officialEmails = new Set(OFFICIAL_SNAPCASE_EMAILS);
  const unexpectedReferences = [];

  for (const relativePath of trackedFiles) {
    const source = readFileSync(resolve(repositoryRoot, relativePath), "utf8");
    const matches = source.matchAll(/[A-Z0-9._%+-]+@snapcase\.ai/gi);

    for (const match of matches) {
      const normalized = match[0].toLowerCase();
      if (!officialEmails.has(normalized)) {
        unexpectedReferences.push(`${relativePath}: ${match[0]}`);
      }
    }
  }

  assert.deepEqual(unexpectedReferences, []);
});

test("Resend webhook signatures preserve the v1 prefix delimiter", () => {
  assert.deepEqual(parseSvixSignatures("v1,current-signature"), ["current-signature"]);
  assert.deepEqual(
    parseSvixSignatures("v1,old-signature v1,current-signature"),
    ["old-signature", "current-signature"],
  );
  assert.deepEqual(parseSvixSignatures("v2,ignored malformed"), []);
});
