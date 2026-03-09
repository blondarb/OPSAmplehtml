-- Allow authenticated users to insert their own profile row
-- Needed for auto-profile creation when the signup trigger didn't fire
-- (e.g., users created before the trigger migration was applied)
CREATE POLICY "Users can insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
