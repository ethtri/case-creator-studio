ALTER TABLE public.shipping_labels
  ADD COLUMN IF NOT EXISTS provider_address_id TEXT,
  ADD COLUMN IF NOT EXISTS address_policy_outcome TEXT
    NOT NULL DEFAULT 'not_checked',
  ADD COLUMN IF NOT EXISTS rate_policy_outcome TEXT
    NOT NULL DEFAULT 'not_evaluated',
  ADD COLUMN IF NOT EXISTS safe_rate_summary JSONB
    NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS purchase_idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS purchase_attempt_count INTEGER
    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_lease_token UUID,
  ADD COLUMN IF NOT EXISTS purchase_lease_expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS purchase_reconciled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS refund_status TEXT
    NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS refund_attempt_count INTEGER
    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_lease_token UUID,
  ADD COLUMN IF NOT EXISTS refund_lease_expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS recovery_state TEXT
    NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shipping_labels_provider_address_length_check'
      AND conrelid = 'public.shipping_labels'::regclass
  ) THEN
    ALTER TABLE public.shipping_labels
      ADD CONSTRAINT shipping_labels_provider_address_length_check
      CHECK (
        provider_address_id IS NULL OR
        char_length(provider_address_id) BETWEEN 1 AND 200
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shipping_labels_address_policy_outcome_check'
      AND conrelid = 'public.shipping_labels'::regclass
  ) THEN
    ALTER TABLE public.shipping_labels
      ADD CONSTRAINT shipping_labels_address_policy_outcome_check
      CHECK (
        address_policy_outcome IN (
          'not_checked',
          'verified',
          'corrected',
          'review_required',
          'rejected'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shipping_labels_rate_policy_outcome_check'
      AND conrelid = 'public.shipping_labels'::regclass
  ) THEN
    ALTER TABLE public.shipping_labels
      ADD CONSTRAINT shipping_labels_rate_policy_outcome_check
      CHECK (
        rate_policy_outcome IN (
          'not_evaluated',
          'approved',
          'review_required',
          'rejected'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shipping_labels_safe_rate_summary_check'
      AND conrelid = 'public.shipping_labels'::regclass
  ) THEN
    ALTER TABLE public.shipping_labels
      ADD CONSTRAINT shipping_labels_safe_rate_summary_check
      CHECK (
        jsonb_typeof(safe_rate_summary) = 'object' AND
        (
          safe_rate_summary - ARRAY[
            'carrier',
            'service',
            'amountCents',
            'currency',
            'deliveryDays',
            'eligibleRateCount',
            'policyVersion'
          ]
        ) = '{}'::jsonb
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shipping_labels_purchase_idempotency_key_check'
      AND conrelid = 'public.shipping_labels'::regclass
  ) THEN
    ALTER TABLE public.shipping_labels
      ADD CONSTRAINT shipping_labels_purchase_idempotency_key_check
      CHECK (
        purchase_idempotency_key IS NULL OR
        char_length(purchase_idempotency_key) BETWEEN 1 AND 200
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shipping_labels_attempt_counts_check'
      AND conrelid = 'public.shipping_labels'::regclass
  ) THEN
    ALTER TABLE public.shipping_labels
      ADD CONSTRAINT shipping_labels_attempt_counts_check
      CHECK (
        purchase_attempt_count >= 0 AND
        refund_attempt_count >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shipping_labels_purchase_lease_check'
      AND conrelid = 'public.shipping_labels'::regclass
  ) THEN
    ALTER TABLE public.shipping_labels
      ADD CONSTRAINT shipping_labels_purchase_lease_check
      CHECK (
        purchase_lease_expires_at IS NULL OR
        purchase_lease_token IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shipping_labels_refund_lease_check'
      AND conrelid = 'public.shipping_labels'::regclass
  ) THEN
    ALTER TABLE public.shipping_labels
      ADD CONSTRAINT shipping_labels_refund_lease_check
      CHECK (
        refund_lease_expires_at IS NULL OR
        refund_lease_token IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shipping_labels_recovery_state_check'
      AND conrelid = 'public.shipping_labels'::regclass
  ) THEN
    ALTER TABLE public.shipping_labels
      ADD CONSTRAINT shipping_labels_recovery_state_check
      CHECK (
        recovery_state IN (
          'none',
          'preparation_review_required',
          'purchase_reconciliation_required',
          'refund_reconciliation_required',
          'operator_review_required'
        )
      );
  END IF;
END;
$$;

ALTER TABLE public.shipping_labels
  DROP CONSTRAINT IF EXISTS shipping_labels_safe_rate_summary_check;
ALTER TABLE public.shipping_labels
  ADD CONSTRAINT shipping_labels_safe_rate_summary_check
  CHECK (
    jsonb_typeof(safe_rate_summary) = 'object' AND
    (
      safe_rate_summary - ARRAY[
        'carrier',
        'service',
        'amountCents',
        'currency',
        'deliveryDays',
        'eligibleRateCount',
        'policyVersion'
      ]
    ) = '{}'::jsonb
  );

ALTER TABLE public.shipping_labels
  DROP CONSTRAINT IF EXISTS shipping_labels_state_check;
ALTER TABLE public.shipping_labels
  ADD CONSTRAINT shipping_labels_state_check
  CHECK (
    state IN (
      'preparing',
      'shipping_review',
      'rated',
      'purchasing',
      'purchase_reconciliation',
      'purchased',
      'refund_pending',
      'refunded',
      'failed'
    )
  );

ALTER TABLE public.shipping_labels
  DROP CONSTRAINT IF EXISTS shipping_labels_refund_status_check;
ALTER TABLE public.shipping_labels
  ADD CONSTRAINT shipping_labels_refund_status_check
  CHECK (
    refund_status IN (
      'none',
      'processing',
      'submitted',
      'refunded',
      'rejected',
      'unknown'
    )
  );

DROP INDEX IF EXISTS public.shipping_labels_one_active_per_job;
CREATE UNIQUE INDEX shipping_labels_one_active_per_job
ON public.shipping_labels (production_job_id)
WHERE state IN (
  'preparing',
  'shipping_review',
  'rated',
  'purchasing',
  'purchase_reconciliation',
  'purchased',
  'refund_pending'
);

CREATE UNIQUE INDEX IF NOT EXISTS shipping_labels_purchase_idempotency_unique
ON public.shipping_labels (purchase_idempotency_key)
WHERE purchase_idempotency_key IS NOT NULL;

DROP INDEX IF EXISTS public.shipping_labels_purchase_recovery_idx;
CREATE INDEX shipping_labels_purchase_recovery_idx
ON public.shipping_labels (purchase_lease_expires_at)
WHERE state IN ('purchasing', 'purchase_reconciliation');

CREATE INDEX IF NOT EXISTS shipping_labels_refund_recovery_idx
ON public.shipping_labels (refund_lease_expires_at)
WHERE state = 'refund_pending';

ALTER TABLE public.shipping_webhook_events
  ADD COLUMN IF NOT EXISTS safe_payload JSONB
    NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lease_token UUID,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_error_message TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shipping_webhook_events_safe_payload_check'
      AND conrelid = 'public.shipping_webhook_events'::regclass
  ) THEN
    ALTER TABLE public.shipping_webhook_events
      ADD CONSTRAINT shipping_webhook_events_safe_payload_check
      CHECK (
        jsonb_typeof(safe_payload) = 'object' AND
        (
          safe_payload - ARRAY[
            'eventId',
            'eventType',
            'trackerId',
            'shipmentId',
            'carrier',
            'trackingCode',
            'trackerStatus',
            'trackingUrl',
            'shipmentStatus'
          ]
        ) = '{}'::jsonb AND
        COALESCE(
          jsonb_typeof(safe_payload -> 'eventId') IN ('string', 'null'),
          true
        ) AND
        COALESCE(
          jsonb_typeof(safe_payload -> 'eventType') IN ('string', 'null'),
          true
        ) AND
        COALESCE(
          jsonb_typeof(safe_payload -> 'trackerId') IN ('string', 'null'),
          true
        ) AND
        COALESCE(
          jsonb_typeof(safe_payload -> 'shipmentId') IN ('string', 'null'),
          true
        ) AND
        COALESCE(
          jsonb_typeof(safe_payload -> 'carrier') IN ('string', 'null'),
          true
        ) AND
        COALESCE(
          jsonb_typeof(safe_payload -> 'trackingCode') IN ('string', 'null'),
          true
        ) AND
        COALESCE(
          jsonb_typeof(safe_payload -> 'trackerStatus') IN ('string', 'null'),
          true
        ) AND
        COALESCE(
          jsonb_typeof(safe_payload -> 'trackingUrl') IN ('string', 'null'),
          true
        ) AND
        COALESCE(
          jsonb_typeof(safe_payload -> 'shipmentStatus') IN ('string', 'null'),
          true
        ) AND
        char_length(COALESCE(safe_payload ->> 'eventId', '')) <= 200 AND
        char_length(COALESCE(safe_payload ->> 'eventType', '')) <= 200 AND
        char_length(COALESCE(safe_payload ->> 'trackerId', '')) <= 200 AND
        char_length(COALESCE(safe_payload ->> 'shipmentId', '')) <= 200 AND
        char_length(COALESCE(safe_payload ->> 'carrier', '')) <= 120 AND
        char_length(COALESCE(safe_payload ->> 'trackingCode', '')) <= 120 AND
        char_length(COALESCE(safe_payload ->> 'trackerStatus', '')) <= 120 AND
        char_length(COALESCE(safe_payload ->> 'trackingUrl', '')) <= 1000 AND
        char_length(COALESCE(safe_payload ->> 'shipmentStatus', '')) <= 120
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shipping_webhook_events_lease_check'
      AND conrelid = 'public.shipping_webhook_events'::regclass
  ) THEN
    ALTER TABLE public.shipping_webhook_events
      ADD CONSTRAINT shipping_webhook_events_lease_check
      CHECK (
        lease_expires_at IS NULL OR
        lease_token IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shipping_webhook_events_error_message_length_check'
      AND conrelid = 'public.shipping_webhook_events'::regclass
  ) THEN
    ALTER TABLE public.shipping_webhook_events
      ADD CONSTRAINT shipping_webhook_events_error_message_length_check
      CHECK (
        last_error_message IS NULL OR
        char_length(last_error_message) <= 500
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS shipping_webhook_events_lease_recovery_idx
ON public.shipping_webhook_events (lease_expires_at)
WHERE status IN ('processing', 'failed');

CREATE OR REPLACE FUNCTION public.prepare_easypost_shipping_label(
  p_production_job_id UUID,
  p_label_format TEXT DEFAULT 'pdf_4x6'
)
RETURNS public.shipping_labels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.production_jobs%ROWTYPE;
  v_label public.shipping_labels%ROWTYPE;
  v_label_id UUID;
  v_label_found BOOLEAN := false;
  v_replaces_label_id UUID;
BEGIN
  IF p_label_format NOT IN ('pdf_4x6', 'pdf_letter') THEN
    RAISE EXCEPTION 'Invalid EasyPost label format';
  END IF;

  SELECT *
  INTO v_label
  FROM public.shipping_labels
  WHERE production_job_id = p_production_job_id
    AND state IN (
      'preparing',
      'shipping_review',
      'rated',
      'purchasing',
      'purchase_reconciliation',
      'purchased',
      'refund_pending'
    )
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  v_label_found := FOUND;

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

  IF v_label_found THEN
    IF v_label.provider <> 'easypost' THEN
      RAISE EXCEPTION 'Production job already has an active shipping label';
    END IF;

    IF v_label.purchase_idempotency_key IS NULL THEN
      UPDATE public.shipping_labels
      SET
        purchase_idempotency_key = 'snapcase-label-' || v_label.id::text,
        label_format = COALESCE(label_format, p_label_format)
      WHERE id = v_label.id
      RETURNING * INTO v_label;
    END IF;

    RETURN v_label;
  END IF;

  SELECT id
  INTO v_replaces_label_id
  FROM public.shipping_labels
  WHERE production_job_id = p_production_job_id
    AND state IN ('refunded', 'failed')
  ORDER BY created_at DESC
  LIMIT 1;

  v_label_id := gen_random_uuid();

  INSERT INTO public.shipping_labels (
    id,
    production_job_id,
    provider,
    state,
    replaces_label_id,
    currency,
    label_format,
    purchase_idempotency_key,
    recovery_state
  )
  VALUES (
    v_label_id,
    p_production_job_id,
    'easypost',
    'preparing',
    v_replaces_label_id,
    'USD',
    p_label_format,
    'snapcase-label-' || v_label_id::text,
    'none'
  )
  RETURNING * INTO v_label;

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
    'easypost_label_prepared',
    'system',
    jsonb_build_object('labelFormat', p_label_format)
  );

  RETURN v_label;
END;
$$;

DROP FUNCTION IF EXISTS public.finalize_easypost_shipping_rate(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  INTEGER
);
DROP FUNCTION IF EXISTS public.finalize_easypost_shipping_rate(
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
  JSONB
);
CREATE OR REPLACE FUNCTION public.finalize_easypost_shipping_rate(
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
  p_rate_summary JSONB
)
RETURNS public.shipping_labels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_label public.shipping_labels%ROWTYPE;
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
    ) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid approved EasyPost rate';
  END IF;

  IF p_rate_summary ? 'eligibleRateCount' THEN
    IF jsonb_typeof(p_rate_summary -> 'eligibleRateCount') <> 'number' THEN
      RAISE EXCEPTION 'Invalid approved EasyPost rate';
    END IF;
    IF (p_rate_summary ->> 'eligibleRateCount')::NUMERIC < 0 THEN
      RAISE EXCEPTION 'Invalid approved EasyPost rate';
    END IF;
  END IF;

  IF p_rate_summary ? 'policyVersion' THEN
    IF jsonb_typeof(p_rate_summary -> 'policyVersion') <> 'number' THEN
      RAISE EXCEPTION 'Invalid approved EasyPost rate';
    END IF;
    IF (p_rate_summary ->> 'policyVersion')::NUMERIC < 1 THEN
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

  IF v_label.state = 'rated' AND
    v_label.provider_address_id = p_provider_address_id AND
    v_label.provider_shipment_id = p_provider_shipment_id AND
    v_label.provider_rate_id = p_provider_rate_id THEN
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

DROP FUNCTION IF EXISTS public.fail_easypost_shipping_preparation(
  UUID,
  TEXT,
  TEXT,
  TEXT
);
CREATE OR REPLACE FUNCTION public.fail_easypost_shipping_preparation(
  p_label_id UUID,
  p_error_code TEXT,
  p_error_message TEXT,
  p_failure_category TEXT DEFAULT 'provider'
)
RETURNS public.shipping_labels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_label public.shipping_labels%ROWTYPE;
BEGIN
  IF p_failure_category NOT IN (
    'address',
    'rate',
    'config',
    'provider',
    'terminal'
  ) OR
    NULLIF(BTRIM(p_error_code), '') IS NULL OR
    char_length(p_error_code) > 120 OR
    NULLIF(BTRIM(p_error_message), '') IS NULL OR
    char_length(p_error_message) > 500 THEN
    RAISE EXCEPTION 'Invalid EasyPost preparation failure';
  END IF;

  SELECT *
  INTO v_label
  FROM public.shipping_labels
  WHERE id = p_label_id
    AND provider = 'easypost'
  FOR UPDATE;

  IF NOT FOUND OR v_label.state NOT IN ('preparing', 'shipping_review') THEN
    RAISE EXCEPTION 'EasyPost shipping label is not being prepared';
  END IF;

  UPDATE public.shipping_labels
  SET
    state = CASE
      WHEN p_failure_category = 'terminal' THEN 'failed'
      ELSE 'shipping_review'
    END,
    address_policy_outcome = CASE
      WHEN p_failure_category = 'address' THEN 'review_required'
      ELSE address_policy_outcome
    END,
    rate_policy_outcome = CASE
      WHEN p_failure_category = 'rate' THEN 'review_required'
      ELSE rate_policy_outcome
    END,
    recovery_state = CASE
      WHEN p_failure_category = 'terminal' THEN 'none'
      ELSE 'preparation_review_required'
    END,
    last_error_code = p_error_code,
    last_error_message = p_error_message,
    failed_at = CASE
      WHEN p_failure_category = 'terminal' THEN now()
      ELSE NULL
    END
  WHERE id = v_label.id
  RETURNING * INTO v_label;

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
    CASE
      WHEN p_failure_category = 'terminal'
        THEN 'easypost_preparation_failed'
      ELSE 'easypost_preparation_review_required'
    END,
    'system',
    jsonb_build_object(
      'failureCategory',
      p_failure_category,
      'errorCode',
      p_error_code
    )
  );

  RETURN v_label;
END;
$$;

DROP FUNCTION IF EXISTS public.claim_easypost_label_purchase(
  UUID,
  UUID,
  INTEGER,
  TEXT
);
CREATE OR REPLACE FUNCTION public.claim_easypost_label_purchase(
  p_production_job_id UUID,
  p_claim_token UUID,
  p_lease_seconds INTEGER,
  p_reconciliation_result TEXT DEFAULT NULL
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
  IF p_claim_token IS NULL OR
    p_lease_seconds < 30 OR p_lease_seconds > 900 OR
    p_reconciliation_result IS NOT NULL AND
      p_reconciliation_result NOT IN (
        'purchased',
        'not_purchased',
        'unknown'
      ) THEN
    RAISE EXCEPTION 'Invalid EasyPost purchase claim';
  END IF;

  SELECT *
  INTO v_label
  FROM public.shipping_labels
  WHERE production_job_id = p_production_job_id
    AND provider = 'easypost'
    AND state IN (
      'rated',
      'purchasing',
      'purchase_reconciliation',
      'purchased'
    )
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EasyPost shipping label not found';
  END IF;

  SELECT status
  INTO v_job_status
  FROM public.production_jobs
  WHERE id = p_production_job_id
  FOR UPDATE;

  IF NOT FOUND OR v_job_status NOT IN ('printed', 'packed') THEN
    RAISE EXCEPTION 'Production job is not ready for postage purchase';
  END IF;

  IF v_label.state = 'purchased' THEN
    RETURN v_label;
  END IF;

  IF v_label.provider_shipment_id IS NULL OR
    v_label.provider_rate_id IS NULL OR
    v_label.purchase_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'EasyPost shipment and rate must be persisted first';
  END IF;

  IF v_label.state = 'rated' AND p_reconciliation_result IS NOT NULL THEN
    RAISE EXCEPTION 'Reconciliation result is invalid for a rated label';
  END IF;

  IF v_label.state = 'purchasing' AND
    v_label.purchase_lease_token = p_claim_token THEN
    RETURN v_label;
  END IF;

  IF v_label.state = 'purchase_reconciliation' AND
    v_label.purchase_lease_token = p_claim_token THEN
    IF p_reconciliation_result = 'purchased' THEN
      UPDATE public.shipping_labels
      SET
        purchase_reconciled_at = now(),
        purchase_lease_expires_at =
          now() + make_interval(secs => p_lease_seconds),
        last_error_code = NULL,
        last_error_message = NULL
      WHERE id = v_label.id
      RETURNING * INTO v_label;
    END IF;

    IF p_reconciliation_result = 'not_purchased' THEN
      UPDATE public.shipping_labels
      SET
        state = 'purchasing',
        recovery_state = 'none',
        purchase_reconciled_at = now(),
        purchase_lease_expires_at =
          now() + make_interval(secs => p_lease_seconds),
        last_error_code = NULL,
        last_error_message = NULL
      WHERE id = v_label.id
      RETURNING * INTO v_label;
    END IF;

    RETURN v_label;
  END IF;

  -- A different worker may recover only after the lease expires. The recovered
  -- claim stays in purchase_reconciliation, forcing provider retrieval before
  -- p_reconciliation_result='not_purchased' can make it buyable again.
  IF v_label.state = 'purchasing' AND
    v_label.purchase_lease_expires_at IS NOT NULL AND
    v_label.purchase_lease_expires_at > now() THEN
    RAISE EXCEPTION 'EasyPost purchase is already actively claimed';
  END IF;

  IF v_label.state = 'purchase_reconciliation' AND
    v_label.purchase_lease_expires_at IS NOT NULL AND
    v_label.purchase_lease_expires_at > now() THEN
    RAISE EXCEPTION 'EasyPost reconciliation is already actively claimed';
  END IF;

  IF v_label.state NOT IN (
    'rated',
    'purchasing',
    'purchase_reconciliation'
  ) THEN
    RAISE EXCEPTION 'EasyPost shipping label is not purchasable';
  END IF;

  UPDATE public.shipping_labels
  SET
    state = CASE
      WHEN v_label.state = 'rated' THEN 'purchasing'
      ELSE 'purchase_reconciliation'
    END,
    purchase_lease_token = p_claim_token,
    purchase_lease_expires_at =
      now() + make_interval(secs => p_lease_seconds),
    purchase_attempt_count = purchase_attempt_count + 1,
    purchase_reconciled_at = CASE
      WHEN v_label.state = 'rated' THEN purchase_reconciled_at
      ELSE NULL
    END,
    recovery_state = CASE
      WHEN v_label.state = 'rated' THEN 'none'
      ELSE 'purchase_reconciliation_required'
    END,
    last_error_code = CASE
      WHEN v_label.state = 'rated' THEN NULL
      ELSE last_error_code
    END,
    last_error_message = CASE
      WHEN v_label.state = 'rated' THEN NULL
      ELSE last_error_message
    END
  WHERE id = v_label.id
  RETURNING * INTO v_label;

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
    'easypost_purchase_claimed',
    'system',
    jsonb_build_object(
      'attemptCount',
      v_label.purchase_attempt_count,
      'claimMode',
      CASE
        WHEN v_label.state = 'purchase_reconciliation'
          THEN 'reconcile'
        ELSE 'purchase'
      END
    )
  );

  RETURN v_label;
END;
$$;

DROP FUNCTION IF EXISTS public.finalize_easypost_label_purchase(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT
);
DROP FUNCTION IF EXISTS public.finalize_easypost_label_purchase(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
);
CREATE OR REPLACE FUNCTION public.finalize_easypost_label_purchase(
  p_label_id UUID,
  p_claim_token UUID,
  p_provider_tracker_id TEXT,
  p_carrier TEXT,
  p_service TEXT,
  p_purchased_amount_cents INTEGER,
  p_currency TEXT,
  p_tracking_number TEXT,
  p_tracking_status TEXT,
  p_tracking_url TEXT,
  p_label_storage_path TEXT,
  p_label_format TEXT
)
RETURNS public.shipping_labels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_label public.shipping_labels%ROWTYPE;
BEGIN
  IF p_claim_token IS NULL OR
    p_provider_tracker_id IS NOT NULL AND
      char_length(p_provider_tracker_id) > 200 OR
    NULLIF(BTRIM(p_carrier), '') IS NULL OR
    char_length(p_carrier) > 120 OR
    NULLIF(BTRIM(p_service), '') IS NULL OR
    char_length(p_service) > 120 OR
    NULLIF(BTRIM(p_tracking_number), '') IS NULL OR
    char_length(p_tracking_number) > 120 OR
    p_tracking_status IS NOT NULL AND
      char_length(p_tracking_status) > 120 OR
    p_tracking_url IS NOT NULL AND
      char_length(p_tracking_url) > 1000 OR
    p_label_format NOT IN ('pdf_4x6', 'pdf_letter') OR
    p_purchased_amount_cents < 0 OR
    p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Invalid EasyPost purchase result';
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

  IF p_label_storage_path <>
    'easypost/' || v_label.production_job_id::text || '/' ||
      v_label.id::text || '.pdf' THEN
    RAISE EXCEPTION 'Invalid EasyPost private label path';
  END IF;

  IF v_label.state = 'purchased' AND
    v_label.purchase_lease_token = p_claim_token AND
    v_label.provider_tracker_id = p_provider_tracker_id AND
    v_label.tracking_number = p_tracking_number AND
    v_label.label_storage_path = p_label_storage_path AND
    v_label.purchased_amount_cents = p_purchased_amount_cents THEN
    RETURN v_label;
  END IF;

  IF v_label.state NOT IN ('purchasing', 'purchase_reconciliation') OR
    v_label.purchase_lease_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'EasyPost purchase claim ownership was lost';
  END IF;

  IF v_label.state = 'purchase_reconciliation' AND
    v_label.purchase_reconciled_at IS NULL THEN
    RAISE EXCEPTION 'EasyPost purchase must be reconciled with the provider';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'shipping-labels'
      AND name = p_label_storage_path
  ) THEN
    RAISE EXCEPTION 'EasyPost private label artifact is missing';
  END IF;

  UPDATE public.shipping_labels
  SET
    state = 'purchased',
    provider_tracker_id = p_provider_tracker_id,
    carrier = p_carrier,
    service = p_service,
    tracking_number = p_tracking_number,
    tracking_status = p_tracking_status,
    tracking_url = p_tracking_url,
    label_storage_path = p_label_storage_path,
    label_format = p_label_format,
    purchased_amount_cents = p_purchased_amount_cents,
    currency = p_currency,
    purchased_at = COALESCE(purchased_at, now()),
    purchase_lease_expires_at = NULL,
    purchase_reconciled_at = CASE
      WHEN v_label.state = 'purchase_reconciliation' THEN now()
      ELSE purchase_reconciled_at
    END,
    recovery_state = 'none',
    last_error_code = NULL,
    last_error_message = NULL,
    failed_at = NULL
  WHERE id = v_label.id
  RETURNING * INTO v_label;

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
    'easypost_label_purchased',
    'provider',
    jsonb_build_object(
      'carrier', v_label.carrier,
      'service', v_label.service,
      'amountCents', p_purchased_amount_cents,
      'currency', p_currency
    )
  );

  RETURN v_label;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_easypost_purchase_reconciliation(
  p_label_id UUID,
  p_claim_token UUID,
  p_error_code TEXT,
  p_error_message TEXT
)
RETURNS public.shipping_labels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_label public.shipping_labels%ROWTYPE;
BEGIN
  IF p_claim_token IS NULL OR
    NULLIF(BTRIM(p_error_code), '') IS NULL OR
    char_length(p_error_code) > 120 OR
    NULLIF(BTRIM(p_error_message), '') IS NULL OR
    char_length(p_error_message) > 500 THEN
    RAISE EXCEPTION 'Invalid EasyPost purchase reconciliation';
  END IF;

  SELECT *
  INTO v_label
  FROM public.shipping_labels
  WHERE id = p_label_id
    AND provider = 'easypost'
  FOR UPDATE;

  IF NOT FOUND OR
    v_label.state <> 'purchasing' OR
    v_label.purchase_lease_token IS DISTINCT FROM p_claim_token THEN
    IF FOUND AND
      v_label.state = 'purchase_reconciliation' AND
      v_label.purchase_lease_token = p_claim_token THEN
      RETURN v_label;
    END IF;
    RAISE EXCEPTION 'EasyPost purchase claim ownership was lost';
  END IF;

  -- Do not return to rated after an ambiguous provider call. The stable
  -- shipment/rate/idempotency identifiers must be reconciled before retrying.
  UPDATE public.shipping_labels
  SET
    state = 'purchase_reconciliation',
    recovery_state = 'purchase_reconciliation_required',
    purchase_lease_expires_at = NULL,
    purchase_reconciled_at = NULL,
    last_error_code = p_error_code,
    last_error_message = p_error_message
  WHERE id = v_label.id
  RETURNING * INTO v_label;

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
    'easypost_purchase_reconciliation_required',
    'system',
    jsonb_build_object('errorCode', p_error_code)
  );

  RETURN v_label;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_easypost_production_job(
  p_production_job_id UUID,
  p_next_status TEXT,
  p_operator_email TEXT,
  p_operator_notes TEXT,
  p_update_operator_notes BOOLEAN
)
RETURNS public.production_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.production_jobs%ROWTYPE;
  v_label public.shipping_labels%ROWTYPE;
  v_previous_status TEXT;
  v_fulfillment_status TEXT;
BEGIN
  IF p_production_job_id IS NULL OR
    p_next_status NOT IN ('printed', 'packed', 'shipped') OR
    NULLIF(BTRIM(p_operator_email), '') IS NULL OR
    char_length(p_operator_email) > 320 OR
    LOWER(BTRIM(p_operator_email)) !~
      '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR
    p_update_operator_notes IS NULL OR
    p_update_operator_notes AND
      p_operator_notes IS NOT NULL AND
      char_length(p_operator_notes) > 2000 THEN
    RAISE EXCEPTION 'Invalid EasyPost production transition';
  END IF;

  -- Label updates already project tracking to the job from a database trigger.
  -- Keep that established label-then-job lock order everywhere.
  SELECT *
  INTO v_label
  FROM public.shipping_labels
  WHERE production_job_id = p_production_job_id
    AND provider = 'easypost'
    AND state IN (
      'rated',
      'purchasing',
      'purchase_reconciliation',
      'purchased',
      'refund_pending'
    )
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EasyPost shipping state does not permit transition';
  END IF;

  SELECT *
  INTO v_job
  FROM public.production_jobs
  WHERE id = p_production_job_id
  FOR UPDATE;

  IF NOT FOUND OR
    v_job.provider <> 'onshore_manual' OR
    v_job.status = 'failed' THEN
    RAISE EXCEPTION 'EasyPost production job is not transitionable';
  END IF;

  IF
    p_next_status = 'printed' AND
      v_job.status NOT IN ('queued', 'artwork_ready', 'printed') OR
    p_next_status = 'packed' AND
      v_job.status NOT IN ('printed', 'packed') OR
    p_next_status = 'shipped' AND
      v_job.status NOT IN ('packed', 'shipped') THEN
    RAISE EXCEPTION 'Invalid EasyPost production status transition';
  END IF;

  IF
    p_next_status = 'printed' AND
      v_label.state NOT IN (
        'rated',
        'purchasing',
        'purchase_reconciliation',
        'purchased'
      ) OR
    p_next_status IN ('packed', 'shipped') AND (
      v_label.state <> 'purchased' OR
      NULLIF(BTRIM(v_label.tracking_number), '') IS NULL
    ) THEN
    RAISE EXCEPTION 'EasyPost shipping state does not permit transition';
  END IF;

  v_previous_status := v_job.status;
  v_fulfillment_status := CASE
    WHEN p_next_status = 'shipped' THEN 'shipped'
    ELSE 'onshore_manual_' || p_next_status
  END;

  UPDATE public.production_jobs
  SET
    status = p_next_status,
    operator_email = LOWER(BTRIM(p_operator_email)),
    operator_notes = CASE
      WHEN p_update_operator_notes THEN p_operator_notes
      ELSE operator_notes
    END,
    fulfillment_status = v_fulfillment_status,
    tracking_carrier = COALESCE(v_label.carrier, tracking_carrier),
    tracking_number = COALESCE(v_label.tracking_number, tracking_number),
    tracking_url = COALESCE(v_label.tracking_url, tracking_url),
    started_at = COALESCE(started_at, now()),
    shipped_at = CASE
      WHEN p_next_status = 'shipped' THEN COALESCE(shipped_at, now())
      ELSE shipped_at
    END
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  UPDATE public.orders
  SET
    fulfillment_provider = 'onshore_manual',
    fulfillment_order_id = v_job.id::text,
    fulfillment_status = v_fulfillment_status,
    fulfillment_last_error = NULL,
    printful_status = v_fulfillment_status,
    printful_last_error = NULL,
    status = CASE
      WHEN p_next_status = 'shipped' THEN 'shipped'
      ELSE 'processing'
    END,
    tracking_carrier = COALESCE(v_label.carrier, tracking_carrier),
    tracking_number = COALESCE(v_label.tracking_number, tracking_number),
    tracking_url = COALESCE(v_label.tracking_url, tracking_url),
    shipped_at = CASE
      WHEN p_next_status = 'shipped' THEN COALESCE(shipped_at, now())
      ELSE shipped_at
    END
  WHERE id = v_job.order_id;

  IF v_previous_status IS DISTINCT FROM p_next_status THEN
    INSERT INTO public.shipping_label_audit_events (
      shipping_label_id,
      production_job_id,
      action,
      actor_email,
      source,
      safe_details
    )
    VALUES (
      v_label.id,
      v_job.id,
      'easypost_job_transition_authorized',
      LOWER(BTRIM(p_operator_email)),
      'operator',
      jsonb_build_object(
        'previousStatus',
        v_previous_status,
        'nextStatus',
        p_next_status
      )
    );
  END IF;

  RETURN v_job;
END;
$$;

DROP FUNCTION IF EXISTS public.claim_easypost_label_refund(
  UUID,
  UUID,
  INTEGER
);
CREATE OR REPLACE FUNCTION public.claim_easypost_label_refund(
  p_label_id UUID,
  p_operator_email TEXT,
  p_claim_token UUID,
  p_lease_seconds INTEGER
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
  IF p_claim_token IS NULL OR
    NULLIF(BTRIM(p_operator_email), '') IS NULL OR
    char_length(p_operator_email) > 320 OR
    LOWER(BTRIM(p_operator_email)) !~
      '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR
    p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'Invalid EasyPost refund claim';
  END IF;

  SELECT *
  INTO v_label
  FROM public.shipping_labels
  WHERE id = p_label_id
    AND provider = 'easypost'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EasyPost shipping label is not refundable';
  END IF;

  SELECT status
  INTO v_job_status
  FROM public.production_jobs
  WHERE id = v_label.production_job_id
  FOR UPDATE;

  IF NOT FOUND OR v_job_status IN ('packed', 'shipped') THEN
    RAISE EXCEPTION 'EasyPost shipping label is not refundable';
  END IF;

  IF v_label.purchased_at IS NULL OR
    v_label.print_accessed_at IS NOT NULL THEN
    RAISE EXCEPTION 'EasyPost shipping label is not refundable';
  END IF;

  IF v_label.refund_status = 'refunded' OR
    v_label.state = 'refunded' THEN
    RETURN v_label;
  END IF;

  IF v_label.refund_status = 'rejected' THEN
    RAISE EXCEPTION 'Rejected EasyPost refund requires operator review';
  END IF;

  IF v_label.state = 'refund_pending' AND
    v_label.refund_lease_token = p_claim_token AND
    v_label.refund_status = 'processing' THEN
    RETURN v_label;
  END IF;

  -- Submitted refunds and stale/failed claims are reclaimed for provider
  -- reconciliation. Callers must inspect refund_status/recovery_state and must
  -- not submit a second refund blindly.
  IF v_label.state = 'refund_pending' AND
    v_label.refund_lease_expires_at IS NOT NULL AND
    v_label.refund_lease_expires_at > now() THEN
    RAISE EXCEPTION 'EasyPost refund is already actively claimed';
  END IF;

  IF v_label.state NOT IN ('purchased', 'refund_pending') THEN
    RAISE EXCEPTION 'EasyPost shipping label is not refundable';
  END IF;

  UPDATE public.shipping_labels
  SET
    state = 'refund_pending',
    refund_status = 'processing',
    refund_lease_token = p_claim_token,
    refund_lease_expires_at =
      now() + make_interval(secs => p_lease_seconds),
    refund_attempt_count = refund_attempt_count + 1,
    refund_requested_at = COALESCE(refund_requested_at, now()),
    last_error_code = NULL,
    last_error_message = NULL
  WHERE id = v_label.id
  RETURNING * INTO v_label;

  INSERT INTO public.shipping_label_audit_events (
    shipping_label_id,
    production_job_id,
    action,
    actor_email,
    source,
    safe_details
  )
  VALUES (
    v_label.id,
    v_label.production_job_id,
    'easypost_refund_claimed',
    LOWER(BTRIM(p_operator_email)),
    'operator',
    jsonb_build_object(
      'attemptCount',
      v_label.refund_attempt_count,
      'isRecovery',
      v_label.recovery_state = 'refund_reconciliation_required'
    )
  );

  RETURN v_label;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_easypost_label_refund(
  p_label_id UUID,
  p_claim_token UUID,
  p_refund_status TEXT,
  p_error_code TEXT,
  p_error_message TEXT
)
RETURNS public.shipping_labels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_label public.shipping_labels%ROWTYPE;
BEGIN
  IF p_claim_token IS NULL OR
    p_refund_status NOT IN (
      'submitted',
      'refunded',
      'rejected',
      'unknown'
    ) OR
    p_error_code IS NOT NULL AND char_length(p_error_code) > 120 OR
    p_error_message IS NOT NULL AND char_length(p_error_message) > 500 OR
    p_refund_status = 'rejected' AND (
      NULLIF(BTRIM(p_error_code), '') IS NULL OR
      NULLIF(BTRIM(p_error_message), '') IS NULL
    ) THEN
    RAISE EXCEPTION 'Invalid EasyPost refund result';
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

  IF v_label.refund_lease_token = p_claim_token AND
    v_label.refund_status = p_refund_status AND
    (
      p_refund_status <> 'refunded' OR
      v_label.state = 'refunded'
    ) AND
    (
      p_refund_status <> 'rejected' OR
      v_label.state = 'purchased'
    ) THEN
    RETURN v_label;
  END IF;

  IF v_label.state <> 'refund_pending' OR
    v_label.refund_status <> 'processing' OR
    v_label.refund_lease_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'EasyPost refund claim ownership was lost';
  END IF;

  UPDATE public.shipping_labels
  SET
    state = CASE
      WHEN p_refund_status = 'refunded' THEN 'refunded'
      WHEN p_refund_status = 'rejected' THEN 'purchased'
      ELSE 'refund_pending'
    END,
    refund_status = p_refund_status,
    refund_lease_expires_at = NULL,
    refunded_at = CASE
      WHEN p_refund_status = 'refunded' THEN COALESCE(refunded_at, now())
      ELSE refunded_at
    END,
    recovery_state = CASE
      WHEN p_refund_status IN ('submitted', 'unknown')
        THEN 'refund_reconciliation_required'
      WHEN p_refund_status = 'rejected'
        THEN 'operator_review_required'
      ELSE 'none'
    END,
    last_error_code = CASE
      WHEN p_refund_status IN ('rejected', 'unknown') THEN p_error_code
      ELSE NULL
    END,
    last_error_message = CASE
      WHEN p_refund_status IN ('rejected', 'unknown') THEN p_error_message
      ELSE NULL
    END
  WHERE id = v_label.id
  RETURNING * INTO v_label;

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
    CASE p_refund_status
      WHEN 'submitted' THEN 'easypost_refund_submitted'
      WHEN 'refunded' THEN 'easypost_label_refunded'
      WHEN 'rejected' THEN 'easypost_refund_rejected'
      ELSE 'easypost_refund_reconciliation_required'
    END,
    'provider',
    jsonb_strip_nulls(jsonb_build_object(
      'refundStatus', p_refund_status,
      'errorCode', p_error_code
    ))
  );

  RETURN v_label;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_shipping_webhook_event(
  p_provider TEXT,
  p_event_id TEXT,
  p_event_type TEXT,
  p_payload_sha256 TEXT,
  p_safe_payload JSONB,
  p_claim_token UUID,
  p_lease_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.shipping_webhook_events%ROWTYPE;
BEGIN
  IF p_provider <> 'easypost' OR
    NULLIF(BTRIM(p_event_id), '') IS NULL OR
    char_length(p_event_id) > 200 OR
    p_event_type IS NOT NULL AND char_length(p_event_type) > 200 OR
    p_payload_sha256 IS NULL OR
    p_payload_sha256 !~ '^[a-f0-9]{64}$' OR
    p_claim_token IS NULL OR
    p_lease_seconds < 30 OR p_lease_seconds > 900 OR
    p_safe_payload IS NULL OR
    jsonb_typeof(p_safe_payload) <> 'object' OR
    (
      p_safe_payload - ARRAY[
        'eventId',
        'eventType',
        'trackerId',
        'shipmentId',
        'carrier',
        'trackingCode',
        'trackerStatus',
        'trackingUrl',
        'shipmentStatus'
      ]
    ) <> '{}'::jsonb OR
    NOT COALESCE(
      jsonb_typeof(p_safe_payload -> 'eventId') IN ('string', 'null'),
      true
    ) OR
    NOT COALESCE(
      jsonb_typeof(p_safe_payload -> 'eventType') IN ('string', 'null'),
      true
    ) OR
    NOT COALESCE(
      jsonb_typeof(p_safe_payload -> 'trackerId') IN ('string', 'null'),
      true
    ) OR
    NOT COALESCE(
      jsonb_typeof(p_safe_payload -> 'shipmentId') IN ('string', 'null'),
      true
    ) OR
    NOT COALESCE(
      jsonb_typeof(p_safe_payload -> 'carrier') IN ('string', 'null'),
      true
    ) OR
    NOT COALESCE(
      jsonb_typeof(p_safe_payload -> 'trackingCode') IN ('string', 'null'),
      true
    ) OR
    NOT COALESCE(
      jsonb_typeof(p_safe_payload -> 'trackerStatus') IN ('string', 'null'),
      true
    ) OR
    NOT COALESCE(
      jsonb_typeof(p_safe_payload -> 'trackingUrl') IN ('string', 'null'),
      true
    ) OR
    NOT COALESCE(
      jsonb_typeof(p_safe_payload -> 'shipmentStatus') IN ('string', 'null'),
      true
    ) OR
    char_length(COALESCE(p_safe_payload ->> 'eventId', '')) > 200 OR
    char_length(COALESCE(p_safe_payload ->> 'eventType', '')) > 200 OR
    char_length(COALESCE(p_safe_payload ->> 'trackerId', '')) > 200 OR
    char_length(COALESCE(p_safe_payload ->> 'shipmentId', '')) > 200 OR
    char_length(COALESCE(p_safe_payload ->> 'carrier', '')) > 120 OR
    char_length(COALESCE(p_safe_payload ->> 'trackingCode', '')) > 120 OR
    char_length(COALESCE(p_safe_payload ->> 'trackerStatus', '')) > 120 OR
    char_length(COALESCE(p_safe_payload ->> 'trackingUrl', '')) > 1000 OR
    char_length(COALESCE(p_safe_payload ->> 'shipmentStatus', '')) > 120 OR
    p_safe_payload ? 'eventId' AND
      p_safe_payload ->> 'eventId' <> p_event_id THEN
    RAISE EXCEPTION 'Invalid safe shipping webhook event';
  END IF;

  INSERT INTO public.shipping_webhook_events (
    provider,
    event_id,
    event_type,
    payload_sha256,
    safe_payload
  )
  VALUES (
    p_provider,
    p_event_id,
    p_event_type,
    p_payload_sha256,
    p_safe_payload
  )
  ON CONFLICT (provider, event_id) DO NOTHING;

  SELECT *
  INTO v_event
  FROM public.shipping_webhook_events
  WHERE provider = p_provider
    AND event_id = p_event_id
  FOR UPDATE;

  IF v_event.payload_sha256 IS DISTINCT FROM p_payload_sha256 THEN
    RAISE EXCEPTION 'Webhook event payload digest conflict';
  END IF;

  IF v_event.status = 'processed' THEN
    RETURN jsonb_build_object(
      'claimResult', 'completed_duplicate',
      'event', to_jsonb(v_event) - ARRAY[
        'lease_token',
        'payload_sha256',
        'last_error_message'
      ]
    );
  END IF;

  IF v_event.status = 'processing' AND
    v_event.lease_token = p_claim_token THEN
    RETURN jsonb_build_object(
      'claimResult', 'claimed',
      'leaseToken', p_claim_token,
      'event', to_jsonb(v_event) - ARRAY[
        'lease_token',
        'payload_sha256',
        'last_error_message'
      ]
    );
  END IF;

  IF v_event.status = 'processing' AND
    v_event.lease_expires_at IS NOT NULL AND
    v_event.lease_expires_at > now() THEN
    RETURN jsonb_build_object(
      'claimResult', 'active_duplicate',
      'event', to_jsonb(v_event) - ARRAY[
        'lease_token',
        'payload_sha256',
        'last_error_message'
      ]
    );
  END IF;

  -- Failed events and expired processing leases are recoverable. A completed
  -- event is never reclaimed, which makes provider retries duplicate-safe.
  UPDATE public.shipping_webhook_events
  SET
    status = 'processing',
    event_type = COALESCE(event_type, p_event_type),
    safe_payload = p_safe_payload,
    lease_token = p_claim_token,
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    attempt_count = attempt_count + 1,
    last_error_code = NULL,
    last_error_message = NULL
  WHERE id = v_event.id
  RETURNING * INTO v_event;

  RETURN jsonb_build_object(
    'claimResult', 'claimed',
    'leaseToken', p_claim_token,
    'event', to_jsonb(v_event) - ARRAY[
      'lease_token',
      'payload_sha256',
      'last_error_message'
    ]
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_shipping_webhook_event(
  p_event_record_id UUID,
  p_claim_token UUID
)
RETURNS public.shipping_webhook_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.shipping_webhook_events%ROWTYPE;
BEGIN
  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION 'Invalid shipping webhook completion';
  END IF;

  SELECT *
  INTO v_event
  FROM public.shipping_webhook_events
  WHERE id = p_event_record_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipping webhook event not found';
  END IF;

  IF v_event.status = 'processed' AND
    v_event.lease_token = p_claim_token THEN
    RETURN v_event;
  END IF;

  IF v_event.status <> 'processing' OR
    v_event.lease_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'Shipping webhook lease ownership was lost';
  END IF;

  UPDATE public.shipping_webhook_events
  SET
    status = 'processed',
    processed_at = COALESCE(processed_at, now()),
    lease_expires_at = NULL,
    last_error_code = NULL,
    last_error_message = NULL
  WHERE id = v_event.id
  RETURNING * INTO v_event;

  RETURN v_event;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_shipping_webhook_event(
  p_event_record_id UUID,
  p_claim_token UUID,
  p_error_code TEXT,
  p_error_message TEXT
)
RETURNS public.shipping_webhook_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.shipping_webhook_events%ROWTYPE;
BEGIN
  IF p_claim_token IS NULL OR
    NULLIF(BTRIM(p_error_code), '') IS NULL OR
    char_length(p_error_code) > 120 OR
    NULLIF(BTRIM(p_error_message), '') IS NULL OR
    char_length(p_error_message) > 500 THEN
    RAISE EXCEPTION 'Invalid shipping webhook failure';
  END IF;

  SELECT *
  INTO v_event
  FROM public.shipping_webhook_events
  WHERE id = p_event_record_id
  FOR UPDATE;

  IF NOT FOUND OR
    v_event.status <> 'processing' OR
    v_event.lease_token IS DISTINCT FROM p_claim_token THEN
    IF FOUND AND
      v_event.status = 'failed' AND
      v_event.lease_token = p_claim_token AND
      v_event.last_error_code = p_error_code AND
      v_event.last_error_message = p_error_message THEN
      RETURN v_event;
    END IF;
    RAISE EXCEPTION 'Shipping webhook lease ownership was lost';
  END IF;

  UPDATE public.shipping_webhook_events
  SET
    status = 'failed',
    lease_expires_at = NULL,
    last_error_code = p_error_code,
    last_error_message = p_error_message
  WHERE id = v_event.id
  RETURNING * INTO v_event;

  RETURN v_event;
END;
$$;

COMMENT ON COLUMN public.shipping_labels.purchase_idempotency_key IS
  'Stable per-label key. Recovery workers must reconcile the persisted EasyPost shipment before retrying an ambiguous purchase.';
COMMENT ON COLUMN public.shipping_labels.recovery_state IS
  'Fail-closed recovery instruction; reconciliation states must not automatically create a second label or repeat a provider mutation.';
COMMENT ON COLUMN public.shipping_labels.state IS
  'shipping_review blocks purchase pending operator/config correction; purchase_reconciliation blocks purchase until provider retrieval is recorded.';
COMMENT ON COLUMN public.shipping_webhook_events.safe_payload IS
  'Minimal allowlisted provider identifiers/statuses only; never store addresses, contacts, or a raw webhook payload.';
COMMENT ON COLUMN public.shipping_webhook_events.lease_token IS
  'Caller-owned processing token. Failed or expired leases may be reclaimed; completed events are permanent duplicates.';

ALTER TABLE public.shipping_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_label_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.shipping_labels FROM anon, authenticated;
REVOKE ALL ON public.shipping_webhook_events FROM anon, authenticated;
REVOKE ALL ON public.shipping_label_audit_events FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.prepare_easypost_shipping_label(
  UUID,
  TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_easypost_shipping_rate(
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
  JSONB
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_easypost_shipping_preparation(
  UUID,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_easypost_label_purchase(
  UUID,
  UUID,
  INTEGER,
  TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_easypost_label_purchase(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_easypost_purchase_reconciliation(
  UUID,
  UUID,
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_easypost_production_job(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_easypost_label_refund(
  UUID,
  TEXT,
  UUID,
  INTEGER
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_easypost_label_refund(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_shipping_webhook_event(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  UUID,
  INTEGER
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_shipping_webhook_event(
  UUID,
  UUID
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_shipping_webhook_event(
  UUID,
  UUID,
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.prepare_easypost_shipping_label(
  UUID,
  TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_easypost_shipping_rate(
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
  JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_easypost_shipping_preparation(
  UUID,
  TEXT,
  TEXT,
  TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_easypost_label_purchase(
  UUID,
  UUID,
  INTEGER,
  TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_easypost_label_purchase(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_easypost_purchase_reconciliation(
  UUID,
  UUID,
  TEXT,
  TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_easypost_production_job(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_easypost_label_refund(
  UUID,
  TEXT,
  UUID,
  INTEGER
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_easypost_label_refund(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_shipping_webhook_event(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  UUID,
  INTEGER
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_shipping_webhook_event(
  UUID,
  UUID
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_shipping_webhook_event(
  UUID,
  UUID,
  TEXT,
  TEXT
) TO service_role;
