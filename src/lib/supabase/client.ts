import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // This is only called at runtime via dynamic import, so env vars are available
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
