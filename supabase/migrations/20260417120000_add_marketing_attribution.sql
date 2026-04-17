ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS marketing_attribution JSONB;
