/**
 * Security Alerts Webhook Endpoint
 * Receives security events from Supabase webhooks
 * Triggers Sentry alerts for critical/emergency events
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { timingSafeEqual } from "node:crypto";

interface SecurityEvent {
  id: string;
  event_type: string;
  severity: "info" | "warning" | "critical" | "emergency";
  user_id?: string;
  session_id?: string;
  ip_address?: string;
  user_agent?: string;
  event_data: Record<string, unknown>;
  created_at: string;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: SecurityEvent;
  old_record?: SecurityEvent;
}

export async function POST(request: NextRequest) {
  try {
    // Le webhook doit rester fermé tant que le secret partagé n'est pas posé.
    const webhookSecret = request.headers.get("x-supabase-signature");
    const expectedSecret = process.env.SUPABASE_WEBHOOK_SECRET;

    if (!expectedSecret) {
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 503 },
      );
    }

    const received = Buffer.from(webhookSecret || "");
    const expected = Buffer.from(expectedSecret);
    const signatureIsValid =
      received.length === expected.length && timingSafeEqual(received, expected);

    if (!signatureIsValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse webhook payload
    const payload: WebhookPayload = await request.json();

    if (payload.type !== "INSERT" || payload.table !== "security_events") {
      return NextResponse.json(
        { error: "Invalid webhook type" },
        { status: 400 },
      );
    }

    const event = payload.record;

    // Only process critical and emergency events
    if (event.severity === "critical" || event.severity === "emergency") {
      // Sentry ne reçoit que les dimensions nécessaires au routage de l'alerte.
      Sentry.captureMessage(`Security Alert: ${event.event_type}`, {
        level: event.severity === "emergency" ? "fatal" : "error",
        tags: {
          event_type: event.event_type,
          severity: event.severity,
          security: true,
        },
        extra: {
          created_at: event.created_at,
        },
      });

      // TODO: Add additional alerting (email, Slack, etc.)
      // Example: await sendSlackAlert(event)
      // Example: await sendEmailAlert(event)
    }

    return NextResponse.json({
      success: true,
      processed: event.id,
      severity: event.severity,
    });
  } catch (error) {
    console.error("[Security Alerts] Error processing webhook:", error);
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "security-alerts-webhook",
    timestamp: new Date().toISOString(),
  });
}
