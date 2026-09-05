import type { Breadcrumb, Event } from "@sentry/nextjs";

const FILTERED = "[Filtered]";
const SENSITIVE_KEYS = new Set([
  "access_token",
  "api_key",
  "authorization",
  "cookie",
  "cookies",
  "cv",
  "cv_text",
  "database_url",
  "dsn",
  "email",
  "headers",
  "ip",
  "ip_address",
  "job_description",
  "password",
  "phone",
  "redis_url",
  "resume",
  "secret",
  "session",
  "session_id",
  "signed_url",
  "supabase_service_role_key",
  "token",
  "user",
  "user_id",
  "userid",
]);
const REPLAY_FREE_FORM_KEYS = new Set([
  "arguments",
  "body",
  "input",
  "message",
  "request_body",
  "response_body",
  "text",
  "value",
]);
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(api[_-]?key|authorization|password|secret|token)\s*[=:]\s*[^\s,;&]+/gi;
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const IPV4_PATTERN =
  /(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.])/g;

function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll("-", "_")
    .toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SENSITIVE_KEYS.has(normalized) ||
    /_(token|secret|password|api_key|email|phone|key)$/.test(normalized)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripUrlQuery(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return rawUrl.replace(/[?#].*$/, "");
  }
}

function sanitizeText(value: string): string {
  return value
    .replace(URL_PATTERN, (url) => stripUrlQuery(url))
    .replace(EMAIL_PATTERN, FILTERED)
    .replace(BEARER_PATTERN, FILTERED)
    .replace(SECRET_ASSIGNMENT_PATTERN, (_match, key: string) =>
      `${key}=${FILTERED}`,
    )
    .replace(UUID_PATTERN, "[id-filtered]")
    .replace(IPV4_PATTERN, "[ip-filtered]");
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (key && isSensitiveKey(key)) return FILTERED;
  if (typeof value === "string") {
    return key === "url" ? stripUrlQuery(value) : sanitizeText(value);
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([nestedKey, nestedValue]) => [
      nestedKey,
      sanitizeValue(nestedValue, nestedKey),
    ]),
  );
}

function sanitizeReplayValue(value: unknown, key?: string): unknown {
  const normalizedKey = key ? normalizeKey(key) : undefined;
  if (
    normalizedKey &&
    (REPLAY_FREE_FORM_KEYS.has(normalizedKey) || isSensitiveKey(normalizedKey))
  ) {
    return FILTERED;
  }
  if (typeof value === "string") {
    return normalizedKey === "url" || normalizedKey === "href"
      ? stripUrlQuery(value)
      : sanitizeText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeReplayValue(item));
  }
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([nestedKey, nestedValue]) => [
      nestedKey,
      sanitizeReplayValue(nestedValue, nestedKey),
    ]),
  );
}

export function scrubSentryEvent<T extends Event>(event: T): T {
  const scrubbed = sanitizeValue(event) as T;
  const record = scrubbed as Event & Record<string, unknown>;

  delete record.user;
  delete record.message;
  delete record.logentry;
  delete record.extra;
  if (scrubbed.request) {
    delete scrubbed.request.data;
    delete scrubbed.request.cookies;
    delete scrubbed.request.headers;
    delete scrubbed.request.query_string;
    delete scrubbed.request.env;
  }

  const exception = record.exception;
  if (isRecord(exception) && Array.isArray(exception.values)) {
    for (const exceptionValue of exception.values) {
      if (!isRecord(exceptionValue)) continue;
      delete exceptionValue.value;
      const stacktrace = exceptionValue.stacktrace;
      if (!isRecord(stacktrace) || !Array.isArray(stacktrace.frames)) continue;
      for (const frame of stacktrace.frames) {
        if (isRecord(frame)) delete frame.vars;
      }
    }
  }

  if (Array.isArray(record.breadcrumbs)) {
    record.breadcrumbs = record.breadcrumbs
      .filter(isRecord)
      .map((breadcrumb) =>
        scrubSentryBreadcrumb(breadcrumb as Breadcrumb) ?? {},
      );
  }

  return scrubbed;
}

export function scrubSentryBreadcrumb(
  breadcrumb: Breadcrumb,
): Breadcrumb | null {
  const scrubbed = sanitizeValue(breadcrumb) as Breadcrumb;
  delete scrubbed.message;
  delete scrubbed.data;
  return scrubbed;
}

export function scrubSentryReplayEvent<T>(event: T): T {
  return sanitizeReplayValue(event) as T;
}
