// Admin API response types

export interface AdminProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  status: "active" | "suspended" | "deleted";
  is_admin: boolean;
  is_banned: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
}

export interface AdminPlanSummary {
  name: string;
  display_name: string;
  price_monthly: number;
}

export interface AdminPlan extends AdminPlanSummary {
  id: string;
  description: string | null;
  price_yearly: number | null;
  limits: Record<string, number>;
  features: string[] | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  stripe_prices?: Array<{
    billing_period: string;
    stripe_price_id: string;
    is_active: boolean;
  }>;
}

export interface AdminSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status:
    | "active"
    | "canceled"
    | "past_due"
    | "paused"
    | "trialing"
    | "incomplete";
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  stripe_price_id: string | null;
  trial_start: string | null;
  trial_end: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  subscription_plans: AdminPlanSummary | null;
}

export interface SubscriptionHistoryEntry {
  id: string;
  user_id: string;
  subscription_id: string;
  plan_id: string;
  action_type:
    | "created"
    | "updated"
    | "cancelled"
    | "deleted"
    | "upgraded"
    | "downgraded"
    | "trialing"
    | "renewed";
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  triggered_by: string;
  stripe_event_id: string | null;
  notes: string | null;
  created_at: string;
  subscription_plans: AdminPlanSummary;
}

export interface UsageQuotaEntry {
  id: string;
  user_id: string;
  quota_date: string;
  cv_analyses_used: number;
  coach_seconds_used: number;
  job_searches_used: number;
  last_reset_at: string;
  created_at: string;
  updated_at: string;
}

export interface SecurityEvent {
  id: string;
  event_type: string;
  severity: "info" | "warning" | "critical" | "emergency";
  created_at: string;
  ip_address: string | null;
  user_id: string | null;
  event_data: Record<string, unknown>;
  profiles?: { email: string } | null;
}

export interface AdminUserDetail {
  profile: AdminProfile;
  subscription: AdminSubscription | null;
  subscription_history: SubscriptionHistoryEntry[];
  usage_30d: UsageQuotaEntry[];
  security_events: SecurityEvent[];
  last_login_at: string | null;
  stripe_customer_id: string | null;
  total_paid: number;
}

export interface AdminUserListItem extends AdminProfile {
  plan: (AdminSubscription & { subscription_plans: AdminPlanSummary }) | null;
  usage_30d:
    | {
        cv_analyses: number;
        assistant_messages: number;
        job_searches: number;
        job_views: number;
      }
    | Record<string, never>;
  total_paid: number;
}

export interface AdminSearchUser {
  id: string;
  email: string;
  full_name: string | null;
  status: "active" | "suspended" | "deleted";
  is_admin: boolean;
  created_at: string;
}

export interface PlatformEvent {
  id: string;
  created_at: string;
  event_name: string;
  event_label: string | null;
  category: string;
  feature: string | null;
  severity: "info" | "success" | "warning" | "error";
  user_id: string | null;
  properties: Record<string, unknown>;
  error_code: string | null;
  duration_ms: number | null;
  source: "backend" | "frontend";
  email: string | null;
}

export interface WebhookFailure {
  id: string;
  stripe_event_id: string;
  event_type: string;
  error_message: string;
  error_traceback: string | null;
  retry_count: number;
  first_attempt_at: string;
  last_attempt_at: string;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentEntry {
  id: string;
  plan_name: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  receipt_url: string | null;
}

export interface FeatureOverrideEntry {
  name: string;
  has_override: boolean;
  override_enabled: boolean | null;
}

export interface UserEvent {
  id: string;
  event_name: string;
  event_label: string | null;
  category: string;
  feature: string | null;
  severity: string | null;
  created_at: string;
  properties: Record<string, unknown>;
}

export interface BannedIPEntry {
  ip: string;
  reason: string | null;
  ttl_seconds: number;
}

export interface BlacklistedEmailEntry {
  email: string;
  reason: string | null;
  ttl_seconds: number;
}

/** Extra data passed with admin actions */
export type AdminActionExtra =
  | string
  | number
  | boolean
  | Record<string, unknown>;
