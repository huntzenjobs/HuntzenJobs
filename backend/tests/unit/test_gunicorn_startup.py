"""Contrat du démarrage Gunicorn utilisé par les déploiements backend."""

from __future__ import annotations

import json
import os
import shlex
import subprocess
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BACKEND_DIR.parent


def _load_railway_resources() -> dict[str, list[dict[str, object]]]:
    """Sérialise le graphe IaC local sans lire les valeurs Railway distantes."""
    script = """
const module = await import('./.railway/railway.ts');
const result = {};
for (const environment of ['production', 'staging']) {
  const railwayProject = await module.default({
    environment,
    isEnvironment: (name) => name === environment,
  });
  result[environment] = railwayProject.resources.map((resource) => ({
    name: resource.name,
    type: resource.type,
    deploy: resource.deploy,
    variables: resource.variables,
  }));
}
process.stdout.write(JSON.stringify(result));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=PROJECT_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_railway_config_uses_supported_horizontal_scaling() -> None:
    """Le nombre de réplicas doit être explicite, sans faux autoscaling horizontal."""
    script = """
const module = await import('./.railway/railway.ts');
const project = await module.default({
  environment: 'production',
  isEnvironment: (name) => name === 'production',
});
const api = project.resources.find((resource) => resource.name === 'HuntzenJobs');
process.stdout.write(JSON.stringify(api.deploy));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=PROJECT_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    deploy = json.loads(result.stdout)

    assert deploy["multiRegionConfig"]["europe-west4-drams3a"]["numReplicas"] == 4
    assert "autoscaling" not in deploy


def test_railway_separates_cache_rate_limits_and_arq_queues() -> None:
    """La file ARQ ne doit pas partager le Redis de cache/limitation."""
    resources = _load_railway_resources()

    production_by_name = {item["name"]: item for item in resources["production"]}
    staging_by_name = {item["name"]: item for item in resources["staging"]}

    assert production_by_name["arq-worker"]["deploy"]["multiRegionConfig"][
        "europe-west4-drams3a"
    ]["numReplicas"] == 2
    assert staging_by_name["ravishing-reprieve"]["deploy"]["multiRegionConfig"][
        "europe-west4-drams3a"
    ]["numReplicas"] == 4
    assert staging_by_name["respectful-rebirth"]["deploy"]["multiRegionConfig"][
        "europe-west4-drams3a"
    ]["numReplicas"] == 2
    assert "Redis-Queue" in production_by_name
    assert "Redis-Queue-Staging" in staging_by_name
    assert "arq-worker-legacy-drain" in production_by_name
    assert "arq-worker-legacy-drain-staging" in staging_by_name

    assert production_by_name["HuntzenJobs"]["variables"]["REDIS_LIMITER_URL"] == {
        "type": "preserve"
    }
    assert production_by_name["arq-worker"]["variables"]["ARQ_REDIS_URL"][
        "resource"
    ] == "database.Redis-Queue"
    assert production_by_name["arq-worker-legacy-drain"]["variables"][
        "ARQ_REDIS_URL"
    ]["resource"] == "database.Redis"
    assert production_by_name["HuntzenJobs"]["variables"]["DB_POOL_SIZE"]["value"] == "5"
    assert production_by_name["arq-worker"]["variables"]["DB_POOL_SIZE"]["value"] == "5"
    assert production_by_name["arq-worker-legacy-drain"]["deploy"][
        "multiRegionConfig"
    ]["europe-west4-drams3a"]["numReplicas"] == 1
    assert staging_by_name["ravishing-reprieve"]["variables"]["REDIS_LIMITER_URL"][
        "resource"
    ] == "database.Redis-SU2L"
    assert staging_by_name["respectful-rebirth"]["variables"]["ARQ_REDIS_URL"][
        "resource"
    ] == "database.Redis-Queue-Staging"
    assert staging_by_name["arq-worker-legacy-drain-staging"]["variables"][
        "ARQ_REDIS_URL"
    ]["resource"] == "database.Redis-SU2L"
    assert staging_by_name["ravishing-reprieve"]["variables"]["DB_POOL_SIZE"]["value"] == "5"
    assert "RECRUITER_CONTACT_PRICE_ID" in staging_by_name["ravishing-reprieve"][
        "variables"
    ]
    assert staging_by_name["respectful-rebirth"]["variables"]["DB_POOL_SIZE"]["value"] == "5"
    assert staging_by_name["arq-worker-legacy-drain-staging"]["deploy"][
        "multiRegionConfig"
    ]["europe-west4-drams3a"]["numReplicas"] == 1


def test_new_legacy_drains_reference_existing_worker_variables() -> None:
    """Un nouveau drain doit hériter des secrets du worker déjà configuré."""
    resources = _load_railway_resources()

    for environment, worker_name, drain_name in (
        ("production", "arq-worker", "arq-worker-legacy-drain"),
        ("staging", "respectful-rebirth", "arq-worker-legacy-drain-staging"),
    ):
        by_name = {item["name"]: item for item in resources[environment]}
        drain_variables = by_name[drain_name]["variables"]

        assert all(
            variable["type"] != "preserve" for variable in drain_variables.values()
        )
        for variable_name in (
            "DATABASE_URL",
            "GROQ_API_KEY",
            "RESEND_API_KEY",
            "SUPABASE_SERVICE_ROLE_KEY",
        ):
            assert drain_variables[variable_name] == {
                "type": "reference",
                "resource": f"service.{worker_name}",
                "output": variable_name,
            }


def test_redis_start_command_keeps_region_placement() -> None:
    """Ajouter la commande Redis ne doit pas effacer sa région de déploiement."""
    resources = _load_railway_resources()

    for environment, redis_names in (
        ("production", ("Redis", "Redis-Queue")),
        ("staging", ("Redis-SU2L", "Redis-Queue-Staging")),
    ):
        by_name = {item["name"]: item for item in resources[environment]}
        for redis_name in redis_names:
            deploy = by_name[redis_name]["deploy"]
            assert deploy["startCommand"]
            assert deploy["multiRegionConfig"]["europe-west4-drams3a"] == {
                "numReplicas": 1
            }


def test_production_keeps_existing_rate_limiter_redis() -> None:
    """Le limiteur distinct de production ne doit pas être remplacé par le cache."""
    resources = _load_railway_resources()
    production_by_name = {
        item["name"]: item for item in resources["production"]
    }

    assert production_by_name["HuntzenJobs"]["variables"]["REDIS_LIMITER_URL"] == {
        "type": "preserve"
    }
    assert production_by_name["worker-stress"]["variables"][
        "REDIS_LIMITER_URL"
    ] == {"type": "preserve"}


def test_stress_worker_reads_the_active_arq_queue() -> None:
    """Le worker de charge doit consommer la même file active que le worker ARQ."""
    resources = _load_railway_resources()
    production_by_name = {
        item["name"]: item for item in resources["production"]
    }

    assert production_by_name["worker-stress"]["variables"]["ARQ_REDIS_URL"] == {
        "type": "reference",
        "resource": "database.Redis-Queue",
        "output": "REDIS_URL",
    }


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
    assert "--access-logfile" not in arguments
