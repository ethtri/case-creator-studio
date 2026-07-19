CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.configure_shipping_webhook_drain_schedule()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_job_id BIGINT;
  v_project_url TEXT;
  v_auth_secret TEXT;
  v_command TEXT;
BEGIN
  SELECT decrypted_secret
  INTO v_project_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url'
  LIMIT 1;

  SELECT decrypted_secret
  INTO v_auth_secret
  FROM vault.decrypted_secrets
  WHERE name = 'shipping_webhook_drain_auth_secret'
  LIMIT 1;

  IF NULLIF(BTRIM(v_project_url), '') IS NULL OR
    v_project_url !~ '^https://[a-z0-9]{20}\.supabase\.co/?$' OR
    NULLIF(BTRIM(v_auth_secret), '') IS NULL OR
    char_length(v_auth_secret) < 32 THEN
    RAISE NOTICE
      'Shipping webhook drain schedule not enabled: Vault secrets are missing';
    RETURN;
  END IF;

  SELECT jobid
  INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'shipping-webhook-drain-1m';

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  v_command := format(
    $command$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L
        ),
        body := '{"limit":20}'::JSONB
      ) AS request_id;
    $command$,
    RTRIM(v_project_url, '/') ||
      '/functions/v1/shipping-webhook-drain',
    'Bearer ' || v_auth_secret
  );

  PERFORM cron.schedule(
    'shipping-webhook-drain-1m',
    '* * * * *',
    v_command
  );
END;
$$;

REVOKE ALL ON FUNCTION public.configure_shipping_webhook_drain_schedule()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_shipping_webhook_drain_schedule()
TO service_role;

SELECT public.configure_shipping_webhook_drain_schedule();
