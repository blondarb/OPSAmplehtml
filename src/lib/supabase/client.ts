import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // During build time, env vars may not be available
  // Return a dummy client that will be replaced at runtime
  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a placeholder - this only happens during static generation
    // At runtime, the real env vars will be available
    // Use a valid-looking Supabase URL format to pass validation
    return createBrowserClient(
      'https://xxxxxxxxxxxxxxxxxxxx.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDAwMDAwMDAsImV4cCI6MTk1NjAwMDAwMH0.placeholder'
    )
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
