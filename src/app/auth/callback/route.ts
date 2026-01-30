import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTenantServer } from '@/lib/tenant'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirectTo = searchParams.get('redirectTo') || '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Seed demo data for new user if they don't have any patients yet
      const tenant = getTenantServer()
      const { count } = await supabase
        .from('patients')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant)

      if (count === 0) {
        await supabase.rpc('seed_demo_data', { user_uuid: data.user.id })
      }

      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=Could not authenticate user`)
}
