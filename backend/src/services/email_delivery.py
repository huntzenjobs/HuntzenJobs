"""Barrière d'envoi Resend commune aux emails applicatifs."""

from typing import cast

import resend

from src.config.settings import settings

_RESEND_TEST_RECIPIENT = "delivered@resend.dev"


def send_email(
    params: resend.Emails.SendParams,
    options: resend.Emails.SendOptions | None = None,
) -> resend.Emails.SendResponse:
    """Envoie en production et redirige tout autre environnement vers le sink Resend."""
    outgoing = params
    if settings.environment != "production":
        outgoing = cast(
            resend.Emails.SendParams,
            {
                **params,
                "to": [_RESEND_TEST_RECIPIENT],
                "cc": [],
                "bcc": [],
            },
        )

    return resend.Emails.send(outgoing, options)
