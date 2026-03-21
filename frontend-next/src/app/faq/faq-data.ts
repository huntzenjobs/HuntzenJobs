/**
 * FAQ Data - Shared between Server and Client Components
 * Questions groupées par catégorie pour SEO et Featured Snippets
 *
 * Prices and limits are injected dynamically to stay in sync
 * with Supabase subscription_plans (admin panel).
 */

export interface FaqParams {
  proPrice: string;
  freeCvLimit: number;
}

export function buildFaqCategories(params: FaqParams) {
  const { proPrice, freeCvLimit } = params;

  return [
    {
      category: "HuntZen Jobs - Général",
      questions: [
        {
          q: "Qu'est-ce que HuntZen Jobs ?",
          a: "HuntZen Jobs est une plateforme innovante d'aide à la recherche d'emploi en France. HuntZen combine intelligence artificielle, analyse CV ATS, et coaching personnalisé pour vous aider à trouver l'emploi idéal. Avec des milliers d'offres d'emploi actualisées quotidiennement, HuntZen Jobs transforme votre recherche d'emploi en véritable succès.",
        },
        {
          q: "Comment fonctionne HuntZen Jobs ?",
          a: "HuntZen Jobs utilise l'IA pour matcher votre profil avec les meilleures offres d'emploi. Uploadez votre CV sur HuntZen, notre algorithme analyse votre profil et vos compétences, puis vous propose des offres d'emploi parfaitement adaptées. HuntZen Jobs optimise aussi votre CV pour les systèmes ATS des recruteurs.",
        },
        {
          q: "HuntZen Jobs est-il gratuit ?",
          a: `Oui ! HuntZen Jobs propose un plan gratuit avec ${freeCvLimit} analyse(s) CV par jour et accès aux offres d'emploi. Pour débloquer toutes les fonctionnalités de HuntZen (analyses CV illimitées, coaching personnalisé, alertes emploi personnalisées), passez au plan Pro HuntZen Jobs à seulement ${proPrice}.`,
        },
        {
          q: "Pourquoi choisir HuntZen Jobs plutôt qu'Indeed ou LinkedIn ?",
          a: "Contrairement à Indeed ou LinkedIn, HuntZen Jobs vous offre un coach personnalisé, une analyse CV ATS professionnelle, et un matching intelligent. HuntZen ne se contente pas de lister des offres : nous vous accompagnons de A à Z. La majorité de nos utilisateurs HuntZen Jobs reçoivent plus de réponses qu'avec Indeed ou LinkedIn.",
        },
      ],
    },
    {
      category: "Analyse CV & ATS",
      questions: [
        {
          q: "Comment fonctionne l'analyse CV de HuntZen Jobs ?",
          a: "L'analyse CV HuntZen Jobs scanne votre CV avec la même technologie ATS que les recruteurs. HuntZen détecte les mots-clés manquants, les erreurs de formatage, et vous donne un score ATS. Ensuite, HuntZen vous fournit des recommandations précises pour améliorer votre CV et passer les filtres ATS.",
        },
        {
          q: "Qu'est-ce qu'un score ATS sur HuntZen Jobs ?",
          a: "Le score ATS HuntZen Jobs mesure la compatibilité de votre CV avec les systèmes de tri automatique des recruteurs. Un score HuntZen supérieur à 80% garantit que votre CV sera lu par un humain. HuntZen analyse format, mots-clés, structure et lisibilité pour calculer ce score.",
        },
        {
          q: "Combien d'analyses CV puis-je faire avec HuntZen Jobs ?",
          a: `Avec le plan gratuit HuntZen Jobs, vous avez droit à ${freeCvLimit} analyse(s) CV par jour. Avec le plan Pro HuntZen, les analyses CV sont illimitées. HuntZen Pro vous permet aussi de comparer plusieurs versions de votre CV et de suivre l'évolution de votre score ATS.`,
        },
        {
          q: "HuntZen Jobs garde-t-il mon CV confidentiel ?",
          a: "Absolument ! HuntZen Jobs respecte la confidentialité de vos données. Votre CV est stocké de manière sécurisée et chiffrée. HuntZen ne partage JAMAIS votre CV sans votre autorisation explicite. Vous contrôlez totalement la visibilité de votre profil sur HuntZen Jobs.",
        },
      ],
    },
    {
      category: "Recherche d'emploi",
      questions: [
        {
          q: "Combien d'offres d'emploi HuntZen Jobs propose-t-il ?",
          a: "HuntZen Jobs agrège des milliers d'offres d'emploi en France, mises à jour quotidiennement. HuntZen compile les offres de toutes les grandes plateformes (Indeed, LinkedIn, Welcome to the Jungle, etc.) et les filtre pour vous proposer uniquement les plus pertinentes selon votre profil.",
        },
        {
          q: "Comment HuntZen Jobs trouve les offres d'emploi qui me correspondent ?",
          a: "HuntZen Jobs utilise un algorithme de matching qui analyse votre CV, vos compétences, votre expérience et vos préférences. Ensuite, HuntZen compare ces données avec les offres d'emploi disponibles pour vous proposer les meilleures opportunités chaque jour. Le matching HuntZen s'améliore au fur et à mesure.",
        },
        {
          q: "Puis-je postuler directement via HuntZen Jobs ?",
          a: "HuntZen Jobs vous redirige vers le site de l'offre d'emploi pour postuler directement. Pour chaque offre sur HuntZen, vous accédez au lien de candidature original. Avant de postuler, HuntZen vous aide à optimiser votre CV et à préparer votre candidature pour maximiser vos chances.",
        },
        {
          q: "HuntZen Jobs propose-t-il des alertes emploi ?",
          a: "Oui ! Avec HuntZen Jobs Pro, vous recevez des alertes emploi personnalisées par email. HuntZen vous prévient dès qu'une nouvelle offre correspond à votre profil. Configurez vos critères (secteur, localisation, salaire) et laissez HuntZen analyser les nouvelles offres pour vous.",
        },
      ],
    },
    {
      category: "Assistant Carrière",
      questions: [
        {
          q: "Qu'est-ce que l'Assistant Carrière HuntZen Jobs ?",
          a: "L'Assistant Carrière HuntZen Jobs est un coach personnalisé accessible depuis votre tableau de bord. HuntZen vous aide à préparer vos entretiens, rédiger des lettres de motivation, optimiser votre CV, et construire votre stratégie de recherche d'emploi. C'est comme avoir un consultant carrière dédié sur HuntZen.",
        },
        {
          q: "Comment HuntZen Jobs m'aide à préparer mes entretiens ?",
          a: "HuntZen Jobs analyse l'offre d'emploi et votre profil pour générer des questions d'entretien personnalisées. HuntZen vous fournit aussi des réponses types, des conseils comportementaux, et des simulations d'entretien. Avec HuntZen, vous arrivez préparé(e) et confiant(e) en entretien.",
        },
        {
          q: "HuntZen Jobs peut-il rédiger ma lettre de motivation ?",
          a: "Oui ! HuntZen Jobs génère des lettres de motivation personnalisées en quelques secondes. Donnez à HuntZen l'offre d'emploi et votre CV : votre coach rédige une lettre professionnelle, convaincante et adaptée. Vous pouvez ensuite personnaliser le texte généré par HuntZen.",
        },
      ],
    },
    {
      category: "Tarifs & Abonnement",
      questions: [
        {
          q: "Combien coûte HuntZen Jobs ?",
          a: `HuntZen Jobs propose 2 plans : Gratuit (0€/mois) avec ${freeCvLimit} analyse(s) CV/jour et accès aux offres, et Pro (${proPrice}) avec analyses CV illimitées, coach personnel, alertes emploi, et accompagnement personnalisé. Vous pouvez passer au plan Pro à tout moment depuis votre compte.`,
        },
        {
          q: "Comment annuler mon abonnement HuntZen Jobs ?",
          a: "Vous pouvez annuler votre abonnement HuntZen Jobs à tout moment depuis votre compte. Allez dans Paramètres > Abonnement > Annuler. Aucun frais caché : avec HuntZen, vous payez uniquement jusqu'à la fin de votre période. Votre accès HuntZen Pro reste actif jusqu'à expiration.",
        },
        {
          q: "Puis-je obtenir un remboursement si HuntZen Jobs ne me convient pas ?",
          a: "Si vous n'êtes pas satisfait de votre abonnement HuntZen Jobs, contactez notre support à support@huntzenjobs.com. Chaque demande est étudiée individuellement. Vous pouvez aussi annuler votre abonnement à tout moment pour ne plus être facturé à la prochaine échéance.",
        },
      ],
    },
    {
      category: "Support & Aide",
      questions: [
        {
          q: "Comment contacter le support HuntZen Jobs ?",
          a: "Le support HuntZen Jobs est disponible par email à support@huntzenjobs.com. Nos équipes HuntZen répondent en moins de 48h en semaine. Pour les utilisateurs Pro, HuntZen offre un support prioritaire.",
        },
        {
          q: "HuntZen Jobs propose-t-il des tutoriels vidéo ?",
          a: "HuntZen Jobs met à disposition des guides d'utilisation directement dans l'interface. Pour toute question, notre équipe support est disponible par email à support@huntzenjobs.com.",
        },
        {
          q: "Puis-je utiliser HuntZen Jobs sur mobile ?",
          a: "Oui ! HuntZen Jobs est 100% responsive et fonctionne parfaitement sur mobile et tablette via votre navigateur. Accédez à toutes les fonctionnalités depuis votre smartphone : recherche d'emploi, analyse de CV, et coaching personnalisé.",
        },
      ],
    },
  ];
}
