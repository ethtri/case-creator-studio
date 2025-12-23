ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS printful_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS printful_last_error TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS printful_last_attempt_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS printful_next_attempt_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS printful_refund_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_printful_retry
  ON public.orders (printful_status, printful_next_attempt_at);
