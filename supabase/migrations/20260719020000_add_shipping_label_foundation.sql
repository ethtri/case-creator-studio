INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'shipping-labels',
  'shipping-labels',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.shipping_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_job_id UUID NOT NULL
    REFERENCES public.production_jobs(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'preparing',
  provider_shipment_id TEXT,
  provider_rate_id TEXT,
  provider_tracker_id TEXT,
  replaces_label_id UUID
    REFERENCES public.shipping_labels(id) ON DELETE SET NULL,
  carrier TEXT,
  service TEXT,
  quoted_amount_cents INTEGER,
  purchased_amount_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  delivery_days INTEGER,
  tracking_number TEXT,
  tracking_status TEXT,
  tracking_url TEXT,
  label_storage_path TEXT,
  label_format TEXT,
  label_mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  last_error_code TEXT,
  last_error_message TEXT,
  created_by_operator TEXT,
  purchased_at TIMESTAMP WITH TIME ZONE,
  print_accessed_at TIMESTAMP WITH TIME ZONE,
  refund_requested_at TIMESTAMP WITH TIME ZONE,
  refunded_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT shipping_labels_provider_check
    CHECK (provider IN ('easypost', 'manual')),
  CONSTRAINT shipping_labels_state_check
    CHECK (state IN (
      'preparing',
      'rated',
      'purchasing',
      'purchased',
      'refund_pending',
      'refunded',
      'failed'
    )),
  CONSTRAINT shipping_labels_provider_shipment_length_check
    CHECK (
      provider_shipment_id IS NULL OR
      char_length(provider_shipment_id) <= 200
    ),
  CONSTRAINT shipping_labels_provider_rate_length_check
    CHECK (provider_rate_id IS NULL OR char_length(provider_rate_id) <= 200),
  CONSTRAINT shipping_labels_provider_tracker_length_check
    CHECK (
      provider_tracker_id IS NULL OR
      char_length(provider_tracker_id) <= 200
    ),
  CONSTRAINT shipping_labels_carrier_length_check
    CHECK (carrier IS NULL OR char_length(carrier) <= 120),
  CONSTRAINT shipping_labels_service_length_check
    CHECK (service IS NULL OR char_length(service) <= 120),
  CONSTRAINT shipping_labels_quoted_amount_check
    CHECK (quoted_amount_cents IS NULL OR quoted_amount_cents >= 0),
  CONSTRAINT shipping_labels_purchased_amount_check
    CHECK (purchased_amount_cents IS NULL OR purchased_amount_cents >= 0),
  CONSTRAINT shipping_labels_currency_check
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT shipping_labels_delivery_days_check
    CHECK (delivery_days IS NULL OR delivery_days >= 0),
  CONSTRAINT shipping_labels_tracking_number_length_check
    CHECK (tracking_number IS NULL OR char_length(tracking_number) <= 120),
  CONSTRAINT shipping_labels_tracking_status_length_check
    CHECK (tracking_status IS NULL OR char_length(tracking_status) <= 120),
  CONSTRAINT shipping_labels_tracking_url_length_check
    CHECK (tracking_url IS NULL OR char_length(tracking_url) <= 1000),
  CONSTRAINT shipping_labels_storage_path_length_check
    CHECK (
      label_storage_path IS NULL OR
      char_length(label_storage_path) <= 500
    ),
  CONSTRAINT shipping_labels_format_check
    CHECK (label_format IS NULL OR label_format IN ('pdf_4x6', 'pdf_letter')),
  CONSTRAINT shipping_labels_mime_check
    CHECK (label_mime_type = 'application/pdf'),
  CONSTRAINT shipping_labels_error_code_length_check
    CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 120),
  CONSTRAINT shipping_labels_error_message_length_check
    CHECK (last_error_message IS NULL OR char_length(last_error_message) <= 500),
  CONSTRAINT shipping_labels_purchased_artifact_check
    CHECK (
      state <> 'purchased' OR (
        label_storage_path IS NOT NULL AND
        label_format IS NOT NULL AND
        purchased_at IS NOT NULL
      )
    ),
  CONSTRAINT shipping_labels_easypost_purchase_check
    CHECK (
      provider <> 'easypost' OR
      state NOT IN ('purchased', 'refund_pending', 'refunded') OR
      provider_shipment_id IS NOT NULL
    ),
  CONSTRAINT shipping_labels_manual_state_check
    CHECK (
      provider <> 'manual' OR
      state NOT IN ('rated', 'purchasing', 'refund_pending', 'refunded')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS shipping_labels_one_active_per_job
ON public.shipping_labels (production_job_id)
WHERE state IN (
  'preparing',
  'rated',
  'purchasing',
  'purchased',
  'refund_pending'
);

CREATE UNIQUE INDEX IF NOT EXISTS shipping_labels_provider_shipment_unique
ON public.shipping_labels (provider, provider_shipment_id)
WHERE provider_shipment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shipping_labels_storage_path_unique
ON public.shipping_labels (label_storage_path)
WHERE label_storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS shipping_labels_job_created_idx
ON public.shipping_labels (production_job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS shipping_labels_tracking_idx
ON public.shipping_labels (tracking_number)
WHERE tracking_number IS NOT NULL;

DROP TRIGGER IF EXISTS update_shipping_labels_updated_at
ON public.shipping_labels;
CREATE TRIGGER update_shipping_labels_updated_at
BEFORE UPDATE ON public.shipping_labels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.shipping_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT,
  payload_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT shipping_webhook_events_provider_check
    CHECK (provider IN ('easypost')),
  CONSTRAINT shipping_webhook_events_status_check
    CHECK (status IN ('received', 'processing', 'processed', 'failed')),
  CONSTRAINT shipping_webhook_events_attempt_count_check
    CHECK (attempt_count >= 0),
  CONSTRAINT shipping_webhook_events_event_id_length_check
    CHECK (char_length(event_id) BETWEEN 1 AND 200),
  CONSTRAINT shipping_webhook_events_event_type_length_check
    CHECK (event_type IS NULL OR char_length(event_type) <= 200),
  CONSTRAINT shipping_webhook_events_error_code_length_check
    CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 120),
  CONSTRAINT shipping_webhook_events_payload_sha256_check
    CHECK (
      payload_sha256 IS NULL OR
      payload_sha256 ~ '^[a-f0-9]{64}$'
    ),
  CONSTRAINT shipping_webhook_events_provider_event_unique
    UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS shipping_webhook_events_pending_idx
ON public.shipping_webhook_events (received_at)
WHERE status IN ('received', 'failed');

DROP TRIGGER IF EXISTS update_shipping_webhook_events_updated_at
ON public.shipping_webhook_events;
CREATE TRIGGER update_shipping_webhook_events_updated_at
BEFORE UPDATE ON public.shipping_webhook_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.shipping_label_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipping_label_id UUID REFERENCES public.shipping_labels(id)
    ON DELETE SET NULL,
  production_job_id UUID NOT NULL
    REFERENCES public.production_jobs(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_email TEXT,
  source TEXT NOT NULL DEFAULT 'operator',
  safe_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT shipping_label_audit_action_length_check
    CHECK (char_length(action) BETWEEN 1 AND 120),
  CONSTRAINT shipping_label_audit_source_check
    CHECK (source IN ('operator', 'provider', 'system')),
  CONSTRAINT shipping_label_audit_details_object_check
    CHECK (jsonb_typeof(safe_details) = 'object')
);

CREATE INDEX IF NOT EXISTS shipping_label_audit_job_created_idx
ON public.shipping_label_audit_events (production_job_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.register_manual_shipping_label(
  p_label_id UUID,
  p_production_job_id UUID,
  p_storage_path TEXT,
  p_label_format TEXT,
  p_operator_email TEXT
)
RETURNS public.shipping_labels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.production_jobs%ROWTYPE;
  v_label public.shipping_labels%ROWTYPE;
BEGIN
  IF NULLIF(BTRIM(p_operator_email), '') IS NULL OR
    char_length(p_operator_email) > 320 THEN
    RAISE EXCEPTION 'Invalid operator identity';
  END IF;

  IF p_storage_path <>
    'manual/' || p_production_job_id::text || '/' || p_label_id::text || '.pdf'
  THEN
    RAISE EXCEPTION 'Invalid manual label path';
  END IF;

  SELECT *
  INTO v_job
  FROM public.production_jobs
  WHERE id = p_production_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production job not found';
  END IF;

  IF v_job.status IN ('shipped', 'failed') THEN
    RAISE EXCEPTION 'Production job cannot accept a shipping label';
  END IF;

  INSERT INTO public.shipping_labels (
    id,
    production_job_id,
    provider,
    state,
    label_storage_path,
    label_format,
    label_mime_type,
    created_by_operator,
    purchased_at
  )
  VALUES (
    p_label_id,
    p_production_job_id,
    'manual',
    'purchased',
    p_storage_path,
    p_label_format,
    'application/pdf',
    LOWER(p_operator_email),
    now()
  )
  RETURNING * INTO v_label;

  INSERT INTO public.shipping_label_audit_events (
    shipping_label_id,
    production_job_id,
    action,
    actor_email,
    safe_details
  )
  VALUES (
    v_label.id,
    v_label.production_job_id,
    'manual_label_uploaded',
    LOWER(p_operator_email),
    jsonb_build_object('format', p_label_format)
  );

  RETURN v_label;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_shipping_label_refund(
  p_label_id UUID,
  p_operator_email TEXT
)
RETURNS public.shipping_labels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_label public.shipping_labels%ROWTYPE;
  v_job_status TEXT;
BEGIN
  IF NULLIF(BTRIM(p_operator_email), '') IS NULL OR
    char_length(p_operator_email) > 320 THEN
    RAISE EXCEPTION 'Invalid operator identity';
  END IF;

  SELECT *
  INTO v_label
  FROM public.shipping_labels
  WHERE id = p_label_id
  FOR UPDATE;

  IF NOT FOUND OR
    v_label.provider <> 'easypost' OR
    v_label.state <> 'purchased' OR
    v_label.print_accessed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Shipping label is not refundable';
  END IF;

  SELECT status
  INTO v_job_status
  FROM public.production_jobs
  WHERE id = v_label.production_job_id
  FOR SHARE;

  IF NOT FOUND OR v_job_status = 'shipped' THEN
    RAISE EXCEPTION 'Shipping label is not refundable';
  END IF;

  UPDATE public.shipping_labels
  SET
    state = 'refund_pending',
    refund_requested_at = now()
  WHERE id = v_label.id
  RETURNING * INTO v_label;

  INSERT INTO public.shipping_label_audit_events (
    shipping_label_id,
    production_job_id,
    action,
    actor_email
  )
  VALUES (
    v_label.id,
    v_label.production_job_id,
    'refund_requested',
    LOWER(p_operator_email)
  );

  RETURN v_label;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_shipping_label_print(
  p_label_id UUID,
  p_operator_email TEXT,
  p_ttl_seconds INTEGER
)
RETURNS public.shipping_labels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_label public.shipping_labels%ROWTYPE;
BEGIN
  IF NULLIF(BTRIM(p_operator_email), '') IS NULL OR
    char_length(p_operator_email) > 320 THEN
    RAISE EXCEPTION 'Invalid operator identity';
  END IF;

  IF p_ttl_seconds < 30 OR p_ttl_seconds > 300 THEN
    RAISE EXCEPTION 'Invalid print-link lifetime';
  END IF;

  UPDATE public.shipping_labels
  SET print_accessed_at = COALESCE(print_accessed_at, now())
  WHERE id = p_label_id
    AND state = 'purchased'
    AND label_storage_path IS NOT NULL
  RETURNING * INTO v_label;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipping label is not printable';
  END IF;

  INSERT INTO public.shipping_label_audit_events (
    shipping_label_id,
    production_job_id,
    action,
    actor_email,
    safe_details
  )
  VALUES (
    v_label.id,
    v_label.production_job_id,
    'print_url_created',
    LOWER(p_operator_email),
    jsonb_build_object('ttlSeconds', p_ttl_seconds)
  );

  RETURN v_label;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_shipping_label_replacement(
  p_label_id UUID,
  p_operator_email TEXT
)
RETURNS public.shipping_labels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_original public.shipping_labels%ROWTYPE;
  v_replacement public.shipping_labels%ROWTYPE;
BEGIN
  IF NULLIF(BTRIM(p_operator_email), '') IS NULL OR
    char_length(p_operator_email) > 320 THEN
    RAISE EXCEPTION 'Invalid operator identity';
  END IF;

  SELECT *
  INTO v_original
  FROM public.shipping_labels
  WHERE id = p_label_id
  FOR UPDATE;

  IF NOT FOUND OR
    v_original.provider <> 'easypost' OR
    v_original.state NOT IN ('refunded', 'failed') THEN
    RAISE EXCEPTION
      'EasyPost label must be refunded or failed before replacement';
  END IF;

  INSERT INTO public.shipping_labels (
    production_job_id,
    provider,
    state,
    replaces_label_id,
    currency,
    label_format,
    created_by_operator
  )
  VALUES (
    v_original.production_job_id,
    'easypost',
    'preparing',
    v_original.id,
    v_original.currency,
    v_original.label_format,
    LOWER(p_operator_email)
  )
  RETURNING * INTO v_replacement;

  INSERT INTO public.shipping_label_audit_events (
    shipping_label_id,
    production_job_id,
    action,
    actor_email,
    safe_details
  )
  VALUES (
    v_replacement.id,
    v_replacement.production_job_id,
    'replacement_requested',
    LOWER(p_operator_email),
    jsonb_build_object('replacesLabelId', v_original.id)
  );

  RETURN v_replacement;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_shipping_webhook_event(
  p_provider TEXT,
  p_event_id TEXT,
  p_event_type TEXT,
  p_payload_sha256 TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted_count INTEGER;
BEGIN
  INSERT INTO public.shipping_webhook_events (
    provider,
    event_id,
    event_type,
    payload_sha256
  )
  VALUES (
    p_provider,
    p_event_id,
    p_event_type,
    p_payload_sha256
  )
  ON CONFLICT (provider, event_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_shipping_label_tracking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.state NOT IN ('purchased', 'refund_pending') OR
    NEW.tracking_number IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.production_jobs
  SET
    tracking_carrier = NEW.carrier,
    tracking_number = NEW.tracking_number,
    tracking_url = NEW.tracking_url
  WHERE id = NEW.production_job_id;

  UPDATE public.orders AS orders
  SET
    tracking_carrier = NEW.carrier,
    tracking_number = NEW.tracking_number,
    tracking_url = NEW.tracking_url
  FROM public.production_jobs AS jobs
  WHERE jobs.id = NEW.production_job_id
    AND orders.id = jobs.order_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_shipping_label_tracking_to_order
ON public.shipping_labels;
CREATE TRIGGER sync_shipping_label_tracking_to_order
AFTER INSERT OR UPDATE OF
  state,
  carrier,
  tracking_number,
  tracking_url
ON public.shipping_labels
FOR EACH ROW
EXECUTE FUNCTION public.sync_shipping_label_tracking();

ALTER TABLE public.shipping_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_label_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shipping labels service role only"
ON public.shipping_labels;
CREATE POLICY "Shipping labels service role only"
ON public.shipping_labels
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Shipping webhook events service role only"
ON public.shipping_webhook_events;
CREATE POLICY "Shipping webhook events service role only"
ON public.shipping_webhook_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Shipping label audit service role only"
ON public.shipping_label_audit_events;
CREATE POLICY "Shipping label audit service role only"
ON public.shipping_label_audit_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Shipping label objects service role only"
ON storage.objects;
CREATE POLICY "Shipping label objects service role only"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'shipping-labels')
WITH CHECK (bucket_id = 'shipping-labels');

REVOKE ALL ON public.shipping_labels FROM anon, authenticated;
REVOKE ALL ON public.shipping_webhook_events FROM anon, authenticated;
REVOKE ALL ON public.shipping_label_audit_events FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.shipping_labels TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON public.shipping_webhook_events TO service_role;
GRANT SELECT, INSERT
ON public.shipping_label_audit_events TO service_role;

REVOKE ALL ON FUNCTION public.register_manual_shipping_label(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_shipping_label_refund(
  UUID,
  TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.authorize_shipping_label_print(
  UUID,
  TEXT,
  INTEGER
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_shipping_label_replacement(
  UUID,
  TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_shipping_webhook_event(
  TEXT,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_shipping_label_tracking()
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.register_manual_shipping_label(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_shipping_label_refund(
  UUID,
  TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.authorize_shipping_label_print(
  UUID,
  TEXT,
  INTEGER
) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_shipping_label_replacement(
  UUID,
  TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_shipping_webhook_event(
  TEXT,
  TEXT,
  TEXT,
  TEXT
) TO service_role;
