CREATE TABLE public.checkout_attempts (
  id UUID PRIMARY KEY,
  order_id UUID UNIQUE REFERENCES public.orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'request_received',
  error_code TEXT,
  session_path_variant TEXT,
  is_synthetic BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  server_completed_at TIMESTAMPTZ,
  client_observed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT checkout_attempts_status_check CHECK (
    status IN (
      'request_received',
      'session_created',
      'server_completed',
      'redirect_accepted',
      'client_rejected',
      'server_failed'
    )
  ),
  CONSTRAINT checkout_attempts_error_code_check CHECK (
    error_code IS NULL OR error_code IN (
      'invalid_request',
      'origin_rejected',
      'promotion_rejected',
      'internal_failure',
      'invalid_checkout_url'
    )
  ),
  CONSTRAINT checkout_attempts_session_path_check CHECK (
    session_path_variant IS NULL OR session_path_variant IN ('c', 'f')
  ),
  CONSTRAINT checkout_attempts_server_completion_check CHECK (
    status NOT IN ('server_completed', 'redirect_accepted', 'client_rejected')
      OR server_completed_at IS NOT NULL
  ),
  CONSTRAINT checkout_attempts_client_observation_check CHECK (
    status NOT IN ('redirect_accepted', 'client_rejected')
      OR client_observed_at IS NOT NULL
  )
);

ALTER TABLE public.checkout_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_attempts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.checkout_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.checkout_attempts TO service_role;

CREATE INDEX checkout_attempts_status_started_idx
  ON public.checkout_attempts (status, started_at DESC);

CREATE INDEX checkout_attempts_unobserved_idx
  ON public.checkout_attempts (server_completed_at)
  WHERE status = 'server_completed' AND client_observed_at IS NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_attempt_id UUID,
  ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS orders_synthetic_pending_created_idx
  ON public.orders (created_at)
  WHERE is_synthetic AND status = 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_checkout_attempt_id_key'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_checkout_attempt_id_key
      UNIQUE (checkout_attempt_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_checkout_attempt_id_fkey'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_checkout_attempt_id_fkey
      FOREIGN KEY (checkout_attempt_id)
      REFERENCES public.checkout_attempts(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

COMMENT ON TABLE public.checkout_attempts IS
  'Private, PII-free correlation state for the browser-to-Stripe checkout handoff.';
COMMENT ON COLUMN public.checkout_attempts.id IS
  'Random UUID generated per browser checkout attempt; never derived from customer data.';
COMMENT ON COLUMN public.checkout_attempts.is_synthetic IS
  'Server-authenticated canary classification; browser request bodies cannot set this field.';
COMMENT ON COLUMN public.orders.checkout_attempt_id IS
  'Private correlation key for checkout diagnostics; safe to omit from customer projections.';
COMMENT ON COLUMN public.orders.is_synthetic IS
  'Server-authenticated test classification used to exclude canaries from business reporting.';

CREATE TABLE public.checkout_health_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  incident_id UUID,
  incident_started_at TIMESTAMPTZ,
  incident_open BOOLEAN NOT NULL DEFAULT false,
  alert_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (alert_status IN ('idle', 'pending', 'sent', 'failed')),
  last_alerted_at TIMESTAMPTZ,
  last_recovered_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (incident_open AND incident_id IS NOT NULL AND incident_started_at IS NOT NULL)
    OR (NOT incident_open)
  )
);

INSERT INTO public.checkout_health_state (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.checkout_health_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_health_state FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.checkout_health_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.checkout_health_state TO service_role;

COMMENT ON TABLE public.checkout_health_state IS
  'Private singleton used to deduplicate checkout outage and recovery alerts.';
