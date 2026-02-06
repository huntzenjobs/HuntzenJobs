/**
 * Security Alerts Webhook Endpoint
 * Receives security events from Supabase webhooks
 * Triggers Sentry alerts for critical/emergency events
 */

import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

interface SecurityEvent {
  id: string
  event_type: string
  severity: 'info' | 'warning' | 'critical' | 'emergency'
  user_id?: string
  session_id?: string
  ip_address?: string
  user_agent?: string
  event_data: Record<string, any>
  created_at: string
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: SecurityEvent
  old_record?: SecurityEvent
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret (optional but recommended)
    const webhookSecret = request.headers.get('x-supabase-signature')
    const expectedSecret = process.env.SUPABASE_WEBHOOK_SECRET

    if (expectedSecret && webhookSecret !== expectedSecret) {
      console.warn('[Security Alerts] Invalid webhook signature')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse webhook payload
    const payload: WebhookPayload = await request.json()

    if (payload.type !== 'INSERT' || payload.table !== 'security_events') {
      return NextResponse.json({ error: 'Invalid webhook type' }, { status: 400 })
    }

    const event = payload.record

    // Only process critical and emergency events
    if (event.severity === 'critical' || event.severity === 'emergency') {
      console.log(`[Security Alerts] ${event.severity.toUpperCase()} event:`, {
        type: event.event_type,
        user_id: event.user_id,
        ip: event.ip_address,
      })

      // Send to Sentry
      Sentry.captureMessage(`Security Alert: ${event.event_type}`, {
        level: event.severity === 'emergency' ? 'fatal' : 'error',
        tags: {
          event_type: event.event_type,
          severity: event.severity,
          security: true,
        },
        contexts: {
          security_event: {
            event_type: event.event_type,
            user_id: event.user_id || 'anonymous',
            ip_address: event.ip_address || 'unknown',
            session_id: event.session_id || 'none',
          },
        },
        extra: {
          event_data: event.event_data,
          created_at: event.created_at,
        },
      })

      // TODO: Add additional alerting (email, Slack, etc.)
      // Example: await sendSlackAlert(event)
      // Example: await sendEmailAlert(event)
    }

    return NextResponse.json({
      success: true,
      processed: event.id,
      severity: event.severity,
    })
  } catch (error) {
    console.error('[Security Alerts] Error processing webhook:', error)
    Sentry.captureException(error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'security-alerts-webhook',
    timestamp: new Date().toISOString(),
  })
}
