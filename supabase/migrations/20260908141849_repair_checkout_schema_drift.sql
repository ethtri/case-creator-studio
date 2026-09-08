-- Reconcile production with the columns already required by create-checkout.
-- This is intentionally additive and idempotent so environments that received
-- the original feature migrations remain unchanged.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS marketing_attribution JSONB,
  ADD COLUMN IF NOT EXISTS analytics_client_id TEXT,
  ADD COLUMN IF NOT EXISTS analytics_consent TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_provider TEXT NOT NULL DEFAULT 'printful';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_analytics_consent_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_analytics_consent_check
  CHECK (
    analytics_consent IS NULL OR
    analytics_consent IN ('granted', 'denied', 'unset')
  );

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_fulfillment_provider_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfillment_provider_check
  CHECK (fulfillment_provider IN ('printful', 'onshore_manual'));
