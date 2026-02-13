"use client";

/**
 * FAQ Client Component - Interactive accordion
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, MessageCircle } from "lucide-react";
import Link from "next/link";
import { InternalLinksFooter } from "@/components/seo/internal-links";

// Questions groupées par catégorie
const faqCategories = [
  {
    category: "HuntZen Jobs - Général",
    questions: [
      {
        q: "Qu'est-ce que HuntZen Jobs ?",
        a: "HuntZen Jobs est la plateforme N°1 de recherche d'emploi en France. HuntZen combine intelligence artificielle, analyse CV ATS, et coaching personnalisé pour vous aider à trouver l'emploi idéal. Avec +100 000 offres d'emploi actualisées quotidiennement, HuntZen Jobs transforme votre recherche d'emploi en véritable succès.",
      },
      {
        q: "Comment fonctionne HuntZen Jobs ?",
        a: "HuntZen Jobs utilise l'IA pour matcher votre profil avec les meilleures offres d'emploi. Uploadez votre CV sur HuntZen, notre algorithme analyse votre profil et vos compétences, puis vous propose des offres d'emploi parfaitement adaptées. HuntZen Jobs optimise aussi votre CV pour les systèmes ATS des recruteurs.",
      },
      {
        q: "HuntZen Jobs est-il gratuit ?",
        a: "Oui ! HuntZen Jobs propose un plan gratuit avec 1 analyse CV par jour et accès aux offres d'emploi. Pour débloquer toutes les fonctionnalités de HuntZen (analyses CV illimitées, coaching IA, alertes emploi personnalisées), passez au plan Pro HuntZen Jobs à seulement 19€/mois.",
      },
      {
        q: "Pourquoi choisir HuntZen Jobs plutôt qu'Indeed ou LinkedIn ?",
        a: "Contrairement à Indeed ou LinkedIn, HuntZen Jobs vous offre un coach IA personnalisé, une analyse CV ATS professionnelle, et un matching intelligent. HuntZen ne se contente pas de lister des offres : nous vous accompagnons de A à Z. 87% de nos utilisateurs HuntZen Jobs reçoivent plus de réponses qu'avec Indeed ou LinkedIn.",
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
        a: "Avec le plan gratuit HuntZen Jobs, vous avez droit à 1 analyse CV par jour. Avec le plan Pro HuntZen, les analyses CV sont illimitées. HuntZen Pro vous permet aussi de comparer plusieurs versions de votre CV et de suivre l'évolution de votre score ATS.",
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
        a: "HuntZen Jobs agrège +100 000 offres d'emploi en France, mises à jour quotidiennement. HuntZen compile les offres de toutes les grandes plateformes (Indeed, LinkedIn, Welcome to the Jungle, etc.) et les filtre pour vous proposer uniquement les plus pertinentes selon votre profil.",
      },
      {
        q: "Comment HuntZen Jobs trouve les offres d'emploi qui me correspondent ?",
        a: "HuntZen Jobs utilise un algorithme de matching IA qui analyse votre CV, vos compétences, votre expérience et vos préférences. Ensuite, HuntZen compare ces données avec +100 000 offres d'emploi pour vous proposer un top 10 personnalisé chaque jour. Le matching HuntZen s'améliore au fur et à mesure.",
      },
      {
        q: "Puis-je postuler directement via HuntZen Jobs ?",
        a: "Oui ! HuntZen Jobs vous permet de postuler en 1 clic avec votre CV optimisé. Pour chaque offre sur HuntZen, nous pré-remplissons votre candidature avec vos informations. Vous validez et envoyez. HuntZen facilite et accélère vos candidatures pour maximiser vos chances.",
      },
      {
        q: "HuntZen Jobs propose-t-il des alertes emploi ?",
        a: "Oui ! Avec HuntZen Jobs Pro, vous recevez des alertes emploi personnalisées par email ou SMS. HuntZen vous prévient dès qu'une nouvelle offre correspond à votre profil. Configurez vos critères (secteur, localisation, salaire) et laissez HuntZen travailler pour vous 24/7.",
      },
    ],
  },
  {
    category: "Assistant Carrière IA",
    questions: [
      {
        q: "Qu'est-ce que l'Assistant Carrière HuntZen Jobs ?",
        a: "L'Assistant Carrière HuntZen Jobs est un coach IA personnalisé disponible 24/7. HuntZen vous aide à préparer vos entretiens, négocier votre salaire, rédiger lettres de motivation, et construire votre stratégie de recherche d'emploi. C'est comme avoir un consultant carrière dédié sur HuntZen.",
      },
      {
        q: "Comment HuntZen Jobs m'aide à préparer mes entretiens ?",
        a: "HuntZen Jobs analyse l'offre d'emploi et votre profil pour générer des questions d'entretien personnalisées. HuntZen vous fournit aussi des réponses types, des conseils comportementaux, et des simulations d'entretien. Avec HuntZen, vous arrivez préparé(e) et confiant(e) en entretien.",
      },
      {
        q: "HuntZen Jobs peut-il rédiger ma lettre de motivation ?",
        a: "Oui ! HuntZen Jobs génère des lettres de motivation personnalisées en quelques secondes. Donnez à HuntZen l'offre d'emploi et votre CV : notre IA rédige une lettre professionnelle, convaincante et adaptée. Vous pouvez ensuite personnaliser le texte généré par HuntZen.",
      },
    ],
  },
  {
    category: "Tarifs & Abonnement",
    questions: [
      {
        q: "Combien coûte HuntZen Jobs ?",
        a: "HuntZen Jobs propose 2 plans : Gratuit (0€/mois) avec 1 analyse CV/jour et accès aux offres, et Pro (19€/mois) avec analyses CV illimitées, assistant IA, alertes emploi, et coaching personnalisé. HuntZen Jobs offre aussi 7 jours d'essai gratuit du plan Pro.",
      },
      {
        q: "Comment annuler mon abonnement HuntZen Jobs ?",
        a: "Vous pouvez annuler votre abonnement HuntZen Jobs à tout moment depuis votre compte. Allez dans Paramètres > Abonnement > Annuler. Aucun frais caché : avec HuntZen, vous payez uniquement jusqu'à la fin de votre période. Votre accès HuntZen Pro reste actif jusqu'à expiration.",
      },
      {
        q: "HuntZen Jobs propose-t-il une garantie satisfait ou remboursé ?",
        a: "Oui ! HuntZen Jobs offre une garantie 14 jours satisfait ou remboursé. Si HuntZen ne vous convient pas, contactez-nous et nous vous remboursons intégralement. Nous sommes convaincus que HuntZen transformera votre recherche d'emploi.",
      },
    ],
  },
  {
    category: "Support & Aide",
    questions: [
      {
        q: "Comment contacter le support HuntZen Jobs ?",
        a: "Le support HuntZen Jobs est disponible par email (support@huntzenjobs.com), chat en direct (24/7), et téléphone (lundi-vendredi 9h-18h). Nos équipes HuntZen répondent en moins de 2h en moyenne. Pour les utilisateurs Pro, HuntZen offre un support prioritaire.",
      },
      {
        q: "HuntZen Jobs propose-t-il des tutoriels vidéo ?",
        a: "Oui ! HuntZen Jobs met à disposition une bibliothèque complète de tutoriels vidéo, guides PDF, et webinaires. Consultez notre centre d'aide HuntZen Jobs pour apprendre à maximiser votre utilisation de la plateforme. Nouveaux contenus HuntZen chaque semaine !",
      },
      {
        q: "Puis-je utiliser HuntZen Jobs sur mobile ?",
        a: "Oui ! HuntZen Jobs est 100% responsive et fonctionne parfaitement sur mobile et tablette. Téléchargez aussi notre app mobile HuntZen Jobs (iOS/Android) pour rechercher des emplois, analyser votre CV, et recevoir des alertes en temps réel où que vous soyez.",
      },
    ],
  },
];

export function FAQClient() {
  const [openIndex, setOpenIndex] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Filtrer les questions selon la recherche
  const filteredCategories = faqCategories
    .map((category) => ({
      ...category,
      questions: category.questions.filter(
        (item) =>
          item.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.a.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((category) => category.questions.length > 0);

  const toggleQuestion = (categoryIndex: number, questionIndex: number) => {
    const key = `${categoryIndex}-${questionIndex}`;
    setOpenIndex(openIndex === key ? null : key);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white pt-32 pb-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl mx-auto text-center"
          >
            <h1 className="text-5xl md:text-6xl font-black mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-[#00D9FF]">
              Questions Fréquentes
            </h1>
            <p className="text-xl text-gray-300 leading-relaxed mb-8">
              Tout ce que vous devez savoir sur{" "}
              <strong>HuntZen Jobs</strong>, la plateforme N°1 de recherche
              d'emploi en France
            </p>

            {/* Search bar */}
            <div className="max-w-2xl mx-auto relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Rechercher une question sur HuntZen Jobs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white/10 backdrop-blur-md border-2 border-white/20 dark:border-white/30 rounded-2xl text-white placeholder-white/60 focus:outline-none focus:border-[#00D9FF] transition-all"
              />
            </div>
          </motion.div>
        </div>
      </div>

      {/* FAQ Content */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-4xl mx-auto">
          {filteredCategories.length > 0 ? (
            <div className="space-y-12">
              {filteredCategories.map((category, categoryIndex) => (
                <motion.div
                  key={categoryIndex}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: categoryIndex * 0.1 }}
                >
                  {/* Catégorie titre */}
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-3">
                    <div className="w-2 h-8 bg-[#00D9FF] rounded-full" />
                    {category.category}
                  </h2>

                  {/* Questions */}
                  <div className="space-y-4">
                    {category.questions.map((item, questionIndex) => {
                      const key = `${categoryIndex}-${questionIndex}`;
                      const isOpen = openIndex === key;

                      return (
                        <motion.div
                          key={questionIndex}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.3,
                            delay: questionIndex * 0.05,
                          }}
                          className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg transition-all overflow-hidden border border-gray-200 dark:border-gray-700"
                        >
                          {/* Question */}
                          <button
                            onClick={() =>
                              toggleQuestion(categoryIndex, questionIndex)
                            }
                            className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left group"
                          >
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-[#00D9FF] transition-colors flex-1">
                              {item.q}
                            </h3>
                            <motion.div
                              animate={{ rotate: isOpen ? 180 : 0 }}
                              transition={{ duration: 0.3 }}
                              className="flex-shrink-0"
                            >
                              <ChevronDown
                                className={`w-6 h-6 ${isOpen ? "text-[#00D9FF]" : "text-gray-400 dark:text-gray-500"} transition-colors`}
                              />
                            </motion.div>
                          </button>

                          {/* Réponse */}
                          <AnimatePresence>
                            {isOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="overflow-hidden"
                              >
                                <div className="px-6 pb-5 pt-2 border-t border-gray-100 dark:border-gray-700">
                                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                                    {item.a}
                                  </p>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-16"
            >
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full mb-6">
                <Search className="w-10 h-10 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                Aucune question trouvée
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Essayez un autre mot-clé ou contactez notre support
              </p>
              <Link
                href="#support"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#00D9FF] hover:bg-[#00C4EA] text-white font-semibold rounded-xl transition-all"
              >
                <MessageCircle className="w-5 h-5" />
                Contactez le support
              </Link>
            </motion.div>
          )}
        </div>
      </div>

      {/* Support CTA */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto text-center"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 bg-[#00D9FF]/20 rounded-2xl mb-6">
              <MessageCircle className="w-8 h-8 text-[#00D9FF]" />
            </div>
            <h2 className="text-4xl font-black mb-6">
              Vous n'avez pas trouvé votre réponse ?
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              Notre équipe HuntZen Jobs est là pour vous aider 24/7
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="mailto:support@huntzenjobs.com"
                className="inline-block px-8 py-4 bg-[#00D9FF] hover:bg-[#00C4EA] text-white font-bold rounded-xl shadow-lg hover:shadow-[#00D9FF]/50 transition-all"
              >
                Contactez-nous par email
              </a>
              <Link
                href="/signup"
                className="inline-block px-8 py-4 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-xl shadow-lg transition-all"
              >
                Essayer HuntZen Jobs gratuitement
              </Link>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Internal Links Footer for SEO */}
      <InternalLinksFooter />
    </div>
  );
}

// Export FAQ categories for schema generation
export { faqCategories };
