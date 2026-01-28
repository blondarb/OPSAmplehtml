import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/diagnostic - Check database setup
export async function GET() {
  const supabase = await createClient()
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET',
    checks: {}
  }

  try {
    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    diagnostics.checks = {
      ...diagnostics.checks as object,
      auth: {
        status: user ? 'authenticated' : 'not authenticated',
        userId: user?.id?.substring(0, 8) + '...' || null,
        error: authError?.message || null
      }
    }

    // Check dot_phrases table
    const { error: tableError } = await supabase
      .from('dot_phrases')
      .select('id')
      .limit(1)

    const tableExists = !tableError || !tableError.message.includes('does not exist')
    diagnostics.checks = {
      ...diagnostics.checks as object,
      dot_phrases_table: {
        exists: tableExists,
        error: tableError?.message || null
      }
    }

    // Check if scope column exists (try a query with scope)
    if (tableExists) {
      const { error: scopeError } = await supabase
        .from('dot_phrases')
        .select('scope')
        .limit(1)

      diagnostics.checks = {
        ...diagnostics.checks as object,
        scope_column: {
          exists: !scopeError,
          error: scopeError?.message || null
        }
      }
    }

    // Check app_settings table for OpenAI key
    const { data: apiKeySetting, error: settingsError } = await supabase
      .from('app_settings')
      .select('key')
      .eq('key', 'openai_api_key')
      .single()

    diagnostics.checks = {
      ...diagnostics.checks as object,
      openai_key: {
        configured: !!apiKeySetting && !settingsError,
        error: settingsError?.message || null
      }
    }

    // Check appointments table
    const { data: aptData, error: aptError } = await supabase
      .from('appointments')
      .select('id')
      .limit(1)

    diagnostics.checks = {
      ...diagnostics.checks as object,
      appointments_table: {
        exists: !aptError || !aptError.message.includes('does not exist'),
        rowCount: aptData?.length ?? 0,
        error: aptError?.message || null,
        code: aptError?.code || null
      }
    }

    // Overall status
    const checks = diagnostics.checks as Record<string, { error?: string | null; configured?: boolean }>
    diagnostics.overall = {
      dot_phrases_ready: checks.dot_phrases_table && !checks.dot_phrases_table.error &&
                         checks.scope_column && !checks.scope_column.error,
      transcription_ready: checks.openai_key?.configured || !!process.env.OPENAI_API_KEY
    }

    return NextResponse.json(diagnostics)
  } catch (error: unknown) {
    return NextResponse.json({
      ...diagnostics,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
