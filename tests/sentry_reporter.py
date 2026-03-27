"""
Sentry Reporter — Plugin pytest pour debuguer avec les vrais events prod.

Utilisation :
    pytest tests/integration/ -p tests.sentry_reporter -v

Ou via le script :
    ./scripts/run_tests_with_sentry.sh tests/integration/test_cv_pdf_prod.py

Ce plugin :
1. Enregistre l'heure de début avant les tests
2. Après les tests, interroge l'API Sentry pour tous les events générés
3. Affiche les stack traces complètes pour chaque issue déclenchée pendant le run
"""

import os
import time
import httpx
import pytest
from datetime import datetime, timezone
from typing import Optional

# ── Config Sentry ────────────────────────────────────────────────────────────
SENTRY_AUTH_TOKEN = os.getenv("SENTRY_AUTH_TOKEN", "")
SENTRY_ORG = os.getenv("SENTRY_ORG", "huntzen")
SENTRY_PROJECT = os.getenv("SENTRY_PROJECT", "javascript-nextjs")
SENTRY_BASE_URL = os.getenv("SENTRY_BASE_URL", "https://de.sentry.io")  # instance EU

# ── État global du run ───────────────────────────────────────────────────────
_run_start_epoch: Optional[float] = None
_run_start_iso: Optional[str] = None
_failed_tests: list = []


# ── Hook pytest : début de session ──────────────────────────────────────────

def pytest_sessionstart(session):
    global _run_start_epoch, _run_start_iso
    _run_start_epoch = time.time()
    _run_start_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"\n[Sentry] Monitoring démarré à {_run_start_iso}")
    if not SENTRY_AUTH_TOKEN:
        print("[Sentry] ⚠️  SENTRY_AUTH_TOKEN non configuré — les rapports Sentry seront désactivés")
        print("[Sentry]     Configurez : export SENTRY_AUTH_TOKEN=sntrys_...")


# ── Hook pytest : résultat de chaque test ────────────────────────────────────

def pytest_runtest_logreport(report):
    if report.when == "call" and report.failed:
        _failed_tests.append({
            "name": report.nodeid,
            "duration": getattr(report, "duration", 0),
        })


# ── Hook pytest : fin de session ─────────────────────────────────────────────

def pytest_sessionfinish(session, exitstatus):
    if not SENTRY_AUTH_TOKEN:
        return

    run_end_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    elapsed = time.time() - (_run_start_epoch or time.time())

    print(f"\n{'='*70}")
    print(f"[Sentry] Récupération des events générés pendant le test run...")
    print(f"[Sentry] Fenêtre : {_run_start_iso} → {run_end_iso} ({elapsed:.0f}s)")
    print(f"{'='*70}")

    try:
        issues = _fetch_issues_since(_run_start_iso)
        _print_sentry_report(issues)
    except Exception as e:
        print(f"[Sentry] ❌ Erreur lors de la récupération des issues : {e}")


# ── API Sentry : récupérer les issues récentes ────────────────────────────────

def _fetch_issues_since(since_iso: str) -> list:
    """Interroge l'API Sentry pour les issues mises à jour depuis 'since_iso'."""
    headers = {
        "Authorization": f"Bearer {SENTRY_AUTH_TOKEN}",
        "Content-Type": "application/json",
    }

    url = f"{SENTRY_BASE_URL}/api/0/projects/{SENTRY_ORG}/{SENTRY_PROJECT}/issues/"
    params = {
        "query": f"lastSeen:>{since_iso}",
        "sort": "date",
        "limit": 25,
    }

    with httpx.Client(timeout=15.0) as client:
        resp = client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        return resp.json()


def _fetch_latest_event(issue_id: str) -> Optional[dict]:
    """Récupère le dernier event d'une issue (avec stack trace complète)."""
    headers = {"Authorization": f"Bearer {SENTRY_AUTH_TOKEN}"}
    url = f"{SENTRY_BASE_URL}/api/0/issues/{issue_id}/events/latest/"

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, headers=headers)
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return None


# ── Formatage du rapport ──────────────────────────────────────────────────────

def _print_sentry_report(issues: list):
    if not issues:
        print("[Sentry] ✅ Aucune nouvelle issue détectée pendant ce run")
        return

    print(f"[Sentry] 🔴 {len(issues)} issue(s) détectée(s) pendant le run :\n")

    for i, issue in enumerate(issues, 1):
        issue_id = issue.get("id", "?")
        title = issue.get("title", "Sans titre")
        culprit = issue.get("culprit", "")
        count = issue.get("count", 0)
        last_seen = issue.get("lastSeen", "?")
        level = issue.get("level", "error").upper()
        permalink = issue.get("permalink", "")

        level_icon = {"ERROR": "🔴", "WARNING": "🟡", "INFO": "🔵", "FATAL": "💀"}.get(level, "🔴")

        print(f"  {i}. {level_icon} [{level}] {title}")
        print(f"     Culprit  : {culprit}")
        print(f"     Dernière : {last_seen}  |  Events : {count}")
        if permalink:
            print(f"     Sentry   : {permalink}")

        # Récupérer la stack trace complète
        event = _fetch_latest_event(issue_id)
        if event:
            _print_stack_trace(event)

        print()

    # Résumé des tests échoués corrélés
    if _failed_tests:
        print(f"{'─'*70}")
        print(f"[Sentry] Tests échoués ({len(_failed_tests)}) :")
        for t in _failed_tests:
            print(f"  ✗ {t['name']}  ({t['duration']:.2f}s)")


def _print_stack_trace(event: dict):
    """Extrait et affiche la stack trace d'un event Sentry."""
    exception = event.get("exception", {})
    values = exception.get("values", [])

    for exc in values:
        exc_type = exc.get("type", "Exception")
        exc_value = exc.get("value", "")
        print(f"\n     Exception : {exc_type}: {exc_value}")

        stacktrace = exc.get("stacktrace", {})
        frames = stacktrace.get("frames", [])

        # Afficher les 5 derniers frames (les plus proches de l'erreur)
        relevant_frames = [f for f in frames if f.get("in_app", False)]
        if not relevant_frames:
            relevant_frames = frames[-5:]
        else:
            relevant_frames = relevant_frames[-5:]

        if relevant_frames:
            print("     Stack trace (app frames) :")
            for frame in relevant_frames:
                filename = frame.get("filename", "?")
                lineno = frame.get("lineno", "?")
                func = frame.get("function", "?")
                context = frame.get("context_line", "").strip()
                print(f"       → {filename}:{lineno} in {func}()")
                if context:
                    print(f"           {context}")
