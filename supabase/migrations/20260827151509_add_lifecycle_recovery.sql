-- Private saved-design and cart recovery foundation.
-- Creates no schedule, provider call, live send, discount, or financial commitment.

ALTER TABLE public.designs
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recovery_invalidated_at TIMESTAMPTZ;

ALTER TABLE public.designs
  DROP CONSTRAINT IF EXISTS designs_revision_positive;
ALTER TABLE public.designs
  ADD CONSTRAINT designs_revision_positive CHECK (revision > 0);

CREATE TABLE public.lifecycle_recovery_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID NOT NULL REFERENCES public.lifecycle_marketing_subscribers(id),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  design_record_id UUID REFERENCES public.designs(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  flow TEXT NOT NULL,
  design_revision INTEGER,
  variant_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  edm_template_id INTEGER,
  external_product_id TEXT,
  cart_snapshot JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  eligible_after TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  terminal_reason TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lifecycle_recovery_flow_check CHECK (
    flow IN ('abandoned_design', 'abandoned_cart')
  ),
  CONSTRAINT lifecycle_recovery_status_check CHECK (
    status IN (
      'pending', 'eligible', 'resumed', 'purchased', 'suppressed',
      'expired', 'deleted', 'invalidated'
    )
  ),
  CONSTRAINT lifecycle_recovery_shape_check CHECK (
    (flow = 'abandoned_design' AND design_record_id IS NOT NULL AND order_id IS NULL AND design_revision IS NOT NULL AND cart_snapshot IS NULL)
    OR
    (flow = 'abandoned_cart' AND order_id IS NOT NULL AND cart_snapshot IS NOT NULL)
  ),
  CONSTRAINT lifecycle_recovery_quantity_check CHECK (quantity BETWEEN 1 AND 100),
  CONSTRAINT lifecycle_recovery_expiry_check CHECK (expires_at > eligible_after),
  CONSTRAINT lifecycle_recovery_snapshot_check CHECK (
    cart_snapshot IS NULL OR jsonb_typeof(cart_snapshot) = 'array'
  )
);

CREATE TABLE public.lifecycle_recovery_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID NOT NULL REFERENCES public.lifecycle_recovery_intents(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT lifecycle_recovery_token_digest CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT lifecycle_recovery_token_status CHECK (status IN ('active', 'consumed', 'revoked')),
  CONSTRAINT lifecycle_recovery_token_expiry CHECK (expires_at > issued_at),
  CONSTRAINT lifecycle_recovery_token_terminal_shape CHECK (
    (status = 'active' AND consumed_at IS NULL AND revoked_at IS NULL)
    OR (status = 'consumed' AND consumed_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE TABLE public.lifecycle_recovery_exclusions (
  subscriber_id UUID PRIMARY KEY REFERENCES public.lifecycle_marketing_subscribers(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lifecycle_recovery_exclusion_reason CHECK (
    reason IN ('employee', 'qa', 'test_fixture', 'policy')
  )
);

CREATE INDEX lifecycle_recovery_ready_idx
  ON public.lifecycle_recovery_intents (status, eligible_after, expires_at);
CREATE INDEX lifecycle_recovery_subscriber_idx
  ON public.lifecycle_recovery_intents (subscriber_id, created_at DESC);
CREATE INDEX lifecycle_recovery_design_idx
  ON public.lifecycle_recovery_intents (design_record_id, design_revision);
CREATE INDEX lifecycle_recovery_order_idx
  ON public.lifecycle_recovery_intents (order_id);
CREATE INDEX lifecycle_recovery_token_intent_idx
  ON public.lifecycle_recovery_tokens (intent_id, issued_at DESC);

ALTER TABLE public.lifecycle_recovery_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_recovery_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_recovery_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lifecycle_recovery_intents FROM anon, authenticated;
REVOKE ALL ON TABLE public.lifecycle_recovery_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.lifecycle_recovery_exclusions FROM anon, authenticated;

ALTER TABLE public.lifecycle_marketing_outbox
  ADD COLUMN IF NOT EXISTS recovery_intent_id UUID
    REFERENCES public.lifecycle_recovery_intents(id) ON DELETE SET NULL;
ALTER TABLE public.lifecycle_marketing_outbox
  DROP CONSTRAINT IF EXISTS lifecycle_outbox_operation;
ALTER TABLE public.lifecycle_marketing_outbox
  ADD CONSTRAINT lifecycle_outbox_operation CHECK (
    operation IN ('subscribe', 'suppress', 'welcome', 'abandoned_design', 'abandoned_cart')
  );
CREATE UNIQUE INDEX lifecycle_outbox_recovery_once_idx
  ON public.lifecycle_marketing_outbox (recovery_intent_id, operation)
  WHERE recovery_intent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.lifecycle_recovery_variant_supported(p_variant_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT p_variant_id = ANY (ARRAY[
    'iphone-17-pro-max', 'iphone-17-pro', 'iphone-17-air', 'iphone-17',
    'iphone-16-pro-max', 'iphone-16-pro', 'iphone-16-plus', 'iphone-16',
    'iphone-15-pro-max', 'iphone-15-pro', 'iphone-15-plus', 'iphone-15',
    'iphone-14-pro-max', 'iphone-14-pro', 'iphone-14',
    'galaxy-s24-ultra', 'galaxy-s24-plus', 'galaxy-s24'
  ]);
$$;

CREATE OR REPLACE FUNCTION public.cancel_lifecycle_recovery_intent(
  p_intent_id UUID,
  p_status TEXT,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('purchased', 'suppressed', 'expired', 'deleted', 'invalidated')
    OR p_reason !~ '^[a-z0-9_]{1,64}$'
  THEN
    RAISE EXCEPTION 'invalid_recovery_cancellation';
  END IF;

  UPDATE public.lifecycle_recovery_intents
  SET status = p_status, terminal_reason = p_reason, updated_at = now()
  WHERE id = p_intent_id AND status IN ('pending', 'eligible');

  UPDATE public.lifecycle_recovery_tokens
  SET status = 'revoked', revoked_at = coalesce(revoked_at, now())
  WHERE intent_id = p_intent_id AND status = 'active';

  UPDATE public.lifecycle_marketing_outbox
  SET status = 'suppressed', last_error_code = p_reason,
    completed_at = coalesce(completed_at, now()), updated_at = now()
  WHERE recovery_intent_id = p_intent_id
    AND status IN ('pending', 'failed', 'sending');
END;
$$;

CREATE OR REPLACE FUNCTION public.register_saved_design_recovery(
  p_user_id UUID,
  p_email TEXT,
  p_design_record_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email TEXT := lower(btrim(coalesce(p_email, '')));
  v_subscriber public.lifecycle_marketing_subscribers%ROWTYPE;
  v_design public.designs%ROWTYPE;
  v_intent_id UUID;
  v_key TEXT;
BEGIN
  SELECT * INTO v_subscriber
  FROM public.lifecycle_marketing_subscribers
  WHERE email_normalized = v_email
    AND status = 'subscribed'
    AND email_normalized !~ '@(snapcase\.ai|example\.invalid)$'
    AND NOT EXISTS (
      SELECT 1 FROM public.lifecycle_recovery_exclusions e
      WHERE e.subscriber_id = lifecycle_marketing_subscribers.id
    );
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_design
  FROM public.designs
  WHERE id = p_design_record_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public.lifecycle_recovery_variant_supported(v_design.variant_id)
    OR v_design.edm_template_id IS NULL OR v_design.recovery_invalidated_at IS NOT NULL
  THEN
    RETURN NULL;
  END IF;

  FOR v_intent_id IN
    SELECT id FROM public.lifecycle_recovery_intents
    WHERE design_record_id = v_design.id
      AND design_revision <> v_design.revision
      AND status IN ('pending', 'eligible')
    FOR UPDATE
  LOOP
    PERFORM public.cancel_lifecycle_recovery_intent(v_intent_id, 'invalidated', 'superseded_revision');
  END LOOP;

  v_key := 'abandoned_design:' || v_design.id::text || ':r' || v_design.revision::text;
  INSERT INTO public.lifecycle_recovery_intents (
    subscriber_id, user_id, design_record_id, flow, design_revision,
    variant_id, quantity, edm_template_id, external_product_id,
    eligible_after, expires_at, idempotency_key
  ) VALUES (
    v_subscriber.id, p_user_id, v_design.id, 'abandoned_design', v_design.revision,
    v_design.variant_id, 1, v_design.edm_template_id, v_design.external_product_id,
    now() + interval '24 hours', now() + interval '8 days', v_key
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_intent_id;

  INSERT INTO public.lifecycle_marketing_outbox (
    subscriber_id, operation, idempotency_key, recovery_intent_id, next_attempt_at
  ) VALUES (
    v_subscriber.id, 'abandoned_design', 'recovery:' || v_key,
    v_intent_id, now() + interval '24 hours'
  ) ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN v_intent_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_abandoned_cart_recovery(
  p_order_id UUID,
  p_email TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email TEXT := lower(btrim(coalesce(p_email, '')));
  v_subscriber public.lifecycle_marketing_subscribers%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_first JSONB;
  v_intent_id UUID;
  v_key TEXT;
BEGIN
  SELECT * INTO v_subscriber
  FROM public.lifecycle_marketing_subscribers
  WHERE email_normalized = v_email
    AND status = 'subscribed'
    AND email_normalized !~ '@(snapcase\.ai|example\.invalid)$'
    AND NOT EXISTS (
      SELECT 1 FROM public.lifecycle_recovery_exclusions e
      WHERE e.subscriber_id = lifecycle_marketing_subscribers.id
    );
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_order FROM public.orders
  WHERE id = p_order_id AND lower(btrim(customer_email)) = v_email
  FOR UPDATE;
  IF NOT FOUND OR lower(coalesce(v_order.status, '')) <> 'pending'
    OR jsonb_typeof(v_order.items) <> 'array' OR jsonb_array_length(v_order.items) = 0
  THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_order.items) item
    WHERE NOT public.lifecycle_recovery_variant_supported(item->>'variantId')
      OR coalesce((item->>'quantity')::INTEGER, 0) NOT BETWEEN 1 AND 100
      OR coalesce((item->>'edmTemplateId')::INTEGER, 0) <= 0
  ) THEN
    RETURN NULL;
  END IF;

  v_first := v_order.items->0;
  v_key := 'abandoned_cart:' || v_order.id::text;
  INSERT INTO public.lifecycle_recovery_intents (
    subscriber_id, user_id, order_id, flow, variant_id, quantity,
    edm_template_id, external_product_id, cart_snapshot,
    eligible_after, expires_at, idempotency_key
  ) VALUES (
    v_subscriber.id, v_order.user_id, v_order.id, 'abandoned_cart',
    v_first->>'variantId', (v_first->>'quantity')::INTEGER,
    (v_first->>'edmTemplateId')::INTEGER, v_first->>'externalProductId',
    v_order.items, now() + interval '4 hours', now() + interval '7 days', v_key
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_intent_id;

  INSERT INTO public.lifecycle_marketing_outbox (
    subscriber_id, operation, idempotency_key, recovery_intent_id, next_attempt_at
  ) VALUES (
    v_subscriber.id, 'abandoned_cart', 'recovery:' || v_key,
    v_intent_id, now() + interval '4 hours'
  ) ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN v_intent_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_lifecycle_recovery_token(p_intent_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_intent public.lifecycle_recovery_intents%ROWTYPE;
  v_subscriber_status TEXT;
  v_token TEXT := encode(gen_random_bytes(32), 'hex');
BEGIN
  SELECT * INTO v_intent FROM public.lifecycle_recovery_intents
  WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recovery_intent_not_found'; END IF;

  SELECT status INTO v_subscriber_status
  FROM public.lifecycle_marketing_subscribers WHERE id = v_intent.subscriber_id;
  IF v_subscriber_status <> 'subscribed' THEN
    PERFORM public.cancel_lifecycle_recovery_intent(v_intent.id, 'suppressed', 'subscriber_not_eligible');
    RAISE EXCEPTION 'recovery_not_eligible';
  END IF;
  IF v_intent.status NOT IN ('pending', 'eligible') OR v_intent.eligible_after > now() THEN
    RAISE EXCEPTION 'recovery_not_eligible';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.lifecycle_marketing_outbox
    WHERE recovery_intent_id = v_intent.id AND status = 'uncertain'
  ) THEN
    RAISE EXCEPTION 'recovery_provider_state_uncertain';
  END IF;
  IF v_intent.expires_at <= now() THEN
    PERFORM public.cancel_lifecycle_recovery_intent(v_intent.id, 'expired', 'intent_expired');
    RAISE EXCEPTION 'recovery_expired';
  END IF;

  UPDATE public.lifecycle_recovery_tokens
  SET status = 'revoked', revoked_at = now()
  WHERE intent_id = v_intent.id AND status = 'active';
  UPDATE public.lifecycle_recovery_intents
  SET status = 'eligible', updated_at = now() WHERE id = v_intent.id;
  INSERT INTO public.lifecycle_recovery_tokens (intent_id, token_digest, expires_at)
  VALUES (v_intent.id, encode(digest(v_token, 'sha256'), 'hex'), v_intent.expires_at);
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_lifecycle_recovery_state(
  p_token TEXT,
  p_consume BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token public.lifecycle_recovery_tokens%ROWTYPE;
  v_intent public.lifecycle_recovery_intents%ROWTYPE;
  v_subscriber_status TEXT;
  v_design public.designs%ROWTYPE;
  v_order_status TEXT;
BEGIN
  IF coalesce(p_token, '') !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status', 'invalid', 'contractVersion', '1.0.0');
  END IF;
  SELECT * INTO v_token FROM public.lifecycle_recovery_tokens
  WHERE token_digest = encode(digest(p_token, 'sha256'), 'hex') FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid', 'contractVersion', '1.0.0'); END IF;
  IF v_token.status = 'consumed' THEN RETURN jsonb_build_object('status', 'already_used', 'contractVersion', '1.0.0'); END IF;
  IF v_token.status = 'revoked' THEN RETURN jsonb_build_object('status', 'revoked', 'contractVersion', '1.0.0'); END IF;
  IF v_token.expires_at <= now() THEN
    UPDATE public.lifecycle_recovery_tokens SET status = 'revoked', revoked_at = now() WHERE id = v_token.id;
    RETURN jsonb_build_object('status', 'expired', 'contractVersion', '1.0.0');
  END IF;

  SELECT * INTO v_intent FROM public.lifecycle_recovery_intents
  WHERE id = v_token.intent_id FOR UPDATE;
  SELECT status INTO v_subscriber_status FROM public.lifecycle_marketing_subscribers
  WHERE id = v_intent.subscriber_id;
  IF v_subscriber_status <> 'subscribed' OR v_intent.status = 'suppressed' THEN
    PERFORM public.cancel_lifecycle_recovery_intent(v_intent.id, 'suppressed', 'subscriber_not_eligible');
    RETURN jsonb_build_object('status', 'revoked', 'contractVersion', '1.0.0');
  END IF;
  IF v_intent.expires_at <= now() OR v_intent.status = 'expired' THEN
    PERFORM public.cancel_lifecycle_recovery_intent(v_intent.id, 'expired', 'intent_expired');
    RETURN jsonb_build_object('status', 'expired', 'contractVersion', '1.0.0');
  END IF;
  IF v_intent.status = 'purchased' THEN RETURN jsonb_build_object('status', 'already_purchased', 'contractVersion', '1.0.0'); END IF;
  IF v_intent.status = 'deleted' THEN RETURN jsonb_build_object('status', 'deleted', 'contractVersion', '1.0.0'); END IF;
  IF v_intent.status IN ('invalidated', 'resumed') THEN RETURN jsonb_build_object('status', 'revoked', 'contractVersion', '1.0.0'); END IF;

  IF v_intent.flow = 'abandoned_design' THEN
    SELECT * INTO v_design FROM public.designs WHERE id = v_intent.design_record_id;
    IF NOT FOUND THEN
      PERFORM public.cancel_lifecycle_recovery_intent(v_intent.id, 'deleted', 'design_deleted');
      RETURN jsonb_build_object('status', 'deleted', 'contractVersion', '1.0.0');
    END IF;
    IF v_design.revision <> v_intent.design_revision THEN
      PERFORM public.cancel_lifecycle_recovery_intent(v_intent.id, 'invalidated', 'superseded_revision');
      RETURN jsonb_build_object('status', 'stale_revision', 'contractVersion', '1.0.0');
    END IF;
  ELSE
    SELECT lower(coalesce(status, '')) INTO v_order_status FROM public.orders WHERE id = v_intent.order_id;
    IF v_order_status IN ('paid', 'processing', 'shipped', 'delivered') THEN
      PERFORM public.cancel_lifecycle_recovery_intent(v_intent.id, 'purchased', 'order_purchased');
      RETURN jsonb_build_object('status', 'already_purchased', 'contractVersion', '1.0.0');
    END IF;
    IF v_order_status IN ('canceled', 'cancelled', 'failed', 'payment_review') OR v_order_status IS NULL THEN
      PERFORM public.cancel_lifecycle_recovery_intent(v_intent.id, 'invalidated', 'cart_not_eligible');
      RETURN jsonb_build_object('status', 'revoked', 'contractVersion', '1.0.0');
    END IF;
  END IF;
  IF NOT public.lifecycle_recovery_variant_supported(v_intent.variant_id) THEN
    PERFORM public.cancel_lifecycle_recovery_intent(v_intent.id, 'invalidated', 'model_unavailable');
    RETURN jsonb_build_object('status', 'unavailable_model', 'contractVersion', '1.0.0');
  END IF;

  IF p_consume THEN
    UPDATE public.lifecycle_recovery_tokens SET status = 'consumed', consumed_at = now() WHERE id = v_token.id;
    UPDATE public.lifecycle_recovery_intents SET status = 'resumed', terminal_reason = 'customer_resumed', updated_at = now() WHERE id = v_intent.id;
    UPDATE public.lifecycle_marketing_outbox
    SET status = 'suppressed', last_error_code = 'customer_resumed', completed_at = coalesce(completed_at, now()), updated_at = now()
    WHERE recovery_intent_id = v_intent.id AND status IN ('pending', 'failed', 'sending');
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'status', 'ready', 'contractVersion', '1.0.0', 'flow', v_intent.flow,
    'ownerUserId', v_intent.user_id, 'variantId', v_intent.variant_id,
    'quantity', v_intent.quantity, 'designRevision', v_intent.design_revision,
    'designId', CASE WHEN v_intent.flow = 'abandoned_design' THEN v_design.design_id ELSE NULL END,
    'edmTemplateId', CASE WHEN v_intent.flow = 'abandoned_design' THEN v_design.edm_template_id ELSE v_intent.edm_template_id END,
    'externalProductId', CASE WHEN v_intent.flow = 'abandoned_design' THEN v_design.external_product_id ELSE v_intent.external_product_id END,
    'previewUrl', CASE WHEN v_intent.flow = 'abandoned_design' THEN v_design.preview_url ELSE NULL END,
    'previewUrlAngled', CASE WHEN v_intent.flow = 'abandoned_design' THEN v_design.preview_url_angled ELSE NULL END,
    'cartItems', v_intent.cart_snapshot
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.lifecycle_recovery_design_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.variant_id, NEW.edm_template_id, NEW.external_product_id, NEW.preview_url, NEW.preview_url_angled)
    IS DISTINCT FROM
    (OLD.variant_id, OLD.edm_template_id, OLD.external_product_id, OLD.preview_url, OLD.preview_url_angled)
  THEN NEW.revision := OLD.revision + 1; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lifecycle_recovery_design_revision_before_update
BEFORE UPDATE ON public.designs FOR EACH ROW EXECUTE FUNCTION public.lifecycle_recovery_design_revision();

CREATE OR REPLACE FUNCTION public.lifecycle_recovery_design_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id UUID;
BEGIN
  FOR v_id IN SELECT id FROM public.lifecycle_recovery_intents
    WHERE design_record_id = OLD.id AND status IN ('pending', 'eligible') FOR UPDATE
  LOOP
    PERFORM public.cancel_lifecycle_recovery_intent(
      v_id,
      CASE WHEN TG_OP = 'DELETE' THEN 'deleted' ELSE 'invalidated' END,
      CASE WHEN TG_OP = 'DELETE' THEN 'design_deleted' ELSE 'superseded_revision' END
    );
  END LOOP;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER lifecycle_recovery_design_cancel_after_update
AFTER UPDATE OF revision, recovery_invalidated_at ON public.designs
FOR EACH ROW
WHEN (
  OLD.revision IS DISTINCT FROM NEW.revision
  OR OLD.recovery_invalidated_at IS DISTINCT FROM NEW.recovery_invalidated_at
)
EXECUTE FUNCTION public.lifecycle_recovery_design_cancel();
CREATE TRIGGER lifecycle_recovery_design_cancel_before_delete
BEFORE DELETE ON public.designs FOR EACH ROW EXECUTE FUNCTION public.lifecycle_recovery_design_cancel();

CREATE OR REPLACE FUNCTION public.lifecycle_recovery_order_purchase_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id UUID;
BEGIN
  IF lower(coalesce(NEW.status, '')) IN ('paid', 'processing', 'shipped', 'delivered')
    AND lower(coalesce(OLD.status, '')) NOT IN ('paid', 'processing', 'shipped', 'delivered')
  THEN
    FOR v_id IN SELECT id FROM public.lifecycle_recovery_intents
      WHERE order_id = NEW.id AND status IN ('pending', 'eligible') FOR UPDATE
    LOOP PERFORM public.cancel_lifecycle_recovery_intent(v_id, 'purchased', 'order_purchased'); END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lifecycle_recovery_order_purchase_after_update
AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.lifecycle_recovery_order_purchase_cancel();

CREATE OR REPLACE FUNCTION public.lifecycle_recovery_suppression_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id UUID;
BEGIN
  IF NEW.status = 'suppressed' AND OLD.status <> 'suppressed' THEN
    FOR v_id IN SELECT id FROM public.lifecycle_recovery_intents
      WHERE subscriber_id = NEW.id AND status IN ('pending', 'eligible') FOR UPDATE
    LOOP PERFORM public.cancel_lifecycle_recovery_intent(v_id, 'suppressed', 'subscriber_not_eligible'); END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lifecycle_recovery_suppression_after_update
AFTER UPDATE OF status ON public.lifecycle_marketing_subscribers
FOR EACH ROW EXECUTE FUNCTION public.lifecycle_recovery_suppression_cancel();

REVOKE ALL ON FUNCTION public.lifecycle_recovery_variant_supported(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_lifecycle_recovery_intent(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_saved_design_recovery(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_abandoned_cart_recovery(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_lifecycle_recovery_token(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_lifecycle_recovery_state(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lifecycle_recovery_design_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lifecycle_recovery_design_cancel() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lifecycle_recovery_order_purchase_cancel() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lifecycle_recovery_suppression_cancel() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_recovery_variant_supported(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_lifecycle_recovery_intent(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_saved_design_recovery(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_abandoned_cart_recovery(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_lifecycle_recovery_token(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_lifecycle_recovery_state(TEXT, BOOLEAN) TO service_role;

COMMENT ON TABLE public.lifecycle_recovery_intents IS
  'Server-only recovery eligibility. Artwork and contact identity must never enter analytics, URLs, logs, or repository evidence.';
COMMENT ON TABLE public.lifecycle_recovery_tokens IS
  'Opaque single-use recovery tokens; only SHA-256 digests are stored.';
COMMENT ON TABLE public.lifecycle_recovery_exclusions IS
  'Server-only employee, QA, fixture, and policy exclusions for recovery cohorts.';
