-- Prepared only: no production application or activation authorized by this PR.
CREATE TABLE public.shipping_offer_config (
  id text PRIMARY KEY CHECK (id = 'us-standard-20261009'),
  enabled boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  ends_at timestamptz,
  eligible_variants jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (eligible_variants IN ('{}'::jsonb, '{"iphone-15":17722}'::jsonb)),
  published_us_rate_verified boolean NOT NULL DEFAULT false,
  cost_evidence text,
  CHECK ((starts_at IS NULL AND ends_at IS NULL) OR
    (starts_at IS NOT NULL AND ends_at IS NOT NULL AND
     ends_at = starts_at + interval '168 hours' AND
     starts_at = date_trunc('second', starts_at))),
  CHECK (NOT enabled OR (starts_at IS NOT NULL AND published_us_rate_verified
    AND cost_evidence IS NOT NULL AND length(trim(cost_evidence)) > 0 AND eligible_variants <> '{}'::jsonb))
);
CREATE TABLE public.shipping_offer_reservations (
  attempt_id uuid PRIMARY KEY,
  offer_id text NOT NULL REFERENCES public.shipping_offer_config(id),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  session_id text UNIQUE,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','paid','released')),
  waiver_cents integer NOT NULL DEFAULT 499 CHECK (waiver_cents = 499),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at_seconds bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.shipping_offer_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_offer_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipping_offer_config, public.shipping_offer_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.shipping_offer_config, public.shipping_offer_reservations TO service_role;
INSERT INTO public.shipping_offer_config(id) VALUES ('us-standard-20261009');

-- Config may be disabled after launch, but evidence, window and eligibility
-- cannot be rewritten under existing reservations, even when all have expired.
CREATE FUNCTION public.freeze_started_shipping_offer() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.shipping_offer_reservations WHERE offer_id = OLD.id)
     AND (NEW.starts_at, NEW.ends_at, NEW.eligible_variants, NEW.published_us_rate_verified, NEW.cost_evidence)
       IS DISTINCT FROM (OLD.starts_at, OLD.ends_at, OLD.eligible_variants, OLD.published_us_rate_verified, OLD.cost_evidence) THEN
    RAISE EXCEPTION 'Started shipping offer configuration is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER freeze_started_shipping_offer BEFORE UPDATE ON public.shipping_offer_config
FOR EACH ROW EXECUTE FUNCTION public.freeze_started_shipping_offer();

CREATE FUNCTION public.reserve_shipping_offer(p_attempt_id uuid, p_request_hash text, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  cfg public.shipping_offer_config%ROWTYPE;
  reservation public.shipping_offer_reservations%ROWTYPE;
  now_seconds bigint := floor(extract(epoch FROM clock_timestamp()));
  variant_id text;
BEGIN
  -- One row lock serializes every allocation; the count is never a browser decision.
  SELECT * INTO cfg FROM public.shipping_offer_config WHERE id = 'us-standard-20261009' FOR UPDATE;
  SELECT * INTO reservation FROM public.shipping_offer_reservations WHERE attempt_id = p_attempt_id;
  IF FOUND THEN
    IF reservation.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'Offer request changed'; END IF;
    RETURN to_jsonb(reservation);
  END IF;
  IF p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid request hash'; END IF;
  IF NOT cfg.enabled OR NOT cfg.published_us_rate_verified OR cfg.cost_evidence IS NULL
     OR length(trim(cfg.cost_evidence)) = 0 OR cfg.starts_at IS NULL
     OR now_seconds < extract(epoch FROM cfg.starts_at)
     OR now_seconds + 1860 >= extract(epoch FROM cfg.ends_at) THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) <> 1
     OR p_items->0->'quantity' IS DISTINCT FROM '1'::jsonb THEN RETURN NULL; END IF;
  variant_id := p_items->0->>'variantId';
  IF variant_id IS NULL OR NOT (cfg.eligible_variants ? variant_id)
     OR jsonb_typeof(cfg.eligible_variants->variant_id) <> 'number'
     OR (cfg.eligible_variants->>variant_id)::numeric <= 0
     OR (cfg.eligible_variants->>variant_id)::numeric <> trunc((cfg.eligible_variants->>variant_id)::numeric)
     THEN RETURN NULL; END IF;
  IF (SELECT count(*) FROM public.shipping_offer_reservations
      WHERE offer_id = cfg.id AND state <> 'released') >= 10 THEN RETURN NULL; END IF;
  INSERT INTO public.shipping_offer_reservations(attempt_id, offer_id, request_hash, expires_at_seconds)
  VALUES (p_attempt_id, cfg.id, p_request_hash,
    least(now_seconds + 3600, extract(epoch FROM cfg.ends_at)::bigint)) RETURNING * INTO reservation;
  RETURN to_jsonb(reservation);
END;
$$;

CREATE FUNCTION public.bind_shipping_offer_session(p_attempt_id uuid, p_request_hash text, p_session_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE r public.shipping_offer_reservations%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.shipping_offer_reservations WHERE attempt_id = p_attempt_id FOR UPDATE;
  IF NOT FOUND OR r.request_hash IS DISTINCT FROM p_request_hash OR p_session_id IS NULL
    OR p_session_id !~ '^cs_(test|live)_' OR (r.session_id IS NOT NULL AND r.session_id <> p_session_id)
    THEN RAISE EXCEPTION 'Offer session binding mismatch'; END IF;
  UPDATE public.shipping_offer_reservations SET session_id = p_session_id, updated_at = clock_timestamp()
  WHERE attempt_id = p_attempt_id;
END;
$$;

CREATE FUNCTION public.settle_shipping_offer(p_attempt_id uuid, p_request_hash text, p_session_id text, p_state text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE r public.shipping_offer_reservations%ROWTYPE;
BEGIN
  -- Same campaign lock as allocation. No interval exists in which a paid slot is free.
  PERFORM 1 FROM public.shipping_offer_config WHERE id = 'us-standard-20261009' FOR UPDATE;
  PERFORM public.bind_shipping_offer_session(p_attempt_id, p_request_hash, p_session_id);
  SELECT * INTO r FROM public.shipping_offer_reservations WHERE attempt_id = p_attempt_id FOR UPDATE;
  IF p_state NOT IN ('reserved','paid','released') OR p_state IS NULL THEN RAISE EXCEPTION 'Invalid lifecycle'; END IF;
  IF r.state = 'paid' THEN RETURN; END IF; -- Refunds and older expiry events never recycle a paid slot.
  IF r.state = 'released' AND p_state <> 'released' THEN RAISE EXCEPTION 'Released offer requires reconciliation'; END IF;
  UPDATE public.shipping_offer_reservations SET state = p_state, updated_at = clock_timestamp()
  WHERE attempt_id = p_attempt_id;
END;
$$;
REVOKE ALL ON FUNCTION public.freeze_started_shipping_offer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_shipping_offer(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bind_shipping_offer_session(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_shipping_offer(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_shipping_offer(uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_shipping_offer_session(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_shipping_offer(uuid,text,text,text) TO service_role;
