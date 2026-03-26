"""
Email Service
=============
Service for sending emails via Resend API.
Supports FR (default) and EN via the `language` parameter on user-facing functions.
"""

import logging
from datetime import datetime

import httpx
import resend

from src.config.settings import settings

logger = logging.getLogger(__name__)

# Initialize Resend with API key
resend.api_key = settings.get_resend_api_key()

# ---------------------------------------------------------------------------
# Translations — user-facing email strings (FR + EN)
# ---------------------------------------------------------------------------

_T: dict[str, dict[str, dict[str, str]]] = {
    "recruiter_confirmation": {
        "fr": {
            "subject": "✅ Demande de consultation recruteur confirmée - HuntZenJobs",
            "header": "🎯 HuntZenJobs - Consultation Recruteur",
            "greeting": "Bonjour",
            "intro": "Nous avons bien reçu votre demande de consultation avec un recruteur expert !",
            "recap_title": "📋 Récapitulatif de votre demande",
            "sector_label": "Secteur :",
            "experience_label": "Niveau d'expérience :",
            "date_label": "Date préférée :",
            "next_steps_title": "⏭️ Prochaines étapes",
            "step1": "<strong>Confirmation de paiement :</strong> Votre paiement de 50€ a été traité avec succès",
            "step2": "<strong>Attribution d'un recruteur :</strong> Un expert sera assigné à votre dossier sous 24-48h",
            "step3": "<strong>Prise de rendez-vous :</strong> Vous recevrez un email avec un lien de planification",
            "step4": "<strong>Consultation :</strong> Session de 60 minutes pour optimiser votre recherche d'emploi",
            "tip": "💡 <strong>Conseil :</strong> Préparez votre CV et une liste de questions pour maximiser votre session !",
            "cta": "Voir mes demandes",
            "help": "Besoin d'aide ? Contactez-nous à",
            "footer": "© 2026 HuntZenJobs - Votre partenaire de recherche d'emploi",
        },
        "en": {
            "subject": "✅ Recruiter consultation request confirmed - HuntZenJobs",
            "header": "🎯 HuntZenJobs - Recruiter Consultation",
            "greeting": "Hello",
            "intro": "We have received your request for a consultation with an expert recruiter!",
            "recap_title": "📋 Summary of your request",
            "sector_label": "Sector:",
            "experience_label": "Experience level:",
            "date_label": "Preferred date:",
            "next_steps_title": "⏭️ Next steps",
            "step1": "<strong>Payment confirmation:</strong> Your €50 payment has been processed successfully",
            "step2": "<strong>Recruiter assignment:</strong> An expert will be assigned to your file within 24-48h",
            "step3": "<strong>Scheduling:</strong> You will receive an email with a scheduling link",
            "step4": "<strong>Consultation:</strong> 60-minute session to optimize your job search",
            "tip": "💡 <strong>Tip:</strong> Prepare your CV and a list of questions to maximize your session!",
            "cta": "View my requests",
            "help": "Need help? Contact us at",
            "footer": "© 2026 HuntZenJobs - Your job search partner",
        },
        "es": {
            "subject": "✅ Solicitud de consulta con reclutador confirmada - HuntZenJobs",
            "header": "🎯 HuntZenJobs - Consulta con Reclutador",
            "greeting": "Hola",
            "intro": "¡Hemos recibido tu solicitud de consulta con un reclutador experto!",
            "recap_title": "📋 Resumen de tu solicitud",
            "sector_label": "Sector:",
            "experience_label": "Nivel de experiencia:",
            "date_label": "Fecha preferida:",
            "next_steps_title": "⏭️ Próximos pasos",
            "step1": "<strong>Confirmación de pago:</strong> Tu pago de 50€ ha sido procesado con éxito",
            "step2": "<strong>Asignación de reclutador:</strong> Un experto será asignado a tu expediente en 24-48h",
            "step3": "<strong>Programación:</strong> Recibirás un email con un enlace de planificación",
            "step4": "<strong>Consulta:</strong> Sesión de 60 minutos para optimizar tu búsqueda de empleo",
            "tip": "💡 <strong>Consejo:</strong> ¡Prepara tu CV y una lista de preguntas para aprovechar al máximo tu sesión!",
            "cta": "Ver mis solicitudes",
            "help": "¿Necesitas ayuda? Contáctanos en",
            "footer": "© 2026 HuntZenJobs - Tu socio en la búsqueda de empleo",
        },
        "pt": {
            "subject": "✅ Solicitação de consulta com recrutador confirmada - HuntZenJobs",
            "header": "🎯 HuntZenJobs - Consulta com Recrutador",
            "greeting": "Olá",
            "intro": "Recebemos sua solicitação de consulta com um recrutador especialista!",
            "recap_title": "📋 Resumo da sua solicitação",
            "sector_label": "Setor:",
            "experience_label": "Nível de experiência:",
            "date_label": "Data preferida:",
            "next_steps_title": "⏭️ Próximos passos",
            "step1": "<strong>Confirmação de pagamento:</strong> Seu pagamento de €50 foi processado com sucesso",
            "step2": "<strong>Atribuição de recrutador:</strong> Um especialista será designado ao seu processo em 24-48h",
            "step3": "<strong>Agendamento:</strong> Você receberá um email com um link de agendamento",
            "step4": "<strong>Consulta:</strong> Sessão de 60 minutos para otimizar sua busca de emprego",
            "tip": "💡 <strong>Dica:</strong> Prepare seu CV e uma lista de perguntas para aproveitar ao máximo sua sessão!",
            "cta": "Ver minhas solicitações",
            "help": "Precisa de ajuda? Entre em contato em",
            "footer": "© 2026 HuntZenJobs - Seu parceiro na busca de emprego",
        },
    },
    "application_confirmation": {
        "fr": {
            "subject_prefix": "✅ Candidature confirmée",
            "header": "🎉 Candidature enregistrée !",
            "header_sub": "Bonne chance pour cette opportunité",
            "intro": "Ta candidature a bien été enregistrée dans HuntZenJobs :",
            "tips_title": "💡 Conseils pour maximiser tes chances :",
            "tip1": "Envoie un message LinkedIn au recruteur dans les 24h",
            "tip2": "Si pas de réponse sous 2 semaines, relance poliment",
            "tip3": "Prépare 3 questions pertinentes sur le poste",
            "tip4": 'Mets à jour ton statut dans "Mes Candidatures"',
            "cta_primary": "Voir mes candidatures",
            "cta_secondary": "Chercher d'autres offres",
            "help": "Besoin d'aide ?",
            "manage": "Gérer mes notifications",
        },
        "en": {
            "subject_prefix": "✅ Application confirmed",
            "header": "🎉 Application recorded!",
            "header_sub": "Good luck with this opportunity",
            "intro": "Your application has been saved in HuntZenJobs:",
            "tips_title": "💡 Tips to maximize your chances:",
            "tip1": "Send a LinkedIn message to the recruiter within 24h",
            "tip2": "If no response within 2 weeks, follow up politely",
            "tip3": "Prepare 3 relevant questions about the role",
            "tip4": 'Update your status in "My Applications"',
            "cta_primary": "View my applications",
            "cta_secondary": "Search for more jobs",
            "help": "Need help?",
            "manage": "Manage my notifications",
        },
        "es": {
            "subject_prefix": "✅ Candidatura confirmada",
            "header": "🎉 ¡Candidatura registrada!",
            "header_sub": "Buena suerte con esta oportunidad",
            "intro": "Tu candidatura ha sido guardada en HuntZenJobs:",
            "tips_title": "💡 Consejos para maximizar tus posibilidades:",
            "tip1": "Envía un mensaje de LinkedIn al reclutador en las próximas 24h",
            "tip2": "Si no hay respuesta en 2 semanas, haz un seguimiento amable",
            "tip3": "Prepara 3 preguntas relevantes sobre el puesto",
            "tip4": 'Actualiza tu estado en "Mis Candidaturas"',
            "cta_primary": "Ver mis candidaturas",
            "cta_secondary": "Buscar más ofertas",
            "help": "¿Necesitas ayuda?",
            "manage": "Gestionar mis notificaciones",
        },
        "pt": {
            "subject_prefix": "✅ Candidatura confirmada",
            "header": "🎉 Candidatura registrada!",
            "header_sub": "Boa sorte com esta oportunidade",
            "intro": "Sua candidatura foi salva no HuntZenJobs:",
            "tips_title": "💡 Dicas para maximizar suas chances:",
            "tip1": "Envie uma mensagem no LinkedIn ao recrutador em 24h",
            "tip2": "Se não houver resposta em 2 semanas, faça um follow-up gentil",
            "tip3": "Prepare 3 perguntas relevantes sobre a vaga",
            "tip4": 'Atualize seu status em "Minhas Candidaturas"',
            "cta_primary": "Ver minhas candidaturas",
            "cta_secondary": "Buscar mais vagas",
            "help": "Precisa de ajuda?",
            "manage": "Gerenciar minhas notificações",
        },
    },
    "job_alerts": {
        "fr": {
            "subject_single": "🔔 {n} nouvelle offre correspond à ton profil",
            "subject_plural": "🔔 {n} nouvelles offres correspondent à ton profil",
            "header_single": "🔔 {n} nouvelle offre pour toi",
            "header_plural": "🔔 {n} nouvelles offres pour toi",
            "header_sub": "Des opportunités sélectionnées selon ton profil",
            "greeting": "Bonjour",
            "intro": "Voici les meilleures offres du jour qui correspondent à ton profil :",
            "view_offer": "Voir l'offre",
            "cta": "Voir toutes les offres",
            "manage": "Gérer mes alertes",
        },
        "en": {
            "subject_single": "🔔 {n} new job matches your profile",
            "subject_plural": "🔔 {n} new jobs match your profile",
            "header_single": "🔔 {n} new job for you",
            "header_plural": "🔔 {n} new jobs for you",
            "header_sub": "Opportunities selected based on your profile",
            "greeting": "Hello",
            "intro": "Here are today's best jobs that match your profile:",
            "view_offer": "View job",
            "cta": "View all jobs",
            "manage": "Manage my alerts",
        },
        "es": {
            "subject_single": "🔔 {n} nueva oferta coincide con tu perfil",
            "subject_plural": "🔔 {n} nuevas ofertas coinciden con tu perfil",
            "header_single": "🔔 {n} nueva oferta para ti",
            "header_plural": "🔔 {n} nuevas ofertas para ti",
            "header_sub": "Oportunidades seleccionadas según tu perfil",
            "greeting": "Hola",
            "intro": "Aquí están las mejores ofertas del día que coinciden con tu perfil:",
            "view_offer": "Ver oferta",
            "cta": "Ver todas las ofertas",
            "manage": "Gestionar mis alertas",
        },
        "pt": {
            "subject_single": "🔔 {n} nova vaga corresponde ao seu perfil",
            "subject_plural": "🔔 {n} novas vagas correspondem ao seu perfil",
            "header_single": "🔔 {n} nova vaga para você",
            "header_plural": "🔔 {n} novas vagas para você",
            "header_sub": "Oportunidades selecionadas de acordo com o seu perfil",
            "greeting": "Olá",
            "intro": "Aqui estão as melhores vagas do dia que correspondem ao seu perfil:",
            "view_offer": "Ver vaga",
            "cta": "Ver todas as vagas",
            "manage": "Gerenciar minhas alertas",
        },
    },
    "weekly_summary": {
        "fr": {
            "subject_prefix": "📊 Ton bilan de recherche d'emploi — semaine du",
            "header": "📊 Ton bilan de la semaine",
            "applications": "Candidatures",
            "saved": "Offres sauvegardées",
            "documents": "Documents générés",
            "views": "Offres consultées",
            "cta": "Voir mes candidatures",
        },
        "en": {
            "subject_prefix": "📊 Your job search summary — week of",
            "header": "📊 Your weekly summary",
            "applications": "Applications",
            "saved": "Saved jobs",
            "documents": "Documents generated",
            "views": "Jobs viewed",
            "cta": "View my applications",
        },
        "es": {
            "subject_prefix": "📊 Tu resumen de búsqueda de empleo — semana del",
            "header": "📊 Tu resumen de la semana",
            "applications": "Candidaturas",
            "saved": "Ofertas guardadas",
            "documents": "Documentos generados",
            "views": "Ofertas consultadas",
            "cta": "Ver mis candidaturas",
        },
        "pt": {
            "subject_prefix": "📊 Seu resumo de busca de emprego — semana de",
            "header": "📊 Seu resumo semanal",
            "applications": "Candidaturas",
            "saved": "Vagas salvas",
            "documents": "Documentos gerados",
            "views": "Vagas consultadas",
            "cta": "Ver minhas candidaturas",
        },
    },
    "welcome": {
        "fr": {
            "subject": "🎯 Bienvenue sur HuntZenJobs — ta recherche d'emploi commence !",
            "header": "🎯 Bienvenue sur HuntZenJobs !",
            "header_sub": "Ta recherche d'emploi commence maintenant",
            "greeting": "Bonjour",
            "intro": "Ton compte HuntZenJobs est prêt. Voici ce que tu peux faire dès maintenant :",
            "feature1": "🔍 <strong>Chercher des offres</strong> adaptées à ton profil",
            "feature2": "📄 <strong>Analyser ton CV</strong> et obtenir un score de matching",
            "feature3": "✉️ <strong>Générer ta lettre de motivation</strong> en 1 clic",
            "feature4": "📊 <strong>Suivre tes candidatures</strong> au même endroit",
            "cta": "Commencer ma recherche",
            "manage": "Gérer mes notifications",
        },
        "en": {
            "subject": "🎯 Welcome to HuntZenJobs — your job search starts now!",
            "header": "🎯 Welcome to HuntZenJobs!",
            "header_sub": "Your job search starts now",
            "greeting": "Hello",
            "intro": "Your HuntZenJobs account is ready. Here's what you can do right now:",
            "feature1": "🔍 <strong>Search for jobs</strong> tailored to your profile",
            "feature2": "📄 <strong>Analyze your CV</strong> and get a matching score",
            "feature3": "✉️ <strong>Generate your cover letter</strong> in 1 click",
            "feature4": "📊 <strong>Track your applications</strong> in one place",
            "cta": "Start my job search",
            "manage": "Manage my notifications",
        },
        "es": {
            "subject": "🎯 Bienvenido a HuntZenJobs — ¡tu búsqueda de empleo comienza ahora!",
            "header": "🎯 ¡Bienvenido a HuntZenJobs!",
            "header_sub": "Tu búsqueda de empleo comienza ahora",
            "greeting": "Hola",
            "intro": "Tu cuenta HuntZenJobs está lista. Esto es lo que puedes hacer ahora:",
            "feature1": "🔍 <strong>Buscar ofertas</strong> adaptadas a tu perfil",
            "feature2": "📄 <strong>Analizar tu CV</strong> y obtener una puntuación de matching",
            "feature3": "✉️ <strong>Generar tu carta de presentación</strong> en 1 clic",
            "feature4": "📊 <strong>Seguir tus candidaturas</strong> en un solo lugar",
            "cta": "Comenzar mi búsqueda",
            "manage": "Gestionar mis notificaciones",
        },
        "pt": {
            "subject": "🎯 Bem-vindo ao HuntZenJobs — sua busca de emprego começa agora!",
            "header": "🎯 Bem-vindo ao HuntZenJobs!",
            "header_sub": "Sua busca de emprego começa agora",
            "greeting": "Olá",
            "intro": "Sua conta HuntZenJobs está pronta. Veja o que você pode fazer agora:",
            "feature1": "🔍 <strong>Buscar vagas</strong> adaptadas ao seu perfil",
            "feature2": "📄 <strong>Analisar seu CV</strong> e obter uma pontuação de matching",
            "feature3": "✉️ <strong>Gerar sua carta de apresentação</strong> em 1 clique",
            "feature4": "📊 <strong>Acompanhar suas candidaturas</strong> em um só lugar",
            "cta": "Começar minha busca",
            "manage": "Gerenciar minhas notificações",
        },
    },
    "cv_analysis": {
        "fr": {
            "subject": "✅ Ton analyse CV est prête — HuntZenJobs",
            "header": "✅ Ton analyse CV est prête !",
            "intro": "Ton CV a été analysé avec succès par notre IA.",
            "intro2": "Tu peux maintenant consulter :",
            "point1": "📊 Ton <strong>score de matching</strong> par rapport aux offres",
            "point2": "💡 Les <strong>points forts</strong> et axes d'amélioration",
            "point3": "🎯 Les offres qui <strong>correspondent le mieux</strong> à ton profil",
            "cta": "Voir mon analyse",
            "manage": "Gérer mes notifications",
        },
        "en": {
            "subject": "✅ Your CV analysis is ready — HuntZenJobs",
            "header": "✅ Your CV analysis is ready!",
            "intro": "Your CV has been successfully analyzed by our AI.",
            "intro2": "You can now view:",
            "point1": "📊 Your <strong>matching score</strong> compared to job offers",
            "point2": "💡 Your <strong>strengths</strong> and areas for improvement",
            "point3": "🎯 The jobs that <strong>best match</strong> your profile",
            "cta": "View my analysis",
            "manage": "Manage my notifications",
        },
        "es": {
            "subject": "✅ Tu análisis de CV está listo — HuntZenJobs",
            "header": "✅ ¡Tu análisis de CV está listo!",
            "intro": "Tu CV ha sido analizado con éxito por nuestra IA.",
            "intro2": "Ahora puedes consultar:",
            "point1": "📊 Tu <strong>puntuación de matching</strong> respecto a las ofertas",
            "point2": "💡 Tus <strong>puntos fuertes</strong> y áreas de mejora",
            "point3": "🎯 Las ofertas que <strong>mejor se adaptan</strong> a tu perfil",
            "cta": "Ver mi análisis",
            "manage": "Gestionar mis notificaciones",
        },
        "pt": {
            "subject": "✅ Sua análise de CV está pronta — HuntZenJobs",
            "header": "✅ Sua análise de CV está pronta!",
            "intro": "Seu CV foi analisado com sucesso pela nossa IA.",
            "intro2": "Agora você pode ver:",
            "point1": "📊 Sua <strong>pontuação de matching</strong> em relação às vagas",
            "point2": "💡 Seus <strong>pontos fortes</strong> e áreas de melhoria",
            "point3": "🎯 As vagas que <strong>melhor correspondem</strong> ao seu perfil",
            "cta": "Ver minha análise",
            "manage": "Gerenciar minhas notificações",
        },
    },
    "document_generated": {
        "fr": {
            "cv_label": "CV adapté",
            "lm_label": "Lettre de motivation",
            "intro_tpl": "Ton {label} pour <strong>{job_title}</strong> chez <strong>{company}</strong> est prêt.",
            "subject_tpl": "{emoji} Ton {label} est prêt — {job_title} chez {company}",
            "cta": "Voir mes documents",
            "manage": "Gérer mes notifications",
        },
        "en": {
            "cv_label": "Tailored CV",
            "lm_label": "Cover letter",
            "intro_tpl": "Your {label} for <strong>{job_title}</strong> at <strong>{company}</strong> is ready.",
            "subject_tpl": "{emoji} Your {label} is ready — {job_title} at {company}",
            "cta": "View my documents",
            "manage": "Manage my notifications",
        },
        "es": {
            "cv_label": "CV adaptado",
            "lm_label": "Carta de presentación",
            "intro_tpl": "Tu {label} para <strong>{job_title}</strong> en <strong>{company}</strong> está listo.",
            "subject_tpl": "{emoji} Tu {label} está listo — {job_title} en {company}",
            "cta": "Ver mis documentos",
            "manage": "Gestionar mis notificaciones",
        },
        "pt": {
            "cv_label": "CV adaptado",
            "lm_label": "Carta de apresentação",
            "intro_tpl": "Seu {label} para <strong>{job_title}</strong> na <strong>{company}</strong> está pronto.",
            "subject_tpl": "{emoji} Seu {label} está pronto — {job_title} na {company}",
            "cta": "Ver meus documentos",
            "manage": "Gerenciar minhas notificações",
        },
    },
    "application_status": {
        "fr": {
            "interview_title": "Entretien décroché !",
            "offer_title": "Offre reçue !",
            "interview_msg": "Tu as un entretien pour <strong>{job_title}</strong> chez <strong>{company}</strong>. Prépare-toi bien !",
            "offer_msg": "Tu as reçu une offre pour <strong>{job_title}</strong> chez <strong>{company}</strong>. Félicitations !",
            "cta": "Voir mes candidatures",
            "manage": "Gérer mes notifications",
        },
        "en": {
            "interview_title": "Interview secured!",
            "offer_title": "Offer received!",
            "interview_msg": "You have an interview for <strong>{job_title}</strong> at <strong>{company}</strong>. Prepare well!",
            "offer_msg": "You have received an offer for <strong>{job_title}</strong> at <strong>{company}</strong>. Congratulations!",
            "cta": "View my applications",
            "manage": "Manage my notifications",
        },
        "es": {
            "interview_title": "¡Entrevista conseguida!",
            "offer_title": "¡Oferta recibida!",
            "interview_msg": "Tienes una entrevista para <strong>{job_title}</strong> en <strong>{company}</strong>. ¡Prepárate bien!",
            "offer_msg": "Has recibido una oferta para <strong>{job_title}</strong> en <strong>{company}</strong>. ¡Felicidades!",
            "cta": "Ver mis candidaturas",
            "manage": "Gestionar mis notificaciones",
        },
        "pt": {
            "interview_title": "Entrevista conquistada!",
            "offer_title": "Oferta recebida!",
            "interview_msg": "Você tem uma entrevista para <strong>{job_title}</strong> na <strong>{company}</strong>. Prepare-se bem!",
            "offer_msg": "Você recebeu uma oferta para <strong>{job_title}</strong> na <strong>{company}</strong>. Parabéns!",
            "cta": "Ver minhas candidaturas",
            "manage": "Gerenciar minhas notificações",
        },
    },
    "support_reply": {
        "fr": {
            "subject_tpl": "Réponse à votre ticket #{ticket_id} — {ticket_subject}",
            "header_tpl": "✅ Réponse à votre ticket #{ticket_id}",
            "greeting": "Bonjour",
            "intro": "Notre équipe a répondu à votre demande :",
            "footer": "Si vous avez d'autres questions, n'hésitez pas à ouvrir un nouveau ticket depuis votre espace HuntZenJobs.",
        },
        "en": {
            "subject_tpl": "Reply to your ticket #{ticket_id} — {ticket_subject}",
            "header_tpl": "✅ Reply to your ticket #{ticket_id}",
            "greeting": "Hello",
            "intro": "Our team has responded to your request:",
            "footer": "If you have further questions, feel free to open a new ticket from your HuntZenJobs account.",
        },
        "es": {
            "subject_tpl": "Respuesta a tu ticket #{ticket_id} — {ticket_subject}",
            "header_tpl": "✅ Respuesta a tu ticket #{ticket_id}",
            "greeting": "Hola",
            "intro": "Nuestro equipo ha respondido a tu solicitud:",
            "footer": "Si tienes más preguntas, no dudes en abrir un nuevo ticket desde tu espacio HuntZenJobs.",
        },
        "pt": {
            "subject_tpl": "Resposta ao seu ticket #{ticket_id} — {ticket_subject}",
            "header_tpl": "✅ Resposta ao seu ticket #{ticket_id}",
            "greeting": "Olá",
            "intro": "Nossa equipe respondeu à sua solicitação:",
            "footer": "Se tiver mais dúvidas, abra um novo ticket no seu espaço HuntZenJobs.",
        },
    },
    "payment_confirmation": {
        "fr": {
            "subject": "Paiement confirmé - HuntZenJobs",
            "header": "Paiement confirmé !",
            "greeting": "Bonjour",
            "intro": "Votre paiement a été traité avec succès.",
            "plan_label": "Plan :",
            "amount_label": "Montant :",
            "date_label": "Date :",
            "cta": "Accéder à mon espace",
            "footer": "Merci de votre confiance !",
        },
        "en": {
            "subject": "Payment confirmed - HuntZenJobs",
            "header": "Payment confirmed!",
            "greeting": "Hello",
            "intro": "Your payment has been processed successfully.",
            "plan_label": "Plan:",
            "amount_label": "Amount:",
            "date_label": "Date:",
            "cta": "Go to my dashboard",
            "footer": "Thank you for your trust!",
        },
        "es": {
            "subject": "Pago confirmado - HuntZenJobs",
            "header": "¡Pago confirmado!",
            "greeting": "Hola",
            "intro": "Tu pago ha sido procesado con éxito.",
            "plan_label": "Plan:",
            "amount_label": "Importe:",
            "date_label": "Fecha:",
            "cta": "Ir a mi espacio",
            "footer": "¡Gracias por tu confianza!",
        },
        "pt": {
            "subject": "Pagamento confirmado - HuntZenJobs",
            "header": "Pagamento confirmado!",
            "greeting": "Olá",
            "intro": "Seu pagamento foi processado com sucesso.",
            "plan_label": "Plano:",
            "amount_label": "Valor:",
            "date_label": "Data:",
            "cta": "Acessar meu espaço",
            "footer": "Obrigado pela sua confiança!",
        },
    },
    "payment_failed": {
        "fr": {
            "subject": "Paiement échoué - Action requise - HuntZenJobs",
            "header": "Paiement échoué",
            "greeting": "Bonjour",
            "intro": "Votre dernier paiement n'a pas pu être traité.",
            "action": "Pour conserver votre abonnement, veuillez mettre à jour votre moyen de paiement.",
            "cta": "Mettre à jour mon paiement",
            "footer": "Si vous avez des questions, contactez-nous à",
        },
        "en": {
            "subject": "Payment failed - Action required - HuntZenJobs",
            "header": "Payment failed",
            "greeting": "Hello",
            "intro": "Your latest payment could not be processed.",
            "action": "To keep your subscription, please update your payment method.",
            "cta": "Update my payment",
            "footer": "If you have any questions, contact us at",
        },
        "es": {
            "subject": "Pago fallido - Acción requerida - HuntZenJobs",
            "header": "Pago fallido",
            "greeting": "Hola",
            "intro": "Tu último pago no ha podido procesarse.",
            "action": "Para conservar tu suscripción, actualiza tu método de pago.",
            "cta": "Actualizar mi pago",
            "footer": "Si tienes alguna pregunta, contáctanos en",
        },
        "pt": {
            "subject": "Pagamento falhou - Ação necessária - HuntZenJobs",
            "header": "Pagamento falhou",
            "greeting": "Olá",
            "intro": "Seu último pagamento não pôde ser processado.",
            "action": "Para manter sua assinatura, atualize seu método de pagamento.",
            "cta": "Atualizar meu pagamento",
            "footer": "Se tiver dúvidas, entre em contato em",
        },
    },
    "contact_confirmation": {
        "fr": {
            "subject": "Nous avons bien reçu votre message - HuntZenJobs",
            "header": "Message bien reçu !",
            "greeting": "Bonjour",
            "body": "Nous avons bien reçu votre message et notre équipe vous répondra sous 48h en semaine.",
            "thanks": "Merci de votre confiance !",
            "cta": "Retour sur HuntZenJobsJobs",
        },
        "en": {
            "subject": "We received your message - HuntZenJobs",
            "header": "Message received!",
            "greeting": "Hello",
            "body": "We have received your message and our team will respond within 48 hours on business days.",
            "thanks": "Thank you for your trust!",
            "cta": "Back to HuntZenJobsJobs",
        },
        "es": {
            "subject": "Hemos recibido tu mensaje - HuntZenJobs",
            "header": "¡Mensaje recibido!",
            "greeting": "Hola",
            "body": "Hemos recibido tu mensaje y nuestro equipo te responderá en 48h en días laborables.",
            "thanks": "¡Gracias por tu confianza!",
            "cta": "Volver a HuntZenJobs",
        },
        "pt": {
            "subject": "Recebemos sua mensagem - HuntZenJobs",
            "header": "Mensagem recebida!",
            "greeting": "Olá",
            "body": "Recebemos sua mensagem e nossa equipe responderá em até 48h em dias úteis.",
            "thanks": "Obrigado pela sua confiança!",
            "cta": "Voltar ao HuntZenJobs",
        },
    },
    "subscription_cancelled": {
        "fr": {
            "subject": "Confirmation d'annulation - HuntZenJobs",
            "header": "Abonnement annulé",
            "greeting": "Bonjour",
            "intro": "Votre annulation a bien été prise en compte.",
            "plan_label": "Plan :",
            "end_date_label": "Accès jusqu'au :",
            "note": "Vous conservez l'accès à toutes les fonctionnalités de votre plan jusqu'à cette date.",
            "cta": "Retour sur HuntZenJobsJobs",
            "footer": "Vous pouvez vous réabonner à tout moment depuis votre espace.",
        },
        "en": {
            "subject": "Cancellation confirmed - HuntZenJobs",
            "header": "Subscription cancelled",
            "greeting": "Hello",
            "intro": "Your cancellation has been confirmed.",
            "plan_label": "Plan:",
            "end_date_label": "Access until:",
            "note": "You will keep access to all features of your plan until this date.",
            "cta": "Back to HuntZenJobsJobs",
            "footer": "You can resubscribe at any time from your dashboard.",
        },
        "es": {
            "subject": "Cancelación confirmada - HuntZenJobs",
            "header": "Suscripción cancelada",
            "greeting": "Hola",
            "intro": "Tu cancelación ha sido confirmada.",
            "plan_label": "Plan:",
            "end_date_label": "Acceso hasta:",
            "note": "Mantendrás el acceso a todas las funcionalidades de tu plan hasta esta fecha.",
            "cta": "Volver a HuntZenJobs",
            "footer": "Puedes volver a suscribirte en cualquier momento desde tu espacio.",
        },
        "pt": {
            "subject": "Cancelamento confirmado - HuntZenJobs",
            "header": "Assinatura cancelada",
            "greeting": "Olá",
            "intro": "Seu cancelamento foi confirmado.",
            "plan_label": "Plano:",
            "end_date_label": "Acesso até:",
            "note": "Você manterá o acesso a todas as funcionalidades do seu plano até esta data.",
            "cta": "Voltar ao HuntZenJobs",
            "footer": "Você pode se reinscrever a qualquer momento no seu espaço.",
        },
    },
}


def _lang(language: str) -> str:
    """Normalize language code — fallback to 'fr' if unsupported."""
    return language if language in ("fr", "en", "es", "pt") else "fr"


# ---------------------------------------------------------------------------
# User-facing email functions
# ---------------------------------------------------------------------------


def send_recruiter_request_confirmation(
    to_email: str,
    full_name: str,
    sector: str,
    experience_level: str,
    preferred_date: str | None = None,
    language: str = "fr",
) -> bool:
    """
    Send confirmation email to user after recruiter request submission.

    Args:
        to_email: User's email address
        full_name: User's full name
        sector: Professional sector
        experience_level: Experience level
        preferred_date: Preferred consultation date
        language: Email language ('fr' or 'en', default 'fr')

    Returns:
        bool: True if email sent successfully, False otherwise
    """
    try:
        lang = _lang(language)
        tr = _T["recruiter_confirmation"][lang]
        date_row = f'<div class="info-item"><span class="label">{tr["date_label"]}</span> {preferred_date}</div>' if preferred_date else ""

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
                    <h1>{tr["header"]}</h1>
                </div>
                <div class="content">
                    <h2>{tr["greeting"]} {full_name},</h2>
                    <p>{tr["intro"]}</p>

                    <div class="info-box">
                        <h3>{tr["recap_title"]}</h3>
                        <div class="info-item"><span class="label">{tr["sector_label"]}</span> {sector}</div>
                        <div class="info-item"><span class="label">{tr["experience_label"]}</span> {experience_level}</div>
                        {date_row}
                    </div>

                    <h3>{tr["next_steps_title"]}</h3>
                    <ol>
                        <li>{tr["step1"]}</li>
                        <li>{tr["step2"]}</li>
                        <li>{tr["step3"]}</li>
                        <li>{tr["step4"]}</li>
                    </ol>

                    <p style="background: #e0f2fe; padding: 15px; border-radius: 6px; margin-top: 20px;">
                        {tr["tip"]}
                    </p>

                    <a href="{settings.get_primary_frontend_url()}/recruiter-contact" class="button">{tr["cta"]}</a>
                </div>
                <div class="footer">
                    <p>{tr["help"]} <a href="mailto:contact@huntzenjobs.com">contact@huntzenjobs.com</a></p>
                    <p>{tr["footer"]}</p>
                </div>
            </div>
        </body>
        </html>
        """

        params = {
            "from": settings.from_email,
            "to": [to_email],
            "subject": tr["subject"],
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
    language: str = "fr",
) -> bool:
    """
    Send confirmation email after user confirms they applied to a job.
    """
    try:
        lang = _lang(language)
        tr = _T["application_confirmation"][lang]
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
                    <h1 style="margin:0;font-size:24px;">{tr["header"]}</h1>
                    <p style="margin:8px 0 0;opacity:0.9;">{tr["header_sub"]}</p>
                </div>
                <div class="content">
                    <p>{tr["intro"]}</p>

                    <div class="job-card">
                        <p class="job-title">{job_title}</p>
                        <p class="company">🏢 {company}</p>
                    </div>

                    <div class="tips">
                        <strong>{tr["tips_title"]}</strong>
                        <ul>
                            <li>{tr["tip1"]}</li>
                            <li>{tr["tip2"]}</li>
                            <li>{tr["tip3"]}</li>
                            <li>{tr["tip4"]}</li>
                        </ul>
                    </div>

                    <div style="text-align:center;margin-top:24px;">
                        <a href="{frontend_url}/candidatures" class="button">
                            {tr["cta_primary"]}
                        </a>
                        <a href="{frontend_url}/jobs" class="button-outline">
                            {tr["cta_secondary"]}
                        </a>
                    </div>
                </div>
                <div class="footer">
                    <p>{tr["help"]} <a href="mailto:contact@huntzenjobs.com" style="color:#00D9FF;">contact@huntzenjobs.com</a></p>
                    <p>© 2026 HuntZenJobs · <a href="{frontend_url}/profile" style="color:#94a3b8;">{tr["manage"]}</a></p>
                </div>
            </div>
        </body>
        </html>
        """

        params = {
            "from": settings.from_email,
            "to": [to_email],
            "subject": f"{tr['subject_prefix']} — {job_title} chez {company}",
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
    language: str = "fr",
) -> bool:
    """
    Send a job alert digest email with new matching offers.
    """
    try:
        lang = _lang(language)
        tr = _T["job_alerts"][lang]
        frontend_url = settings.get_primary_frontend_url()
        n = len(jobs)
        is_plural = n > 1

        subject = tr["subject_plural"].format(n=n) if is_plural else tr["subject_single"].format(n=n)
        header = tr["header_plural"].format(n=n) if is_plural else tr["header_single"].format(n=n)
        greeting_name = f" {user_name}" if user_name != "là" else ""

        job_cards_html = ""
        for job in jobs[:5]:
            salary_html = (
                f"<span style='color:#16a34a;font-size:13px;'>💰 {job.get('salary', '')}</span>"
                if job.get("salary")
                else ""
            )
            job_cards_html += f"""
            <div style="background:white;padding:16px;border-radius:8px;margin:10px 0;border:1px solid #e2e8f0;">
                <p style="margin:0 0 4px;font-weight:bold;color:#1e293b;font-size:15px;">{job.get('title','')}</p>
                <p style="margin:0 0 4px;color:#64748b;font-size:13px;">🏢 {job.get('company','')} · 📍 {job.get('location','')}</p>
                {salary_html}
                <a href="{frontend_url}/jobs?jobId={job.get('id','')}" style="display:inline-block;margin-top:10px;background:#00D9FF;color:white;padding:7px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:bold;">{tr["view_offer"]}</a>
            </div>
            """

        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#0D1F3C,#1a3a6b);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:22px;">{header}</h1>
                    <p style="color:#00D9FF;margin:8px 0 0;font-size:14px;">{tr["header_sub"]}</p>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <p>{tr["greeting"]}{greeting_name} 👋</p>
                    <p>{tr["intro"]}</p>
                    {job_cards_html}
                    <div style="text-align:center;margin-top:24px;">
                        <a href="{frontend_url}/jobs" style="display:inline-block;background:linear-gradient(135deg,#00D9FF,#0EA5E9);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                            {tr["cta"]}
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
                    © 2026 HuntZenJobs · <a href="{frontend_url}/profile" style="color:#94a3b8;">{tr["manage"]}</a>
                </p>
            </div>
        </body></html>
        """

        params = {
            "from": settings.from_email,
            "to": [to_email],
            "subject": subject,
            "html": html_content,
        }

        resend.Emails.send(params)
        logger.info(f"Job alerts sent to {to_email} ({n} jobs)")
        return True

    except Exception as e:
        logger.error(f"Failed to send job alerts to {to_email}: {e}")
        return False


def send_weekly_summary(
    to_email: str,
    stats: dict,
    language: str = "fr",
) -> bool:
    """
    Send weekly activity summary email.
    stats = { applications: int, saved: int, documents: int, views: int }
    """
    try:
        lang = _lang(language)
        tr = _T["weekly_summary"][lang]
        frontend_url = settings.get_primary_frontend_url()

        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:22px;">{tr["header"]}</h1>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0;">
                        <div style="background:white;padding:16px;border-radius:8px;text-align:center;border:1px solid #e2e8f0;">
                            <p style="font-size:28px;font-weight:bold;color:#00D9FF;margin:0;">{stats.get('applications', 0)}</p>
                            <p style="margin:4px 0 0;color:#64748b;font-size:13px;">{tr["applications"]}</p>
                        </div>
                        <div style="background:white;padding:16px;border-radius:8px;text-align:center;border:1px solid #e2e8f0;">
                            <p style="font-size:28px;font-weight:bold;color:#8b5cf6;margin:0;">{stats.get('saved', 0)}</p>
                            <p style="margin:4px 0 0;color:#64748b;font-size:13px;">{tr["saved"]}</p>
                        </div>
                        <div style="background:white;padding:16px;border-radius:8px;text-align:center;border:1px solid #e2e8f0;">
                            <p style="font-size:28px;font-weight:bold;color:#16a34a;margin:0;">{stats.get('documents', 0)}</p>
                            <p style="margin:4px 0 0;color:#64748b;font-size:13px;">{tr["documents"]}</p>
                        </div>
                        <div style="background:white;padding:16px;border-radius:8px;text-align:center;border:1px solid #e2e8f0;">
                            <p style="font-size:28px;font-weight:bold;color:#ea580c;margin:0;">{stats.get('views', 0)}</p>
                            <p style="margin:4px 0 0;color:#64748b;font-size:13px;">{tr["views"]}</p>
                        </div>
                    </div>
                    <div style="text-align:center;margin-top:20px;">
                        <a href="{frontend_url}/candidatures" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                            {tr["cta"]}
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">© 2026 HuntZenJobs</p>
            </div>
        </body></html>
        """

        params = {
            "from": settings.from_email,
            "to": [to_email],
            "subject": tr["subject_prefix"] + " " + datetime.now().strftime("%d/%m"),
            "html": html_content,
        }

        resend.Emails.send(params)
        logger.info(f"Weekly summary sent to {to_email}")
        return True

    except Exception as e:
        logger.error(f"Failed to send weekly summary to {to_email}: {e}")
        return False


def send_welcome(to_email: str, full_name: str = "", language: str = "fr") -> bool:
    """Send welcome email after signup."""
    try:
        lang = _lang(language)
        tr = _T["welcome"][lang]
        frontend_url = settings.get_primary_frontend_url()
        name = full_name or "là"

        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#0D1F3C,#1a3a6b);padding:32px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:26px;">{tr["header"]}</h1>
                    <p style="color:#00D9FF;margin:10px 0 0;font-size:15px;">{tr["header_sub"]}</p>
                </div>
                <div style="background:#f8fafc;padding:28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <p>{tr["greeting"]} {name} 👋</p>
                    <p>{tr["intro"]}</p>
                    <div style="background:white;padding:20px;border-radius:10px;margin:16px 0;border:1px solid #e2e8f0;">
                        <p style="margin:8px 0;">{tr["feature1"]}</p>
                        <p style="margin:8px 0;">{tr["feature2"]}</p>
                        <p style="margin:8px 0;">{tr["feature3"]}</p>
                        <p style="margin:8px 0;">{tr["feature4"]}</p>
                    </div>
                    <div style="text-align:center;margin-top:24px;">
                        <a href="{frontend_url}/jobs" style="display:inline-block;background:linear-gradient(135deg,#00D9FF,#0EA5E9);color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
                            {tr["cta"]}
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
                    © 2026 HuntZenJobs · <a href="{frontend_url}/profile" style="color:#94a3b8;">{tr["manage"]}</a>
                </p>
            </div>
        </body></html>
        """
        resend.Emails.send({
            "from": settings.from_email,
            "to": [to_email],
            "subject": tr["subject"],
            "html": html_content,
        })
        logger.info(f"Welcome email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send welcome email to {to_email}: {e}")
        return False


def send_cv_analysis_complete(to_email: str, language: str = "fr") -> bool:
    """Notify user their CV analysis is ready."""
    try:
        lang = _lang(language)
        tr = _T["cv_analysis"][lang]
        frontend_url = settings.get_primary_frontend_url()

        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#00D9FF,#0EA5E9);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:22px;">{tr["header"]}</h1>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <p>{tr["intro"]}</p>
                    <p>{tr["intro2"]}</p>
                    <div style="background:white;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #e2e8f0;">
                        <p style="margin:6px 0;">{tr["point1"]}</p>
                        <p style="margin:6px 0;">{tr["point2"]}</p>
                        <p style="margin:6px 0;">{tr["point3"]}</p>
                    </div>
                    <div style="text-align:center;margin-top:20px;">
                        <a href="{frontend_url}/cv-analysis" style="display:inline-block;background:linear-gradient(135deg,#00D9FF,#0EA5E9);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                            {tr["cta"]}
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
                    © 2026 HuntZenJobs · <a href="{frontend_url}/profile" style="color:#94a3b8;">{tr["manage"]}</a>
                </p>
            </div>
        </body></html>
        """
        resend.Emails.send({
            "from": settings.from_email,
            "to": [to_email],
            "subject": tr["subject"],
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
    language: str = "fr",
) -> bool:
    """Notify user their generated document (CV adapté or LM) is ready."""
    try:
        lang = _lang(language)
        tr = _T["document_generated"][lang]
        frontend_url = settings.get_primary_frontend_url()

        label = tr["cv_label"] if doc_type == "cv" else tr["lm_label"]
        emoji = "📄" if doc_type == "cv" else "✉️"
        intro = tr["intro_tpl"].format(label=label.lower(), job_title=job_title, company=company)
        subject = tr["subject_tpl"].format(emoji=emoji, label=label.lower(), job_title=job_title, company=company)
        gradient = "linear-gradient(135deg,#16a34a,#15803d)"

        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:{gradient};padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:22px;">{emoji} {label} !</h1>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <p>{intro}</p>
                    <div style="text-align:center;margin-top:20px;">
                        <a href="{frontend_url}/documents" style="display:inline-block;background:{gradient};color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                            {tr["cta"]}
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
                    © 2026 HuntZenJobs · <a href="{frontend_url}/profile" style="color:#94a3b8;">{tr["manage"]}</a>
                </p>
            </div>
        </body></html>
        """
        resend.Emails.send({
            "from": settings.from_email,
            "to": [to_email],
            "subject": subject,
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
    language: str = "fr",
) -> bool:
    """Notify user their application status changed to interview or offer."""
    try:
        lang = _lang(language)
        tr = _T["application_status"][lang]
        frontend_url = settings.get_primary_frontend_url()

        if new_status == "interview":
            emoji, color = "🎉", "#0EA5E9"
            title = tr["interview_title"]
            msg = tr["interview_msg"].format(job_title=job_title, company=company)
        else:  # offer
            emoji, color = "🏆", "#16a34a"
            title = tr["offer_title"]
            msg = tr["offer_msg"].format(job_title=job_title, company=company)

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
                            {tr["cta"]}
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
                    © 2026 HuntZenJobs · <a href="{frontend_url}/profile" style="color:#94a3b8;">{tr["manage"]}</a>
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


def send_payment_confirmation_email(
    user_email: str,
    plan_name: str,
    amount: str,
    language: str = "fr",
    invoice_url: str | None = None,
    invoice_pdf_url: str | None = None,
    billing_reason: str = "subscription_create",
) -> bool:
    """Send payment confirmation email after successful Stripe checkout or renewal."""
    try:
        lang = _lang(language)
        tr = _T["payment_confirmation"][lang]
        frontend_url = settings.get_primary_frontend_url()
        today = datetime.now().strftime("%d/%m/%Y")

        is_renewal = billing_reason == "subscription_cycle"
        renewal_subjects = {
            "fr": f"[HuntZenJobs] Renouvellement {plan_name} confirmé",
            "en": f"[HuntZenJobs] {plan_name} renewal confirmed",
            "es": f"[HuntZenJobs] Renovación {plan_name} confirmada",
            "pt": f"[HuntZenJobs] Renovação {plan_name} confirmada",
        }
        subject = renewal_subjects.get(lang, renewal_subjects["fr"]) if is_renewal else tr["subject"]

        invoice_block = ""
        if invoice_url:
            invoice_labels = {
                "fr": "Voir ma facture",
                "en": "View my invoice",
                "es": "Ver mi factura",
                "pt": "Ver minha fatura",
            }
            invoice_label = invoice_labels.get(lang, invoice_labels["fr"])
            invoice_block = f"""
                <div style="text-align:center;margin-top:12px;">
                    <a href="{invoice_url}" style="display:inline-block;background:#f1f5f9;color:#334155;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;border:1px solid #cbd5e1;">
                        🧾 {invoice_label}
                    </a>
                </div>"""

        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#16a34a,#15803d);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:22px;">{tr["header"]}</h1>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <p>{tr["greeting"]},</p>
                    <p>{tr["intro"]}</p>
                    <div style="background:white;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #16a34a;">
                        <p style="margin:6px 0;"><strong>{tr["plan_label"]}</strong> {plan_name}</p>
                        <p style="margin:6px 0;"><strong>{tr["amount_label"]}</strong> {amount}</p>
                        <p style="margin:6px 0;"><strong>{tr["date_label"]}</strong> {today}</p>
                    </div>
                    {invoice_block}
                    <p>{tr["footer"]}</p>
                    <div style="text-align:center;margin-top:20px;">
                        <a href="{frontend_url}/dashboard" style="display:inline-block;background:linear-gradient(135deg,#16a34a,#15803d);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                            {tr["cta"]}
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
                    &copy; 2026 HuntZenJobs
                </p>
            </div>
        </body></html>
        """
        email_payload: dict = {
            "from": settings.from_email,
            "to": [user_email],
            "subject": subject,
            "html": html_content,
        }

        # Attacher le PDF de la facture Stripe si disponible
        if invoice_pdf_url:
            try:
                pdf_resp = httpx.get(invoice_pdf_url, timeout=15)
                if pdf_resp.status_code == 200 and len(pdf_resp.content) > 0:
                    email_payload["attachments"] = [{
                        "filename": f"facture-huntzen-{today.replace('/', '-')}.pdf",
                        "content": list(pdf_resp.content),
                    }]
                    logger.info(f"Invoice PDF attached ({len(pdf_resp.content)} bytes)")
                else:
                    logger.warning(f"Failed to download invoice PDF: HTTP {pdf_resp.status_code}")
            except Exception as e:
                logger.warning(f"Could not attach invoice PDF: {e}")

        resend.Emails.send(email_payload)
        logger.info(f"Payment confirmation email sent to {user_email} (plan={plan_name}, reason={billing_reason})")
        return True
    except Exception as e:
        logger.error(f"Failed to send payment confirmation to {user_email}: {e}")
        return False


def send_payment_failed_email(
    user_email: str,
    language: str = "fr",
) -> bool:
    """Send payment failure alert email."""
    try:
        lang = _lang(language)
        tr = _T["payment_failed"][lang]
        frontend_url = settings.get_primary_frontend_url()

        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#dc2626,#991b1b);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:22px;">{tr["header"]}</h1>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <p>{tr["greeting"]},</p>
                    <p>{tr["intro"]}</p>
                    <p>{tr["action"]}</p>
                    <div style="text-align:center;margin-top:20px;">
                        <a href="{frontend_url}/profile" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#991b1b);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                            {tr["cta"]}
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
                    {tr["footer"]} <a href="mailto:contact@huntzenjobs.com" style="color:#94a3b8;">contact@huntzenjobs.com</a>
                    <br/>&copy; 2026 HuntZenJobs
                </p>
            </div>
        </body></html>
        """
        resend.Emails.send({
            "from": settings.from_email,
            "to": [user_email],
            "subject": tr["subject"],
            "html": html_content,
        })
        logger.info(f"Payment failed email sent to {user_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send payment failed email to {user_email}: {e}")
        return False


def send_subscription_cancelled_email(
    user_email: str,
    plan_name: str,
    end_date: str,
    language: str = "fr",
) -> bool:
    """Send subscription cancellation confirmation email."""
    try:
        lang = _lang(language)
        tr = _T["subscription_cancelled"][lang]
        frontend_url = settings.get_primary_frontend_url()

        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#6b7280,#4b5563);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:22px;">{tr["header"]}</h1>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <p>{tr["greeting"]},</p>
                    <p>{tr["intro"]}</p>
                    <div style="background:white;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #6b7280;">
                        <p style="margin:6px 0;"><strong>{tr["plan_label"]}</strong> {plan_name}</p>
                        <p style="margin:6px 0;"><strong>{tr["end_date_label"]}</strong> {end_date}</p>
                    </div>
                    <p style="background:#fef3c7;padding:12px;border-radius:6px;">{tr["note"]}</p>
                    <div style="text-align:center;margin-top:20px;">
                        <a href="{frontend_url}" style="display:inline-block;background:linear-gradient(135deg,#00D9FF,#0EA5E9);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                            {tr["cta"]}
                        </a>
                    </div>
                    <p style="color:#64748b;font-size:13px;margin-top:16px;">{tr["footer"]}</p>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
                    &copy; 2026 HuntZenJobs
                </p>
            </div>
        </body></html>
        """
        resend.Emails.send({
            "from": settings.from_email,
            "to": [user_email],
            "subject": tr["subject"],
            "html": html_content,
        })
        logger.info(f"Subscription cancelled email sent to {user_email} (plan={plan_name})")
        return True
    except Exception as e:
        logger.error(f"Failed to send cancellation email to {user_email}: {e}")
        return False


# ---------------------------------------------------------------------------
# Admin-only email functions (no language param — always FR)
# ---------------------------------------------------------------------------


def send_recruiter_request_notification(
    request_id: str,
    full_name: str,
    email: str,
    phone: str | None,
    sector: str,
    experience_level: str,
    message: str,
    preferred_date: str | None = None,
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
    language: str = "fr",
) -> bool:
    """
    Send admin reply to the user who submitted the ticket.
    """
    try:
        lang = _lang(language)
        tr = _T["support_reply"][lang]
        first_name = user_name.split()[0] if user_name else "Utilisateur"

        frontend_url = settings.get_primary_frontend_url()
        if lang == "fr":
            cta_label = "Voir mon espace support"
        elif lang == "es":
            cta_label = "Ver mi espacio de soporte"
        elif lang == "pt":
            cta_label = "Ver meu espaço de suporte"
        else:
            cta_label = "View my support area"

        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#0EA5E9 0%,#2563EB 100%);color:white;padding:28px;text-align:center;border-radius:12px 12px 0 0;">
                    <h1 style="margin:0;font-size:22px;">💬 {tr["header_tpl"].format(ticket_id=ticket_id)}</h1>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <p style="margin:0 0 12px;">{tr["greeting"]} {first_name},</p>
                    <p style="margin:0 0 16px;">{tr["intro"]} <strong>{ticket_subject}</strong></p>
                    <div style="background:white;border-radius:8px;padding:20px;margin:16px 0;border-left:4px solid #00d4aa;border:1px solid #e2e8f0;border-left:4px solid #00d4aa;">
                        {admin_reply}
                    </div>
                    <div style="text-align:center;margin-top:24px;">
                        <a href="{frontend_url}/support" style="display:inline-block;background:linear-gradient(135deg,#0EA5E9,#2563EB);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                            {cta_label}
                        </a>
                    </div>
                    <p style="color:#94a3b8;font-size:13px;margin-top:20px;">
                        {tr["footer"]}
                    </p>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">&copy; 2026 HuntZenJobs</p>
            </div>
        </body></html>
        """

        params = {
            "from": settings.from_email,
            "to": [user_email],
            "subject": tr["subject_tpl"].format(ticket_id=ticket_id, ticket_subject=ticket_subject),
            "html": html_content,
        }

        email = resend.Emails.send(params)
        logger.info(f"Support reply sent to {user_email} for ticket {ticket_id}: {email}")
        return True

    except Exception as e:
        logger.error(f"Failed to send support reply for ticket {ticket_id}: {e}")
        return False


# ---------------------------------------------------------------------------
# Contact form emails
# ---------------------------------------------------------------------------


def send_contact_confirmation(to_email: str, full_name: str, language: str = "fr") -> bool:
    """Send a short acknowledgement to the person who submitted the contact form."""
    try:
        lang = _lang(language)
        tr = _T["contact_confirmation"][lang]
        frontend_url = settings.get_primary_frontend_url()
        name = full_name or "there"

        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#0D1F3C,#1a3a6b);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:22px;">{tr["header"]}</h1>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <p>{tr["greeting"]} {name},</p>
                    <p>{tr["body"]}</p>
                    <p>{tr["thanks"]}</p>
                    <div style="text-align:center;margin-top:24px;">
                        <a href="{frontend_url}" style="display:inline-block;background:linear-gradient(135deg,#00D9FF,#0EA5E9);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                            {tr["cta"]}
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
                    &copy; 2026 HuntZenJobs
                </p>
            </div>
        </body></html>
        """

        resend.Emails.send({
            "from": settings.from_email,
            "to": [to_email],
            "subject": tr["subject"],
            "html": html_content,
        })
        logger.info(f"Contact confirmation sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send contact confirmation to {to_email}: {e}")
        return False


def send_contact_admin_notification(
    full_name: str,
    email: str,
    reason: str,
    message: str,
) -> bool:
    """Notify admin of a new contact form submission."""
    try:
        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#0EA5E9,#2563EB);color:white;padding:28px;text-align:center;border-radius:12px 12px 0 0;">
                    <h1 style="margin:0;font-size:22px;">📩 Nouveau message de contact</h1>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <div style="background:white;padding:16px 20px;border-radius:8px;margin:0 0 16px;border-left:4px solid #0EA5E9;border:1px solid #e2e8f0;border-left:4px solid #0EA5E9;">
                        <p style="margin:6px 0;"><strong style="color:#555;">Nom :</strong> {full_name}</p>
                        <p style="margin:6px 0;"><strong style="color:#555;">Email :</strong> <a href="mailto:{email}" style="color:#0EA5E9;">{email}</a></p>
                        <p style="margin:6px 0;"><strong style="color:#555;">Motif :</strong> {reason}</p>
                    </div>
                    <h3 style="margin:16px 0 8px;color:#1e293b;">Message</h3>
                    <div style="background:white;border-radius:8px;padding:20px;border:1px solid #e2e8f0;">
                        {message}
                    </div>
                    <div style="text-align:center;margin-top:24px;">
                        <a href="mailto:{email}" style="display:inline-block;background:linear-gradient(135deg,#0EA5E9,#2563EB);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                            Répondre à {full_name}
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">&copy; 2026 HuntZenJobs — Admin</p>
            </div>
        </body></html>
        """

        resend.Emails.send({
            "from": settings.from_email,
            "to": ["contact@huntzenjobs.com"],
            "subject": f"[Contact] {full_name} - {reason}",
            "html": html_content,
        })
        logger.info(f"Contact admin notification sent for {email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send contact admin notification for {email}: {e}")
        return False


def send_expiring_plan_email(
    user_email: str,
    plan_name: str,
    language: str = "fr",
) -> bool:
    """Email J-7 avant expiration d'un plan admin_granted."""
    try:
        lang = _lang(language)
        frontend_url = settings.get_primary_frontend_url()
        if lang == "fr":
            subject = f"Votre accès {plan_name} expire dans 7 jours"
            body_line1 = f"Votre accès au plan <strong>{plan_name}</strong> expire dans <strong>7 jours</strong>."
            body_line2 = "Pour continuer à profiter de toutes les fonctionnalités, activez votre abonnement avant la date d'expiration."
            cta = "Activer mon abonnement"
        elif lang == "es":
            subject = f"Su acceso {plan_name} expira en 7 días"
            body_line1 = f"Su acceso al plan <strong>{plan_name}</strong> expira en <strong>7 días</strong>."
            body_line2 = "Para seguir disfrutando de todas las funcionalidades, active su suscripción antes de la fecha de expiración."
            cta = "Activar mi suscripción"
        elif lang == "pt":
            subject = f"Seu acesso {plan_name} expira em 7 dias"
            body_line1 = f"Seu acesso ao plano <strong>{plan_name}</strong> expira em <strong>7 dias</strong>."
            body_line2 = "Para continuar aproveitando todas as funcionalidades, ative sua assinatura antes da data de expiração."
            cta = "Ativar minha assinatura"
        else:
            subject = f"Your {plan_name} access expires in 7 days"
            body_line1 = f"Your <strong>{plan_name}</strong> plan access expires in <strong>7 days</strong>."
            body_line2 = "To keep enjoying all features, activate your subscription before the expiry date."
            cta = "Activate my subscription"

        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:22px;">⏰ {subject}</h1>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <p>{body_line1}</p>
                    <p>{body_line2}</p>
                    <div style="text-align:center;margin-top:24px;">
                        <a href="{frontend_url}/pricing" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                            {cta}
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">&copy; 2026 HuntZenJobs</p>
            </div>
        </body></html>
        """
        resend.Emails.send({
            "from": settings.from_email,
            "to": [user_email],
            "subject": subject,
            "html": html_content,
        })
        logger.info(f"Expiry warning email sent to {user_email} (plan={plan_name})")
        return True
    except Exception as e:
        logger.error(f"Failed to send expiry warning to {user_email}: {e}")
        return False


def send_expiring_plan_tomorrow_email(
    user_email: str,
    plan_name: str,
    language: str = "fr",
) -> bool:
    """Email J-1 avant expiration d'un plan admin_granted."""
    try:
        lang = _lang(language)
        frontend_url = settings.get_primary_frontend_url()
        if lang == "fr":
            subject = f"Dernier jour : votre accès {plan_name} expire demain"
            body_line1 = f"Votre accès au plan <strong>{plan_name}</strong> expire <strong>demain</strong>."
            body_line2 = "C'est votre dernière chance pour activer votre abonnement et conserver toutes vos fonctionnalités."
            cta = "Activer mon abonnement maintenant"
        elif lang == "es":
            subject = f"Último día: su acceso {plan_name} expira mañana"
            body_line1 = f"Su acceso al plan <strong>{plan_name}</strong> expira <strong>mañana</strong>."
            body_line2 = "Es su última oportunidad para activar su suscripción y conservar todas sus funcionalidades."
            cta = "Activar mi suscripción ahora"
        elif lang == "pt":
            subject = f"Último dia: seu acesso {plan_name} expira amanhã"
            body_line1 = f"Seu acesso ao plano <strong>{plan_name}</strong> expira <strong>amanhã</strong>."
            body_line2 = "Esta é sua última chance para ativar sua assinatura e manter todas as funcionalidades."
            cta = "Ativar minha assinatura agora"
        else:
            subject = f"Last day: your {plan_name} access expires tomorrow"
            body_line1 = f"Your <strong>{plan_name}</strong> plan access expires <strong>tomorrow</strong>."
            body_line2 = "This is your last chance to activate your subscription and keep all your features."
            cta = "Activate my subscription now"

        html_content = f"""
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:white;margin:0;font-size:22px;">🚨 {subject}</h1>
                </div>
                <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                    <p>{body_line1}</p>
                    <p>{body_line2}</p>
                    <div style="text-align:center;margin-top:24px;">
                        <a href="{frontend_url}/pricing" style="display:inline-block;background:linear-gradient(135deg,#ef4444,#dc2626);color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
                            {cta}
                        </a>
                    </div>
                </div>
                <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">&copy; 2026 HuntZenJobs</p>
            </div>
        </body></html>
        """
        resend.Emails.send({
            "from": settings.from_email,
            "to": [user_email],
            "subject": subject,
            "html": html_content,
        })
        logger.info(f"Expiry J-1 email sent to {user_email} (plan={plan_name})")
        return True
    except Exception as e:
        logger.error(f"Failed to send expiry J-1 to {user_email}: {e}")
        return False
