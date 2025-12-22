-- Lock down orders table: remove public access policies.
-- Service role access via edge functions bypasses RLS.
DROP POLICY IF EXISTS "Allow public order creation" ON public.orders;
DROP POLICY IF EXISTS "Users can view orders by email" ON public.orders;
DROP POLICY IF EXISTS "Allow order updates" ON public.orders;
