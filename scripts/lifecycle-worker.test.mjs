import test from "node:test";
import assert from "node:assert/strict";
import {
  activationBlocks,
  runLifecycleWorker,
  workerAuthorized,
} from "../supabase/functions/_shared/lifecycle-worker.ts";
import { COPY } from "../supabase/functions/_shared/lifecycle-worker-copy.ts";
import { createLifecycleOutboxHandler } from "../supabase/functions/_shared/lifecycle-worker-http.ts";
import { handleLifecycleNativeWebhook } from "../supabase/functions/_shared/lifecycle-native-webhook.ts";
import { createHmac } from "node:crypto";
const evidence = () => ({
  source: "production_contract",
  projectUrl: "https://mdprdbaykuordozfctud.supabase.co",
  from: "hello@snapcase.ai",
  replyTo: "hello@snapcase.ai",
  authorityId: "authority_20260720_zero_spend_marketing",
  contractVersion: "1.0.0",
  seedAndQaExcluded: true,
  keyAccountVerified: true,
  webhookSchema: "svix_resend_native",
  noOverageVerified: true,
  evidenceClass: "production",
  observedAt: new Date().toISOString(),
  accountId: "account",
  domainId: "domain",
  webhookId: "hook",
  marketingTopicId: "marketing",
  bindingVerified: true,
  suppressionVerified: true,
  unsubscribeVerified: true,
  restorationVerified: true,
  freePlanVerified: true,
  dailyRemaining: 10,
  monthlyRemaining: 100,
  flows: ["welcome", "abandoned_design", "abandoned_cart"],
});
const input = (extra = {}) => ({
  dryRun: false,
  enabled: true,
  provider: "resend",
  activation: evidence(),
  ...extra,
});
const claim = { id: "claim", claim_token: "token", operation: "welcome" };
test("worker auth accepts server service-role or dedicated secret, rejects browser/ordinary JWT", () => {
  const req = (token, origin) =>
    new Request("https://example.invalid", {
      headers: {
        authorization: `Bearer ${token}`,
        ...(origin ? { origin } : {}),
      },
    });
  assert.ok(workerAuthorized(req("service"), ["", "service"]));
  assert.ok(workerAuthorized(req("worker"), ["worker", "service"]));
  assert.equal(workerAuthorized(req("anon"), ["worker", "service"]), false);
  assert.equal(workerAuthorized(req("user"), ["worker", "service"]), false);
  assert.equal(
    workerAuthorized(req("service", "https://www.snapcase.ai"), [
      "worker",
      "service",
    ]),
    false,
  );
  assert.equal(workerAuthorized(req(""), ["", ""]), false);
});
function mock(extra = {}) {
  const calls = [];
  return {
    calls,
    d: {
      aggregate: async () => {
        calls.push("aggregate");
        return { subscribers: 0, dueEligible: 0, uncertain: 0 };
      },
      verifyDomain: async () => {
        calls.push("domain");
        return true;
      },
      claim: async (e) => {
        calls.push(["claim", e.flows]);
        return claim;
      },
      prepare: async () => {
        calls.push("prepare");
        return { email: "fixture@example.invalid" };
      },
      providerEligibility: async () => {
        calls.push("providerEligibility");
        return "eligible";
      },
      recheck: async () => {
        calls.push("recheck");
        return "eligible";
      },
      deliver: async () => {
        calls.push("send");
        return "message-id";
      },
      finish: async (c, status, id) => {
        calls.push(["finish", status, id]);
      },
      ...extra,
    },
  };
}
test("disabled makes no claim, token, provider or database mutation", async () => {
  const m = mock();
  assert.equal(
    (await runLifecycleWorker(input({ enabled: false }), m.d)).result,
    "blocked",
  );
  assert.deepEqual(m.calls, []);
});
test("dry run reads real aggregates only and preserves explicit blockers", async () => {
  const m = mock();
  const r = await runLifecycleWorker(
    input({ dryRun: true, enabled: false, activation: null }),
    m.d,
  );
  assert.deepEqual(m.calls, ["aggregate"]);
  assert.equal(r.eligible.dueEligible, 0);
  assert.ok(r.blocks.includes("activation_evidence_missing"));
});
test("strict evidence rejects strings, wrong project, QA, stale and capacity failures", () => {
  for (
    const field of [
      "bindingVerified",
      "suppressionVerified",
      "unsubscribeVerified",
      "restorationVerified",
      "freePlanVerified",
      "seedAndQaExcluded",
      "keyAccountVerified",
      "noOverageVerified",
    ]
  ) {
    assert.ok(
      activationBlocks({ ...evidence(), [field]: "false" }).length,
      field,
    );
  }
  for (
    const patch of [
      { projectUrl: "https://staging.supabase.co" },
      { evidenceClass: "qa" },
      { dailyRemaining: 0 },
      { monthlyRemaining: 3001 },
      { flows: ["paid_campaign"] },
      { flows: ["welcome", "welcome"] },
      { observedAt: new Date(Date.now() - 901000).toISOString() },
    ]
  ) {
    assert.ok(activationBlocks({ ...evidence(), ...patch }).length);
  }
  assert.deepEqual(activationBlocks(evidence()), []);
});
test("domain drift blocks before claims", async () => {
  const m = mock({ verifyDomain: async () => false });
  assert.equal((await runLifecycleWorker(input(), m.d)).result, "blocked");
  assert.deepEqual(m.calls, []);
});
test("scope and exhausted quota stay inside atomic claim and leave work pending", async () => {
  const m = mock({
    claim: async (e) => {
      assert.deepEqual(e.flows, ["welcome"]);
      return null;
    },
  });
  assert.equal(
    (await runLifecycleWorker(
      input({ activation: { ...evidence(), flows: ["welcome"] } }),
      m.d,
    )).result,
    "no_eligible_claim",
  );
  assert.deepEqual(m.calls, ["domain"]);
});
test("fresh consent or suppression diff prevents provider action", async () => {
  const m = mock({ recheck: async () => "suppressed" });
  const r = await runLifecycleWorker(input(), m.d);
  assert.equal(r.result, "eligibility_or_capacity_blocked");
  assert.ok(!m.calls.includes("send"));
  assert.deepEqual(m.calls.at(-1), ["finish", "suppressed", undefined]);
});
test("period or lease change immediately before send defers without suppression", async () => {
  const m = mock({ recheck: async () => "deferred" });
  assert.equal(
    (await runLifecycleWorker(input(), m.d)).result,
    "eligibility_or_capacity_blocked",
  );
  assert.deepEqual(m.calls.at(-1), ["finish", "deferred", undefined]);
  assert.ok(!m.calls.includes("send"));
});
test("success durably records acceptance once", async () => {
  const m = mock();
  assert.equal(
    (await runLifecycleWorker(input(), m.d)).result,
    "provider_accepted",
  );
  assert.deepEqual(m.calls.at(-1), ["finish", "completed", "message-id"]);
  assert.equal(m.calls.filter((c) => c === "send").length, 1);
});
test("ambiguous send never retries or prepares another private token", async () => {
  const m = mock({
    deliver: async () => {
      throw Error("timeout");
    },
  });
  assert.equal(
    (await runLifecycleWorker(input(), m.d)).result,
    "reconciliation_required",
  );
  assert.deepEqual(m.calls.at(-1), ["finish", "uncertain", undefined]);
  assert.equal(m.calls.filter((c) => c === "prepare").length, 1);
});
test("completion failure retains accepted ID for reconciliation", async () => {
  const m = mock({
    finish: async (c, status, id) => {
      m.calls.push(["finish", status, id]);
      if (status === "completed") throw Error("DB lost");
    },
  });
  assert.equal(
    (await runLifecycleWorker(input(), m.d)).result,
    "reconciliation_required",
  );
  assert.deepEqual(m.calls.at(-1), ["finish", "uncertain", "message-id"]);
});
test("pre-provider transient failure is bounded deferred, not recipient suppression", async () => {
  const m = mock({
    prepare: async () => {
      throw Error("deadlock");
    },
  });
  assert.equal(
    (await runLifecycleWorker(input(), m.d)).result,
    "preparation_deferred",
  );
  assert.deepEqual(m.calls.at(-1), ["finish", "deferred", undefined]);
  assert.ok(!m.calls.includes("send"));
});
test("provider missing synchronization defers; explicit global/topic suppression blocks without sending", async () => {
  for (const status of ["unavailable", "suppressed"]) {
    const m = mock({ providerEligibility: async () => status });
    const r = await runLifecycleWorker(input(), m.d);
    assert.equal(
      r.result,
      status === "unavailable"
        ? "provider_synchronization_unavailable"
        : "provider_suppressed",
    );
    assert.deepEqual(m.calls.at(-1), [
      "finish",
      status === "unavailable" ? "deferred" : "suppressed",
      undefined,
    ]);
    assert.ok(!m.calls.includes("send"));
  }
});
test("approved copy contains exact private and unsubscribe placeholders", () => {
  assert.equal(COPY.welcome.subject, "Ready to start your custom phone case?");
  for (const copy of Object.values(COPY)) {
    assert.ok(copy.text.includes("{{unsubscribe_url}}"));
    assert.ok(copy.text.includes("{{physical_postal_address}}"));
  }
  for (const flow of ["abandoned_design", "abandoned_cart"]) {
    assert.ok(COPY[flow].text.includes("{{private_recovery_url}}"));
  }
});
function httpMock(settings = {}) {
  const calls = [];
  const env = {
    SUPABASE_URL: "https://mdprdbaykuordozfctud.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    LIFECYCLE_EMAIL_ENABLED: "false",
    LIFECYCLE_EMAIL_PROVIDER: "disabled",
    ...settings,
  };
  const handler = createLifecycleOutboxHandler({
    env: (n) => env[n],
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === "lifecycle_worker_aggregate") {
        return { subscribers: 0, dueEligible: 0, uncertain: 0 };
      }
      if (name === "lifecycle_worker_claim") {
        return claim;
      }
      if (name === "lifecycle_worker_prepare") {
        return {
          email: "synthetic@fixture.test",
          preferenceToken: "a".repeat(64),
          recoveryToken: "b".repeat(64),
          eventId: "event",
          recipientRef: "ref",
          idempotencyKey: "stable",
        };
      }
      if (name === "lifecycle_worker_recheck") return "eligible";
      return true;
    },
    providerFetch: async (url, opts) => {
      calls.push(["fetch", url, opts]);
      return new Response(
        JSON.stringify(
          url.includes("/domains/")
            ? { id: "domain", name: "snapcase.ai", status: "verified" }
            : url.endsWith("/topics")
            ? {
              has_more: false,
              data: [{ id: "marketing", subscription: "opt_in" }],
            }
            : url.includes("/contacts/")
            ? {
              id: "contact",
              email: "synthetic@fixture.test",
              unsubscribed: false,
            }
            : { id: "message" },
        ),
        { status: 200 },
      );
    },
  });
  return { handler, calls };
}
const request = (body, headers = {}) =>
  new Request("https://example.invalid", {
    method: "POST",
    headers: { authorization: "Bearer service", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
test("real HTTP wrapper rejects browser, unauthorized and malformed input without I/O", async () => {
  const m = httpMock();
  assert.equal(
    (await m.handler(
      request({ dryRun: true }, { origin: "https://www.snapcase.ai" }),
    )).status,
    403,
  );
  assert.equal(
    (await m.handler(
      request({ dryRun: true }, { authorization: "Bearer user" }),
    )).status,
    401,
  );
  for (const b of ["not-json", null, {}, [], { dryRun: "true" }]) {
    assert.equal((await m.handler(request(b))).status, 400);
  }
  assert.deepEqual(m.calls, []);
});
test("real HTTP disabled and dry-run are nonmutating and do not call provider", async () => {
  const m = httpMock();
  assert.equal((await m.handler(request({ dryRun: false }))).status, 503);
  assert.deepEqual(m.calls, []);
  const response = await m.handler(request({ dryRun: true }));
  assert.equal(response.status, 200);
  assert.deepEqual(m.calls, [["lifecycle_worker_aggregate", undefined]]);
  assert.deepEqual((await response.json()).eligible, {
    subscribers: 0,
    dueEligible: 0,
    uncertain: 0,
  });
});
test("real HTTP wrapper renders exact sender, tags and private one-click links with stable idempotency", async () => {
  const m = httpMock({
    LIFECYCLE_EMAIL_ENABLED: "true",
    LIFECYCLE_EMAIL_PROVIDER: "resend",
    LIFECYCLE_RESEND_API_KEY: "fixture",
    LIFECYCLE_ACTIVATION_EVIDENCE: JSON.stringify(evidence()),
  });
  const response = await m.handler(request({ dryRun: false }));
  assert.deepEqual(await response.json(), { result: "provider_accepted" });
  const send = m.calls.find((c) =>
    c[0] === "fetch" && c[1].endsWith("/emails")
  );
  assert.ok(send);
  const payload = JSON.parse(send[2].body);
  assert.equal(send[2].headers["Idempotency-Key"], "stable");
  assert.equal(payload.from, "Snapcase Team <hello@snapcase.ai>");
  assert.equal(payload.reply_to, "hello@snapcase.ai");
  assert.equal(payload.subject, COPY.welcome.subject);
  assert.ok(!payload.text.includes("{{"));
  assert.ok(payload.text.includes("1401 21st Street, Sacramento, CA 95811"));
  assert.equal(
    payload.headers["List-Unsubscribe-Post"],
    "List-Unsubscribe=One-Click",
  );
  assert.match(
    payload.headers["List-Unsubscribe"],
    /^<https:\/\/mdprdbaykuordozfctud.supabase.co\/functions\/v1\/lifecycle-email-preferences\?token=[a-f0-9]{64}>$/,
  );
  assert.deepEqual(payload.tags.map((t) => t.name), [
    "template_id",
    "campaign_id",
    "event_id",
    "recipient_ref",
  ]);
});
test("native Svix wrapper authenticates and persists only bounded event join fields", async () => {
  const now = Date.now(),
    timestamp = String(Math.floor(now / 1000)),
    id = "evt_fixture",
    secret = Buffer.from("fixture-signing-key").toString("base64");
  const body = JSON.stringify({
    type: "email.bounced",
    created_at: new Date(now).toISOString(),
    data: {
      email_id: "message_fixture",
      to: ["synthetic@fixture.test"],
      bounce: { message: "private error" },
    },
  });
  const sig = createHmac("sha256", Buffer.from(secret, "base64")).update(
    `${id}.${timestamp}.${body}`,
  ).digest("base64");
  const signed = () =>
    new Request("https://example.invalid", {
      method: "POST",
      body,
      headers: {
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": `v1,${sig}`,
      },
    });
  const calls = [];
  const options = {
    secret: `whsec_${secret}`,
    now: () => now,
    persist: async (args) => {
      calls.push(args);
      return "applied";
    },
  };
  assert.equal(
    (await handleLifecycleNativeWebhook(signed(), options)).status,
    200,
  );
  assert.deepEqual(calls, [{
    p_event: id,
    p_message: "message_fixture",
    p_type: "email.bounced",
    p_at: new Date(now).toISOString(),
  }]);
  const invalid = signed();
  invalid.headers.set("svix-signature", "v1,invalid");
  assert.equal(
    (await handleLifecycleNativeWebhook(invalid, options)).status,
    401,
  );
  assert.equal(calls.length, 1);
});
