"""Initialisation Sentry commune et nettoyage strict des données utilisateur."""

from __future__ import annotations

import copy
import hashlib
import os
import re
from collections.abc import Iterable
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import sentry_sdk

from src.config.settings import settings

_FILTERED = "[Filtered]"
_SENSITIVE_KEYS = {
    "access_token",
    "api_key",
    "apikey",
    "authorization",
    "code",
    "cookie",
    "cookies",
    "cv",
    "cv_data",
    "cv_text",
    "database_url",
    "dsn",
    "email",
    "headers",
    "ip",
    "ip_address",
    "job_description",
    "password",
    "pdf_url",
    "phone",
    "request_body",
    "redis_url",
    "resume",
    "secret",
    "signed_url",
    "supabase_service_role_key",
    "token",
    "user_id",
}
_EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
_CREDENTIAL_PATTERN = re.compile(
    r"(?i)\b(token|secret|password|api[_-]?key|code)=([^\s&]+)"
)
_BEARER_PATTERN = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/-]+={0,2}")
_UUID_PATTERN = re.compile(
    r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b"
)
_IPV4_PATTERN = re.compile(
    r"(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.])"
)


def _normalize_key(key: object) -> str:
    value = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", str(key))
    return value.lower().replace("-", "_")


def _is_sensitive_key(key: object) -> bool:
    normalized = _normalize_key(key)
    return normalized in _SENSITIVE_KEYS or normalized.endswith(
        (
            "_token",
            "_secret",
            "_password",
            "_api_key",
            "_email",
            "_phone",
            "_key",
        )
    )


def _sanitize_text(value: str) -> str:
    sanitized = _EMAIL_PATTERN.sub("[email-filtered]", value)
    sanitized = _BEARER_PATTERN.sub("Bearer [Filtered]", sanitized)
    sanitized = _CREDENTIAL_PATTERN.sub(lambda match: f"{match.group(1)}=[Filtered]", sanitized)
    sanitized = _UUID_PATTERN.sub("[id-filtered]", sanitized)
    sanitized = _IPV4_PATTERN.sub("[ip-filtered]", sanitized)
    if sanitized.startswith(("http://", "https://")):
        try:
            parsed = urlsplit(sanitized)
            sanitized = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))
        except ValueError:
            return _FILTERED
    return sanitized


def _sanitize_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): _FILTERED if _is_sensitive_key(key) else _sanitize_value(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_sanitize_value(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_sanitize_value(item) for item in value)
    if isinstance(value, str):
        return _sanitize_text(value)
    return value


def _pseudonymize(value: object) -> str:
    digest = hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:16]
    return f"anon-{digest}"


def scrub_sentry_event(
    event: dict[str, Any],
    hint: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Retire les secrets et le contenu métier avant tout envoi Sentry."""
    del hint
    scrubbed = copy.deepcopy(event)
    user = scrubbed.get("user")
    if isinstance(user, dict) and user.get("id"):
        scrubbed["user"] = {"id": _pseudonymize(user["id"])}
    elif "user" in scrubbed:
        scrubbed.pop("user", None)

    # Les champs libres et variables locales peuvent contenir un CV complet.
    scrubbed.pop("message", None)
    scrubbed.pop("logentry", None)
    scrubbed.pop("extra", None)

    request = scrubbed.get("request")
    if isinstance(request, dict):
        for key in ("data", "cookies", "headers", "query_string", "env"):
            request.pop(key, None)

    exception = scrubbed.get("exception")
    if isinstance(exception, dict):
        values = exception.get("values")
        if isinstance(values, list):
            for exception_value in values:
                if not isinstance(exception_value, dict):
                    continue
                exception_value.pop("value", None)
                stacktrace = exception_value.get("stacktrace")
                if not isinstance(stacktrace, dict):
                    continue
                frames = stacktrace.get("frames")
                if isinstance(frames, list):
                    for frame in frames:
                        if isinstance(frame, dict):
                            frame.pop("vars", None)

    breadcrumbs = scrubbed.get("breadcrumbs")
    if isinstance(breadcrumbs, dict) and isinstance(breadcrumbs.get("values"), list):
        breadcrumbs["values"] = [
            scrub_sentry_breadcrumb(item)
            for item in breadcrumbs["values"]
            if isinstance(item, dict)
        ]
    return _sanitize_value(scrubbed)


def scrub_sentry_breadcrumb(
    breadcrumb: dict[str, Any],
    hint: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Applique le même filtrage aux breadcrumbs réseau et applicatifs."""
    del hint
    scrubbed = copy.deepcopy(breadcrumb)
    scrubbed.pop("message", None)
    scrubbed.pop("data", None)
    return _sanitize_value(scrubbed)


def initialize_sentry(
    service: str,
    integrations: Iterable[Any] | None = None,
) -> bool:
    """Initialise Sentry de façon cohérente pour API, ARQ et Modal."""
    if not settings.sentry_dsn.startswith(("http://", "https://")):
        return False

    release = (
        os.getenv("RAILWAY_GIT_COMMIT_SHA")
        or os.getenv("VERCEL_GIT_COMMIT_SHA")
        or os.getenv("GIT_COMMIT_SHA")
    )
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        release=release,
        integrations=list(integrations or []),
        traces_sample_rate=0.1 if settings.environment == "production" else 0.3,
        profiles_sample_rate=0.0,
        send_default_pii=False,
        max_request_body_size="never",
        include_local_variables=False,
        before_send=scrub_sentry_event,
        before_send_transaction=scrub_sentry_event,
        before_breadcrumb=scrub_sentry_breadcrumb,
    )
    sentry_sdk.set_tag("service", service)
    sentry_sdk.set_tag("runtime", "python")
    return True
