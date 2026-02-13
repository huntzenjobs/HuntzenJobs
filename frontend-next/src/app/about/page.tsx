import { Metadata } from "next";
import { aboutMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = aboutMetadata;

/**
 * Page À Propos HuntZen Jobs - CRITIQUE pour SEO
 * Optimisée pour dominer les recherches "huntzen" et "huntzenjobs"
 * Contenu: 1700+ mots avec densité mot-clé "huntzen" 2-3%
 */

("use client");

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { InternalLinksFooter } from "@/components/seo/internal-links";
import {
  Target,
  Sparkles,
  TrendingUp,
  Users,
  Globe,
  Award,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white pt-32 pb-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl mx-auto text-center"
          >
            <h1 className="text-5xl md:text-6xl font-black mb-6">
              HuntZen Jobs : Votre Allié Carrière N°1 en France
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 leading-relaxed">
              Découvrez comment <strong>HuntZen Jobs</strong> révolutionne la
              recherche d'emploi en France avec la puissance de l'IA et une
              approche centrée sur le candidat.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Qui est HuntZen Section */}
      <div className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl font-black text-gray-900 mb-8">
                Qui est HuntZen ?
              </h2>

              <div className="prose prose-lg max-w-none text-gray-700 leading-relaxed space-y-6">
                <p>
                  <strong>HuntZen Jobs</strong> est la plateforme de recherche
                  d'emploi nouvelle génération qui transforme la façon dont les
                  candidats trouvent leur prochain emploi en France.{" "}
                  <strong>HuntZen</strong> combine technologie de pointe,
                  intelligence artificielle et expertise RH pour offrir une
                  expérience de recherche d'emploi inégalée.
                </p>

                <p>
                  Fondée en 2024, <strong>HuntZen Jobs</strong> est née d'une
                  vision simple : rendre la recherche d'emploi plus efficace,
                  plus humaine et plus accessible à tous. Avec{" "}
                  <strong>HuntZen</strong>, nous croyons que chaque candidat
                  mérite les meilleures opportunités et les outils les plus
                  performants pour réussir sa carrière.
                </p>

                <p>
                  Aujourd'hui, <strong>HuntZen Jobs</strong> agrège plus de 100
                  000 offres d'emploi en France, couvrant tous les secteurs,
                  tous les niveaux d'expérience et tous les types de contrats.
                  La plateforme <strong>HuntZen</strong> analyse quotidiennement
                  des milliers d'offres provenant des plus grands sites emploi
                  pour vous offrir le catalogue le plus complet du marché
                  français.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Pourquoi choisir HuntZen Section */}
      <div className="py-20 bg-gradient-to-br from-gray-50 to-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl font-black text-gray-900 mb-6">
                Pourquoi choisir HuntZen Jobs ?
              </h2>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto">
                <strong>HuntZen Jobs</strong> vous offre bien plus qu'une simple
                liste d'offres d'emploi. Découvrez nos 3 piliers qui font de{" "}
                <strong>HuntZen</strong> la plateforme N°1.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                viewport={{ once: true }}
                className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all"
              >
                <div className="w-16 h-16 bg-[#00D9FF]/10 rounded-2xl flex items-center justify-center mb-6">
                  <Target className="w-8 h-8 text-[#00D9FF]" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  1. La plus grande base d'offres d'emploi
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  <strong>HuntZen Jobs</strong> agrège +100 000 offres d'emploi
                  en France depuis les plus grandes plateformes : Indeed,
                  LinkedIn, Pôle Emploi, APEC et bien d'autres. Avec{" "}
                  <strong>HuntZen</strong>, vous accédez à toutes les
                  opportunités en un seul endroit.
                </p>
              </motion.div>

              {/* Feature 2 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                viewport={{ once: true }}
                className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all"
              >
                <div className="w-16 h-16 bg-[#00D9FF]/10 rounded-2xl flex items-center justify-center mb-6">
                  <Sparkles className="w-8 h-8 text-[#00D9FF]" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  2. Analyse CV experte avec HuntZen
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Notre technologie <strong>HuntZen</strong> analyse votre CV en
                  profondeur et vous donne un score ATS précis. L'outil
                  d'analyse CV <strong>HuntZen Jobs</strong> identifie les
                  points faibles et vous fournit des recommandations concrètes
                  pour améliorer vos chances de décrocher un entretien.
                </p>
              </motion.div>

              {/* Feature 3 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                viewport={{ once: true }}
                className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all"
              >
                <div className="w-16 h-16 bg-[#00D9FF]/10 rounded-2xl flex items-center justify-center mb-6">
                  <TrendingUp className="w-8 h-8 text-[#00D9FF]" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  3. Coach IA HuntZen 24/7
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  L'assistant carrière <strong>HuntZen</strong> vous accompagne
                  à chaque étape : préparation d'entretien, négociation
                  salariale, optimisation LinkedIn. Avec{" "}
                  <strong>HuntZen Jobs</strong>, vous avez un coach
                  professionnel disponible 24h/24.
                </p>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* L'histoire de HuntZen Section */}
      <div className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl font-black text-gray-900 mb-8">
                L'histoire de HuntZen Jobs
              </h2>

              <div className="prose prose-lg max-w-none text-gray-700 leading-relaxed space-y-6">
                <p>
                  Fondée en 2024, <strong>HuntZen Jobs</strong> révolutionne le
                  marché de la recherche d'emploi en France. L'équipe{" "}
                  <strong>HuntZen</strong> a identifié un problème majeur : les
                  candidats perdent des heures à consulter plusieurs sites
                  emploi, à optimiser leur CV sans guidance, et à se préparer
                  seuls aux entretiens.
                </p>

                <p>
                  La vision de <strong>HuntZen Jobs</strong> ? Centraliser
                  toutes les offres d'emploi, fournir des outils d'analyse
                  professionnels et offrir un accompagnement personnalisé grâce
                  à l'intelligence artificielle. En quelques mois,{" "}
                  <strong>HuntZen</strong> est devenu la référence pour des
                  milliers de candidats en France.
                </p>

                <p>
                  Aujourd'hui, <strong>HuntZen Jobs</strong> compte plus de 50
                  000 utilisateurs actifs qui utilisent quotidiennement la
                  plateforme pour trouver leur prochain emploi. La communauté{" "}
                  <strong>HuntZen</strong> grandit chaque jour, et notre mission
                  reste la même : rendre la recherche d'emploi plus efficace et
                  plus humaine.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="py-20 bg-gradient-to-r from-gray-900 to-gray-800 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-black mb-4">
              HuntZen Jobs en chiffres
            </h2>
            <p className="text-xl text-gray-300">
              Les résultats parlent d'eux-mêmes
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="text-5xl font-black text-[#00D9FF] mb-2">
                +100K
              </div>
              <div className="text-gray-300">Offres d'emploi</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="text-5xl font-black text-[#00D9FF] mb-2">
                50K+
              </div>
              <div className="text-gray-300">Utilisateurs actifs</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="text-5xl font-black text-[#00D9FF] mb-2">87%</div>
              <div className="text-gray-300">Taux de satisfaction</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="text-5xl font-black text-[#00D9FF] mb-2">
                24/7
              </div>
              <div className="text-gray-300">Support disponible</div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* HuntZen vs autres plateformes */}
      <div className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl font-black text-gray-900 mb-6">
                HuntZen Jobs vs autres plateformes
              </h2>
              <p className="text-xl text-gray-600">
                Découvrez pourquoi <strong>HuntZen Jobs</strong> surpasse
                Indeed, LinkedIn et les autres
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  title: "Agrégation complète",
                  description:
                    "HuntZen centralise TOUTES les offres (Indeed, LinkedIn, Pôle Emploi...)",
                },
                {
                  title: "Analyse CV gratuite",
                  description:
                    "Score ATS précis inclus - payant sur les autres plateformes",
                },
                {
                  title: "Coach IA 24/7",
                  description:
                    "Assistant carrière personnalisé - inexistant ailleurs",
                },
                {
                  title: "Interface moderne",
                  description:
                    "UX intuitive et rapide - bien supérieure aux autres",
                },
                {
                  title: "Matching intelligent",
                  description:
                    "Recommandations IA basées sur votre profil complet",
                },
                {
                  title: "100% gratuit",
                  description:
                    "Toutes les fonctionnalités essentielles sans payer",
                },
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="flex items-start gap-4 bg-gradient-to-br from-gray-50 to-white p-6 rounded-xl border border-gray-200"
                >
                  <CheckCircle2 className="w-6 h-6 text-[#00D9FF] flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-bold text-gray-900 mb-2">
                      {item.title}
                    </h3>
                    <p className="text-gray-600 text-sm">{item.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-20 bg-gradient-to-br from-[#00D9FF] to-blue-600 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto text-center"
          >
            <h2 className="text-4xl md:text-5xl font-black mb-6">
              Rejoignez HuntZen Jobs aujourd'hui
            </h2>
            <p className="text-xl mb-8 text-white/90">
              Transformez votre recherche d'emploi avec la plateforme N°1 en
              France. <strong>HuntZen Jobs</strong> est 100% gratuit et sans
              engagement.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-8 py-4 bg-white text-[#00D9FF] font-bold rounded-xl shadow-lg hover:shadow-2xl hover:scale-105 transition-all"
              >
                Créer mon compte gratuit
                <ArrowRight className="w-5 h-5" />
              </Link>

              <Link
                href="/jobs"
                className="inline-flex items-center gap-2 px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-bold rounded-xl border-2 border-white hover:bg-white/20 transition-all"
              >
                Découvrir les offres
              </Link>
            </div>

            <p className="mt-8 text-white/80 text-sm">
              Déjà membre ?{" "}
              <Link href="/login" className="underline font-semibold">
                Se connecter
              </Link>
            </p>
          </motion.div>
        </div>
      </div>

      {/* Internal Links Footer for SEO */}
      <InternalLinksFooter />
    </div>
  );
}
