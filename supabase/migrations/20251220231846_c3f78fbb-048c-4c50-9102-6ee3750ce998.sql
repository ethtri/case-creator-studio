-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Users can view orders by email" ON orders;

-- Create a more restrictive SELECT policy
-- Orders can only be viewed via edge functions (service role) or if matching stripe_session_id is provided via RPC
-- This policy restricts direct table access - order lookups should go through the verify-payment edge function
CREATE POLICY "Orders viewable via service role only"
ON orders FOR SELECT
USING (
  -- Allow access only when called with service role (edge functions)
  -- Regular anon/authenticated users cannot directly query orders
  (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- Also fix the UPDATE policy which has the same issue
DROP POLICY IF EXISTS "Allow order updates" ON orders;

CREATE POLICY "Orders updatable via service role only"
ON orders FOR UPDATE
USING (
  (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);