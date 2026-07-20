import {
  assertEquals,
  assertMatch,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  fulfillmentStatusForKexiaozhanNotification,
  getKexiaozhanNotificationSummary,
  kexiaozhanNotificationLastError,
} from "./kexiaozhan-reconciliation.ts";

Deno.test("projects a successful vendor notification", () => {
  const summary = getKexiaozhanNotificationSummary({
    kexiaozhan: {
      paymentNotification: {
        mode: "live",
        generatedAt: "2026-07-20T00:00:00Z",
        response: { ok: true, code: "0", message: " accepted " },
      },
    },
  });

  assertEquals(summary, {
    state: "succeeded",
    reason: null,
    vendorCode: 0,
    message: "accepted",
    attemptedAt: "2026-07-20T00:00:00.000Z",
    canRetry: false,
  });
  assertEquals(
    fulfillmentStatusForKexiaozhanNotification(
      "vendor_notify_failed",
      summary,
    ),
    "onshore_manual_queued",
  );
});

Deno.test("projects a retryable vendor business failure", () => {
  const summary = getKexiaozhanNotificationSummary({
    kexiaozhan: {
      paymentNotification: {
        mode: "live",
        completedAt: "2026-07-20T01:02:03Z",
        response: {
          ok: false,
          code: 9001,
          message: " Machine unavailable ",
          error: "vendor_business_error",
        },
      },
    },
  });

  assertEquals(summary?.state, "failed");
  assertEquals(summary?.reason, "vendor_business_error");
  assertEquals(summary?.vendorCode, 9001);
  assertEquals(summary?.message, "Machine unavailable");
  assertEquals(summary?.canRetry, true);
  assertEquals(
    fulfillmentStatusForKexiaozhanNotification(
      "onshore_manual_queued",
      summary,
    ),
    "vendor_notify_failed",
  );
  assertEquals(
    kexiaozhanNotificationLastError(summary),
    "Kexiaozhan vendor notification failed: vendor_business_error",
  );
});

Deno.test("projects a blocked notification as retryable", () => {
  const summary = getKexiaozhanNotificationSummary({
    kexiaozhan: {
      paymentNotification: {
        mode: "blocked",
        reason: "machine_not_allowed",
        generatedAt: "2026-07-20T00:00:00Z",
      },
    },
  });

  assertEquals(summary?.state, "failed");
  assertEquals(summary?.reason, "machine_not_allowed");
  assertEquals(summary?.canRetry, true);
});

Deno.test("does not make dry runs retryable", () => {
  const summary = getKexiaozhanNotificationSummary({
    kexiaozhan: {
      paymentNotification: {
        mode: "dry_run",
        reason: "notify_gate_disabled",
      },
    },
  });

  assertEquals(summary, {
    state: "dry_run",
    reason: "notify_gate_disabled",
    vendorCode: null,
    message: null,
    attemptedAt: null,
    canRetry: false,
  });
});

Deno.test("fails legacy or malformed notification metadata safely", () => {
  const summary = getKexiaozhanNotificationSummary({
    kexiaozhan: {
      paymentNotification: {
        mode: "<script>unsafe</script>",
        reason: "contains spaces and secrets",
        generatedAt: "not-a-date",
        response: {
          ok: false,
          code: "not-a-code",
          message: "line one\u0000 line two",
          error: "also unsafe!",
        },
      },
    },
  });

  assertEquals(summary?.state, "failed");
  assertEquals(summary?.reason, "unknown_failure");
  assertEquals(summary?.vendorCode, null);
  assertEquals(summary?.message, "line one line two");
  assertEquals(summary?.attemptedAt, null);
  assertMatch(
    kexiaozhanNotificationLastError(summary) ?? "",
    /unknown_failure/,
  );
});

Deno.test("returns null when a job is not from Kexiaozhan", () => {
  assertEquals(getKexiaozhanNotificationSummary({ routed_at: "now" }), null);
  assertEquals(
    fulfillmentStatusForKexiaozhanNotification(
      "onshore_manual_queued",
      null,
    ),
    "onshore_manual_queued",
  );
  assertEquals(kexiaozhanNotificationLastError(null), null);
});
