ALTER TABLE public.orders
  ADD COLUMN shipping_method_id TEXT,
  ADD COLUMN shipping_method_label TEXT,
  ADD COLUMN shipping_method_min_days INTEGER,
  ADD COLUMN shipping_method_max_days INTEGER,
  ADD COLUMN shipping_method_currency TEXT,
  ADD COLUMN discount_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN promotion_code TEXT,
  ADD COLUMN promotion_code_id TEXT,
  ADD COLUMN coupon_id TEXT;
