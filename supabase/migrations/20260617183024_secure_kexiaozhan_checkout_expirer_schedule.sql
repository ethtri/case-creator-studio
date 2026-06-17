create extension if not exists supabase_vault;
create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
declare
  existing_job_id integer;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'kexiaozhan-checkout-expirer-1m';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

select
  cron.schedule(
    'kexiaozhan-checkout-expirer-1m',
    '* * * * *',
    $$
    select
      net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
          || '/functions/v1/kexiaozhan-checkout-expirer',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'kexiaozhan_checkout_expirer_auth_secret'),
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'kexiaozhan_checkout_expirer_auth_secret')
        ),
        body := '{"limit":25}'::jsonb
      ) as request_id;
    $$
  );
