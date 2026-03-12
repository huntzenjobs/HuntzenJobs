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
                    <p>Besoin d'aide ? Contactez-nous à <a href="mailto:contact@huntzenjobs.com">contact@huntzenjobs.com</a></p>
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


def send_application_confirmation(
    to_email: str,
    job_title: str,
    company: str,
    job_url: str,
) -> bool:
    """
    Send confirmation email after user confirms they applied to a job.
    """
    try:
        frontend_url = settings.get_primary_frontend_url()
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #00D9FF 0%, #0EA5E9 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0; }}
                .content {{ background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none; }}
                .job-card {{ background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #00D9FF; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }}
                .job-title {{ font-size: 18px; font-weight: bold; color: #1e293b; margin: 0 0 6px; }}
                .company {{ color: #64748b; font-size: 14px; margin: 0; }}
                .tips {{ background: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px 20px; border-radius: 8px; margin: 20px 0; }}
                .tips ul {{ margin: 8px 0; padding-left: 20px; }}
                .tips li {{ margin: 6px 0; color: #166534; font-size: 14px; }}
                .button {{ display: inline-block; background: linear-gradient(135deg, #00D9FF, #0EA5E9); color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 8px 4px; font-size: 14px; }}
                .button-outline {{ display: inline-block; border: 2px solid #00D9FF; color: #0EA5E9; padding: 10px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 8px 4px; font-size: 14px; }}
                .footer {{ text-align: center; margin-top: 24px; color: #94a3b8; font-size: 13px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin:0;font-size:24px;">🎉 Candidature enregistrée !</h1>
                    <p style="margin:8px 0 0;opacity:0.9;">Bonne chance pour cette opportunité</p>
                </div>
                <div class="content">
                    <p>Ta candidature a bien été enregistrée dans HuntZen :</p>

                    <div class="job-card">
                        <p class="job-title">{job_title}</p>
                        <p class="company">🏢 {company}</p>
                    </div>

                    <div class="tips">
                        <strong>💡 Conseils pour maximiser tes chances :</strong>
                        <ul>
                            <li>Envoie un message LinkedIn au recruteur dans les 24h</li>
                            <li>Si pas de réponse sous 2 semaines, relance poliment</li>
                            <li>Prépare 3 questions pertinentes sur le poste</li>
                            <li>Mets à jour ton statut dans "Mes Candidatures"</li>
                        </ul>
                    </div>

                    <div style="text-align:center;margin-top:24px;">
                        <a href="{frontend_url}/candidatures" class="button">
                            Voir mes candidatures
                        </a>
                        <a href="{frontend_url}/jobs" class="button-outline">
                            Chercher d'autres offres
                        </a>
                    </div>
                </div>
                <div class="footer">
                    <p>Besoin d'aide ? <a href="mailto:contact@huntzenjobs.com" style="color:#00D9FF;">contact@huntzenjobs.com</a></p>
                    <p>© 2026 HuntZen · <a href="{frontend_url}/profile" style="color:#94a3b8;">Gérer mes notifications</a></p>
                </div>
            </div>
        </body>
        </html>
        """

        params = {
            "from": settings.from_email,
            "to": [to_email],
            "subject": f"✅ Candidature confirmée — {job_title} chez {company}",
            "html": html_content,
        }

        email = resend.Emails.send(params)
        logger.info(f"Application confirmation sent to {to_email}: {email}")
        return True

    except Exception as e:
        logger.error(f"Failed to send application confirmation to {to_email}: {e}")
        return False


def send_job_alerts(
    to_email: str,
    jobs: list,
    user_name: str = "là",
) -> bool:
    """
    Send a job alert digest email with new matching offers.
    """
    try:
        frontend_url = settings.get_primary_frontend_url()
        job_cards_html = ""
        for job in jobs[:5]:
            salary_html = f"<span style='color:#16a34a;font-size:13px;'>💰 {job.get('salary', '')}</span>" if job.get("salary") else ""
            job_cards_html += f"""
            <div style="background:white;padding:16px;border-radius:8px;margin:10px 0;border:1px solid #e2e8f0;">
                <p style="margin:0 0 4px;font-weight:bold;color:#1e293b;font-size:15px;">{job.get('title','')}</p>
                <p style="margin:0 0 4px;color:#64748b;font-size:13px;">🏢 {job.get('company','')} · 📍 {job.get('location','')}</p>
                {salary_html}
                <a href="{frontend_url}/jobs?jobId={job.get('id','')}" style="display:inline-block;margin-top:10px;background:#00D9FF;color:white;padding:7px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:bold;">Voir l'offre</a>
            </div>
            """

        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#0D1F3C,#1a3a6b);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:22px;">🔔 {len(jobs)} nouvelle{'s' if len(jobs) > 1 else ''} offre{'s' if len(jobs) > 1 else ''} pour toi</h1>
                    <p style="color:#00D9FF;margin:8px 0 0;font-size:14px;">Des opportunités sélectionnées selon ton profil</p>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <p>Bonjour{' ' + user_name if user_name != 'là' else ''} 👋</p>
                    <p>Voici les meilleures offres du jour qui correspondent à ton profil :</p>
                    {job_cards_html}
                    <div style="text-align:center;margin-top:24px;">
                        <a href="{frontend_url}/jobs" style="display:inline-block;background:linear-gradient(135deg,#00D9FF,#0EA5E9);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                            Voir toutes les offres
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
                    © 2026 HuntZen · <a href="{frontend_url}/profile" style="color:#94a3b8;">Gérer mes alertes</a>
                </p>
            </div>
        </body></html>
        """

        params = {
            "from": settings.from_email,
            "to": [to_email],
            "subject": f"🔔 {len(jobs)} nouvelle{'s' if len(jobs) > 1 else ''} offre{'s' if len(jobs) > 1 else ''} correspondent à ton profil",
            "html": html_content,
        }

        resend.Emails.send(params)
        logger.info(f"Job alerts sent to {to_email} ({len(jobs)} jobs)")
        return True

    except Exception as e:
        logger.error(f"Failed to send job alerts to {to_email}: {e}")
        return False


def send_weekly_summary(
    to_email: str,
    stats: dict,
) -> bool:
    """
    Send weekly activity summary email.
    stats = { applications: int, saved: int, documents: int, views: int }
    """
    try:
        frontend_url = settings.get_primary_frontend_url()
        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:22px;">📊 Ton bilan de la semaine</h1>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0;">
                        <div style="background:white;padding:16px;border-radius:8px;text-align:center;border:1px solid #e2e8f0;">
                            <p style="font-size:28px;font-weight:bold;color:#00D9FF;margin:0;">{stats.get('applications', 0)}</p>
                            <p style="margin:4px 0 0;color:#64748b;font-size:13px;">Candidatures</p>
                        </div>
                        <div style="background:white;padding:16px;border-radius:8px;text-align:center;border:1px solid #e2e8f0;">
                            <p style="font-size:28px;font-weight:bold;color:#8b5cf6;margin:0;">{stats.get('saved', 0)}</p>
                            <p style="margin:4px 0 0;color:#64748b;font-size:13px;">Offres sauvegardées</p>
                        </div>
                        <div style="background:white;padding:16px;border-radius:8px;text-align:center;border:1px solid #e2e8f0;">
                            <p style="font-size:28px;font-weight:bold;color:#16a34a;margin:0;">{stats.get('documents', 0)}</p>
                            <p style="margin:4px 0 0;color:#64748b;font-size:13px;">Documents générés</p>
                        </div>
                        <div style="background:white;padding:16px;border-radius:8px;text-align:center;border:1px solid #e2e8f0;">
                            <p style="font-size:28px;font-weight:bold;color:#ea580c;margin:0;">{stats.get('views', 0)}</p>
                            <p style="margin:4px 0 0;color:#64748b;font-size:13px;">Offres consultées</p>
                        </div>
                    </div>
                    <div style="text-align:center;margin-top:20px;">
                        <a href="{frontend_url}/candidatures" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                            Voir mes candidatures
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">© 2026 HuntZen</p>
            </div>
        </body></html>
        """

        params = {
            "from": settings.from_email,
            "to": [to_email],
            "subject": "📊 Ton bilan de recherche d'emploi — semaine du " + datetime.now().strftime("%d/%m"),
            "html": html_content,
        }

        resend.Emails.send(params)
        logger.info(f"Weekly summary sent to {to_email}")
        return True

    except Exception as e:
        logger.error(f"Failed to send weekly summary to {to_email}: {e}")
        return False


def send_welcome(to_email: str, full_name: str = "") -> bool:
    """Send welcome email after signup."""
    try:
        frontend_url = settings.get_primary_frontend_url()
        name = full_name or "là"
        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#0D1F3C,#1a3a6b);padding:32px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:26px;">🎯 Bienvenue sur HuntZen !</h1>
                    <p style="color:#00D9FF;margin:10px 0 0;font-size:15px;">Ta recherche d'emploi commence maintenant</p>
                </div>
                <div style="background:#f8fafc;padding:28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <p>Bonjour {name} 👋</p>
                    <p>Ton compte HuntZen est prêt. Voici ce que tu peux faire dès maintenant :</p>
                    <div style="background:white;padding:20px;border-radius:10px;margin:16px 0;border:1px solid #e2e8f0;">
                        <p style="margin:8px 0;">🔍 <strong>Chercher des offres</strong> adaptées à ton profil</p>
                        <p style="margin:8px 0;">📄 <strong>Analyser ton CV</strong> et obtenir un score de matching</p>
                        <p style="margin:8px 0;">✉️ <strong>Générer ta lettre de motivation</strong> en 1 clic</p>
                        <p style="margin:8px 0;">📊 <strong>Suivre tes candidatures</strong> au même endroit</p>
                    </div>
                    <div style="text-align:center;margin-top:24px;">
                        <a href="{frontend_url}/jobs" style="display:inline-block;background:linear-gradient(135deg,#00D9FF,#0EA5E9);color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
                            Commencer ma recherche
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
                    © 2026 HuntZen · <a href="{frontend_url}/profile" style="color:#94a3b8;">Gérer mes notifications</a>
                </p>
            </div>
        </body></html>
        """
        resend.Emails.send({
            "from": settings.from_email,
            "to": [to_email],
            "subject": "🎯 Bienvenue sur HuntZen — ta recherche d'emploi commence !",
            "html": html_content,
        })
        logger.info(f"Welcome email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send welcome email to {to_email}: {e}")
        return False


def send_cv_analysis_complete(to_email: str) -> bool:
    """Notify user their CV analysis is ready."""
    try:
        frontend_url = settings.get_primary_frontend_url()
        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#00D9FF,#0EA5E9);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:22px;">✅ Ton analyse CV est prête !</h1>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <p>Ton CV a été analysé avec succès par notre IA.</p>
                    <p>Tu peux maintenant consulter :</p>
                    <div style="background:white;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #e2e8f0;">
                        <p style="margin:6px 0;">📊 Ton <strong>score de matching</strong> par rapport aux offres</p>
                        <p style="margin:6px 0;">💡 Les <strong>points forts</strong> et axes d'amélioration</p>
                        <p style="margin:6px 0;">🎯 Les offres qui <strong>correspondent le mieux</strong> à ton profil</p>
                    </div>
                    <div style="text-align:center;margin-top:20px;">
                        <a href="{frontend_url}/cv-analysis" style="display:inline-block;background:linear-gradient(135deg,#00D9FF,#0EA5E9);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                            Voir mon analyse
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
                    © 2026 HuntZen · <a href="{frontend_url}/profile" style="color:#94a3b8;">Gérer mes notifications</a>
                </p>
            </div>
        </body></html>
        """
        resend.Emails.send({
            "from": settings.from_email,
            "to": [to_email],
            "subject": "✅ Ton analyse CV est prête — HuntZen",
            "html": html_content,
        })
        logger.info(f"CV analysis complete email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send cv analysis email to {to_email}: {e}")
        return False


def send_document_generated(
    to_email: str,
    doc_type: str,  # "cv" | "cover_letter"
    job_title: str,
    company: str,
) -> bool:
    """Notify user their generated document (CV adapté or LM) is ready."""
    try:
        frontend_url = settings.get_primary_frontend_url()
        label = "CV adapté" if doc_type == "cv" else "Lettre de motivation"
        emoji = "📄" if doc_type == "cv" else "✉️"
        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#16a34a,#15803d);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:22px;">{emoji} {label} généré{'' if doc_type == 'cover_letter' else 'e'} !</h1>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <p>Ton {label.lower()} pour <strong>{job_title}</strong> chez <strong>{company}</strong> est prêt.</p>
                    <div style="text-align:center;margin-top:20px;">
                        <a href="{frontend_url}/documents" style="display:inline-block;background:linear-gradient(135deg,#16a34a,#15803d);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                            Voir mes documents
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
                    © 2026 HuntZen · <a href="{frontend_url}/profile" style="color:#94a3b8;">Gérer mes notifications</a>
                </p>
            </div>
        </body></html>
        """
        resend.Emails.send({
            "from": settings.from_email,
            "to": [to_email],
            "subject": f"{emoji} Ton {label.lower()} est prêt — {job_title} chez {company}",
            "html": html_content,
        })
        logger.info(f"Document generated email sent to {to_email} ({doc_type})")
        return True
    except Exception as e:
        logger.error(f"Failed to send document email to {to_email}: {e}")
        return False


def send_application_status_change(
    to_email: str,
    job_title: str,
    company: str,
    new_status: str,  # "interview" | "offer"
) -> bool:
    """Notify user their application status changed to interview or offer."""
    try:
        frontend_url = settings.get_primary_frontend_url()
        if new_status == "interview":
            emoji, title, color, msg = "🎉", "Entretien décroché !", "#0EA5E9", f"Tu as un entretien pour <strong>{job_title}</strong> chez <strong>{company}</strong>. Prépare-toi bien !"
        else:  # offer
            emoji, title, color, msg = "🏆", "Offre reçue !", "#16a34a", f"Tu as reçu une offre pour <strong>{job_title}</strong> chez <strong>{company}</strong>. Félicitations !"

        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:{color};padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:24px;">{emoji} {title}</h1>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <p>{msg}</p>
                    <div style="text-align:center;margin-top:20px;">
                        <a href="{frontend_url}/candidatures" style="display:inline-block;background:{color};color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                            Voir mes candidatures
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
                    © 2026 HuntZen · <a href="{frontend_url}/profile" style="color:#94a3b8;">Gérer mes notifications</a>
                </p>
            </div>
        </body></html>
        """
        resend.Emails.send({
            "from": settings.from_email,
            "to": [to_email],
            "subject": f"{emoji} {title} — {job_title} chez {company}",
            "html": html_content,
        })
        logger.info(f"Status change email sent to {to_email} ({new_status})")
        return True
    except Exception as e:
        logger.error(f"Failed to send status change email to {to_email}: {e}")
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


def send_support_ticket_notification(
    ticket_id: str,
    subject: str,
    category: str,
    priority: str,
    user_name: str,
    user_email: str,
    user_plan: str,
    page_url: str,
    description: str,
) -> bool:
    """
    Notify admin of a new support ticket.
    Sends to settings.admin_email.
    """
    try:
        priority_emoji = {"urgent": "🔴", "normal": "🟡", "low": "🟢"}.get(priority, "🟡")
        category_label = {"bug": "Bug", "question": "Question", "suggestion": "Suggestion"}.get(category, category)

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
                .info-box {{ background: white; border-radius: 8px; padding: 20px; margin: 15px 0; border-left: 4px solid #2563EB; }}
                .info-item {{ margin: 8px 0; }}
                .label {{ font-weight: bold; color: #555; }}
                .message-box {{ background: white; border-radius: 8px; padding: 20px; margin: 15px 0; border: 1px solid #e5e7eb; white-space: pre-wrap; }}
                .button {{ display: inline-block; background: #2563EB; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 20px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>🎫 Nouveau ticket support #{ticket_id}</h2>
                    <p>{priority_emoji} {priority.upper()} — {category_label}</p>
                </div>
                <div class="content">
                    <div class="info-box">
                        <div class="info-item"><span class="label">Utilisateur :</span> {user_name or "N/A"}</div>
                        <div class="info-item"><span class="label">Email :</span> {user_email}</div>
                        <div class="info-item"><span class="label">Plan :</span> {user_plan or "N/A"}</div>
                        <div class="info-item"><span class="label">Page :</span> {page_url or "N/A"}</div>
                    </div>
                    <h3>📋 Sujet</h3>
                    <p>{subject}</p>
                    <h3>💬 Description</h3>
                    <div class="message-box">{description}</div>
                    <a href="{settings.get_primary_frontend_url()}/admin/support" class="button">Gérer dans l'admin</a>
                </div>
            </div>
        </body>
        </html>
        """

        params = {
            "from": settings.from_email,
            "to": [settings.admin_email],
            "subject": f"[Support] Nouveau ticket #{ticket_id} — {category_label} — {priority.upper()}",
            "html": html_content,
        }

        email = resend.Emails.send(params)
        logger.info(f"Support ticket notification sent for ticket {ticket_id}: {email}")
        return True

    except Exception as e:
        logger.error(f"Failed to send support ticket notification for {ticket_id}: {e}")
        return False


def send_support_ticket_reply(
    user_email: str,
    user_name: str,
    ticket_id: str,
    ticket_subject: str,
    admin_reply: str,
) -> bool:
    """
    Send admin reply to the user who submitted the ticket.
    """
    try:
        first_name = user_name.split()[0] if user_name else "Utilisateur"

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
                .reply-box {{ background: white; border-radius: 8px; padding: 20px; margin: 15px 0; border-left: 4px solid #00d4aa; white-space: pre-wrap; }}
                .footer {{ color: #888; font-size: 0.9em; margin-top: 20px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>✅ Réponse à votre ticket #{ticket_id}</h2>
                </div>
                <div class="content">
                    <p>Bonjour {first_name},</p>
                    <p>Notre équipe a répondu à votre demande : <strong>{ticket_subject}</strong></p>
                    <div class="reply-box">{admin_reply}</div>
                    <p class="footer">
                        Si vous avez d'autres questions, n'hésitez pas à ouvrir un nouveau ticket depuis votre espace HuntZen.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """

        params = {
            "from": settings.from_email,
            "to": [user_email],
            "subject": f"Réponse à votre ticket #{ticket_id} — {ticket_subject}",
            "html": html_content,
        }

        email = resend.Emails.send(params)
        logger.info(f"Support reply sent to {user_email} for ticket {ticket_id}: {email}")
        return True

    except Exception as e:
        logger.error(f"Failed to send support reply for ticket {ticket_id}: {e}")
        return False
