-- Versioned, server-owned lifecycle marketing consent and suppression contract.
-- This migration creates no provider schedule and sends no email.

CREATE TABLE public.lifecycle_marketing_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL DEFAULT 'lifecycle_marketing',
  status TEXT NOT NULL DEFAULT 'subscribed',
  source TEXT NOT NULL,
  placement TEXT NOT NULL,
  campaign TEXT,
  consent_copy_version TEXT NOT NULL,
  privacy_policy_version TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  suppression_reason TEXT,
  provider TEXT,
  provider_contact_id TEXT,
  provider_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lifecycle_email_normalized CHECK (
    email_normalized = lower(btrim(email_normalized))
    AND length(email_normalized) BETWEEN 3 AND 254
    AND email_normalized !~ '[[:space:]]'
    AND position('@' IN email_normalized) > 1
  ),
  CONSTRAINT lifecycle_purpose_check CHECK (purpose = 'lifecycle_marketing'),
  CONSTRAINT lifecycle_status_check CHECK (status IN ('subscribed', 'suppressed')),
  CONSTRAINT lifecycle_suppression_shape CHECK (
    (status = 'subscribed' AND revoked_at IS NULL AND suppression_reason IS NULL)
    OR
    (status = 'suppressed' AND revoked_at IS NOT NULL AND suppression_reason IS NOT NULL)
  ),
  CONSTRAINT lifecycle_provider_identity_unique UNIQUE (provider, provider_contact_id)
);

CREATE TABLE public.lifecycle_marketing_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID NOT NULL REFERENCES public.lifecycle_marketing_subscribers(id),
  request_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  placement TEXT NOT NULL,
  campaign TEXT,
  consent_copy_version TEXT NOT NULL,
  privacy_policy_version TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT lifecycle_consent_event_type CHECK (
    event_type IN ('granted', 'duplicate', 'revoked', 'blocked_resubscribe', 'provider_suppressed')
  ),
  CONSTRAINT lifecycle_consent_event_request_unique UNIQUE (request_id),
  CONSTRAINT lifecycle_consent_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE public.lifecycle_marketing_preference_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID NOT NULL REFERENCES public.lifecycle_marketing_subscribers(id),
  token_digest TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 years'),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT lifecycle_preference_token_digest CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT lifecycle_preference_token_expiry CHECK (expires_at > issued_at)
);

CREATE TABLE public.lifecycle_marketing_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID NOT NULL REFERENCES public.lifecycle_marketing_subscribers(id),
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claim_token UUID,
  claimed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  provider TEXT,
  provider_operation_id TEXT,
  last_error_code TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lifecycle_outbox_operation CHECK (operation IN ('subscribe', 'suppress', 'welcome')),
  CONSTRAINT lifecycle_outbox_status CHECK (
    status IN ('pending', 'sending', 'failed', 'completed', 'suppressed', 'dry_run', 'disabled', 'dead_letter', 'uncertain')
  ),
  CONSTRAINT lifecycle_outbox_attempts CHECK (
    attempts >= 0 AND max_attempts BETWEEN 1 AND 5 AND attempts <= max_attempts
  )
);

CREATE TABLE public.lifecycle_marketing_provider_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_contact_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome TEXT NOT NULL,
  PRIMARY KEY (provider, event_id),
  CONSTRAINT lifecycle_provider_event_type CHECK (
    event_type IN ('contact.subscribed', 'contact.unsubscribed', 'email.bounced', 'email.complained', 'contact.suppressed')
  ),
  CONSTRAINT lifecycle_provider_outcome CHECK (
    outcome IN ('applied', 'duplicate', 'ignored', 'out_of_order', 'unmatched')
  )
);

CREATE INDEX lifecycle_consent_events_subscriber_idx
  ON public.lifecycle_marketing_consent_events (subscriber_id, occurred_at DESC);
CREATE INDEX lifecycle_outbox_ready_idx
  ON public.lifecycle_marketing_outbox (status, next_attempt_at, created_at);
CREATE INDEX lifecycle_tokens_subscriber_idx
  ON public.lifecycle_marketing_preference_tokens (subscriber_id, issued_at DESC);

ALTER TABLE public.lifecycle_marketing_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_marketing_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_marketing_preference_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_marketing_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_marketing_provider_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.lifecycle_marketing_subscribers FROM anon, authenticated;
REVOKE ALL ON TABLE public.lifecycle_marketing_consent_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.lifecycle_marketing_preference_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.lifecycle_marketing_outbox FROM anon, authenticated;
REVOKE ALL ON TABLE public.lifecycle_marketing_provider_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_lifecycle_marketing_consent(
  p_email TEXT,
  p_request_id UUID,
  p_source TEXT,
  p_placement TEXT,
  p_campaign TEXT,
  p_consent_copy_version TEXT,
  p_privacy_policy_version TEXT,
  p_consent_granted BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email TEXT := lower(btrim(coalesce(p_email, '')));
  v_subscriber public.lifecycle_marketing_subscribers%ROWTYPE;
  v_existing_event public.lifecycle_marketing_consent_events%ROWTYPE;
  v_result TEXT;
BEGIN
  IF NOT p_consent_granted
    OR p_consent_copy_version <> 'lifecycle_marketing_home_v1'
    OR p_privacy_policy_version <> '2026-07-22'
    OR length(v_email) NOT BETWEEN 3 AND 254
    OR v_email ~ '[[:space:]]'
    OR position('@' IN v_email) <= 1
    OR p_source !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'
    OR p_placement !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'
    OR (p_campaign IS NOT NULL AND p_campaign !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$')
  THEN
    RAISE EXCEPTION 'invalid_lifecycle_consent';
  END IF;

  -- Serialize same-address requests so concurrent first submissions collapse
  -- into one canonical subscriber instead of surfacing a unique-key failure.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_email, 0));

  SELECT * INTO v_existing_event
  FROM public.lifecycle_marketing_consent_events
  WHERE request_id = p_request_id;

  IF FOUND THEN
    SELECT * INTO v_subscriber
    FROM public.lifecycle_marketing_subscribers
    WHERE id = v_existing_event.subscriber_id;
    IF v_subscriber.email_normalized <> v_email
      OR v_existing_event.source <> lower(p_source)
      OR v_existing_event.placement <> lower(p_placement)
      OR v_existing_event.campaign IS DISTINCT FROM lower(p_campaign)
      OR v_existing_event.consent_copy_version <> p_consent_copy_version
      OR v_existing_event.privacy_policy_version <> p_privacy_policy_version
    THEN
      RAISE EXCEPTION 'lifecycle_consent_replay_mismatch';
    END IF;
    -- A replay of the original transaction must not look like a new signup to
    -- the browser, otherwise it could emit email_signup more than once.
    v_result := CASE
      WHEN v_subscriber.status = 'suppressed' THEN 'suppressed'
      ELSE 'already_subscribed'
    END;
    RETURN jsonb_build_object('status', v_result, 'contractVersion', '1.0.0');
  END IF;

  SELECT * INTO v_subscriber
  FROM public.lifecycle_marketing_subscribers
  WHERE email_normalized = v_email
  FOR UPDATE;

  IF FOUND AND v_subscriber.status = 'suppressed' THEN
    INSERT INTO public.lifecycle_marketing_consent_events (
      subscriber_id, request_id, event_type, source, placement, campaign,
      consent_copy_version, privacy_policy_version
    ) VALUES (
      v_subscriber.id, p_request_id, 'blocked_resubscribe', lower(p_source),
      lower(p_placement), lower(p_campaign), p_consent_copy_version,
      p_privacy_policy_version
    );
    RETURN jsonb_build_object('status', 'suppressed', 'contractVersion', '1.0.0');
  END IF;

  IF FOUND THEN
    INSERT INTO public.lifecycle_marketing_consent_events (
      subscriber_id, request_id, event_type, source, placement, campaign,
      consent_copy_version, privacy_policy_version
    ) VALUES (
      v_subscriber.id, p_request_id, 'duplicate', lower(p_source),
      lower(p_placement), lower(p_campaign), p_consent_copy_version,
      p_privacy_policy_version
    );
    RETURN jsonb_build_object('status', 'already_subscribed', 'contractVersion', '1.0.0');
  END IF;

  INSERT INTO public.lifecycle_marketing_subscribers (
    email_normalized, source, placement, campaign, consent_copy_version,
    privacy_policy_version
  ) VALUES (
    v_email, lower(p_source), lower(p_placement), lower(p_campaign),
    p_consent_copy_version, p_privacy_policy_version
  ) RETURNING * INTO v_subscriber;

  INSERT INTO public.lifecycle_marketing_consent_events (
    subscriber_id, request_id, event_type, source, placement, campaign,
    consent_copy_version, privacy_policy_version
  ) VALUES (
    v_subscriber.id, p_request_id, 'granted', lower(p_source),
    lower(p_placement), lower(p_campaign), p_consent_copy_version,
    p_privacy_policy_version
  );

  INSERT INTO public.lifecycle_marketing_outbox (
    subscriber_id, operation, idempotency_key
  ) VALUES
    (v_subscriber.id, 'subscribe', 'subscribe:' || v_subscriber.id::text || ':' || p_consent_copy_version),
    (v_subscriber.id, 'welcome', 'welcome:' || v_subscriber.id::text || ':' || p_consent_copy_version);

  RETURN jsonb_build_object('status', 'subscribed', 'contractVersion', '1.0.0');
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_lifecycle_preference_token(
  p_subscriber_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token TEXT := encode(gen_random_bytes(32), 'hex');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.lifecycle_marketing_subscribers WHERE id = p_subscriber_id
  ) THEN
    RAISE EXCEPTION 'subscriber_not_found';
  END IF;

  INSERT INTO public.lifecycle_marketing_preference_tokens (
    subscriber_id, token_digest
  ) VALUES (
    p_subscriber_id,
    encode(digest(v_token, 'sha256'), 'hex')
  );
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_lifecycle_preference_state(
  p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT s.status INTO v_status
  FROM public.lifecycle_marketing_preference_tokens t
  JOIN public.lifecycle_marketing_subscribers s ON s.id = t.subscriber_id
  WHERE t.token_digest = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    AND t.expires_at > now()
    AND t.revoked_at IS NULL;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_status IS NULL THEN 'invalid' ELSE v_status END,
    'contractVersion', '1.0.0'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unsubscribe_lifecycle_marketing(
  p_token TEXT,
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token public.lifecycle_marketing_preference_tokens%ROWTYPE;
  v_subscriber public.lifecycle_marketing_subscribers%ROWTYPE;
BEGIN
  SELECT * INTO v_token
  FROM public.lifecycle_marketing_preference_tokens
  WHERE token_digest = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    AND expires_at > now()
    AND revoked_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid', 'contractVersion', '1.0.0');
  END IF;

  UPDATE public.lifecycle_marketing_preference_tokens
  SET last_used_at = now()
  WHERE id = v_token.id;

  SELECT * INTO v_subscriber
  FROM public.lifecycle_marketing_subscribers
  WHERE id = v_token.subscriber_id
  FOR UPDATE;

  IF v_subscriber.status = 'suppressed' THEN
    RETURN jsonb_build_object('status', 'already_unsubscribed', 'contractVersion', '1.0.0');
  END IF;

  UPDATE public.lifecycle_marketing_subscribers
  SET status = 'suppressed', revoked_at = now(), suppression_reason = 'unsubscribe', updated_at = now()
  WHERE id = v_subscriber.id;

  INSERT INTO public.lifecycle_marketing_consent_events (
    subscriber_id, request_id, event_type, source, placement,
    consent_copy_version, privacy_policy_version
  ) VALUES (
    v_subscriber.id, p_request_id, 'revoked', 'preference_link',
    'email_preferences', v_subscriber.consent_copy_version,
    v_subscriber.privacy_policy_version
  ) ON CONFLICT (request_id) DO NOTHING;

  INSERT INTO public.lifecycle_marketing_outbox (
    subscriber_id, operation, idempotency_key
  ) VALUES (
    v_subscriber.id, 'suppress', 'suppress:' || v_subscriber.id::text || ':unsubscribe'
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('status', 'unsubscribed', 'contractVersion', '1.0.0');
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_lifecycle_provider_event(
  p_provider TEXT,
  p_event_id TEXT,
  p_event_type TEXT,
  p_provider_contact_id TEXT,
  p_occurred_at TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_subscriber public.lifecycle_marketing_subscribers%ROWTYPE;
  v_reason TEXT;
  v_outcome TEXT;
BEGIN
  IF p_provider !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'
    OR length(p_event_id) NOT BETWEEN 1 AND 255
    OR length(p_provider_contact_id) NOT BETWEEN 1 AND 255
    OR p_event_type NOT IN (
      'contact.subscribed', 'contact.unsubscribed', 'email.bounced',
      'email.complained', 'contact.suppressed'
    )
  THEN
    RAISE EXCEPTION 'invalid_provider_event';
  END IF;

  -- Collapse concurrent deliveries of the same provider event before the
  -- replay lookup and insert, avoiding a unique-key race and a retryable 500.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(lower(p_provider) || ':' || p_event_id, 0)
  );

  IF EXISTS (
    SELECT 1 FROM public.lifecycle_marketing_provider_events
    WHERE provider = lower(p_provider) AND event_id = p_event_id
  ) THEN
    RETURN 'duplicate';
  END IF;

  SELECT * INTO v_subscriber
  FROM public.lifecycle_marketing_subscribers
  WHERE provider = lower(p_provider) AND provider_contact_id = p_provider_contact_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_outcome := 'unmatched';
  ELSIF v_subscriber.provider_event_at IS NOT NULL
    AND p_occurred_at < v_subscriber.provider_event_at
  THEN
    v_outcome := 'out_of_order';
  ELSIF p_event_type = 'contact.subscribed' THEN
    -- Provider state can acknowledge a subscription, but it can never clear a
    -- website or provider suppression.
    UPDATE public.lifecycle_marketing_subscribers
    SET provider_event_at = p_occurred_at, updated_at = now()
    WHERE id = v_subscriber.id;
    v_outcome := 'ignored';
  ELSE
    v_reason := CASE p_event_type
      WHEN 'contact.unsubscribed' THEN 'provider_unsubscribe'
      WHEN 'email.bounced' THEN 'bounce'
      WHEN 'email.complained' THEN 'complaint'
      ELSE 'provider_suppression'
    END;
    UPDATE public.lifecycle_marketing_subscribers
    SET status = 'suppressed', revoked_at = coalesce(revoked_at, p_occurred_at),
      suppression_reason = coalesce(suppression_reason, v_reason),
      provider_event_at = p_occurred_at, updated_at = now()
    WHERE id = v_subscriber.id;
    INSERT INTO public.lifecycle_marketing_consent_events (
      subscriber_id, request_id, event_type, source, placement,
      consent_copy_version, privacy_policy_version, metadata, occurred_at
    ) VALUES (
      v_subscriber.id, gen_random_uuid(), 'provider_suppressed', lower(p_provider),
      'provider_webhook', v_subscriber.consent_copy_version,
      v_subscriber.privacy_policy_version,
      jsonb_build_object('reason', v_reason), p_occurred_at
    );
    v_outcome := 'applied';
  END IF;

  INSERT INTO public.lifecycle_marketing_provider_events (
    provider, event_id, event_type, provider_contact_id, occurred_at, outcome
  ) VALUES (
    lower(p_provider), p_event_id, p_event_type, p_provider_contact_id,
    p_occurred_at, v_outcome
  );
  RETURN v_outcome;
END;
$$;

CREATE OR REPLACE VIEW public.lifecycle_marketing_health AS
SELECT
  count(*) FILTER (WHERE status = 'subscribed')::BIGINT AS eligible_subscribers,
  count(*) FILTER (WHERE status = 'suppressed')::BIGINT AS suppressed_subscribers,
  count(*) FILTER (WHERE suppression_reason = 'unsubscribe')::BIGINT AS unsubscribes,
  count(*) FILTER (WHERE suppression_reason = 'bounce')::BIGINT AS bounces,
  count(*) FILTER (WHERE suppression_reason = 'complaint')::BIGINT AS complaints,
  (SELECT count(*) FROM public.lifecycle_marketing_outbox WHERE status IN ('failed', 'dead_letter', 'uncertain'))::BIGINT AS synchronization_failures
FROM public.lifecycle_marketing_subscribers;

REVOKE ALL ON FUNCTION public.register_lifecycle_marketing_consent(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_lifecycle_preference_token(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_lifecycle_preference_state(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unsubscribe_lifecycle_marketing(TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_lifecycle_provider_event(
  TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.lifecycle_marketing_health FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.register_lifecycle_marketing_consent(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN
) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_lifecycle_preference_token(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_lifecycle_preference_state(TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.unsubscribe_lifecycle_marketing(TEXT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_lifecycle_provider_event(
  TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) TO service_role;
GRANT SELECT ON public.lifecycle_marketing_health TO service_role;

COMMENT ON TABLE public.lifecycle_marketing_subscribers IS
  'Server-only lifecycle marketing identity, consent, and authoritative suppression state. Never expose through anon table access.';
COMMENT ON TABLE public.lifecycle_marketing_outbox IS
  'Fail-closed provider operations. Uncertain mutations are terminal until an operator reconciles provider state.';
COMMENT ON VIEW public.lifecycle_marketing_health IS
  'Aggregate-only lifecycle reporting; contains no subscriber identity.';
