ALTER TABLE public.kexiaozhan_handoffs
  ADD COLUMN IF NOT EXISTS notify_claim_id UUID,
  ADD COLUMN IF NOT EXISTS notify_claimed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.kexiaozhan_handoffs
  DROP CONSTRAINT IF EXISTS kexiaozhan_handoffs_status_check;

ALTER TABLE public.kexiaozhan_handoffs
  ADD CONSTRAINT kexiaozhan_handoffs_status_check CHECK (
    status IN (
      'received',
      'checkout_created',
      'paid',
      'vendor_notifying',
      'vendor_notified',
      'vendor_notify_failed',
      'expired',
      'failed'
    )
  );

CREATE OR REPLACE FUNCTION public.claim_kexiaozhan_payment_notification(
  p_out_trade_no TEXT,
  p_lease_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  claimed BOOLEAN,
  already_succeeded BOOLEAN,
  claim_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_handoff public.kexiaozhan_handoffs%ROWTYPE;
  v_claim_id UUID;
  v_lease_seconds INTEGER := LEAST(GREATEST(p_lease_seconds, 30), 900);
BEGIN
  IF COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    ''
  ) <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;

  IF p_out_trade_no IS NULL OR btrim(p_out_trade_no) = '' THEN
    RETURN QUERY SELECT FALSE, FALSE, NULL::UUID;
    RETURN;
  END IF;

  SELECT *
  INTO v_handoff
  FROM public.kexiaozhan_handoffs
  WHERE out_trade_no = p_out_trade_no
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, FALSE, NULL::UUID;
    RETURN;
  END IF;

  IF
    v_handoff.payment_notified_at IS NOT NULL OR
    v_handoff.status = 'vendor_notified'
  THEN
    RETURN QUERY SELECT FALSE, TRUE, NULL::UUID;
    RETURN;
  END IF;

  IF
    v_handoff.status = 'vendor_notifying' AND
    v_handoff.notify_claim_id IS NOT NULL AND
    v_handoff.notify_claimed_at >
      now() - make_interval(secs => v_lease_seconds)
  THEN
    RETURN QUERY SELECT FALSE, FALSE, v_handoff.notify_claim_id;
    RETURN;
  END IF;

  v_claim_id := gen_random_uuid();

  UPDATE public.kexiaozhan_handoffs
  SET
    status = 'vendor_notifying',
    notify_claim_id = v_claim_id,
    notify_claimed_at = now(),
    last_error = NULL
  WHERE id = v_handoff.id;

  RETURN QUERY SELECT TRUE, FALSE, v_claim_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_kexiaozhan_payment_notification(
  TEXT,
  INTEGER
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_kexiaozhan_payment_notification(
  TEXT,
  INTEGER
) TO service_role;
