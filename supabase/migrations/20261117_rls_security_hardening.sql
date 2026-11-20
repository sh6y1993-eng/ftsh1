-- Fatteshha (فتّشها) Supabase RLS Security Hardening Migration
-- Date: 2026-11-17
-- Purpose: Eliminate unauthenticated public REST reads/writes/scans on public.profiles
--          and restrict sensitive mutations to service_role (Express server) or verified owner auth.uid().

ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

-- Remove overly permissive legacy policies if present
DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.profiles;
DROP POLICY IF EXISTS "Enable update for all users" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Allow anon read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow anon write profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Revoke anonymous / unauthenticated table grants completely
REVOKE ALL ON TABLE public.profiles FROM anon;

-- Allow authenticated Supabase Auth users to read ONLY their own profile row
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = id::text);

-- Allow authenticated Supabase Auth users to update ONLY their own safe non-competitive identity fields
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = id::text)
  WITH CHECK (auth.uid()::text = id::text);

-- Note: Registration, competitive progression, coins, XP, account deletion (DELETE),
-- and leaderboard aggregation are performed server-side via the Express backend using SUPABASE_SERVICE_ROLE_KEY.
