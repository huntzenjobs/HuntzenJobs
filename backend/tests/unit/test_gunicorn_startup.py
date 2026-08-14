"""Contrat du démarrage Gunicorn utilisé par les déploiements backend."""

from __future__ import annotations

import os
import shlex
import subprocess
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]


def test_startup_spreads_worker_recycling_beyond_a_load_probe(tmp_path: Path) -> None:
    """Le recyclage ne doit pas regrouper les workers pendant un test de charge court."""
    fake_gunicorn = tmp_path / "gunicorn"
    fake_gunicorn.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\"\n", encoding="utf-8")
    fake_gunicorn.chmod(0o755)

    environment = os.environ.copy()
    environment.update(
        {
            "PATH": f"{tmp_path}{os.pathsep}{environment['PATH']}",
            "PORT": "8080",
            "WORKERS": "2",
        }
    )
    result = subprocess.run(
        ["sh", str(BACKEND_DIR / "start.sh")],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    arguments = shlex.split(result.stdout.strip())
    max_requests = int(arguments[arguments.index("--max-requests") + 1])
    max_requests_jitter = int(arguments[arguments.index("--max-requests-jitter") + 1])

    assert max_requests >= 10_000
    assert max_requests_jitter >= max_requests // 2
    assert arguments[arguments.index("--workers") + 1] == "2"
    assert arguments[arguments.index("--bind") + 1] == "0.0.0.0:8080"
