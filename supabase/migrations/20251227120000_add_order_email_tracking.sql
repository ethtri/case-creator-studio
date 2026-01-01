ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_number TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_url TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_carrier TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS public.order_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.order_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Order notifications service role only"
ON public.order_notifications
FOR ALL
USING (
  (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
)
WITH CHECK (
  (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_notifications_unique
  ON public.order_notifications(order_id, event_type);

CREATE INDEX IF NOT EXISTS idx_order_notifications_status
  ON public.order_notifications(status, created_at);

DROP TRIGGER IF EXISTS update_order_notifications_updated_at ON public.order_notifications;
CREATE TRIGGER update_order_notifications_updated_at
BEFORE UPDATE ON public.order_notifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
