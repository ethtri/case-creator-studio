// Disposable native PostgreSQL tests. Synthetic fixtures only; no provider/network APIs.
const fs = require("fs"),
  crypto = require("crypto"),
  assert = require("assert/strict");
const { Client } = require(process.env.LIFECYCLE_PG_DRIVER_PATH || "pg");
const root = process.env.LIFECYCLE_SQL_RESULTS_DIR;
if (!root || !process.env.LIFECYCLE_SQL_CONNECTION_FILE) {
  throw Error("Explicit disposable fixture configuration required");
}
const cfg = JSON.parse(
  fs.readFileSync(process.env.LIFECYCLE_SQL_CONNECTION_FILE, "utf8").replace(
    /^\uFEFF/,
    "",
  ),
);
cfg.database = "lifecycle_qa";
if (
  cfg.host !== "127.0.0.1" || cfg.port !== 55439 ||
  cfg.database !== "lifecycle_qa"
) {
  throw Error("Disposable localhost fixture guard failed");
}
const repo = require("path").join(__dirname, "../supabase/migrations/");
const results = [], hashes = {};
let c;
async function q(sql, args = []) {
  return (await c.query(sql, args)).rows;
}
async function val(sql, args = []) {
  return Object.values((await q(sql, args))[0])[0];
}
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message, code: e.code });
  }
}
async function reset() {
  await q(
    "TRUNCATE lifecycle_worker_events,lifecycle_worker_reservations,lifecycle_marketing_subscribers,designs,orders,auth.users CASCADE",
  );
}
async function sub(n) {
  const id = crypto.randomUUID();
  await q(
    `INSERT INTO lifecycle_marketing_subscribers(id,email_normalized,source,placement,consent_copy_version,privacy_policy_version,granted_at) VALUES($1,$2,'website','homepage_email_card','lifecycle_marketing_home_v1','2026-07-22',now()-interval '1 hour')`,
    [id, `synthetic${n}@fixture.test`],
  );
  await q(
    `INSERT INTO lifecycle_marketing_consent_events(subscriber_id,request_id,event_type,source,placement,consent_copy_version,privacy_policy_version,occurred_at) VALUES($1,$2,'granted','website','homepage_email_card','lifecycle_marketing_home_v1','2026-07-22',now()-interval '1 hour')`,
    [id, crypto.randomUUID()],
  );
  return id;
}
async function welcome(s) {
  return val(
    `INSERT INTO lifecycle_marketing_outbox(subscriber_id,operation,idempotency_key) VALUES($1,'welcome',$2) RETURNING id`,
    [s, crypto.randomUUID()],
  );
}
async function claim(account = "synthetic", daily = 10, monthly = 10) {
  return val(
    `SELECT lifecycle_worker_claim(ARRAY['welcome','abandoned_design','abandoned_cart'],$1,$2,$3,now())`,
    [account, daily, monthly],
  );
}
async function prepare(cl, account = "synthetic", daily = 10, monthly = 10) {
  return val("SELECT lifecycle_worker_prepare($1,$2,$3,$4,$5)", [
    cl.id,
    cl.claim_token,
    account,
    daily,
    monthly,
  ]);
}
async function design(n) {
  const s = await sub(n), u = crypto.randomUUID(), d = crypto.randomUUID();
  await q("INSERT INTO auth.users(id)VALUES($1)", [u]);
  await q(
    `INSERT INTO designs(id,user_id,design_id,variant_id,edm_template_id)VALUES($1,$2,$3,'iphone-17-pro-max',100)`,
    [d, u, crypto.randomUUID()],
  );
  const r = await val("SELECT register_saved_design_recovery($1,$2,$3)", [
    u,
    `synthetic${n}@fixture.test`,
    d,
  ]);
  await q(
    `UPDATE lifecycle_recovery_intents SET eligible_after=now()-interval '1 minute' WHERE id=$1`,
    [r],
  );
  await q(
    `UPDATE lifecycle_marketing_outbox SET next_attempt_at=now()-interval '1 minute' WHERE recovery_intent_id=$1`,
    [r],
  );
  const o = await val(
    "SELECT id FROM lifecycle_marketing_outbox WHERE recovery_intent_id=$1",
    [r],
  );
  return { s, u, d, r, o };
}
async function cart(n) {
  const s = await sub(n), o = crypto.randomUUID();
  await q(
    `INSERT INTO orders(id,customer_email,status,items)VALUES($1,$2,'pending',$3)`,
    [
      o,
      `synthetic${n}@fixture.test`,
      JSON.stringify([{
        variantId: "iphone-17-pro-max",
        quantity: 1,
        edmTemplateId: 100,
      }]),
    ],
  );
  const r = await val("SELECT register_abandoned_cart_recovery($1,$2)", [
    o,
    `synthetic${n}@fixture.test`,
  ]);
  await q(
    `UPDATE lifecycle_recovery_intents SET eligible_after=now()-interval '1 minute' WHERE id=$1`,
    [r],
  );
  await q(
    `UPDATE lifecycle_marketing_outbox SET next_attempt_at=now()-interval '1 minute' WHERE recovery_intent_id=$1`,
    [r],
  );
  return { s, o, r };
}
(async () => {
  c = new Client(cfg);
  await c.connect();
  await q(
    "DROP SCHEMA public CASCADE;CREATE SCHEMA public;DROP SCHEMA IF EXISTS auth CASCADE;CREATE SCHEMA auth;CREATE SCHEMA IF NOT EXISTS extensions;CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions",
  );
  await q(
    `DO $$BEGIN CREATE ROLE anon;EXCEPTION WHEN duplicate_object THEN NULL;END$$;DO $$BEGIN CREATE ROLE authenticated;EXCEPTION WHEN duplicate_object THEN NULL;END$$;DO $$BEGIN CREATE ROLE service_role;EXCEPTION WHEN duplicate_object THEN NULL;END$$;GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;CREATE TABLE auth.users(id uuid primary key);CREATE TABLE public.designs(id uuid primary key,user_id uuid,design_id text,variant_id text,edm_template_id integer,external_product_id text,preview_url text,preview_url_angled text);CREATE TABLE public.orders(id uuid primary key,user_id uuid,customer_email text,status text,items jsonb);`,
  );
  for (const prefix of ["20260722120000", "20260827151509", "20261002155310"]) {
    const name = fs.readdirSync(repo).find((n) => n.startsWith(prefix));
    const sql = fs.readFileSync(repo + name, "utf8");
    hashes[name] = crypto.createHash("sha256").update(sql).digest("hex");
    await q(sql);
    results.push({ name: "migration " + name, status: "PASS" });
  }
  await test("simultaneous claims unique; same subscriber scope", async () => {
    await reset();
    const s = await sub(1);
    await welcome(s);
    await welcome(s);
    const b = new Client(cfg);
    await b.connect();
    try {
      const [a, z] = await Promise.all([
        claim(),
        b.query(
          `SELECT lifecycle_worker_claim(ARRAY['welcome','abandoned_design','abandoned_cart'],'synthetic',10,10,now())`,
        ).then((r) => r.rows[0].lifecycle_worker_claim),
      ]);
      assert.equal([a, z].filter(Boolean).length, 1);
    } finally {
      await b.end();
    }
  });
  await test("atomic daily capacity and no duplicate reservation", async () => {
    await reset();
    await welcome(await sub(2));
    await welcome(await sub(3));
    const b = new Client(cfg);
    await b.connect();
    try {
      const [a, z] = await Promise.all([
        claim("quota", 1, 10),
        b.query(
          "SELECT lifecycle_worker_claim(ARRAY['welcome'],'quota',1,10,now())",
        ).then((r) => r.rows[0].lifecycle_worker_claim),
      ]);
      assert.equal([a, z].filter(Boolean).length, 1);
      assert.equal(
        await val("SELECT count(*)::int FROM lifecycle_worker_reservations"),
        1,
      );
      const cl = a || z;
      assert(await prepare(cl, "quota", 1, 10));
      assert.equal(
        await val(
          "SELECT count(*)::int FROM lifecycle_marketing_preference_tokens",
        ),
        1,
      );
      await assert.rejects(
        () => prepare(cl, "quota", 1, 10),
        /worker_preparation_already_exists/,
      );
      assert.equal(
        await val(
          "SELECT count(*)::int FROM lifecycle_marketing_preference_tokens",
        ),
        1,
      );
      assert.equal(
        await val("SELECT count(*)::int FROM lifecycle_worker_reservations"),
        1,
      );
    } finally {
      await b.end();
    }
  });
  await test("callback and completion serialize in both commit orders", async () => {
    const b = new Client(cfg);
    await b.connect();
    try {
      for (const callbackFirst of [true, false]) {
        await reset();
        const subscriber = await sub(100);
        await welcome(subscriber);
        const cl = await claim();
        await prepare(cl);
        const at = new Date().toISOString();
        const eventArgs = ["event_race", "message_race", "email.bounced", at];
        const finishArgs = [cl.id, cl.claim_token, "completed", "message_race"];
        await b.query("BEGIN");
        if (callbackFirst) {
          assert.equal(
            (await b.query(
              "SELECT lifecycle_worker_apply_event($1,$2,$3,$4)",
              eventArgs,
            )).rows[0].lifecycle_worker_apply_event,
            "unmatched",
          );
          const pending = q(
            "SELECT lifecycle_worker_finish($1,$2,$3,$4)",
            finishArgs,
          );
          await b.query("SELECT pg_sleep(0.05)");
          await b.query("COMMIT");
          await pending;
        } else {
          await b.query(
            "SELECT lifecycle_worker_finish($1,$2,$3,$4)",
            finishArgs,
          );
          const pending = q(
            "SELECT lifecycle_worker_apply_event($1,$2,$3,$4)",
            eventArgs,
          );
          await b.query("SELECT pg_sleep(0.05)");
          await b.query("COMMIT");
          await pending;
        }
        assert.equal(
          await val(
            "SELECT outcome FROM lifecycle_worker_events WHERE event_id='event_race'",
          ),
          "applied",
        );
        assert.equal(
          await val(
            "SELECT status FROM lifecycle_marketing_subscribers WHERE id=$1",
            [subscriber],
          ),
          "suppressed",
        );
      }
    } finally {
      await b.end();
    }
  });
  await test("known acceptance in uncertain state reconciles early bounce", async () => {
    await reset();
    const subscriber = await sub(102);
    await welcome(subscriber);
    const cl = await claim();
    await prepare(cl);
    const at = new Date().toISOString();
    assert.equal(
      await val("SELECT lifecycle_worker_apply_event($1,$2,$3,$4)", [
        "event_uncertain",
        "message_uncertain",
        "email.bounced",
        at,
      ]),
      "unmatched",
    );
    assert.equal(
      await val("SELECT lifecycle_worker_finish($1,$2,'uncertain',$3)", [
        cl.id,
        cl.claim_token,
        "message_uncertain",
      ]),
      true,
    );
    assert.equal(
      await val(
        "SELECT status FROM lifecycle_marketing_subscribers WHERE id=$1",
        [subscriber],
      ),
      "suppressed",
    );
    assert.equal(
      await val(
        "SELECT outcome FROM lifecycle_worker_events WHERE event_id='event_uncertain'",
      ),
      "applied",
    );
    assert.equal(
      await val("SELECT status FROM lifecycle_marketing_outbox WHERE id=$1", [
        cl.id,
      ]),
      "uncertain",
    );
  });
  await test("old-day deferred reservation cannot bypass exhausted current quota", async () => {
    await reset();
    await welcome(await sub(103));
    const cl = await claim("midnight", 1, 10);
    await val("SELECT lifecycle_worker_finish($1,$2,'deferred',null)", [
      cl.id,
      cl.claim_token,
    ]);
    await q(
      "UPDATE lifecycle_worker_reservations SET reserved_at=now()-interval '1 day' WHERE outbox_id=$1",
      [cl.id],
    );
    await q(
      "UPDATE lifecycle_marketing_outbox SET next_attempt_at=now()-interval '1 minute' WHERE id=$1",
      [cl.id],
    );
    const other = await welcome(await sub(104));
    await q(
      "INSERT INTO lifecycle_worker_reservations(outbox_id,account_id) VALUES($1,'midnight')",
      [other],
    );
    assert.equal(await claim("midnight", 1, 10), null);
    assert.equal(
      await val("SELECT status FROM lifecycle_marketing_outbox WHERE id=$1", [
        cl.id,
      ]),
      "pending",
    );
    await q("DELETE FROM lifecycle_worker_reservations WHERE outbox_id=$1", [
      other,
    ]);
    assert(await claim("midnight", 1, 10));
    assert.equal(
      await val(
        "SELECT count(*)::int FROM lifecycle_worker_reservations WHERE account_id='midnight' AND reserved_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
      ),
      1,
    );
  });
  await test("in-flight claim crossing UTC day cannot prepare or send on old reservation", async () => {
    await reset();
    await welcome(await sub(105));
    const cl = await claim("inflight", 1, 10);
    await q(
      "UPDATE lifecycle_worker_reservations SET reserved_at=now()-interval '1 day' WHERE outbox_id=$1",
      [cl.id],
    );
    await assert.rejects(
      () => prepare(cl, "inflight", 1, 10),
      /worker_capacity_period_or_lease_changed/,
    );
    assert.equal(
      await val("SELECT lifecycle_worker_recheck($1,$2)", [
        cl.id,
        cl.claim_token,
      ]),
      "deferred",
    );
    assert.equal(
      await val(
        "SELECT count(*)::int FROM lifecycle_marketing_preference_tokens",
      ),
      0,
    );
    assert.equal(
      await val("SELECT lifecycle_worker_finish($1,$2,'deferred',null)", [
        cl.id,
        cl.claim_token,
      ]),
      true,
    );
    assert.equal(
      await val("SELECT status FROM lifecycle_marketing_outbox WHERE id=$1", [
        cl.id,
      ]),
      "pending",
    );
    await q(
      "UPDATE lifecycle_marketing_outbox SET next_attempt_at=now()-interval '1 minute' WHERE id=$1",
      [cl.id],
    );
    const next = await claim("inflight", 1, 10);
    assert(next);
    assert(await prepare(next, "inflight", 1, 10));
    assert.equal(
      await val("SELECT lifecycle_worker_recheck($1,$2)", [
        next.id,
        next.claim_token,
      ]),
      "eligible",
    );
  });
  await test("monthly capacity depletion", async () => {
    await reset();
    await welcome(await sub(4));
    await welcome(await sub(5));
    assert(await claim("monthly", 100, 1));
    assert.equal(await claim("monthly", 100, 1), null);
  });
  await test("suppression after claim fails recheck/prepare", async () => {
    await reset();
    const s = await sub(6);
    await welcome(s);
    const cl = await claim();
    await q(
      `UPDATE lifecycle_marketing_subscribers SET status='suppressed',revoked_at=now(),suppression_reason='unsubscribe' WHERE id=$1`,
      [s],
    );
    assert.equal(await prepare(cl), null);
    assert.equal(
      await val("SELECT lifecycle_worker_recheck($1,$2)", [
        cl.id,
        cl.claim_token,
      ]),
      "suppressed",
    );
  });
  await test("consent missing / QA campaign / exclusion fail closed", async () => {
    await reset();
    const s = await sub(7), o = await welcome(s);
    await q(
      "DELETE FROM lifecycle_marketing_consent_events WHERE subscriber_id=$1",
      [s],
    );
    assert.equal(await val("SELECT lifecycle_worker_eligible($1)", [o]), false);
    const s2 = await sub(8), o2 = await welcome(s2);
    await q(
      "UPDATE lifecycle_marketing_subscribers SET campaign='qa_fixture' WHERE id=$1",
      [s2],
    );
    assert.equal(
      await val("SELECT lifecycle_worker_eligible($1)", [o2]),
      false,
    );
    const s3 = await sub(9), o3 = await welcome(s3);
    await q(
      "INSERT INTO lifecycle_recovery_exclusions(subscriber_id,reason)VALUES($1,'test_fixture')",
      [s3],
    );
    assert.equal(
      await val("SELECT lifecycle_worker_eligible($1)", [o3]),
      false,
    );
  });
  await test("design token restore / consume / replay", async () => {
    await reset();
    const f = await design(10), cl = await claim(), p = await prepare(cl);
    assert(p);
    assert.equal(
      (await val("SELECT get_lifecycle_recovery_state($1,false)", [
        p.recoveryToken,
      ])).status,
      "ready",
    );
    assert.equal(
      (await val("SELECT get_lifecycle_recovery_state($1,true)", [
        p.recoveryToken,
      ])).status,
      "ready",
    );
    assert.equal(
      (await val("SELECT get_lifecycle_recovery_state($1,true)", [
        p.recoveryToken,
      ])).status,
      "already_used",
    );
    assert.equal(
      await val("SELECT status FROM lifecycle_marketing_outbox WHERE id=$1", [
        cl.id,
      ]),
      "suppressed",
    );
  });
  await test("preference token unsubscribe and replay", async () => {
    await reset();
    await welcome(await sub(11));
    const cl = await claim(), p = await prepare(cl);
    assert.equal(
      (await val("SELECT unsubscribe_lifecycle_marketing($1,$2)", [
        p.preferenceToken,
        crypto.randomUUID(),
      ])).status,
      "unsubscribed",
    );
    assert.equal(
      (await val("SELECT unsubscribe_lifecycle_marketing($1,$2)", [
        p.preferenceToken,
        crypto.randomUUID(),
      ])).status,
      "already_unsubscribed",
    );
    assert.equal(
      await val("SELECT lifecycle_worker_recheck($1,$2)", [
        cl.id,
        cl.claim_token,
      ]),
      "suppressed",
    );
  });
  await test("purchase after claim cancels cart", async () => {
    await reset();
    const f = await cart(12), cl = await claim();
    assert(cl);
    await q("UPDATE orders SET status='paid' WHERE id=$1", [f.o]);
    assert.equal(await prepare(cl), null);
    assert.equal(
      await val("SELECT status FROM lifecycle_recovery_intents WHERE id=$1", [
        f.r,
      ]),
      "purchased",
    );
  });
  await test("stale revision after claim cancels design", async () => {
    await reset();
    const f = await design(13), cl = await claim(), p = await prepare(cl);
    await q("UPDATE designs SET edm_template_id=101 WHERE id=$1", [f.d]);
    assert.equal(await prepare(cl), null);
    assert.equal(
      (await val("SELECT get_lifecycle_recovery_state($1,false)", [
        p.recoveryToken,
      ])).status,
      "stale_revision",
    );
    assert.equal(
      await val("SELECT status FROM lifecycle_recovery_intents WHERE id=$1", [
        f.r,
      ]),
      "invalidated",
    );
  });
  await test("design deletion cancels recovery", async () => {
    await reset();
    const f = await design(14);
    await q("DELETE FROM designs WHERE id=$1", [f.d]);
    assert.equal(
      await val("SELECT lifecycle_worker_eligible($1)", [f.o]),
      false,
    );
  });
  await test("unsupported model excluded", async () => {
    await reset();
    const f = await design(15);
    await q("UPDATE designs SET variant_id='unsupported-fixture' WHERE id=$1", [
      f.d,
    ]);
    assert.equal(
      await val("SELECT lifecycle_worker_eligible($1)", [f.o]),
      false,
    );
    assert.equal(
      await val(
        "SELECT lifecycle_recovery_variant_supported('unsupported-fixture')",
      ),
      false,
    );
  });
  await test("expired claim uncertain, not reclaimed; token-bound completion", async () => {
    await reset();
    await welcome(await sub(16));
    const cl = await claim();
    await prepare(cl);
    await q(
      "UPDATE lifecycle_marketing_outbox SET lease_expires_at=now()-interval '1 minute' WHERE id=$1",
      [cl.id],
    );
    assert.equal(await claim(), null);
    assert.equal(
      await val("SELECT status FROM lifecycle_marketing_outbox WHERE id=$1", [
        cl.id,
      ]),
      "uncertain",
    );
    assert.equal(
      await val(
        "SELECT lifecycle_worker_finish($1,$2,'completed','synthetic-message')",
        [cl.id, crypto.randomUUID()],
      ),
      false,
    );
    assert.equal(
      await val(
        "SELECT lifecycle_worker_finish($1,$2,'completed','synthetic-message')",
        [cl.id, cl.claim_token],
      ),
      true,
    );
    assert.equal(
      await val(
        "SELECT lifecycle_worker_finish($1,$2,'completed','synthetic-message')",
        [cl.id, cl.claim_token],
      ),
      false,
    );
  });
  await test("native bounce before acceptance reconciles; replay idempotent", async () => {
    await reset();
    const s = await sub(17);
    await welcome(s);
    const cl = await claim();
    await prepare(cl);
    const at = "2026-10-02T15:00:00Z";
    assert.equal(
      await val(
        "SELECT lifecycle_worker_apply_event('synthetic-event','synthetic-bounce','email.bounced',$1)",
        [at],
      ),
      "unmatched",
    );
    await val(
      "SELECT lifecycle_worker_finish($1,$2,'completed','synthetic-bounce')",
      [cl.id, cl.claim_token],
    );
    assert.equal(
      await val(
        "SELECT status FROM lifecycle_marketing_subscribers WHERE id=$1",
        [s],
      ),
      "suppressed",
    );
    assert.equal(
      await val(
        "SELECT lifecycle_worker_apply_event('synthetic-event','synthetic-bounce','email.bounced',$1)",
        [at],
      ),
      "duplicate",
    );
    assert.equal(
      await val(
        "SELECT count(*)::int FROM lifecycle_marketing_consent_events WHERE event_type='provider_suppressed'",
      ),
      1,
    );
  });
  await test("flow allowlist and stale quota evidence fail closed", async () => {
    await reset();
    await welcome(await sub(18));
    assert.equal(
      await val(
        "SELECT lifecycle_worker_claim(ARRAY['abandoned_cart'],'synthetic',10,10,now())",
      ),
      null,
    );
    assert.equal(
      await val(
        "SELECT lifecycle_worker_claim(ARRAY['welcome'],'synthetic',10,10,now()-interval '16 minutes')",
      ),
      null,
    );
    assert.equal(
      await val(
        "SELECT lifecycle_worker_claim(ARRAY['welcome'],'synthetic',10,10,now()+interval '1 minute')",
      ),
      null,
    );
    assert.equal(
      await val("SELECT count(*)::int FROM lifecycle_worker_reservations"),
      0,
    );
  });
  await test("completed requires provider acceptance; late suppression retained", async () => {
    await reset();
    const f = await design(19), cl = await claim();
    await prepare(cl);
    await assert.rejects(
      () =>
        q(`SELECT lifecycle_worker_finish($1,$2,'completed',null)`, [
          cl.id,
          cl.claim_token,
        ]),
      /missing_provider_acceptance/,
    );
    await q(
      "UPDATE lifecycle_marketing_subscribers SET status='suppressed',revoked_at=now(),suppression_reason='unsubscribe' WHERE id=$1",
      [f.s],
    );
    assert.equal(
      await val(
        "SELECT lifecycle_worker_finish($1,$2,'completed','late-synthetic-message')",
        [cl.id, cl.claim_token],
      ),
      true,
    );
    assert.equal(
      await val("SELECT status FROM lifecycle_marketing_outbox WHERE id=$1", [
        cl.id,
      ]),
      "suppressed",
    );
  });
  await test("native event mismatch refused", async () => {
    await reset();
    await val(
      "SELECT lifecycle_worker_apply_event('fixture-mismatch','fixture-message','email.sent',now())",
    );
    await assert.rejects(
      () =>
        q("SELECT lifecycle_worker_apply_event('fixture-mismatch','other-message','email.bounced',now())"),
      /native_event_replay_mismatch/,
    );
  });
  await test("anon/authenticated denied worker RPC", async () => {
    for (const role of ["anon", "authenticated"]) {
      await q("SET ROLE " + role);
      await assert.rejects(
        () =>
          q("SELECT public.lifecycle_worker_claim(ARRAY['welcome'],'synthetic',10,10,now())"),
        /permission denied/,
      );
      await q("RESET ROLE");
    }
  });
  await test("bounded preparation deferral retains single reservation", async () => {
    await reset();
    await welcome(await sub(20));
    let cl = await claim();
    const id = cl.id;
    for (let i = 0; i < 3; i++) {
      assert.equal(
        await val("SELECT lifecycle_worker_finish($1,$2,'deferred',null)", [
          cl.id,
          cl.claim_token,
        ]),
        true,
      );
      await q(
        "UPDATE lifecycle_marketing_outbox SET next_attempt_at=now()-interval '1 minute' WHERE id=$1",
        [id],
      );
      if (i < 2) {
        cl = await claim();
        assert(cl);
        assert.equal(cl.id, id);
      }
    }
    assert.equal(await claim(), null);
    assert.equal(
      await val("SELECT count(*)::int FROM lifecycle_worker_reservations"),
      1,
    );
  });
  await test("wrong claim/account cannot prepare", async () => {
    await reset();
    await welcome(await sub(21));
    const cl = await claim();
    assert.equal(
      await prepare({ ...cl, claim_token: crypto.randomUUID() }),
      null,
    );
    assert.equal(await prepare(cl, "wrong-account"), null);
    assert.equal(
      await val(
        "SELECT count(*)::int FROM lifecycle_marketing_preference_tokens",
      ),
      0,
    );
  });
  await test("order deletion cancels recovery and removes link", async () => {
    await reset();
    const f = await cart(22), cl = await claim();
    await q("DELETE FROM orders WHERE id=$1", [f.o]);
    assert.equal(await prepare(cl), null);
    assert.equal(
      await val("SELECT status FROM lifecycle_recovery_intents WHERE id=$1", [
        f.r,
      ]),
      "deleted",
    );
    assert.equal(
      await val("SELECT order_id FROM lifecycle_recovery_intents WHERE id=$1", [
        f.r,
      ]),
      null,
    );
  });
  await test("uncertain cannot defer or regain capacity", async () => {
    await reset();
    await welcome(await sub(23));
    const cl = await claim();
    await prepare(cl);
    assert.equal(
      await val("SELECT lifecycle_worker_finish($1,$2,'uncertain',null)", [
        cl.id,
        cl.claim_token,
      ]),
      true,
    );
    assert.equal(
      await val("SELECT lifecycle_worker_finish($1,$2,'deferred',null)", [
        cl.id,
        cl.claim_token,
      ]),
      false,
    );
    assert.equal(
      await val("SELECT status FROM lifecycle_marketing_outbox WHERE id=$1", [
        cl.id,
      ]),
      "uncertain",
    );
    assert.equal(await claim(), null);
    assert.equal(
      await val("SELECT count(*)::int FROM lifecycle_worker_reservations"),
      1,
    );
  });
  await test("observed provider opt-out irreversibly suppresses canonical consent and all recovery", async () => {
    await reset();
    const f = await design(106);
    const cl = await claim();
    const p = await prepare(cl);
    assert(p);
    const other = await welcome(f.s);
    assert.equal(
      await val(
        "SELECT lifecycle_worker_finish($1,$2,'provider_suppressed',null)",
        [cl.id, cl.claim_token],
      ),
      true,
    );
    assert.equal(
      await val(
        "SELECT status FROM lifecycle_marketing_subscribers WHERE id=$1",
        [f.s],
      ),
      "suppressed",
    );
    assert.equal(
      await val(
        "SELECT count(*)::int FROM lifecycle_marketing_consent_events WHERE subscriber_id=$1 AND event_type='provider_suppressed'",
        [f.s],
      ),
      1,
    );
    assert.equal(
      (await val("SELECT get_lifecycle_recovery_state($1,false)", [
        p.recoveryToken,
      ])).status,
      "revoked",
    );
    assert.equal(
      await val("SELECT lifecycle_worker_eligible($1)", [other]),
      false,
    );
    assert.equal(
      (await val(
        "SELECT register_lifecycle_marketing_consent($1,$2,'website','homepage_email_card',null,'lifecycle_marketing_home_v1','2026-07-22',true)",
        ["synthetic106@fixture.test", crypto.randomUUID()],
      )).status,
      "suppressed",
    );
    assert.equal(await claim(), null);
    assert.equal(
      await val(
        "SELECT lifecycle_worker_finish($1,$2,'provider_suppressed',null)",
        [cl.id, cl.claim_token],
      ),
      true,
    );
    assert.equal(
      await val(
        "SELECT count(*)::int FROM lifecycle_marketing_consent_events WHERE subscriber_id=$1 AND event_type='provider_suppressed'",
        [f.s],
      ),
      1,
    );
  });
  await test("depleted quota leaves next job pending with zero attempts", async () => {
    await reset();
    await welcome(await sub(24));
    const second = await welcome(await sub(25));
    assert(await claim("depletion", 1, 1));
    assert.equal(await claim("depletion", 1, 1), null);
    assert.equal(
      await val(
        "SELECT count(*)::int FROM lifecycle_marketing_outbox WHERE status='pending' AND attempts=0",
      ),
      1,
    );
  });
  await c.end();
  const output = {
    observedAt: new Date().toISOString(),
    fixtureOnly: true,
    providerCalls: 0,
    productionConnections: 0,
    migrationHashes: hashes,
    results,
  };
  fs.writeFileSync(
    root + "/migration-results.json",
    JSON.stringify(output, null, 2),
  );
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = results.some((r) => r.status === "FAIL") ? 1 : 0;
})().catch(async (e) => {
  console.error(e.message);
  if (c) {
    await c.end();
  }
  process.exitCode = 1;
});
