"""Contrats de concurrence Stripe sur PostgreSQL Supabase staging réel."""

import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from urllib.parse import urlparse, urlunparse

import psycopg
import pytest
from psycopg.rows import dict_row

STAGING_PROJECT_REF = "cxkpbciubsvopgxakgbj"
PRODUCTION_PROJECT_REF = "ngiakfikbuyugqfqtfwp"


class RedactedDatabaseUrl(str):
    def __repr__(self) -> str:
        return "<staging-database-url>"


@pytest.fixture(scope="module")
def staging_database_url() -> RedactedDatabaseUrl:
    database_url = os.getenv("SUPABASE_STAGING_DATABASE_URL", "")
    project_ref = os.getenv("SUPABASE_STAGING_PROJECT_REF", "")
    if not database_url or not project_ref:
        pytest.skip("Supabase staging non configuré")
    assert project_ref == STAGING_PROJECT_REF
    assert project_ref != PRODUCTION_PROJECT_REF

    parsed_url = urlparse(database_url)
    hostname = parsed_url.hostname or ""
    username = parsed_url.username or ""
    assert project_ref in hostname or project_ref in username, (
        "Le test refuse toute base hors staging"
    )
    return RedactedDatabaseUrl(database_url)


@pytest.fixture(scope="module")
def staging_admin_database_url(
    staging_database_url: RedactedDatabaseUrl,
) -> RedactedDatabaseUrl:
    parsed_url = urlparse(staging_database_url)
    assert parsed_url.hostname is not None
    assert parsed_url.username is not None
    assert parsed_url.password is not None
    session_netloc = (
        f"{parsed_url.username}:{parsed_url.password}@{parsed_url.hostname}:5432"
    )
    return RedactedDatabaseUrl(
        urlunparse(
            (
                parsed_url.scheme,
                session_netloc,
                parsed_url.path,
                "",
                parsed_url.query,
                "",
            )
        )
    )


def _service_connection(database_url: str) -> psycopg.Connection:
    connection = psycopg.connect(database_url, autocommit=True, row_factory=dict_row)
    connection.execute("SET ROLE service_role")
    return connection


def test_webhook_claim_is_atomic_and_fenced_by_owner_token(
    staging_database_url: str,
) -> None:
    event_id = f"evt_codex_claim_{uuid.uuid4().hex}"
    barrier = Barrier(2)

    def claim() -> dict[str, object]:
        with _service_connection(staging_database_url) as connection:
            barrier.wait(timeout=10)
            row = connection.execute(
                "SELECT public.claim_stripe_webhook_event(%s, %s) AS result",
                (event_id, "checkout.session.completed"),
            ).fetchone()
            assert row is not None
            return dict(row["result"])

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: claim(), range(2)))

        assert sorted(result["status"] for result in results) == [
            "claimed",
            "processing",
        ]
        owner_token = next(
            str(result["claim_token"])
            for result in results
            if result["status"] == "claimed"
        )

        with _service_connection(staging_database_url) as connection:
            wrong_owner = connection.execute(
                "SELECT public.mark_webhook_event_processed(%s, %s)",
                (event_id, uuid.uuid4()),
            ).fetchone()
            assert wrong_owner is not None
            assert wrong_owner["mark_webhook_event_processed"] is False

            right_owner = connection.execute(
                "SELECT public.mark_webhook_event_processed(%s, %s)",
                (event_id, uuid.UUID(owner_token)),
            ).fetchone()
            assert right_owner is not None
            assert right_owner["mark_webhook_event_processed"] is True

            replay = connection.execute(
                "SELECT public.claim_stripe_webhook_event(%s, %s) AS result",
                (event_id, "checkout.session.completed"),
            ).fetchone()
            assert replay is not None
            assert replay["result"]["status"] == "processed"
            assert replay["result"]["claim_token"] is None
    finally:
        with psycopg.connect(staging_database_url, autocommit=True) as connection:
            connection.execute(
                "DELETE FROM public.stripe_webhook_events WHERE stripe_event_id = %s",
                (event_id,),
            )


def test_outbox_claim_retry_and_dead_letter_are_atomic(
    staging_database_url: str,
) -> None:
    dedupe_key = f"codex-outbox:{uuid.uuid4()}"
    effect_id: uuid.UUID | None = None
    barrier = Barrier(2)

    def claim() -> list[dict[str, object]]:
        with _service_connection(staging_database_url) as connection:
            barrier.wait(timeout=10)
            return [
                dict(row)
                for row in connection.execute(
                    "SELECT * FROM public.claim_stripe_effects(1)"
                ).fetchall()
            ]

    try:
        with psycopg.connect(
            staging_database_url,
            autocommit=True,
            row_factory=dict_row,
        ) as connection:
            row = connection.execute(
                """
                INSERT INTO public.stripe_effect_outbox (
                  stripe_event_id,
                  effect_type,
                  subject_type,
                  subject_id,
                  dedupe_key,
                  max_attempts,
                  available_at,
                  created_at
                )
                VALUES (%s, %s, %s, %s, %s, 2,
                        TIMESTAMPTZ '2000-01-01 00:00:00+00',
                        TIMESTAMPTZ '2000-01-01 00:00:00+00')
                RETURNING id
                """,
                (
                    f"evt_{uuid.uuid4().hex}",
                    "payment_confirmation_client",
                    "invoice",
                    f"in_{uuid.uuid4().hex}",
                    dedupe_key,
                ),
            ).fetchone()
            assert row is not None
            effect_id = row["id"]

        with ThreadPoolExecutor(max_workers=2) as executor:
            batches = list(executor.map(lambda _: claim(), range(2)))

        claimed = [
            row
            for batch in batches
            for row in batch
            if row["id"] == effect_id
        ]
        assert len(claimed) == 1
        assert claimed[0]["attempt_count"] == 1
        first_token = claimed[0]["claim_token"]

        with _service_connection(staging_database_url) as connection:
            wrong_retry = connection.execute(
                "SELECT public.retry_stripe_effect(%s, %s, %s, 1) AS result",
                (effect_id, uuid.uuid4(), "SyntheticFailure"),
            ).fetchone()
            assert wrong_retry is not None
            assert wrong_retry["result"] == {"updated": False, "status": None}

            valid_retry = connection.execute(
                "SELECT public.retry_stripe_effect(%s, %s, %s, 1) AS result",
                (effect_id, first_token, "SyntheticFailure"),
            ).fetchone()
            assert valid_retry is not None
            assert valid_retry["result"] == {"updated": True, "status": "pending"}

        with psycopg.connect(staging_database_url, autocommit=True) as connection:
            connection.execute(
                """
                UPDATE public.stripe_effect_outbox
                SET available_at = TIMESTAMPTZ '2000-01-01 00:00:00+00'
                WHERE id = %s
                """,
                (effect_id,),
            )

        with _service_connection(staging_database_url) as connection:
            second_claim = connection.execute(
                "SELECT * FROM public.claim_stripe_effects(1)"
            ).fetchone()
            assert second_claim is not None
            assert second_claim["id"] == effect_id
            assert second_claim["attempt_count"] == 2

            dead = connection.execute(
                "SELECT public.retry_stripe_effect(%s, %s, %s, 1) AS result",
                (effect_id, second_claim["claim_token"], "SyntheticFailure"),
            ).fetchone()
            assert dead is not None
            assert dead["result"] == {"updated": True, "status": "dead"}

            stale_success = connection.execute(
                "SELECT public.mark_stripe_effect_succeeded(%s, %s, NULL)",
                (effect_id, second_claim["claim_token"]),
            ).fetchone()
            assert stale_success is not None
            assert stale_success["mark_stripe_effect_succeeded"] is False
    finally:
        if effect_id is not None:
            with psycopg.connect(staging_database_url, autocommit=True) as connection:
                connection.execute(
                    "DELETE FROM public.stripe_effect_outbox WHERE id = %s",
                    (effect_id,),
                )


def test_payment_failed_notifies_once_when_subscription_is_already_past_due(
    staging_database_url: str,
    staging_admin_database_url: str,
) -> None:
    user_id = uuid.uuid4()
    subscription_id = f"sub_codex_{uuid.uuid4().hex}"
    invoice_id = f"in_codex_{uuid.uuid4().hex}"
    event_id = f"evt_codex_payment_failed_{uuid.uuid4().hex}"
    replay_event_id = f"evt_codex_payment_failed_{uuid.uuid4().hex}"

    try:
        with psycopg.connect(
            staging_admin_database_url,
            autocommit=True,
        ) as connection:
            connection.execute(
                """
                INSERT INTO auth.users (id, email, encrypted_password)
                VALUES (%s, %s, '')
                """,
                (
                    user_id,
                    f"codex-payment-failed-{uuid.uuid4()}@example.invalid",
                ),
            )

        with _service_connection(staging_database_url) as connection:
            price = connection.execute(
                """
                SELECT plan_id, stripe_price_id
                FROM public.stripe_prices
                ORDER BY created_at
                LIMIT 1
                """
            ).fetchone()
            assert price is not None
            connection.execute(
                """
                UPDATE public.user_subscriptions
                SET plan_id = %s,
                    status = 'past_due',
                    stripe_subscription_id = %s,
                    stripe_customer_id = %s,
                    stripe_price_id = %s
                WHERE user_id = %s
                """,
                (
                    price["plan_id"],
                    subscription_id,
                    f"cus_codex_{uuid.uuid4().hex}",
                    price["stripe_price_id"],
                    user_id,
                ),
            )

            claim = connection.execute(
                "SELECT public.claim_stripe_webhook_event(%s, %s) AS result",
                (event_id, "invoice.payment_failed"),
            ).fetchone()
            assert claim is not None
            assert claim["result"]["status"] == "claimed"

            applied = connection.execute(
                """
                SELECT public.apply_stripe_payment_failed(%s, %s, %s, %s)
                  AS result
                """,
                (
                    event_id,
                    claim["result"]["claim_token"],
                    subscription_id,
                    invoice_id,
                ),
            ).fetchone()
            assert applied is not None
            assert applied["result"]["finalized"] is True

            replay_claim = connection.execute(
                "SELECT public.claim_stripe_webhook_event(%s, %s) AS result",
                (replay_event_id, "invoice.payment_failed"),
            ).fetchone()
            assert replay_claim is not None
            replay_applied = connection.execute(
                """
                SELECT public.apply_stripe_payment_failed(%s, %s, %s, %s)
                  AS result
                """,
                (
                    replay_event_id,
                    replay_claim["result"]["claim_token"],
                    subscription_id,
                    invoice_id,
                ),
            ).fetchone()
            assert replay_applied is not None
            assert replay_applied["result"]["finalized"] is True

            effect_count = connection.execute(
                """
                SELECT COUNT(*) AS count
                FROM public.stripe_effect_outbox
                WHERE subject_id = %s
                  AND effect_type IN (
                    'payment_failed_client', 'payment_failed_admin'
                  )
                """,
                (invoice_id,),
            ).fetchone()
            assert effect_count is not None
            assert effect_count["count"] == 2

            notification_count = connection.execute(
                """
                SELECT COUNT(*) AS count
                FROM public.user_notifications
                WHERE user_id = %s
                  AND type = 'payment_failed'
                  AND data->>'invoice_id' = %s
                """,
                (user_id, invoice_id),
            ).fetchone()
            assert notification_count is not None
            assert notification_count["count"] == 1

            unique_index = connection.execute(
                """
                SELECT to_regclass(
                  'public.idx_user_notifications_payment_failed_invoice_unique'
                ) AS index_name
                """
            ).fetchone()
            assert unique_index is not None
            assert unique_index["index_name"] is not None
    finally:
        with psycopg.connect(staging_database_url, autocommit=True) as connection:
            connection.execute(
                "DELETE FROM public.stripe_effect_outbox WHERE subject_id = %s",
                (invoice_id,),
            )
            connection.execute(
                """
                DELETE FROM public.stripe_webhook_events
                WHERE stripe_event_id IN (%s, %s)
                """,
                (event_id, replay_event_id),
            )
        with psycopg.connect(
            staging_admin_database_url,
            autocommit=True,
        ) as connection:
            connection.execute("DELETE FROM auth.users WHERE id = %s", (user_id,))


def test_stripe_rpc_acl_is_service_role_only(staging_database_url: str) -> None:
    signatures = (
        "public.claim_stripe_webhook_event(text,text)",
        "public.mark_webhook_event_processed(text,uuid)",
        "public.mark_webhook_event_failed(text,uuid,text)",
        "public.apply_stripe_payment_failed(text,uuid,text,text)",
        "public.claim_stripe_effects(integer)",
        "public.mark_stripe_effect_succeeded(uuid,uuid,text)",
        "public.retry_stripe_effect(uuid,uuid,text,integer)",
    )

    with psycopg.connect(staging_database_url) as connection:
        connection.execute("BEGIN READ ONLY")
        for signature in signatures:
            # anon/authenticated héritent des privilèges accordés à PUBLIC :
            # un résultat False prouve donc aussi l'absence de GRANT PUBLIC.
            for role in ("anon", "authenticated"):
                row = connection.execute(
                    "SELECT has_function_privilege(%s, %s, 'EXECUTE')",
                    (role, signature),
                ).fetchone()
                assert row is not None
                assert row[0] is False, f"{role} conserve EXECUTE sur {signature}"

            service_row = connection.execute(
                "SELECT has_function_privilege('service_role', %s, 'EXECUTE')",
                (signature,),
            ).fetchone()
            assert service_row is not None
            assert service_row[0] is True
        connection.rollback()


def test_subscription_identifiers_are_unique_for_atomic_checkout_upsert(
    staging_database_url: str,
) -> None:
    with psycopg.connect(staging_database_url) as connection:
        connection.execute("BEGIN READ ONLY")
        duplicates = connection.execute(
            """
            SELECT COUNT(*)
            FROM (
              SELECT stripe_subscription_id
              FROM public.user_subscriptions
              WHERE stripe_subscription_id IS NOT NULL
              GROUP BY stripe_subscription_id
              HAVING COUNT(*) > 1
            ) duplicate_ids
            """
        ).fetchone()
        assert duplicates is not None
        assert duplicates[0] == 0

        unique_index = connection.execute(
            """
            SELECT to_regclass(
              'public.user_subscriptions_stripe_subscription_id_key'
            )
            """
        ).fetchone()
        assert unique_index is not None
        assert unique_index[0] is not None
        connection.rollback()
