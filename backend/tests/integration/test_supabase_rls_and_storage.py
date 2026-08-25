"""Matrice RLS/Storage avec deux identités synthétiques sur Supabase staging."""

import os
import uuid

import httpx
import pytest


def _required_staging_environment() -> tuple[str, str, str, str]:
    url = os.getenv("SUPABASE_STAGING_URL", "").rstrip("/")
    anon_key = os.getenv("SUPABASE_STAGING_ANON_KEY", "")
    service_key = os.getenv("SUPABASE_STAGING_SERVICE_ROLE_KEY", "")
    project_ref = os.getenv("SUPABASE_STAGING_PROJECT_REF", "")
    if not all((url, anon_key, service_key, project_ref)):
        pytest.skip("Secrets Supabase staging absents")
    assert project_ref in url, "Le test refuse toute URL hors staging attendu"
    return url, anon_key, service_key, project_ref


def _headers(api_key: str, access_token: str | None = None) -> dict[str, str]:
    return {
        "apikey": api_key,
        "Authorization": f"Bearer {access_token or api_key}",
    }


@pytest.fixture(scope="module")
def synthetic_users():
    url, anon_key, service_key, _ = _required_staging_environment()
    password = f"HuntZen-Acl-{uuid.uuid4()}!"
    created_user_ids: list[str] = []
    users: list[dict[str, str]] = []

    with httpx.Client(timeout=20) as client:
        try:
            for label in ("a", "b"):
                email = f"codex-acl-{label}-{uuid.uuid4()}@example.invalid"
                create_response = client.post(
                    f"{url}/auth/v1/admin/users",
                    headers=_headers(service_key),
                    json={
                        "email": email,
                        "password": password,
                        "email_confirm": True,
                    },
                )
                create_response.raise_for_status()
                user_id = create_response.json()["id"]
                created_user_ids.append(user_id)

                login_response = client.post(
                    f"{url}/auth/v1/token?grant_type=password",
                    headers={"apikey": anon_key},
                    json={"email": email, "password": password},
                )
                login_response.raise_for_status()
                users.append(
                    {
                        "id": user_id,
                        "access_token": login_response.json()["access_token"],
                    }
                )

            yield url, anon_key, users
        finally:
            for user_id in created_user_ids:
                response = client.delete(
                    f"{url}/auth/v1/admin/users/{user_id}",
                    headers=_headers(service_key),
                )
                assert response.status_code in (200, 204)


def test_user_cannot_read_another_profile_or_mutate_privileged_fields(
    synthetic_users,
) -> None:
    url, anon_key, users = synthetic_users
    user_a, user_b = users

    with httpx.Client(timeout=20) as client:
        other_profile = client.get(
            f"{url}/rest/v1/profiles",
            headers=_headers(anon_key, user_b["access_token"]),
            params={"select": "id", "id": f"eq.{user_a['id']}"},
        )
        other_profile.raise_for_status()
        assert other_profile.json() == []

        protected_update = client.patch(
            f"{url}/rest/v1/profiles",
            headers={
                **_headers(anon_key, user_a["access_token"]),
                "Prefer": "return=representation",
            },
            params={"id": f"eq.{user_a['id']}"},
            json={"is_admin": True},
        )
        protected_error = protected_update.json()
        assert protected_update.status_code in (401, 403), {
            "status": protected_update.status_code,
            "code": protected_error.get("code"),
            "message": protected_error.get("message"),
        }

        allowed_update = client.patch(
            f"{url}/rest/v1/profiles",
            headers={
                **_headers(anon_key, user_a["access_token"]),
                "Prefer": "return=representation",
            },
            params={"id": f"eq.{user_a['id']}"},
            json={"full_name": "Utilisateur ACL A"},
        )
        allowed_update.raise_for_status()
        assert allowed_update.json()[0]["full_name"] == "Utilisateur ACL A"


def test_anon_cannot_read_sensitive_tables(synthetic_users) -> None:
    url, anon_key, _ = synthetic_users
    with httpx.Client(timeout=20) as client:
        for table in ("profiles", "usage_quotas", "user_subscriptions"):
            response = client.get(
                f"{url}/rest/v1/{table}",
                headers=_headers(anon_key),
                params={"select": "*", "limit": "1"},
            )
            assert response.status_code in (401, 403)


def test_private_cv_object_is_owned_by_authenticated_folder(synthetic_users) -> None:
    url, anon_key, users = synthetic_users
    user_a, user_b = users
    object_name = f"{user_a['id']}/acl-{uuid.uuid4()}.pdf"
    object_url = f"{url}/storage/v1/object/cvs/{object_name}"
    pdf = b"%PDF-1.4\n% HuntZen staging ACL test\n%%EOF"

    with httpx.Client(timeout=20) as client:
        upload = client.post(
            object_url,
            headers={
                **_headers(anon_key, user_a["access_token"]),
                "Content-Type": "application/pdf",
                "x-upsert": "false",
            },
            content=pdf,
        )
        upload.raise_for_status()

        try:
            owner_read = client.get(
                object_url,
                headers=_headers(anon_key, user_a["access_token"]),
            )
            owner_read.raise_for_status()
            assert owner_read.content == pdf

            for access_token in (None, user_b["access_token"]):
                forbidden_read = client.get(
                    object_url,
                    headers=_headers(anon_key, access_token),
                )
                assert forbidden_read.status_code in (400, 401, 403, 404)
        finally:
            delete = client.delete(
                object_url,
                headers=_headers(anon_key, user_a["access_token"]),
            )
            delete.raise_for_status()
