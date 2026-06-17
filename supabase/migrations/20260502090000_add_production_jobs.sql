CREATE TABLE IF NOT EXISTS public.production_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'onshore_manual',
  status TEXT NOT NULL DEFAULT 'queued',
  order_status TEXT NOT NULL,
  fulfillment_status TEXT,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  total DECIMAL(10,2) NOT NULL,
  shipping_address JSONB,
  items JSONB NOT NULL,
  operator_email TEXT,
  operator_notes TEXT,
  tracking_carrier TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMP WITH TIME ZONE,
  shipped_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT production_jobs_provider_check CHECK (provider IN ('onshore_manual')),
  CONSTRAINT production_jobs_status_check CHECK (status IN ('queued', 'artwork_ready', 'printed', 'packed', 'shipped', 'failed')),
  CONSTRAINT production_jobs_order_provider_unique UNIQUE (order_id, provider)
);

ALTER TABLE public.production_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Production jobs service role only" ON public.production_jobs;
CREATE POLICY "Production jobs service role only"
ON public.production_jobs
FOR ALL
USING ((SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role')
WITH CHECK ((SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_production_jobs_status_created
ON public.production_jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_production_jobs_order_id
ON public.production_jobs (order_id);

DROP TRIGGER IF EXISTS update_production_jobs_updated_at ON public.production_jobs;
CREATE TRIGGER update_production_jobs_updated_at
BEFORE UPDATE ON public.production_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_jobs TO service_role;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_provider TEXT NOT NULL DEFAULT 'printful',
  ADD COLUMN IF NOT EXISTS fulfillment_order_id TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_last_error TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_routed_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_fulfillment_provider_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_fulfillment_provider_check
      CHECK (fulfillment_provider IN ('printful', 'onshore_manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_provider_status
ON public.orders (fulfillment_provider, fulfillment_status);
