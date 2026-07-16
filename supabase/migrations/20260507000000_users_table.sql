-- public.users table
CREATE TABLE public.users (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text UNIQUE NOT NULL,
  display_name text NOT NULL,
  is_admin     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Row-Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Security definer function avoids recursive RLS when checking is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
  );
$$;

CREATE POLICY "Users can read own row"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all users"
  ON public.users FOR SELECT
  USING (public.is_admin());

-- Trigger: mirror auth.users inserts into public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (NEW.id, NEW.email, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
