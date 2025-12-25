-- Accounts + Designs schema additions

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by owner"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Profiles are insertable by owner"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

CREATE POLICY "Profiles are updatable by owner"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id);

CREATE TABLE IF NOT EXISTS public.designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  design_id TEXT NOT NULL,
  external_product_id TEXT,
  edm_template_id INTEGER,
  variant_id TEXT NOT NULL,
  preview_url TEXT NOT NULL,
  preview_url_angled TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT designs_source_check CHECK (source IN ('manual', 'purchase')),
  CONSTRAINT designs_user_design_unique UNIQUE (user_id, design_id)
);

ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designs are viewable by owner"
ON public.designs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Designs are insertable by owner"
ON public.designs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Designs are updatable by owner"
ON public.designs
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Designs are deletable by owner"
ON public.designs
FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_designs_user_id ON public.designs(user_id);
CREATE INDEX IF NOT EXISTS idx_designs_order_id ON public.designs(order_id);

CREATE POLICY "Orders viewable by owner"
ON public.orders
FOR SELECT
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_designs_updated_at ON public.designs;
CREATE TRIGGER update_designs_updated_at
BEFORE UPDATE ON public.designs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
