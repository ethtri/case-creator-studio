CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.configure_ga4_outbox_drain_schedule()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_job_id BIGINT;
  v_project_url TEXT;
  v_auth_secret TEXT;
  v_enabled TEXT;
BEGIN
  FOR v_existing_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'ga4-outbox-drain-1m'
  LOOP
    PERFORM cron.unschedule(v_existing_job_id);
  END LOOP;

  SELECT decrypted_secret
  INTO v_enabled
  FROM vault.decrypted_secrets
  WHERE name = 'ga4_outbox_drain_enabled'
  LIMIT 1;

  IF COALESCE(v_enabled, '') <> 'true' THEN
    RAISE NOTICE
      'GA4 outbox drain schedule not enabled: explicit Vault flag is not true';
    RETURN FALSE;
  END IF;

  SELECT decrypted_secret
  INTO v_project_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url'
  LIMIT 1;

  SELECT decrypted_secret
  INTO v_auth_secret
  FROM vault.decrypted_secrets
  WHERE name = 'ga4_outbox_drain_auth_secret'
  LIMIT 1;

  IF NULLIF(BTRIM(v_project_url), '') IS NULL OR
    v_project_url !~ '^https://[a-z0-9]{20}\.supabase\.co/?$' OR
    NULLIF(BTRIM(v_auth_secret), '') IS NULL OR
    char_length(v_auth_secret) < 32 THEN
    RAISE NOTICE
      'GA4 outbox drain schedule not enabled: Vault secrets are missing';
    RETURN FALSE;
  END IF;

  PERFORM cron.schedule(
    'ga4-outbox-drain-1m',
    '* * * * *',
    $command$
      WITH runtime_config AS (
        SELECT
          (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'ga4_outbox_drain_enabled'
            LIMIT 1
          ) AS enabled,
          (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'project_url'
            LIMIT 1
          ) AS project_url,
          (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'ga4_outbox_drain_auth_secret'
            LIMIT 1
          ) AS auth_secret
      )
      SELECT net.http_post(
        url := RTRIM(project_url, '/') || '/functions/v1/ga4-outbox-drain',
        headers := jsonb_build_object(
          'Content-Type',
          'application/json',
          'Authorization',
          'Bearer ' || auth_secret
        ),
        body := '{"limit":25}'::JSONB
      ) AS request_id
      FROM runtime_config
      WHERE enabled = 'true'
        AND project_url ~ '^https://[a-z0-9]{20}\.supabase\.co/?$'
        AND NULLIF(BTRIM(auth_secret), '') IS NOT NULL
        AND char_length(auth_secret) >= 32;
    $command$
  );

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_ga4_outbox_drain_schedule()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_ga4_outbox_drain_schedule()
TO service_role;

SELECT public.configure_ga4_outbox_drain_schedule();
