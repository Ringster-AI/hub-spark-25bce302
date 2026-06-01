
-- =========================================================================
-- 1. Extend subscription_plans with mobile device limit
-- =========================================================================
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS max_mobile_devices integer NOT NULL DEFAULT 1;

-- Defaults per plan (NULL = unlimited not used; we use a high number for unlimited)
UPDATE public.subscription_plans SET max_mobile_devices = 1  WHERE name ILIKE 'Free%';
UPDATE public.subscription_plans SET max_mobile_devices = 2  WHERE name ILIKE 'Receptionist%';
UPDATE public.subscription_plans SET max_mobile_devices = 3  WHERE name ILIKE 'Starter%';
UPDATE public.subscription_plans SET max_mobile_devices = 5  WHERE name ILIKE 'Growth%';
UPDATE public.subscription_plans SET max_mobile_devices = 10 WHERE name ILIKE 'Professional%';
UPDATE public.subscription_plans SET max_mobile_devices = 99 WHERE name ILIKE 'Enterprise%';
UPDATE public.subscription_plans SET max_mobile_devices = 3  WHERE name ILIKE 'Pay%';
UPDATE public.subscription_plans SET max_mobile_devices = 5  WHERE name ILIKE 'Custom%';

-- Receptionist gets 1 extra team seat (was 0)
UPDATE public.subscription_plans SET max_team_members = 1 WHERE name ILIKE 'Receptionist%';

-- =========================================================================
-- 2. active_calls
-- =========================================================================
CREATE TABLE public.active_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent_id uuid,
  vapi_call_id text UNIQUE,
  caller_number text,
  caller_name text,
  status text NOT NULL DEFAULT 'ringing',
  stream_url text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT active_calls_status_check CHECK (status IN ('ringing','in-progress','transferring','ended','failed'))
);
CREATE INDEX idx_active_calls_user ON public.active_calls(user_id, status);
CREATE INDEX idx_active_calls_started ON public.active_calls(started_at DESC);

GRANT SELECT ON public.active_calls TO authenticated;
GRANT ALL ON public.active_calls TO service_role;

ALTER TABLE public.active_calls ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 3. call_events (append-only stream for live transcript / status)
-- =========================================================================
CREATE TABLE public.call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  active_call_id uuid NOT NULL REFERENCES public.active_calls(id) ON DELETE CASCADE,
  call_log_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_call_events_call ON public.call_events(active_call_id, created_at);

GRANT SELECT ON public.call_events TO authenticated;
GRANT ALL ON public.call_events TO service_role;

ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 4. push_devices
-- =========================================================================
CREATE TABLE public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_token text NOT NULL,
  platform text NOT NULL,
  app_version text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_devices_platform_check CHECK (platform IN ('ios','android','expo','web')),
  CONSTRAINT push_devices_unique_token UNIQUE (device_token)
);
CREATE INDEX idx_push_devices_user ON public.push_devices(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_devices TO authenticated;
GRANT ALL ON public.push_devices TO service_role;

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 5. team_members
-- =========================================================================
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  member_user_id uuid,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer',
  can_listen boolean NOT NULL DEFAULT false,
  can_transfer boolean NOT NULL DEFAULT false,
  receives_notifications boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending',
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_members_role_check CHECK (role IN ('admin','listener','transfer_only','viewer')),
  CONSTRAINT team_members_status_check CHECK (status IN ('pending','active','revoked')),
  CONSTRAINT team_members_unique_owner_email UNIQUE (owner_user_id, email)
);
CREATE INDEX idx_team_members_owner ON public.team_members(owner_user_id, status);
CREATE INDEX idx_team_members_member ON public.team_members(member_user_id) WHERE member_user_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 6. team_invites
-- =========================================================================
CREATE TABLE public.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_team_invites_owner ON public.team_invites(owner_user_id);

GRANT SELECT, DELETE ON public.team_invites TO authenticated;
GRANT ALL ON public.team_invites TO service_role;

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 7. Security-definer helper: does member have access to an owner's data?
-- =========================================================================
CREATE OR REPLACE FUNCTION public.team_member_has_access(_owner uuid, _member uuid, _cap text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE owner_user_id = _owner
      AND member_user_id = _member
      AND status = 'active'
      AND (
        _cap IS NULL
        OR (_cap = 'listen' AND can_listen = true)
        OR (_cap = 'transfer' AND can_transfer = true)
        OR (_cap = 'notify' AND receives_notifications = true)
      )
  );
$$;

-- =========================================================================
-- 8. RLS Policies
-- =========================================================================

-- active_calls: owner OR active team member
CREATE POLICY "Owners view their active calls"
  ON public.active_calls FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.team_member_has_access(user_id, auth.uid()));

-- call_events: same scope via parent active_call
CREATE POLICY "Owners view their call events"
  ON public.call_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.active_calls ac
    WHERE ac.id = active_call_id
      AND (auth.uid() = ac.user_id OR public.team_member_has_access(ac.user_id, auth.uid()))
  ));

-- push_devices: user manages their own
CREATE POLICY "Users view their devices"
  ON public.push_devices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert their devices"
  ON public.push_devices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update their devices"
  ON public.push_devices FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete their devices"
  ON public.push_devices FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- team_members: owner manages; member can view their own row
CREATE POLICY "Owners manage their team members"
  ON public.team_members FOR ALL TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Members view their own membership"
  ON public.team_members FOR SELECT TO authenticated
  USING (auth.uid() = member_user_id);

-- team_invites: owner only (token-based acceptance happens via edge function)
CREATE POLICY "Owners view their invites"
  ON public.team_invites FOR SELECT TO authenticated USING (auth.uid() = owner_user_id);
CREATE POLICY "Owners delete their invites"
  ON public.team_invites FOR DELETE TO authenticated USING (auth.uid() = owner_user_id);

-- =========================================================================
-- 9. updated_at triggers
-- =========================================================================
CREATE TRIGGER trg_active_calls_updated
  BEFORE UPDATE ON public.active_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_team_members_updated
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 10. Realtime
-- =========================================================================
ALTER TABLE public.active_calls REPLICA IDENTITY FULL;
ALTER TABLE public.call_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_events;
