BEGIN;

DO $acceptance$
DECLARE
  v_command TEXT;
  v_configured BOOLEAN;
  v_job_count INTEGER;
  v_public_execute BOOLEAN;
BEGIN
  IF has_function_privilege(
    'anon',
    'public.configure_ga4_outbox_drain_schedule()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon can execute the GA4 scheduler configurator';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.configure_ga4_outbox_drain_schedule()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated can execute the GA4 scheduler configurator';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.configure_ga4_outbox_drain_schedule()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role cannot execute the GA4 scheduler configurator';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(
        procedure.proacl,
        acldefault('f', procedure.proowner)
      )
    ) AS privilege
    WHERE procedure.oid =
      'public.configure_ga4_outbox_drain_schedule()'::regprocedure
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  )
  INTO v_public_execute;

  IF v_public_execute THEN
    RAISE EXCEPTION 'PUBLIC can execute the GA4 scheduler configurator';
  END IF;

  DELETE FROM vault.secrets
  WHERE name IN (
    'project_url',
    'ga4_outbox_drain_auth_secret',
    'ga4_outbox_drain_enabled'
  );

  -- Legacy-upgrade and missing-config scenario.
  PERFORM cron.schedule(
    'ga4-outbox-drain-1m',
    '* * * * *',
    'SELECT 1;'
  );
  v_configured := public.configure_ga4_outbox_drain_schedule();
  IF v_configured THEN
    RAISE EXCEPTION 'missing Vault configuration unexpectedly enabled cron';
  END IF;
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'ga4-outbox-drain-1m'
  ) THEN
    RAISE EXCEPTION 'legacy cron remained after disabled reconfiguration';
  END IF;

  -- Explicit false scenario.
  PERFORM vault.create_secret(
    'false',
    'ga4_outbox_drain_enabled',
    'transactional acceptance fixture'
  );
  PERFORM vault.create_secret(
    'https://onztuktjcmjukfhcuphh.supabase.co',
    'project_url',
    'transactional acceptance fixture'
  );
  PERFORM vault.create_secret(
    'acceptance-auth-secret-value-000000000000',
    'ga4_outbox_drain_auth_secret',
    'transactional acceptance fixture'
  );
  v_configured := public.configure_ga4_outbox_drain_schedule();
  IF v_configured THEN
    RAISE EXCEPTION 'false enable flag unexpectedly enabled cron';
  END IF;

  -- Invalid live URL scenario.
  PERFORM vault.update_secret(
    (
      SELECT id FROM vault.secrets
      WHERE name = 'ga4_outbox_drain_enabled'
      LIMIT 1
    ),
    'true'
  );
  PERFORM vault.update_secret(
    (
      SELECT id FROM vault.secrets
      WHERE name = 'project_url'
      LIMIT 1
    ),
    'https://invalid.example.com'
  );
  v_configured := public.configure_ga4_outbox_drain_schedule();
  IF v_configured THEN
    RAISE EXCEPTION 'invalid project URL unexpectedly enabled cron';
  END IF;

  -- Fully valid scenario.
  PERFORM vault.update_secret(
    (
      SELECT id FROM vault.secrets
      WHERE name = 'project_url'
      LIMIT 1
    ),
    'https://onztuktjcmjukfhcuphh.supabase.co'
  );
  v_configured := public.configure_ga4_outbox_drain_schedule();
  IF NOT v_configured THEN
    RAISE EXCEPTION 'valid scheduler configuration remained disabled';
  END IF;

  SELECT COUNT(*), MAX(command)
  INTO v_job_count, v_command
  FROM cron.job
  WHERE jobname = 'ga4-outbox-drain-1m';

  IF v_job_count <> 1 THEN
    RAISE EXCEPTION 'expected one GA4 cron job, found %', v_job_count;
  END IF;

  IF POSITION('WITH runtime_config' IN v_command) = 0 OR
    POSITION('ga4_outbox_drain_enabled' IN v_command) = 0 OR
    POSITION('ga4_outbox_drain_auth_secret' IN v_command) = 0 OR
    POSITION('project_url' IN v_command) = 0 OR
    POSITION('char_length(auth_secret) >= 32' IN v_command) = 0 THEN
    RAISE EXCEPTION 'scheduled command does not validate live Vault config';
  END IF;

  IF POSITION('acceptance-auth-secret-value' IN v_command) > 0 THEN
    RAISE EXCEPTION 'scheduled command persisted a credential value';
  END IF;

  -- Runtime disable is immediate; configurator removes the stored cron row.
  PERFORM vault.update_secret(
    (
      SELECT id FROM vault.secrets
      WHERE name = 'ga4_outbox_drain_enabled'
      LIMIT 1
    ),
    'false'
  );
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'ga4-outbox-drain-1m'
  ) THEN
    RAISE EXCEPTION 'fixture expected cron before disabled reconfiguration';
  END IF;
  v_configured := public.configure_ga4_outbox_drain_schedule();
  IF v_configured THEN
    RAISE EXCEPTION 'disabled reconfiguration unexpectedly returned true';
  END IF;
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'ga4-outbox-drain-1m'
  ) THEN
    RAISE EXCEPTION 'disabled reconfiguration did not remove cron';
  END IF;

  RAISE NOTICE 'GA4 scheduler gate acceptance passed';
END;
$acceptance$;

ROLLBACK;
