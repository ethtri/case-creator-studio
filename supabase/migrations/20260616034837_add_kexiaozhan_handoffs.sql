CREATE TABLE public.kexiaozhan_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  out_trade_no TEXT NOT NULL UNIQUE,
  order_no TEXT,
  machine_sn TEXT NOT NULL,
  nonce TEXT NOT NULL,
  amount TEXT NOT NULL,
  currency TEXT NOT NULL,
  goods_name TEXT NOT NULL,
  sign TEXT NOT NULL,
  signed_payload JSONB NOT NULL,
  handoff_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  customer_email TEXT,
  snapcase_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  notify_request JSONB,
  notify_response JSONB,
  payment_notified_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT kexiaozhan_handoffs_status_check CHECK (
    status IN (
      'received',
      'checkout_created',
      'paid',
      'vendor_notified',
      'vendor_notify_failed',
      'expired',
      'failed'
    )
  )
);

CREATE UNIQUE INDEX idx_kexiaozhan_handoffs_machine_nonce
ON public.kexiaozhan_handoffs (machine_sn, nonce);

CREATE INDEX idx_kexiaozhan_handoffs_status
ON public.kexiaozhan_handoffs (status, created_at);

CREATE INDEX idx_kexiaozhan_handoffs_snapcase_order
ON public.kexiaozhan_handoffs (snapcase_order_id);

ALTER TABLE public.kexiaozhan_handoffs ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_kexiaozhan_handoffs_updated_at
BEFORE UPDATE ON public.kexiaozhan_handoffs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
