
-- Add personalization + first-call tracking to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS use_case text,
  ADD COLUMN IF NOT EXISTS first_call_acknowledged_at timestamptz;

-- Onboarding progress table
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  user_id uuid PRIMARY KEY,
  current_step int NOT NULL DEFAULT 1,
  completed_at timestamptz,
  choices jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own onboarding progress"
  ON public.onboarding_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own onboarding progress"
  ON public.onboarding_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own onboarding progress"
  ON public.onboarding_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at trigger
CREATE TRIGGER update_onboarding_progress_updated_at
  BEFORE UPDATE ON public.onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create row on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.onboarding_progress (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_onboarding ON auth.users;
CREATE TRIGGER on_auth_user_created_onboarding
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_onboarding();
