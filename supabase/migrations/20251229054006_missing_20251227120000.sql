drop extension if exists "pg_net";

create extension if not exists "pg_net" with schema "public";


  create table "public"."order_notifications" (
    "id" uuid not null default gen_random_uuid(),
    "order_id" uuid not null,
    "event_type" text not null,
    "recipient_email" text not null,
    "status" text not null default 'pending'::text,
    "provider" text not null default 'resend'::text,
    "provider_message_id" text,
    "error_message" text,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."order_notifications" enable row level security;

alter table "public"."orders" add column "delivered_at" timestamp with time zone;

alter table "public"."orders" add column "shipped_at" timestamp with time zone;

alter table "public"."orders" add column "tracking_carrier" text;

alter table "public"."orders" add column "tracking_number" text;

alter table "public"."orders" add column "tracking_url" text;

CREATE INDEX idx_order_notifications_status ON public.order_notifications USING btree (status, created_at);

CREATE UNIQUE INDEX idx_order_notifications_unique ON public.order_notifications USING btree (order_id, event_type);

CREATE UNIQUE INDEX order_notifications_pkey ON public.order_notifications USING btree (id);

alter table "public"."order_notifications" add constraint "order_notifications_pkey" PRIMARY KEY using index "order_notifications_pkey";

alter table "public"."order_notifications" add constraint "order_notifications_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE not valid;

alter table "public"."order_notifications" validate constraint "order_notifications_order_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$function$
;

grant delete on table "public"."order_notifications" to "anon";

grant insert on table "public"."order_notifications" to "anon";

grant references on table "public"."order_notifications" to "anon";

grant select on table "public"."order_notifications" to "anon";

grant trigger on table "public"."order_notifications" to "anon";

grant truncate on table "public"."order_notifications" to "anon";

grant update on table "public"."order_notifications" to "anon";

grant delete on table "public"."order_notifications" to "authenticated";

grant insert on table "public"."order_notifications" to "authenticated";

grant references on table "public"."order_notifications" to "authenticated";

grant select on table "public"."order_notifications" to "authenticated";

grant trigger on table "public"."order_notifications" to "authenticated";

grant truncate on table "public"."order_notifications" to "authenticated";

grant update on table "public"."order_notifications" to "authenticated";

grant delete on table "public"."order_notifications" to "service_role";

grant insert on table "public"."order_notifications" to "service_role";

grant references on table "public"."order_notifications" to "service_role";

grant select on table "public"."order_notifications" to "service_role";

grant trigger on table "public"."order_notifications" to "service_role";

grant truncate on table "public"."order_notifications" to "service_role";

grant update on table "public"."order_notifications" to "service_role";


  create policy "Order notifications service role only"
  on "public"."order_notifications"
  as permissive
  for all
  to public
using ((( SELECT ((current_setting('request.jwt.claims'::text, true))::json ->> 'role'::text)) = 'service_role'::text))
with check ((( SELECT ((current_setting('request.jwt.claims'::text, true))::json ->> 'role'::text)) = 'service_role'::text));


CREATE TRIGGER update_order_notifications_updated_at BEFORE UPDATE ON public.order_notifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


