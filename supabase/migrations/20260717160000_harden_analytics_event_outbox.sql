ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS source_order_id UUID REFERENCES public.orders(id)
    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_token UUID,
  ADD COLUMN IF NOT EXISTS worker_id TEXT,
  ADD COLUMN IF NOT EXISTS last_failure_kind TEXT,
  ADD COLUMN IF NOT EXISTS last_http_status INTEGER,
  ADD COLUMN IF NOT EXISTS ambiguous_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terminal_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_operator_note TEXT;

ALTER TABLE public.analytics_events
  DROP CONSTRAINT IF EXISTS analytics_events_status_check;

ALTER TABLE public.analytics_events
  ADD CONSTRAINT analytics_events_status_check
    CHECK (
      status IN (
        'pending',
        'sending',
        'sent',
        'failed',
        'ambiguous',
        'dead_letter',
        'suppressed'
      )
    ),
  ADD CONSTRAINT analytics_events_attempts_check
    CHECK (attempts >= 0 AND max_attempts BETWEEN 1 AND 20),
  ADD CONSTRAINT analytics_events_source_amount_check
    CHECK (source_amount IS NULL OR source_amount >= 0);

UPDATE public.analytics_events AS event
SET source_order_id = orders.id
FROM public.orders
WHERE event.source_order_id IS NULL
  AND event.payload #>> '{events,0,params,transaction_id}' = orders.id::TEXT;

UPDATE public.analytics_events
SET source_amount =
  (payload #>> '{events,0,params,value}')::NUMERIC(12, 2)
WHERE source_amount IS NULL
  AND payload #>> '{events,0,params,value}' ~ '^[0-9]+([.][0-9]+)?$';

UPDATE public.analytics_events
SET
  next_attempt_at = CASE
    WHEN status IN ('pending', 'failed')
      THEN COALESCE(next_attempt_at, created_at)
    ELSE next_attempt_at
  END,
  lease_expires_at = CASE
    WHEN status = 'sending'
      THEN COALESCE(
        lease_expires_at,
        claimed_at + INTERVAL '5 minutes',
        created_at + INTERVAL '5 minutes'
      )
    ELSE lease_expires_at
  END;

CREATE INDEX IF NOT EXISTS idx_analytics_events_retry_pending
  ON public.analytics_events (next_attempt_at, created_at, id)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_analytics_events_retry_stale_lease
  ON public.analytics_events (lease_expires_at, claimed_at, id)
  WHERE status = 'sending';

CREATE INDEX IF NOT EXISTS idx_analytics_events_source_order
  ON public.analytics_events (source_order_id);

CREATE OR REPLACE FUNCTION public.analytics_event_backoff_seconds(
  p_attempts INTEGER
)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_attempts <= 1 THEN 60
    WHEN p_attempts = 2 THEN 300
    WHEN p_attempts = 3 THEN 900
    ELSE 3600
  END;
$$;

CREATE OR REPLACE FUNCTION public.claim_analytics_event(
  p_event_key TEXT,
  p_event_name TEXT,
  p_payload JSONB
)
RETURNS SETOF public.analytics_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_source_order_id UUID;
  v_source_amount NUMERIC(12, 2);
BEGIN
  SELECT orders.id
  INTO v_source_order_id
  FROM public.orders
  WHERE orders.id::TEXT =
    p_payload #>> '{events,0,params,transaction_id}'
  LIMIT 1;

  IF p_payload #>> '{events,0,params,value}' ~ '^[0-9]+([.][0-9]+)?$' THEN
    v_source_amount :=
      (p_payload #>> '{events,0,params,value}')::NUMERIC(12, 2);
  END IF;

  INSERT INTO public.analytics_events (
    event_key,
    event_name,
    payload,
    source_order_id,
    source_amount,
    next_attempt_at
  )
  VALUES (
    p_event_key,
    p_event_name,
    p_payload,
    v_source_order_id,
    v_source_amount,
    v_now
  )
  ON CONFLICT (event_key) DO NOTHING;

  UPDATE public.analytics_events
  SET
    status = 'dead_letter',
    terminal_at = v_now,
    next_attempt_at = NULL,
    lease_expires_at = NULL,
    claim_token = NULL,
    worker_id = NULL,
    last_failure_kind = COALESCE(last_failure_kind, 'max_attempts_exhausted'),
    last_error = COALESCE(last_error, 'Maximum analytics delivery attempts reached')
  WHERE event_key = p_event_key
    AND attempts >= max_attempts
    AND (
      status IN ('pending', 'failed') OR
      (
        status = 'sending' AND
        lease_expires_at <= v_now
      )
    );

  RETURN QUERY
  UPDATE public.analytics_events
  SET
    status = 'sending',
    attempts = attempts + 1,
    claimed_at = v_now,
    lease_expires_at = v_now + INTERVAL '5 minutes',
    claim_token = gen_random_uuid(),
    worker_id = 'stripe-webhook',
    next_attempt_at = NULL,
    ambiguous_at = NULL,
    terminal_at = NULL
  WHERE event_key = p_event_key
    AND attempts < max_attempts
    AND (
      (
        status IN ('pending', 'failed') AND
        next_attempt_at <= v_now
      ) OR
      (
        status = 'sending' AND
        lease_expires_at <= v_now
      )
    )
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_analytics_event_batch(
  p_limit INTEGER,
  p_worker_id TEXT,
  p_now TIMESTAMPTZ
)
RETURNS SETOF public.analytics_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 100';
  END IF;

  IF NULLIF(BTRIM(p_worker_id), '') IS NULL OR LENGTH(p_worker_id) > 100 THEN
    RAISE EXCEPTION 'p_worker_id must be between 1 and 100 characters';
  END IF;

  UPDATE public.analytics_events
  SET
    status = 'dead_letter',
    terminal_at = p_now,
    next_attempt_at = NULL,
    lease_expires_at = NULL,
    claim_token = NULL,
    worker_id = NULL,
    last_failure_kind = COALESCE(last_failure_kind, 'max_attempts_exhausted'),
    last_error = COALESCE(last_error, 'Maximum analytics delivery attempts reached')
  WHERE attempts >= max_attempts
    AND (
      status IN ('pending', 'failed') OR
      (
        status = 'sending' AND
        lease_expires_at <= p_now
      )
    );

  RETURN QUERY
  WITH candidates AS (
    SELECT event.id
    FROM public.analytics_events AS event
    WHERE event.attempts < event.max_attempts
      AND (
        (
          event.status IN ('pending', 'failed') AND
          event.next_attempt_at <= p_now
        ) OR
        (
          event.status = 'sending' AND
          event.lease_expires_at <= p_now
        )
      )
    ORDER BY
      COALESCE(
        event.next_attempt_at,
        event.lease_expires_at,
        event.created_at
      ),
      event.created_at,
      event.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.analytics_events AS event
  SET
    status = 'sending',
    attempts = event.attempts + 1,
    claimed_at = p_now,
    lease_expires_at = p_now + INTERVAL '5 minutes',
    claim_token = gen_random_uuid(),
    worker_id = p_worker_id,
    next_attempt_at = NULL,
    ambiguous_at = NULL,
    terminal_at = NULL
  FROM candidates
  WHERE event.id = candidates.id
  RETURNING event.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_analytics_event(
  p_event_id UUID,
  p_claim_token UUID,
  p_http_status INTEGER,
  p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.analytics_events
  SET
    status = 'sent',
    sent_at = p_now,
    last_error = NULL,
    last_failure_kind = NULL,
    last_http_status = p_http_status,
    next_attempt_at = NULL,
    lease_expires_at = NULL,
    claim_token = NULL,
    worker_id = NULL,
    ambiguous_at = NULL,
    terminal_at = NULL
  WHERE id = p_event_id
    AND claim_token = p_claim_token
    AND status = 'sending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_analytics_event(
  p_event_id UUID,
  p_claim_token UUID,
  p_error TEXT,
  p_failure_kind TEXT,
  p_http_status INTEGER,
  p_now TIMESTAMPTZ
)
RETURNS SETOF public.analytics_events
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.analytics_events
  SET
    status = CASE
      WHEN attempts >= max_attempts THEN 'dead_letter'
      ELSE 'failed'
    END,
    next_attempt_at = CASE
      WHEN attempts >= max_attempts THEN NULL
      ELSE p_now + make_interval(
        secs => public.analytics_event_backoff_seconds(attempts)
      )
    END,
    terminal_at = CASE
      WHEN attempts >= max_attempts THEN p_now
      ELSE NULL
    END,
    last_error = LEFT(COALESCE(p_error, 'Analytics delivery failed'), 500),
    last_failure_kind = LEFT(
      COALESCE(p_failure_kind, 'delivery_error'),
      100
    ),
    last_http_status = p_http_status,
    lease_expires_at = NULL,
    claim_token = NULL,
    worker_id = NULL
  WHERE id = p_event_id
    AND claim_token = p_claim_token
    AND status = 'sending'
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION public.mark_analytics_event_ambiguous(
  p_event_id UUID,
  p_claim_token UUID,
  p_error TEXT,
  p_http_status INTEGER,
  p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.analytics_events
  SET
    status = 'ambiguous',
    ambiguous_at = p_now,
    terminal_at = p_now,
    next_attempt_at = NULL,
    lease_expires_at = NULL,
    last_error = LEFT(
      COALESCE(
        p_error,
        'GA accepted the event but the sent-state update was not confirmed'
      ),
      500
    ),
    last_failure_kind = 'post_send_state',
    last_http_status = p_http_status,
    claim_token = NULL,
    worker_id = NULL
  WHERE id = p_event_id
    AND claim_token = p_claim_token
    AND status = 'sending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_analytics_event_without_delivery(
  p_event_id UUID,
  p_claim_token UUID,
  p_status TEXT,
  p_reason TEXT,
  p_failure_kind TEXT,
  p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF p_status NOT IN ('suppressed', 'dead_letter') THEN
    RAISE EXCEPTION 'p_status must be suppressed or dead_letter';
  END IF;

  UPDATE public.analytics_events
  SET
    status = p_status,
    terminal_at = p_now,
    next_attempt_at = NULL,
    lease_expires_at = NULL,
    claim_token = NULL,
    worker_id = NULL,
    last_error = LEFT(COALESCE(p_reason, 'Delivery not attempted'), 500),
    last_failure_kind = LEFT(
      COALESCE(p_failure_kind, 'not_delivered'),
      100
    )
  WHERE id = p_event_id
    AND claim_token = p_claim_token
    AND status = 'sending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.requeue_analytics_event(
  p_event_key TEXT,
  p_operator_note TEXT,
  p_reset_attempts BOOLEAN
)
RETURNS SETOF public.analytics_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NULLIF(BTRIM(p_operator_note), '') IS NULL THEN
    RAISE EXCEPTION 'p_operator_note is required';
  END IF;

  RETURN QUERY
  UPDATE public.analytics_events
  SET
    status = 'failed',
    attempts = CASE WHEN p_reset_attempts THEN 0 ELSE attempts END,
    next_attempt_at = now(),
    lease_expires_at = NULL,
    claim_token = NULL,
    worker_id = NULL,
    ambiguous_at = NULL,
    terminal_at = NULL,
    last_operator_note = LEFT(p_operator_note, 500)
  WHERE event_key = p_event_key
    AND status IN ('failed', 'ambiguous', 'dead_letter')
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_event_backoff_seconds(INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_analytics_event(TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_analytics_event_batch(
  INTEGER,
  TEXT,
  TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_analytics_event(
  UUID,
  UUID,
  INTEGER,
  TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_analytics_event(
  UUID,
  UUID,
  TEXT,
  TEXT,
  INTEGER,
  TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_analytics_event_ambiguous(
  UUID,
  UUID,
  TEXT,
  INTEGER,
  TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_analytics_event_without_delivery(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.requeue_analytics_event(TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.analytics_event_backoff_seconds(INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_analytics_event(TEXT, TEXT, JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_analytics_event_batch(
  INTEGER,
  TEXT,
  TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_analytics_event(
  UUID,
  UUID,
  INTEGER,
  TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_analytics_event(
  UUID,
  UUID,
  TEXT,
  TEXT,
  INTEGER,
  TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_analytics_event_ambiguous(
  UUID,
  UUID,
  TEXT,
  INTEGER,
  TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_analytics_event_without_delivery(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_analytics_event(TEXT, TEXT, BOOLEAN)
  TO service_role;

COMMENT ON COLUMN public.analytics_events.claim_token IS
  'Lease ownership token. State transitions must match it to prevent stale workers from finalizing a reclaimed event.';
COMMENT ON COLUMN public.analytics_events.ambiguous_at IS
  'Set when GA accepted a request but the local sent-state update could not be confirmed. Ambiguous rows never retry automatically.';
COMMENT ON FUNCTION public.claim_analytics_event_batch(INTEGER, TEXT, TIMESTAMPTZ)
  IS 'Atomically claims retry-ready analytics events with row locks and SKIP LOCKED.';
COMMENT ON FUNCTION public.requeue_analytics_event(TEXT, TEXT, BOOLEAN)
  IS 'Explicit operator-only retry path. Ambiguous events require external reconciliation before requeue.';
