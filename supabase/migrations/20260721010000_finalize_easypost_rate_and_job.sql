CREATE OR REPLACE FUNCTION public.finalize_easypost_shipping_rate_and_job(
  p_label_id UUID,
  p_provider_address_id TEXT,
  p_provider_shipment_id TEXT,
  p_provider_rate_id TEXT,
  p_carrier TEXT,
  p_service TEXT,
  p_quoted_amount_cents INTEGER,
  p_currency TEXT,
  p_delivery_days INTEGER,
  p_address_status TEXT,
  p_rate_summary JSONB,
  p_normalized_shipping_address JSONB
)
RETURNS public.shipping_labels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_label public.shipping_labels%ROWTYPE;
  v_job public.production_jobs%ROWTYPE;
BEGIN
  IF NULLIF(BTRIM(p_provider_address_id), '') IS NULL OR
    char_length(p_provider_address_id) > 200 OR
    NULLIF(BTRIM(p_provider_shipment_id), '') IS NULL OR
    char_length(p_provider_shipment_id) > 200 OR
    NULLIF(BTRIM(p_provider_rate_id), '') IS NULL OR
    char_length(p_provider_rate_id) > 200 OR
    p_address_status NOT IN ('valid', 'corrected') OR
    NULLIF(BTRIM(p_carrier), '') IS NULL OR
    char_length(p_carrier) > 120 OR
    NULLIF(BTRIM(p_service), '') IS NULL OR
    char_length(p_service) > 120 OR
    p_quoted_amount_cents < 0 OR
    p_currency !~ '^[A-Z]{3}$' OR
    p_delivery_days IS NOT NULL AND p_delivery_days < 0 OR
    p_rate_summary IS NULL OR
    jsonb_typeof(p_rate_summary) <> 'object' OR
    (
      p_rate_summary - ARRAY['eligibleRateCount', 'policyVersion']
    ) <> '{}'::jsonb OR
    p_normalized_shipping_address IS NULL OR
    jsonb_typeof(p_normalized_shipping_address) <> 'object' OR
    octet_length(p_normalized_shipping_address::TEXT) > 16384 THEN
    RAISE EXCEPTION 'Invalid approved EasyPost rate';
  END IF;

  IF p_rate_summary ? 'eligibleRateCount' THEN
    IF jsonb_typeof(p_rate_summary -> 'eligibleRateCount') <> 'number' OR
      (p_rate_summary ->> 'eligibleRateCount')::NUMERIC < 0 THEN
      RAISE EXCEPTION 'Invalid approved EasyPost rate';
    END IF;
  END IF;

  IF p_rate_summary ? 'policyVersion' THEN
    IF jsonb_typeof(p_rate_summary -> 'policyVersion') <> 'number' OR
      (p_rate_summary ->> 'policyVersion')::NUMERIC < 1 THEN
      RAISE EXCEPTION 'Invalid approved EasyPost rate';
    END IF;
  END IF;

  SELECT *
  INTO v_label
  FROM public.shipping_labels
  WHERE id = p_label_id
    AND provider = 'easypost'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EasyPost shipping label not found';
  END IF;

  SELECT *
  INTO v_job
  FROM public.production_jobs
  WHERE id = v_label.production_job_id
    AND provider = 'onshore_manual'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onshore production job not found';
  END IF;

  IF v_label.state = 'rated' AND
    v_label.provider_address_id = p_provider_address_id AND
    v_label.provider_shipment_id = p_provider_shipment_id AND
    v_label.provider_rate_id = p_provider_rate_id THEN
    UPDATE public.production_jobs
    SET
      fulfillment_status = CASE
        WHEN fulfillment_status = 'vendor_notify_failed'
          THEN fulfillment_status
        ELSE 'onshore_manual_shipping_rated'
      END,
      shipping_address = p_normalized_shipping_address
    WHERE id = v_job.id;

    RETURN v_label;
  END IF;

  IF v_label.state NOT IN ('preparing', 'shipping_review') THEN
    RAISE EXCEPTION 'EasyPost shipping label is not awaiting a rate';
  END IF;

  UPDATE public.shipping_labels
  SET
    state = 'rated',
    provider_address_id = p_provider_address_id,
    provider_shipment_id = p_provider_shipment_id,
    provider_rate_id = p_provider_rate_id,
    address_policy_outcome = CASE
      WHEN p_address_status = 'corrected' THEN 'corrected'
      ELSE 'verified'
    END,
    rate_policy_outcome = 'approved',
    carrier = p_carrier,
    service = p_service,
    quoted_amount_cents = p_quoted_amount_cents,
    currency = p_currency,
    delivery_days = p_delivery_days,
    safe_rate_summary = jsonb_strip_nulls(
      jsonb_build_object(
        'carrier', p_carrier,
        'service', p_service,
        'amountCents', p_quoted_amount_cents,
        'currency', p_currency,
        'deliveryDays', p_delivery_days
      ) || p_rate_summary
    ),
    recovery_state = 'none',
    last_error_code = NULL,
    last_error_message = NULL,
    failed_at = NULL
  WHERE id = v_label.id
  RETURNING * INTO v_label;

  UPDATE public.production_jobs
  SET
    fulfillment_status = CASE
      WHEN fulfillment_status = 'vendor_notify_failed'
        THEN fulfillment_status
      ELSE 'onshore_manual_shipping_rated'
    END,
    shipping_address = p_normalized_shipping_address
  WHERE id = v_job.id;

  INSERT INTO public.shipping_label_audit_events (
    shipping_label_id,
    production_job_id,
    action,
    source,
    safe_details
  )
  VALUES (
    v_label.id,
    v_label.production_job_id,
    'easypost_rate_approved',
    'system',
    v_label.safe_rate_summary
  );

  RETURN v_label;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_easypost_shipping_rate_and_job(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  INTEGER,
  TEXT,
  JSONB,
  JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.finalize_easypost_shipping_rate_and_job(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  INTEGER,
  TEXT,
  JSONB,
  JSONB
) TO service_role;
