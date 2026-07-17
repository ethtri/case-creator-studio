import {
  postGa4Measurement,
  sendGa4Event,
  type AnalyticsStore,
} from "./ga4-measurement.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`Expected ${right}, received ${left}`);
  }
};

const assertRejects = async (
  callback: () => Promise<unknown>,
  pattern: RegExp,
) => {
  try {
    await callback();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!pattern.test(message)) {
      throw new Error(`Expected ${pattern}, received ${message}`);
    }
    return;
  }
  throw new Error("Expected promise to reject");
};

Deno.test("missing GA credentials fail before a network call", async () => {
  let fetchCalls = 0;
  await assertRejects(
    () =>
      postGa4Measurement({
        payload: {
          client_id: "123.456",
          events: [{ name: "purchase", params: {} }],
        },
        fetchImpl() {
          fetchCalls += 1;
          return Promise.resolve(new Response(null, { status: 204 }));
        },
      }),
    /credentials are not configured/,
  );
  assertEquals(fetchCalls, 0);
});

Deno.test("GA HTTP failure persists a retryable diagnostic", async () => {
  const calls: string[] = [];
  const store: AnalyticsStore = {
    rpc(name) {
      calls.push(name);
      if (name === "claim_analytics_event") {
        return Promise.resolve({
          data: [{
            claim_token: "11111111-1111-4111-8111-111111111111",
            id: "22222222-2222-4222-8222-222222222222",
          }],
          error: null,
        });
      }
      if (name === "fail_analytics_event") {
        return Promise.resolve({
          data: [{ status: "failed" }],
          error: null,
        });
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };

  await assertRejects(
    () =>
      sendGa4Event({
        apiSecret: "test-secret",
        clientId: "123.456",
        eventKey: "purchase:order",
        eventName: "purchase",
        eventParams: {},
        fetchImpl: () =>
          Promise.resolve(new Response(null, { status: 503 })),
        measurementId: "G-TEST",
        store,
      }),
    /returned 503/,
  );

  assertEquals(calls, ["claim_analytics_event", "fail_analytics_event"]);
});

Deno.test("post-send persistence failure is marked ambiguous", async () => {
  const calls: string[] = [];
  const store: AnalyticsStore = {
    rpc(name) {
      calls.push(name);
      if (name === "claim_analytics_event") {
        return Promise.resolve({
          data: [{
            claim_token: "11111111-1111-4111-8111-111111111111",
            id: "22222222-2222-4222-8222-222222222222",
          }],
          error: null,
        });
      }
      if (name === "complete_analytics_event") {
        return Promise.resolve({
          data: null,
          error: { message: "database unavailable" },
        });
      }
      if (name === "mark_analytics_event_ambiguous") {
        return Promise.resolve({ data: true, error: null });
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };

  await assertRejects(
    () =>
      sendGa4Event({
        apiSecret: "test-secret",
        clientId: "123.456",
        eventKey: "refund:re_test",
        eventName: "refund",
        eventParams: {},
        fetchImpl: () =>
          Promise.resolve(new Response(null, { status: 204 })),
        measurementId: "G-TEST",
        store,
      }),
    /sent-state update was not confirmed/,
  );

  assertEquals(calls, [
    "claim_analytics_event",
    "complete_analytics_event",
    "mark_analytics_event_ambiguous",
  ]);
});
