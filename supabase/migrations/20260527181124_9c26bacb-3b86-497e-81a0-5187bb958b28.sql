
-- Add the new enum value (must be in its own statement, before any function uses it)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
