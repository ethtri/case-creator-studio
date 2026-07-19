import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  isVerifiedOperatorUser,
  parseOperatorEmails,
} from "./operator-auth.ts";

Deno.test("operator email allowlist is normalized and deduplicated", () => {
  assertEquals(
    [...parseOperatorEmails(
      " Ops@Snapcase.ai,ops@snapcase.ai, alejandro@example.com ",
    )],
    ["ops@snapcase.ai", "alejandro@example.com"],
  );
});

Deno.test("operator verification fails closed", () => {
  assert(!isVerifiedOperatorUser(null));
  assert(!isVerifiedOperatorUser({}));
  assert(
    !isVerifiedOperatorUser({
      app_metadata: {},
    }),
  );
  assert(
    isVerifiedOperatorUser({ email_confirmed_at: "2026-07-19T00:00:00Z" }),
  );
  assert(isVerifiedOperatorUser({
    app_metadata: { email_verified: true },
  }));
  assert(
    !isVerifiedOperatorUser({
      // User metadata is intentionally not part of the trusted input type.
      user_metadata: { email_verified: true },
    } as { app_metadata?: Record<string, unknown> }),
  );
});
