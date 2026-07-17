ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS analytics_client_id TEXT,
  ADD COLUMN IF NOT EXISTS analytics_consent TEXT;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_analytics_consent_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_analytics_consent_check
  CHECK (
    analytics_consent IS NULL OR
    analytics_consent IN ('granted', 'denied', 'unset')
  );

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  CONSTRAINT analytics_events_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'failed'))
);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_analytics_events_status_created
  ON public.analytics_events (status, created_at);

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
BEGIN
  INSERT INTO public.analytics_events (event_key, event_name, payload)
  VALUES (p_event_key, p_event_name, p_payload)
  ON CONFLICT (event_key) DO NOTHING;

  RETURN QUERY
  UPDATE public.analytics_events
  SET
    status = 'sending',
    attempts = attempts + 1,
    last_error = NULL
  WHERE event_key = p_event_key
    AND status IN ('pending', 'failed')
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_analytics_event(TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_analytics_event(TEXT, TEXT, JSONB)
  TO service_role;
