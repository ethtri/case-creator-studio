create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
declare
  existing_job_id integer;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'printful-retry-5m';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

select
  cron.schedule(
    'printful-retry-5m',
    '*/5 * * * *',
    $$
    select
      net.http_post(
        url := 'https://mdprdbaykuordozfctud.supabase.co/functions/v1/printful-retry',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := '{}'::jsonb
      ) as request_id;
    $$
  );
