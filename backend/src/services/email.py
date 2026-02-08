"""
Email Service
=============
Service for sending emails via Resend API.
"""

import logging
from typing import Optional
from datetime import datetime

import resend
from src.config.settings import settings

logger = logging.getLogger(__name__)

# Initialize Resend with API key
resend.api_key = settings.get_resend_api_key()


def send_recruiter_request_confirmation(
    to_email: str,
    full_name: str,
    sector: str,
    experience_level: str,
    preferred_date: Optional[str] = None,
) -> bool:
    """
    Send confirmation email to user after recruiter request submission.

    Args:
        to_email: User's email address
        full_name: User's full name
        sector: Professional sector
        experience_level: Experience level
        preferred_date: Preferred consultation date

    Returns:
        bool: True if email sent successfully, False otherwise
    """
    try:
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }}
                .info-box {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0EA5E9; }}
                .info-item {{ margin: 10px 0; }}
                .label {{ font-weight: bold; color: #555; }}
                .footer {{ text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px; }}
                .button {{ display: inline-block; background: #0EA5E9; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎯 HuntZen - Consultation Recruteur</h1>
                </div>
                <div class="content">
                    <h2>Bonjour {full_name},</h2>
                    <p>Nous avons bien reçu votre demande de consultation avec un recruteur expert !</p>

                    <div class="info-box">
                        <h3>📋 Récapitulatif de votre demande</h3>
                        <div class="info-item"><span class="label">Secteur :</span> {sector}</div>
                        <div class="info-item"><span class="label">Niveau d'expérience :</span> {experience_level}</div>
                        {f'<div class="info-item"><span class="label">Date préférée :</span> {preferred_date}</div>' if preferred_date else ''}
                    </div>

                    <h3>⏭️ Prochaines étapes</h3>
                    <ol>
                        <li><strong>Confirmation de paiement :</strong> Votre paiement de 50€ a été traité avec succès</li>
                        <li><strong>Attribution d'un recruteur :</strong> Un expert sera assigné à votre dossier sous 24-48h</li>
                        <li><strong>Prise de rendez-vous :</strong> Vous recevrez un email avec un lien de planification</li>
                        <li><strong>Consultation :</strong> Session de 60 minutes pour optimiser votre recherche d'emploi</li>
                    </ol>

                    <p style="background: #e0f2fe; padding: 15px; border-radius: 6px; margin-top: 20px;">
                        💡 <strong>Conseil :</strong> Préparez votre CV et une liste de questions pour maximiser votre session !
                    </p>

                    <a href="{settings.get_primary_frontend_url()}/recruiter-contact" class="button">Voir mes demandes</a>
                </div>
                <div class="footer">
                    <p>Besoin d'aide ? Contactez-nous à <a href="mailto:contact@huntzen.app">contact@huntzen.app</a></p>
                    <p>© 2026 HuntZen - Votre partenaire de recherche d'emploi</p>
                </div>
            </div>
        </body>
        </html>
        """

        params = {
            "from": settings.from_email,
            "to": [to_email],
            "subject": "✅ Demande de consultation recruteur confirmée - HuntZen",
            "html": html_content,
        }

        email = resend.Emails.send(params)
        logger.info(f"Confirmation email sent to {to_email}: {email}")
        return True

    except Exception as e:
        logger.error(f"Failed to send confirmation email to {to_email}: {e}")
        return False


def send_recruiter_request_notification(
    request_id: str,
    full_name: str,
    email: str,
    phone: Optional[str],
    sector: str,
    experience_level: str,
    message: str,
    preferred_date: Optional[str] = None,
) -> bool:
    """
    Send notification email to admin when new recruiter request is received.

    Args:
        request_id: Request UUID
        full_name: User's full name
        email: User's email
        phone: User's phone number
        sector: Professional sector
        experience_level: Experience level
        message: User's message
        preferred_date: Preferred consultation date

    Returns:
        bool: True if email sent successfully, False otherwise
    """
    try:
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #DC2626 0%, #991B1B 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }}
                .info-box {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #DC2626; }}
                .info-item {{ margin: 10px 0; }}
                .label {{ font-weight: bold; color: #555; }}
                .message-box {{ background: #fef3c7; padding: 15px; border-radius: 6px; margin: 15px 0; font-style: italic; }}
                .button {{ display: inline-block; background: #DC2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚨 Nouvelle Demande de Consultation</h1>
                </div>
                <div class="content">
                    <p><strong>Une nouvelle demande de consultation recruteur a été reçue et payée (50€).</strong></p>

                    <div class="info-box">
                        <h3>📋 Informations du candidat</h3>
                        <div class="info-item"><span class="label">ID Demande :</span> <code>{request_id}</code></div>
                        <div class="info-item"><span class="label">Nom :</span> {full_name}</div>
                        <div class="info-item"><span class="label">Email :</span> <a href="mailto:{email}">{email}</a></div>
                        {f'<div class="info-item"><span class="label">Téléphone :</span> {phone}</div>' if phone else ''}
                        <div class="info-item"><span class="label">Secteur :</span> {sector}</div>
                        <div class="info-item"><span class="label">Expérience :</span> {experience_level}</div>
                        {f'<div class="info-item"><span class="label">Date préférée :</span> {preferred_date}</div>' if preferred_date else ''}
                    </div>

                    <h3>💬 Message du candidat</h3>
                    <div class="message-box">
                        {message}
                    </div>

                    <h3>⏭️ Actions à effectuer</h3>
                    <ol>
                        <li>Assigner un recruteur expert au dossier</li>
                        <li>Envoyer un lien de planification au candidat</li>
                        <li>Préparer les notes de consultation</li>
                    </ol>

                    <a href="{settings.get_primary_frontend_url()}/admin/recruiter-requests" class="button">Gérer dans l'admin</a>
                </div>
            </div>
        </body>
        </html>
        """

        params = {
            "from": settings.from_email,
            "to": [settings.admin_email],
            "subject": f"🚨 Nouvelle consultation recruteur - {full_name} ({sector})",
            "html": html_content,
        }

        email = resend.Emails.send(params)
        logger.info(f"Admin notification sent for request {request_id}: {email}")
        return True

    except Exception as e:
        logger.error(f"Failed to send admin notification for request {request_id}: {e}")
        return False
