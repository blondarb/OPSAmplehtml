import { getUser } from '@/lib/cognito/server'
import { NextResponse } from 'next/server'
import { from } from '@/lib/db-query'

// GET /api/diagnostic - Check database setup
export async function GET() {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    database: 'AWS RDS (node-postgres)',
    checks: {}
  }

  try {
    // Check auth
    const user = await getUser()
    diagnostics.checks = {
      ...diagnostics.checks as object,
      auth: {
        status: user ? 'authenticated' : 'not authenticated',
        userId: user?.id?.substring(0, 8) + '...' || null,
        error: null
      }
    }

    // Check dot_phrases table
    const { error: tableError } = await from('dot_phrases')
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
      const { error: scopeError } = await from('dot_phrases')
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

    // Check AWS Bedrock configuration (used for all non-Realtime AI calls)
    diagnostics.checks = {
      ...diagnostics.checks as object,
      aws_bedrock: {
        region: process.env.AWS_REGION || 'us-east-2 (default)',
        access_key_configured: !!process.env.AWS_ACCESS_KEY_ID,
        secret_key_configured: !!process.env.AWS_SECRET_ACCESS_KEY,
      }
    }

    // Check OpenAI key (only needed for Realtime API features)
    diagnostics.checks = {
      ...diagnostics.checks as object,
      openai_key_realtime: {
        configured: !!process.env.OPENAI_API_KEY,
        note: 'Only needed for Realtime API features (voice historian, intake voice)',
      }
    }

    // Check appointments table
    const { data: aptData, error: aptError } = await from('appointments')
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
    const checks = diagnostics.checks as Record<string, { error?: string | null; configured?: boolean; access_key_configured?: boolean }>
    diagnostics.overall = {
      dot_phrases_ready: checks.dot_phrases_table && !checks.dot_phrases_table.error &&
                         checks.scope_column && !checks.scope_column.error,
      ai_ready: !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY,
      realtime_ready: !!process.env.OPENAI_API_KEY,
      transcription_ready: !!process.env.DEEPGRAM_API_KEY,
    }

    return NextResponse.json(diagnostics)
  } catch (error: unknown) {
    return NextResponse.json({
      ...diagnostics,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
