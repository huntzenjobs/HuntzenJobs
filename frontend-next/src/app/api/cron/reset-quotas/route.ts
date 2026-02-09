/**
 * Vercel Cron endpoint for daily quota reset
 *
 * Runs daily at midnight UTC (0 0 * * *)
 * Calls Supabase RPC function to clean up old quota records
 *
 * Fallback pour Supabase Free tier (sans pg_cron extension)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Vercel Cron secret for security
const CRON_SECRET = process.env.CRON_SECRET || ''

export async function GET(request: Request) {
  try {
    // Security: Verify cron secret (Vercel sets this automatically)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      console.error('[Cron] Unauthorized access attempt')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[Cron] Starting daily quota reset...')

    // Initialize Supabase client with service role key (bypass RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Call the RPC function to reset quotas
    const { data, error } = await supabase.rpc('reset_quotas_rpc')

    if (error) {
      console.error('[Cron] Failed to reset quotas:', error)
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      )
    }

    console.log('[Cron] Quota reset completed successfully:', data)

    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[Cron] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
