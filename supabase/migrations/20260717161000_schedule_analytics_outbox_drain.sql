CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  existing_job_id INTEGER;
BEGIN
  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'ga4-outbox-drain-1m';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END
$$;

SELECT cron.schedule(
  'ga4-outbox-drain-1m',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'project_url'
    ) || '/functions/v1/ga4-outbox-drain',
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'Authorization',
      'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'ga4_outbox_drain_auth_secret'
      ),
      'apikey',
      (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'ga4_outbox_drain_auth_secret'
      )
    ),
    body := '{"limit":25}'::JSONB
  ) AS request_id;
  $$
);
