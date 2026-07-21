ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS delivery_status TEXT,
  ADD COLUMN IF NOT EXISTS last_provider_event_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_provider_event_id TEXT;

UPDATE public.order_notifications
SET
  delivery_status = status,
  status = 'sent'
WHERE provider_message_id IS NOT NULL
  AND status IN (
    'sent',
    'delivery_delayed',
    'delivered',
    'opened',
    'clicked',
    'failed',
    'bounced',
    'suppressed',
    'complained'
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_notifications_delivery_status_check'
      AND conrelid = 'public.order_notifications'::regclass
  ) THEN
    ALTER TABLE public.order_notifications
      ADD CONSTRAINT order_notifications_delivery_status_check
      CHECK (
        delivery_status IS NULL
        OR delivery_status IN (
          'sent',
          'delivery_delayed',
          'delivered',
          'opened',
          'clicked',
          'failed',
          'bounced',
          'suppressed',
          'complained'
        )
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_notifications_provider_message_id
  ON public.order_notifications(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.resend_webhook_events (
  svix_id TEXT PRIMARY KEY,
  provider_message_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  delivery_status TEXT NOT NULL,
  event_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT resend_webhook_events_delivery_status_check CHECK (
    delivery_status IN (
      'sent',
      'delivery_delayed',
      'delivered',
      'opened',
      'clicked',
      'failed',
      'bounced',
      'suppressed',
      'complained'
    )
  )
);

ALTER TABLE public.resend_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Resend webhook events service role only"
  ON public.resend_webhook_events;
CREATE POLICY "Resend webhook events service role only"
  ON public.resend_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.resend_webhook_events FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_resend_webhook_events_message_created
  ON public.resend_webhook_events(provider_message_id, event_created_at DESC);

CREATE OR REPLACE FUNCTION public.apply_resend_webhook_event(
  p_svix_id TEXT,
  p_provider_message_id TEXT,
  p_event_type TEXT,
  p_delivery_status TEXT,
  p_event_created_at TIMESTAMP WITH TIME ZONE,
  p_error_message TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated_rows INTEGER := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;

  IF p_svix_id IS NULL OR length(btrim(p_svix_id)) NOT BETWEEN 1 AND 255
    OR p_provider_message_id IS NULL
    OR length(btrim(p_provider_message_id)) NOT BETWEEN 1 AND 255
    OR p_event_type IS NULL OR length(btrim(p_event_type)) NOT BETWEEN 1 AND 100
    OR p_event_created_at IS NULL
    OR p_delivery_status NOT IN (
      'sent',
      'delivery_delayed',
      'delivered',
      'opened',
      'clicked',
      'failed',
      'bounced',
      'suppressed',
      'complained'
    )
  THEN
    RAISE EXCEPTION 'invalid Resend webhook event' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.resend_webhook_events (
    svix_id,
    provider_message_id,
    event_type,
    delivery_status,
    event_created_at
  )
  VALUES (
    btrim(p_svix_id),
    btrim(p_provider_message_id),
    btrim(p_event_type),
    p_delivery_status,
    p_event_created_at
  )
  ON CONFLICT (svix_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN 'duplicate';
  END IF;

  UPDATE public.order_notifications
  SET
    delivery_status = p_delivery_status,
    last_provider_event_at = p_event_created_at,
    last_provider_event_id = btrim(p_svix_id),
    error_message = CASE
      WHEN p_error_message IS NOT NULL THEN left(p_error_message, 1000)
      WHEN p_delivery_status IN ('sent', 'delivered', 'opened', 'clicked') THEN NULL
      ELSE error_message
    END,
    updated_at = now()
  WHERE provider_message_id = btrim(p_provider_message_id)
    AND (
      last_provider_event_at IS NULL
      OR last_provider_event_at < p_event_created_at
      OR (
        last_provider_event_at = p_event_created_at
        AND CASE p_delivery_status
          WHEN 'sent' THEN 10
          WHEN 'delivery_delayed' THEN 20
          WHEN 'delivered' THEN 30
          WHEN 'opened' THEN 40
          WHEN 'clicked' THEN 50
          WHEN 'failed' THEN 80
          WHEN 'bounced' THEN 90
          WHEN 'suppressed' THEN 90
          WHEN 'complained' THEN 100
        END >= CASE delivery_status
          WHEN 'sent' THEN 10
          WHEN 'delivery_delayed' THEN 20
          WHEN 'delivered' THEN 30
          WHEN 'opened' THEN 40
          WHEN 'clicked' THEN 50
          WHEN 'failed' THEN 80
          WHEN 'bounced' THEN 90
          WHEN 'suppressed' THEN 90
          WHEN 'complained' THEN 100
          ELSE 0
        END
      )
    );

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows > 0 THEN
    RETURN 'applied';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.order_notifications
    WHERE provider_message_id = btrim(p_provider_message_id)
  ) THEN
    RETURN 'out_of_order';
  END IF;

  RETURN 'unmatched';
END;
$$;

REVOKE ALL ON FUNCTION public.apply_resend_webhook_event(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMP WITH TIME ZONE,
  TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_resend_webhook_event(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMP WITH TIME ZONE,
  TEXT
) TO service_role;
