#!/usr/bin/env bash
# Disposable CI database only. Never point this at a Snapcase database.
set -euo pipefail
: "${PGDATABASE:?Set PGDATABASE=shipping_offer_ci}"
[[ "$PGDATABASE" == shipping_offer_ci ]] || { echo 'Refusing non-fixture database'; exit 1; }
psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
SQL
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261009051116_capped_us_shipping_offer.sql
psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF (SELECT enabled FROM public.shipping_offer_config) THEN RAISE EXCEPTION 'Enabled by default'; END IF;
 IF has_function_privilege('anon','public.reserve_shipping_offer(uuid,text,jsonb)','execute') OR
    has_function_privilege('authenticated','public.reserve_shipping_offer(uuid,text,jsonb)','execute') OR
    has_table_privilege('anon','public.shipping_offer_reservations','select') THEN RAISE EXCEPTION 'Public ledger access'; END IF;
END $$;
UPDATE public.shipping_offer_config SET starts_at=date_trunc('second',now())-interval '1 minute',
 ends_at=date_trunc('second',now())-interval '1 minute'+interval '168 hours',
 enabled=true,eligible_variants='{"iphone-15":17722}',published_us_rate_verified=true,cost_evidence='CI fixture only';
DO $$ DECLARE item jsonb; BEGIN
 FOREACH item IN ARRAY ARRAY[NULL::jsonb,'null'::jsonb,'[]'::jsonb,'[{"variantId":"iphone-15"}]'::jsonb,
   '[{"quantity":1}]'::jsonb,'[{"variantId":"iphone-15","quantity":2}]'::jsonb] LOOP
  IF public.reserve_shipping_offer(gen_random_uuid(),repeat('a',64),item) IS NOT NULL THEN RAISE EXCEPTION 'Malformed item accepted: %',item; END IF;
 END LOOP;
END $$;
SQL
# Independent PostgreSQL connections contend on the real campaign-row lock.
pids=()
for i in $(seq 1 40); do
  psql -v ON_ERROR_STOP=1 -Atc "SET ROLE service_role; SELECT public.reserve_shipping_offer(gen_random_uuid(),repeat('a',64),'[{\"variantId\":\"iphone-15\",\"quantity\":1}]');" > /dev/null &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$ DECLARE r public.shipping_offer_reservations%ROWTYPE; original jsonb; BEGIN
 IF (SELECT count(*) FROM public.shipping_offer_reservations WHERE state <> 'released') <> 10 THEN RAISE EXCEPTION 'Concurrency cap failed'; END IF;
 IF (SELECT sum(waiver_cents) FROM public.shipping_offer_reservations WHERE state <> 'released') <> 4990 THEN RAISE EXCEPTION 'Dollar cap failed'; END IF;
 SELECT * INTO r FROM public.shipping_offer_reservations LIMIT 1;
 original := public.reserve_shipping_offer(r.attempt_id,r.request_hash,'[{"variantId":"iphone-15","quantity":1}]');
 IF original->>'attempt_id' <> r.attempt_id::text THEN RAISE EXCEPTION 'Retry identity changed'; END IF;
 BEGIN PERFORM public.reserve_shipping_offer(r.attempt_id,NULL,'[]'); RAISE EXCEPTION 'NULL hash accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='NULL hash accepted' THEN RAISE; END IF; END;
 BEGIN PERFORM public.bind_shipping_offer_session(r.attempt_id,NULL,'cs_test_fixture'); RAISE EXCEPTION 'NULL binding accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='NULL binding accepted' THEN RAISE; END IF; END;
 PERFORM public.settle_shipping_offer(r.attempt_id,r.request_hash,'cs_test_paid','paid');
 PERFORM public.settle_shipping_offer(r.attempt_id,r.request_hash,'cs_test_paid','released');
 IF (SELECT state FROM public.shipping_offer_reservations WHERE attempt_id=r.attempt_id) <> 'paid' THEN RAISE EXCEPTION 'Paid/refunded slot recycled'; END IF;
 BEGIN UPDATE public.shipping_offer_config SET ends_at=ends_at+interval '1 day', starts_at=starts_at+interval '1 day';
 RAISE EXCEPTION 'Offer window changed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Offer window changed' THEN RAISE; END IF; END;
 SELECT * INTO r FROM public.shipping_offer_reservations WHERE state='reserved' LIMIT 1;
 PERFORM public.settle_shipping_offer(r.attempt_id,r.request_hash,'cs_test_expired','released');
 IF public.reserve_shipping_offer(gen_random_uuid(),repeat('b',64),'[{"variantId":"iphone-15","quantity":1}]') IS NULL THEN RAISE EXCEPTION 'Proven expired slot unavailable'; END IF;
 IF (SELECT count(*) FROM public.shipping_offer_reservations WHERE state <> 'released') <> 10 THEN RAISE EXCEPTION 'Reallocation cap failed'; END IF;
END $$;
UPDATE public.shipping_offer_config SET enabled=false;
DO $$ BEGIN
 IF public.reserve_shipping_offer(gen_random_uuid(),repeat('c',64),'[{"variantId":"iphone-15","quantity":1}]') IS NOT NULL THEN RAISE EXCEPTION 'Disabled allocation'; END IF;
END $$;
SQL
echo 'PostgreSQL capacity, concurrency, binding, privilege and terminal-state checks passed.'
