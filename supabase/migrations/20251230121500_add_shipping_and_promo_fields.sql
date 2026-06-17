ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_method_id TEXT,
  ADD COLUMN IF NOT EXISTS shipping_method_label TEXT,
  ADD COLUMN IF NOT EXISTS shipping_method_min_days INTEGER,
  ADD COLUMN IF NOT EXISTS shipping_method_max_days INTEGER,
  ADD COLUMN IF NOT EXISTS shipping_method_currency TEXT,
  ADD COLUMN IF NOT EXISTS discount_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promotion_code TEXT,
  ADD COLUMN IF NOT EXISTS promotion_code_id TEXT,
  ADD COLUMN IF NOT EXISTS coupon_id TEXT;
