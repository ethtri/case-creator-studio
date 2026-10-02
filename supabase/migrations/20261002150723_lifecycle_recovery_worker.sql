-- Additive, service-only worker. No schedule, provider enablement, or recipient seed.
ALTER TABLE public.lifecycle_marketing_outbox ADD COLUMN preparation_deferrals INTEGER NOT NULL DEFAULT 0;
-- Preserve canceled audit history when existing FK SET NULL follows a delete.
ALTER TABLE public.lifecycle_recovery_intents DROP CONSTRAINT lifecycle_recovery_shape_check;
ALTER TABLE public.lifecycle_recovery_intents ADD CONSTRAINT lifecycle_recovery_shape_check CHECK (
 (flow='abandoned_design' AND (design_record_id IS NOT NULL OR status IN ('deleted','resumed','purchased','suppressed','expired','invalidated'))
  AND order_id IS NULL AND design_revision IS NOT NULL AND cart_snapshot IS NULL)
 OR (flow='abandoned_cart' AND (order_id IS NOT NULL OR status IN ('deleted','resumed','purchased','suppressed','expired','invalidated')) AND cart_snapshot IS NOT NULL)
);
CREATE FUNCTION public.lifecycle_worker_order_delete_cancel() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id UUID;
BEGIN
 FOR v_id IN SELECT id FROM public.lifecycle_recovery_intents WHERE order_id=OLD.id
  AND status IN ('pending','eligible') FOR UPDATE
 LOOP PERFORM public.cancel_lifecycle_recovery_intent(v_id,'deleted','order_deleted'); END LOOP;
 RETURN OLD;
END;
$$;
CREATE TRIGGER lifecycle_worker_order_delete_before_delete BEFORE DELETE ON public.orders
 FOR EACH ROW EXECUTE FUNCTION public.lifecycle_worker_order_delete_cancel();
CREATE TABLE public.lifecycle_worker_reservations (
  outbox_id UUID PRIMARY KEY REFERENCES public.lifecycle_marketing_outbox(id),
  account_id TEXT NOT NULL,
  prepared_at TIMESTAMPTZ,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lifecycle_worker_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lifecycle_worker_reservations FROM PUBLIC, anon, authenticated;
CREATE UNIQUE INDEX lifecycle_worker_message_unique ON public.lifecycle_marketing_outbox(provider,provider_operation_id)
 WHERE provider='resend' AND provider_operation_id IS NOT NULL;

CREATE TABLE public.lifecycle_worker_events (
 event_id TEXT PRIMARY KEY, message_id TEXT NOT NULL, event_type TEXT NOT NULL,
 occurred_at TIMESTAMPTZ NOT NULL, outcome TEXT NOT NULL DEFAULT 'unmatched',
 received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lifecycle_worker_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lifecycle_worker_events FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.lifecycle_worker_apply_event(p_event TEXT,p_message TEXT,p_type TEXT,p_at TIMESTAMPTZ)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_sub UUID; v_reason TEXT; v_row public.lifecycle_worker_events%ROWTYPE;
BEGIN
 IF length(p_event) NOT BETWEEN 1 AND 255 OR length(p_message) NOT BETWEEN 1 AND 128
  OR p_type NOT IN ('email.sent','email.delivered','email.delivery_delayed','email.opened','email.clicked',
   'email.failed','email.bounced','email.complained','email.suppressed') OR p_at IS NULL
 THEN RAISE EXCEPTION 'invalid_native_event'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('lifecycle_message:'||p_message,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('lifecycle_event:'||p_event,0));
 INSERT INTO public.lifecycle_worker_events(event_id,message_id,event_type,occurred_at)
 VALUES(p_event,p_message,p_type,p_at) ON CONFLICT DO NOTHING;
 SELECT * INTO v_row FROM public.lifecycle_worker_events WHERE event_id=p_event FOR UPDATE;
 IF v_row.message_id<>p_message OR v_row.event_type<>p_type OR v_row.occurred_at<>p_at
 THEN RAISE EXCEPTION 'native_event_replay_mismatch'; END IF;
 IF v_row.outcome<>'unmatched' THEN RETURN 'duplicate'; END IF;
 SELECT subscriber_id INTO v_sub FROM public.lifecycle_marketing_outbox
 WHERE provider='resend' AND provider_operation_id=p_message LIMIT 1;
 IF NOT FOUND THEN RETURN 'unmatched'; END IF;
 SELECT CASE p_type WHEN 'email.bounced' THEN 'bounce' WHEN 'email.complained' THEN 'complaint'
  WHEN 'email.suppressed' THEN 'provider_suppression' ELSE NULL END INTO v_reason;
 IF v_reason IS NOT NULL THEN
  UPDATE public.lifecycle_marketing_subscribers SET status='suppressed',
   revoked_at=coalesce(revoked_at,p_at),suppression_reason=coalesce(suppression_reason,v_reason),
   provider_event_at=greatest(coalesce(provider_event_at,p_at),p_at),updated_at=now() WHERE id=v_sub;
  INSERT INTO public.lifecycle_marketing_consent_events(subscriber_id,request_id,event_type,source,placement,
   consent_copy_version,privacy_policy_version,metadata,occurred_at)
  SELECT id,gen_random_uuid(),'provider_suppressed','resend','provider_webhook',consent_copy_version,
   privacy_policy_version,jsonb_build_object('reason',v_reason),p_at FROM public.lifecycle_marketing_subscribers WHERE id=v_sub;
 END IF;
 UPDATE public.lifecycle_worker_events SET outcome='applied' WHERE event_id=p_event;
 RETURN 'applied';
END;
$$;

CREATE FUNCTION public.lifecycle_worker_eligible(p_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.lifecycle_marketing_outbox o
  JOIN public.lifecycle_marketing_subscribers s ON s.id=o.subscriber_id
  LEFT JOIN public.lifecycle_recovery_intents r ON r.id=o.recovery_intent_id
  WHERE o.id=p_id AND o.operation IN ('welcome','abandoned_design','abandoned_cart')
   AND s.status='subscribed' AND s.revoked_at IS NULL AND s.suppression_reason IS NULL
   AND s.purpose='lifecycle_marketing' AND s.source='website' AND s.placement='homepage_email_card'
   AND s.consent_copy_version='lifecycle_marketing_home_v1' AND s.privacy_policy_version='2026-07-22'
   AND s.email_normalized !~* '@(snapcase\.ai|example\.invalid)$'
   AND coalesce(s.campaign,'') !~* '^qa_' AND s.granted_at<=o.created_at
   AND NOT EXISTS (SELECT 1 FROM public.lifecycle_recovery_exclusions e WHERE e.subscriber_id=s.id)
   AND EXISTS (SELECT 1 FROM public.lifecycle_marketing_consent_events c
     WHERE c.subscriber_id=s.id AND c.event_type='granted' AND c.occurred_at<=o.created_at
      AND (o.operation<>'welcome' OR c.occurred_at>=now()-interval '24 hours')
      AND c.consent_copy_version=s.consent_copy_version AND c.privacy_policy_version=s.privacy_policy_version)
   AND NOT EXISTS (SELECT 1 FROM public.lifecycle_marketing_outbox other
     WHERE other.subscriber_id=s.id AND other.id<>o.id AND other.operation=o.operation
       AND other.status IN ('completed','uncertain','sending')
       AND other.created_at>now()-interval '30 days')
   AND ((o.operation='welcome' AND o.recovery_intent_id IS NULL AND o.created_at>=now()-interval '24 hours'
     AND s.granted_at>=now()-interval '24 hours')
    OR (r.subscriber_id=s.id AND r.flow=o.operation AND r.status IN ('pending','eligible')
     AND r.eligible_after<=now() AND r.expires_at>now()
     AND public.lifecycle_recovery_variant_supported(r.variant_id)
     AND ((r.flow='abandoned_design' AND EXISTS (SELECT 1 FROM public.designs d
       WHERE d.id=r.design_record_id AND d.user_id=r.user_id AND d.revision=r.design_revision
        AND d.recovery_invalidated_at IS NULL AND d.edm_template_id IS NOT NULL))
      OR (r.flow='abandoned_cart' AND EXISTS (SELECT 1 FROM public.orders ord
       WHERE ord.id=r.order_id AND lower(ord.status)='pending'
        AND lower(btrim(ord.customer_email))=s.email_normalized
        AND ord.items=r.cart_snapshot AND jsonb_array_length(ord.items)>0)))))
 );
$$;

CREATE FUNCTION public.lifecycle_worker_aggregate() RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT jsonb_build_object('subscribers',(SELECT count(*) FROM public.lifecycle_marketing_subscribers),
  'dueEligible',(SELECT count(*) FROM public.lifecycle_marketing_outbox o WHERE o.status='pending'
    AND o.attempts=0 AND o.next_attempt_at<=now() AND public.lifecycle_worker_eligible(o.id)),
  'uncertain',(SELECT count(*) FROM public.lifecycle_marketing_outbox WHERE status='uncertain'));
$$;

CREATE FUNCTION public.lifecycle_worker_claim(p_flows TEXT[],p_account TEXT,p_daily INTEGER,p_monthly INTEGER,p_observed_at TIMESTAMPTZ) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.lifecycle_marketing_outbox%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(610020325);
 IF p_flows IS NULL OR cardinality(p_flows)=0 OR NOT p_flows<@ARRAY['welcome','abandoned_design','abandoned_cart']::TEXT[]
  OR length(p_account) NOT BETWEEN 1 AND 128 OR p_daily NOT BETWEEN 1 AND 100 OR p_monthly NOT BETWEEN 1 AND 3000
  OR p_observed_at IS NULL OR p_observed_at>now() OR p_observed_at<now()-interval '15 minutes' THEN RETURN NULL; END IF;
 UPDATE public.lifecycle_marketing_outbox SET status='uncertain',last_error_code='expired_worker_lease',updated_at=now()
 WHERE status='sending' AND lease_expires_at<=now();
 SELECT * INTO v FROM public.lifecycle_marketing_outbox o WHERE status='pending' AND attempts=0
  AND preparation_deferrals<3
  AND operation=ANY(p_flows)
  AND next_attempt_at<=now() AND public.lifecycle_worker_eligible(o.id)
  ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.lifecycle_worker_reservations WHERE outbox_id=v.id AND account_id=p_account
   AND reserved_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') THEN
  IF EXISTS (SELECT 1 FROM public.lifecycle_worker_reservations WHERE outbox_id=v.id AND account_id<>p_account) THEN RETURN NULL; END IF;
  IF (SELECT count(*) FROM public.lifecycle_worker_reservations WHERE account_id=p_account
      AND reserved_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')>=p_daily
   OR (SELECT count(*) FROM public.lifecycle_worker_reservations WHERE account_id=p_account
      AND reserved_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')>=p_monthly THEN RETURN NULL; END IF;
  INSERT INTO public.lifecycle_worker_reservations(outbox_id,account_id) VALUES(v.id,p_account)
   ON CONFLICT(outbox_id) DO UPDATE SET reserved_at=now();
 END IF;
 UPDATE public.lifecycle_marketing_outbox SET status='sending',attempts=1,claim_token=gen_random_uuid(),
  claimed_at=now(),lease_expires_at=now()+interval '2 minutes',provider='resend',updated_at=now()
 WHERE id=v.id RETURNING * INTO v;
 RETURN jsonb_build_object('id',v.id,'claim_token',v.claim_token,'operation',v.operation);
END;
$$;

CREATE FUNCTION public.lifecycle_worker_prepare(p_id UUID,p_claim UUID,p_account TEXT,p_daily INTEGER,p_monthly INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v public.lifecycle_marketing_outbox%ROWTYPE; s public.lifecycle_marketing_subscribers%ROWTYPE;
 pref TEXT; recovery TEXT; event_id UUID;
BEGIN
 -- Serialize capacity reservations across ALL invocations. Reservations are never refunded automatically.
 PERFORM pg_advisory_xact_lock(610020325);
 -- Match unsubscribe's lock order: subscriber -> recovery intent -> outbox.
 SELECT * INTO s FROM public.lifecycle_marketing_subscribers WHERE id=(
  SELECT subscriber_id FROM public.lifecycle_marketing_outbox WHERE id=p_id) FOR UPDATE;
 PERFORM 1 FROM public.lifecycle_recovery_intents WHERE id=(
  SELECT recovery_intent_id FROM public.lifecycle_marketing_outbox WHERE id=p_id) FOR UPDATE;
 SELECT * INTO v FROM public.lifecycle_marketing_outbox WHERE id=p_id FOR UPDATE;
 IF v.status='sending' AND v.claim_token=p_claim AND (v.lease_expires_at<=now()+interval '20 seconds'
  OR NOT EXISTS (SELECT 1 FROM public.lifecycle_worker_reservations WHERE outbox_id=p_id
   AND reserved_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))
 THEN RAISE EXCEPTION 'worker_capacity_period_or_lease_changed'; END IF;
 IF NOT FOUND OR v.claim_token IS DISTINCT FROM p_claim OR v.status<>'sending' OR v.lease_expires_at<=now()
  OR NOT public.lifecycle_worker_eligible(p_id) OR length(p_account) NOT BETWEEN 1 AND 128
  OR p_daily NOT BETWEEN 1 AND 100 OR p_monthly NOT BETWEEN 1 AND 3000 THEN RETURN NULL; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.lifecycle_worker_reservations WHERE outbox_id=p_id AND account_id=p_account) THEN RETURN NULL; END IF;
 IF EXISTS (SELECT 1 FROM public.lifecycle_worker_reservations WHERE outbox_id=p_id AND prepared_at IS NOT NULL)
 THEN RAISE EXCEPTION 'worker_preparation_already_exists'; END IF;
 SELECT request_id INTO event_id FROM public.lifecycle_marketing_consent_events
 WHERE subscriber_id=s.id AND event_type='granted' ORDER BY occurred_at LIMIT 1;
 IF v.operation<>'welcome' THEN
  recovery:=public.issue_lifecycle_recovery_token(v.recovery_intent_id);
  IF public.get_lifecycle_recovery_state(recovery,false)->>'status'<>'ready' THEN RETURN NULL; END IF;
 END IF;
 pref:=public.issue_lifecycle_preference_token(s.id);
 UPDATE public.lifecycle_worker_reservations SET prepared_at=now() WHERE outbox_id=p_id;
 RETURN jsonb_build_object('email',s.email_normalized,'preferenceToken',pref,'recoveryToken',recovery,
  'eventId',CASE WHEN v.operation='welcome' THEN event_id ELSE v.recovery_intent_id END,'recipientRef',s.id,'idempotencyKey',CASE WHEN v.operation='welcome'
   THEN 'welcome:'||s.id::text||':'||event_id::text||':welcome_v1' ELSE v.idempotency_key END);
END;
$$;

CREATE FUNCTION public.lifecycle_worker_recheck(p_id UUID,p_claim UUID) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE
  WHEN EXISTS (SELECT 1 FROM public.lifecycle_marketing_outbox WHERE id=p_id AND claim_token=p_claim AND status='suppressed') THEN 'suppressed'
  WHEN NOT EXISTS (SELECT 1 FROM public.lifecycle_marketing_outbox o JOIN public.lifecycle_worker_reservations r ON r.outbox_id=o.id
   WHERE o.id=p_id AND o.claim_token=p_claim AND o.status='sending' AND o.lease_expires_at>now()+interval '20 seconds'
    AND r.reserved_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    AND now()+interval '20 seconds'<(date_trunc('day',now() AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC') THEN 'deferred'
  WHEN public.lifecycle_worker_eligible(p_id) THEN 'eligible' ELSE 'suppressed' END;
$$;
CREATE FUNCTION public.lifecycle_worker_finish(p_id UUID,p_claim UUID,p_status TEXT,p_message TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_event public.lifecycle_worker_events%ROWTYPE; v_done BOOLEAN;
BEGIN
 IF p_status NOT IN ('completed','suppressed','dead_letter','uncertain','deferred') THEN RAISE EXCEPTION 'invalid_worker_result'; END IF;
 IF p_status='completed' AND coalesce(p_message,'') !~ '^[a-zA-Z0-9_-]{1,128}$' THEN RAISE EXCEPTION 'missing_provider_acceptance'; END IF;
 IF p_message IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('lifecycle_message:'||p_message,0));
 END IF;
 PERFORM 1 FROM public.lifecycle_marketing_subscribers WHERE id=(
  SELECT subscriber_id FROM public.lifecycle_marketing_outbox WHERE id=p_id) FOR UPDATE;
 UPDATE public.lifecycle_marketing_outbox SET status=CASE WHEN status='suppressed' THEN status WHEN p_status='deferred' THEN 'pending' ELSE p_status END,
  attempts=CASE WHEN p_status='deferred' THEN 0 ELSE attempts END,
  preparation_deferrals=preparation_deferrals+CASE WHEN p_status='deferred' THEN 1 ELSE 0 END,
  next_attempt_at=CASE WHEN p_status='deferred' THEN now()+interval '5 minutes' ELSE next_attempt_at END,
  provider_operation_id=coalesce(p_message,provider_operation_id),
  last_error_code=CASE WHEN p_status='uncertain' THEN 'provider_reconciliation_required' ELSE p_status END,
  completed_at=CASE WHEN p_status='completed' THEN now() ELSE completed_at END,updated_at=now()
 WHERE id=p_id AND claim_token=p_claim AND status IN ('sending','uncertain','suppressed')
  AND (p_status<>'deferred' OR status='sending');
 v_done:=FOUND;
 IF v_done AND p_status='deferred' THEN
  UPDATE public.lifecycle_worker_reservations SET prepared_at=NULL WHERE outbox_id=p_id;
 END IF;
 IF v_done AND p_message IS NOT NULL THEN
  FOR v_event IN SELECT * FROM public.lifecycle_worker_events WHERE message_id=p_message AND outcome='unmatched'
  LOOP PERFORM public.lifecycle_worker_apply_event(v_event.event_id,v_event.message_id,v_event.event_type,v_event.occurred_at); END LOOP;
 END IF;
 RETURN v_done;
END;
$$;
REVOKE ALL ON FUNCTION public.lifecycle_worker_eligible(UUID),public.lifecycle_worker_aggregate(),
 public.lifecycle_worker_order_delete_cancel(),
 public.lifecycle_worker_apply_event(TEXT,TEXT,TEXT,TIMESTAMPTZ),
 public.lifecycle_worker_claim(TEXT[],TEXT,INTEGER,INTEGER,TIMESTAMPTZ),public.lifecycle_worker_prepare(UUID,UUID,TEXT,INTEGER,INTEGER),
 public.lifecycle_worker_recheck(UUID,UUID),public.lifecycle_worker_finish(UUID,UUID,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_worker_eligible(UUID),public.lifecycle_worker_aggregate(),
 public.lifecycle_worker_apply_event(TEXT,TEXT,TEXT,TIMESTAMPTZ),
 public.lifecycle_worker_claim(TEXT[],TEXT,INTEGER,INTEGER,TIMESTAMPTZ),public.lifecycle_worker_prepare(UUID,UUID,TEXT,INTEGER,INTEGER),
 public.lifecycle_worker_recheck(UUID,UUID),public.lifecycle_worker_finish(UUID,UUID,TEXT,TEXT) TO service_role;
