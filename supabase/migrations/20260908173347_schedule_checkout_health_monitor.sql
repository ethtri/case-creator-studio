CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.configure_checkout_health_monitor_schedule()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job_id BIGINT;
  v_project_url TEXT;
  v_auth_secret TEXT;
  v_enabled TEXT;
BEGIN
  FOR v_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'checkout-health-monitor-5m'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  SELECT decrypted_secret INTO v_enabled
  FROM vault.decrypted_secrets
  WHERE name = 'checkout_health_monitor_enabled'
  LIMIT 1;

  IF COALESCE(v_enabled, '') <> 'true' THEN
    RAISE NOTICE 'Checkout health monitor not enabled: explicit Vault flag is not true';
    RETURN FALSE;
  END IF;

  SELECT decrypted_secret INTO v_project_url
  FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  SELECT decrypted_secret INTO v_auth_secret
  FROM vault.decrypted_secrets
  WHERE name = 'checkout_health_monitor_auth_secret'
  LIMIT 1;

  IF NULLIF(BTRIM(v_project_url), '') IS NULL OR
    v_project_url !~ '^https://[a-z0-9]{20}\.supabase\.co/?$' OR
    NULLIF(BTRIM(v_auth_secret), '') IS NULL OR
    char_length(v_auth_secret) < 32 THEN
    RAISE NOTICE 'Checkout health monitor not enabled: Vault secrets are missing';
    RETURN FALSE;
  END IF;

  PERFORM cron.schedule(
    'checkout-health-monitor-5m',
    '*/5 * * * *',
    $command$
      WITH runtime_config AS (
        SELECT
          (SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'checkout_health_monitor_enabled' LIMIT 1) AS enabled,
          (SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'project_url' LIMIT 1) AS project_url,
          (SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'checkout_health_monitor_auth_secret' LIMIT 1) AS auth_secret
      )
      SELECT net.http_post(
        url := RTRIM(project_url, '/') || '/functions/v1/checkout-health-monitor',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || auth_secret
        ),
        body := '{}'::JSONB
      ) AS request_id
      FROM runtime_config
      WHERE enabled = 'true'
        AND project_url ~ '^https://[a-z0-9]{20}\.supabase\.co/?$'
        AND char_length(COALESCE(auth_secret, '')) >= 32;
    $command$
  );

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_checkout_health_monitor_schedule()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_checkout_health_monitor_schedule()
TO service_role;

SELECT public.configure_checkout_health_monitor_schedule();
