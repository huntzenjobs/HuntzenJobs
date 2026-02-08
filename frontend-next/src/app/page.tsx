'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  FileText,
  Search,
  Users,
  Target,
  CheckCircle2,
  AlertCircle,
  Menu,
  X
} from 'lucide-react'

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white">
      {/* Header - Black background */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black border-b border-white/10">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-white font-bold text-xl tracking-tight">HuntZen</span>
            <span className="w-2 h-2 rounded-full bg-[#00D9FF]"></span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            <Link href="/pricing" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
              Tarifs
            </Link>
            <Link href="/jobs" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
              Recherche d&apos;emploi
            </Link>
            <Link href="/assistant" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
              Assistant
            </Link>
            <Link href="/salons" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
              Salon & Forum
            </Link>
            <Link href="/cv-analysis" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
              Analyse de CV
            </Link>
          </nav>

          {/* Auth Buttons */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden md:inline-flex items-center px-5 py-2 rounded-lg text-sm font-semibold text-white hover:text-[#00D9FF] transition-colors"
            >
              CONNEXION
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-[#00D9FF] hover:bg-[#00C4EA] transition-all shadow-lg hover:shadow-[#00D9FF]/50"
            >
              S&apos;INSCRIRE
            </Link>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden text-white p-2"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="lg:hidden absolute top-16 left-0 right-0 bg-black border-b border-white/10"
          >
            <nav className="container mx-auto px-6 py-4 flex flex-col gap-4">
              <Link
                href="/pricing"
                onClick={() => setMobileMenuOpen(false)}
                className="text-white/80 hover:text-white text-sm font-medium transition-colors py-2"
              >
                Tarifs
              </Link>
              <Link
                href="/jobs"
                onClick={() => setMobileMenuOpen(false)}
                className="text-white/80 hover:text-white text-sm font-medium transition-colors py-2"
              >
                Recherche d&apos;emploi
              </Link>
              <Link
                href="/assistant"
                onClick={() => setMobileMenuOpen(false)}
                className="text-white/80 hover:text-white text-sm font-medium transition-colors py-2"
              >
                Assistant
              </Link>
              <Link
                href="/salons"
                onClick={() => setMobileMenuOpen(false)}
                className="text-white/80 hover:text-white text-sm font-medium transition-colors py-2"
              >
                Salon & Forum
              </Link>
              <Link
                href="/cv-analysis"
                onClick={() => setMobileMenuOpen(false)}
                className="text-white/80 hover:text-white text-sm font-medium transition-colors py-2"
              >
                Analyse de CV
              </Link>
            </nav>
          </motion.div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative min-h-[60vh] flex items-center justify-center overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 pt-16">
        {/* Background image overlay */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%2300D9FF\' fill-opacity=\'0.1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
            backgroundSize: '60px 60px'
          }}
        />

        {/* Gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00D9FF]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />

        {/* Hero Content */}
        <div className="container mx-auto px-6 relative z-10 text-center py-20">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-5xl md:text-7xl font-black text-white tracking-tight mb-6"
          >
            HUNTZENJOBS
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl text-white/90 max-w-3xl mx-auto mb-8"
          >
            Plateforme IA tout-en-un pour maîtriser sa carrière et ses négociations
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-bold text-white bg-[#00D9FF] hover:bg-[#00C4EA] transition-all shadow-2xl hover:shadow-[#00D9FF]/50 hover:-translate-y-1"
            >
              <Search className="w-5 h-5" />
              Trouvez votre emploi
            </Link>
            <p className="text-white/60 text-sm mt-4">Voir comment ça marche</p>
          </motion.div>
        </div>
      </section>

      {/* Comment ça marche - Section */}
      <section className="py-16 bg-white" id="features">
        <div className="container mx-auto px-6">
          {/* Section Header */}
          <div className="text-center mb-12">
            <span className="inline-block px-4 py-1.5 rounded-full bg-[#00D9FF]/10 text-[#00D9FF] text-xs font-bold tracking-widest uppercase mb-4">
              COMMENT ÇA MARCHE
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
              Plateforme IA tout-en-un pour maîtriser sa carrière et ses négociations
            </h2>
          </div>

          {/* Features Grid - 5 columns */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 max-w-6xl mx-auto">
            {[
              { icon: TrendingUp, title: "Simulation de carrière et salaires", href: "#" },
              { icon: FileText, title: "Diagnostic compétences et formations", href: "/cv-analysis" },
              { icon: Search, title: "Agrégateurs d'offres", href: "/jobs" },
              { icon: Target, title: "Optimisation CV", href: "/cv-analysis" },
              { icon: Users, title: "Simulation d'entretien", href: "/assistant" }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center group"
              >
                <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center bg-gray-100 rounded-2xl group-hover:bg-[#00D9FF]/10 transition-all">
                  <feature.icon className="w-8 h-8 text-gray-700 group-hover:text-[#00D9FF] transition-colors" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2 min-h-[40px] flex items-center justify-center px-2">
                  {feature.title}
                </h3>
                <Link
                  href={feature.href}
                  className="text-sm font-medium text-gray-600 hover:text-[#00D9FF] transition-colors inline-flex items-center gap-1"
                >
                  En savoir plus →
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* La recherche d'emploi est cassé */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
              La recherche d&apos;emploi est cassé
            </h2>
            <p className="text-[#00D9FF] font-semibold uppercase text-sm tracking-wide">
              Les candidats perdent des mois à naviguer à l&apos;aveugle
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {[
              {
                title: "GHOSTING CONSTANT",
                description: "73% des candidats n'obtiennent jamais de retour après plusieurs relances et mois d'attente",
                color: "#00D9FF"
              },
              {
                title: "RECHERCHE ÉCLAIRÉE",
                description: "Des dizaines de sites à consulter, des tonnes d'offres inappropriées",
                color: "#00D9FF"
              },
              {
                title: "NÉGOCIATION AVISÉE",
                description: "Aucune visibilité sur les salaires réels vs votre profil (YoE, ville, etc.)",
                color: "#00D9FF"
              },
              {
                title: "AUCUNE VISION",
                description: "Pas de contrôle, pas d'aide, manque de feedback sur le CV et sur les skills",
                color: "#00D9FF"
              }
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white rounded-2xl p-6 border-2 border-gray-100 hover:border-[#00D9FF]/30 hover:shadow-lg transition-all"
              >
                <h3
                  className="text-lg font-bold mb-3"
                  style={{ color: item.color }}
                >
                  {item.title}
                </h3>
                <p className="text-gray-700 text-sm leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Votre Co-pilote de carrière */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">
              Votre <span className="text-[#00D9FF]">Co-pilote</span> de carrière
            </h2>
          </div>

          {/* Two Column Features */}
          <div className="max-w-6xl mx-auto space-y-20">
            {/* Feature 1: Analyse CV */}
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              >
                <h3 className="text-3xl font-bold text-gray-900 mb-6">
                  <span className="text-[#00D9FF]">Analyse</span> et <span className="text-[#00D9FF]">optimisation</span> CV
                </h3>
                <p className="text-gray-700 text-lg mb-6 leading-relaxed">
                  Obtenez une analyse rapide précise de vos forces et axes d&apos;amélioration, à la seconde verte pour que
                  vous sachiez sur quels leviers du marché pour identifier les gaps à combler.
                </p>
                <ul className="space-y-3">
                  {[
                    "Analyse de vos hard et soft skills vs. le marché",
                    "Recommandations de formations certifiantes prioritaires",
                    "Score d'employabilité actualisé en temps réel"
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#00D9FF] flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="relative rounded-3xl overflow-hidden aspect-square border-2 border-gray-200 shadow-xl"
              >
                <Image
                  src="/images/cv-analysis-feature.png"
                  alt="Interface d'analyse de CV avec IA montrant les compétences et recommandations"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </motion.div>
            </div>

            {/* Feature 2: Matching */}
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="relative rounded-3xl overflow-hidden aspect-square border-2 border-gray-200 shadow-xl md:order-1"
              >
                <Image
                  src="/images/job-matching-feature.png"
                  alt="Interface de recherche d'emploi avec scores de compatibilité intelligents"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="md:order-2"
              >
                <h3 className="text-3xl font-bold text-gray-900 mb-6">
                  <span className="text-[#00D9FF]">Matching</span> et recherche
                </h3>
                <p className="text-gray-700 text-lg mb-6 leading-relaxed">
                  Fini les heures perdues à scroller. Notre agrégateur centralise les offres de +20 plateformes et ne vous
                  envoie que ce qui vous correspond vraiment.
                </p>
                <ul className="space-y-3">
                  {[
                    "Score de compatibilité intelligent (0-100%) pour chaque offre",
                    "Alertes instantanées sur les offres à fort potentiel",
                    "Gestion des favoris"
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#00D9FF] flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { value: "+ 15,000", label: "Candidat accompagné", color: "#00D9FF" },
              { value: "87%", label: "Taux de réponse", color: "#00D9FF" },
              { value: "+ 35%", label: "De salaire négocié", color: "#00D9FF" }
            ].map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center bg-white rounded-2xl p-8 border-2 border-gray-100"
              >
                <div
                  className="text-5xl font-black mb-2"
                  style={{ color: stat.color }}
                >
                  {stat.value}
                </div>
                <div className="text-gray-600 font-medium">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {[
              {
                name: "GRATUIT",
                price: "0€",
                period: "/7 jours",
                color: "#9CA3AF",
                features: [
                  "3 recherches d'offres par jour",
                  "10 offres d'emploi visibles maximum",
                  "1 analyse de CV par jour avec IA",
                  "5 minutes de coaching IA personnel",
                  "Support standard"
                ],
                unavailable: [
                  "Filtres avancés",
                  "Gestion favoris",
                  "Export PDF rapports"
                ],
                cta: "Commencer gratuitement"
              },
              {
                name: "ESSENTIEL",
                price: "8.90€",
                period: "/mois",
                color: "#00D9FF",
                popular: true,
                features: [
                  "Recherches d'offres illimitées",
                  "Accès à toutes les offres d'emploi",
                  "Filtres avancés (salaire, télétravail, date)",
                  "Gestion de vos favoris",
                  "Analyses de CV illimitées avec IA",
                  "Score de compatibilité visuel et animé",
                  "Coach IA personnel (30 min/jour)"
                ],
                unavailable: ["Export PDF rapports"],
                cta: "Commencer avec Essentiel"
              },
              {
                name: "PRO",
                price: "13.90€",
                period: "/mois",
                color: "#9333EA",
                features: [
                  "Toutes les fonctionnalités Starter incluses",
                  "Coach IA disponible 24/7 sans limite",
                  "Export PDF professionnel",
                  "Simulations d'entretien réalistes avec IA",
                  "Feedback détaillé sur vos performances",
                  "Support prioritaire par email"
                ],
                unavailable: [],
                cta: "Commencer avec Pro"
              },
              {
                name: "PREMIUM",
                price: "19.90€",
                period: "/mois",
                color: "#F97316",
                features: [
                  "Toutes les fonctionnalités Pro incluses",
                  "Historique illimité de toutes vos analyses CV",
                  "Conseils personnalisés ultra-ciblés par l'IA",
                  "Alertes email instantanées",
                  "Historique complet sessions coaching",
                  "Accès anticipé aux nouvelles fonctionnalités",
                  "Support VIP avec assistance prioritaire",
                  "Rapports mensuels de progression"
                ],
                unavailable: [],
                cta: "Commencer avec Premium"
              }
            ].map((plan, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`bg-white rounded-2xl p-6 border-2 ${
                  plan.popular ? 'border-[#00D9FF] shadow-xl scale-105' : 'border-gray-200'
                } hover:shadow-lg transition-all relative`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#00D9FF] text-white text-xs font-bold rounded-full">
                    POPULAIRE
                  </div>
                )}

                <div className="text-center mb-6">
                  <div className="text-gray-600 font-bold text-sm mb-2">{plan.name}</div>
                  <div className="flex items-baseline justify-center gap-1">
                    <span
                      className="text-5xl font-black"
                      style={{ color: plan.color }}
                    >
                      {plan.price}
                    </span>
                    <span className="text-gray-500 text-sm">{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: plan.color }} />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                  {plan.unavailable.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm text-gray-400">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signup"
                  className="block w-full text-center px-4 py-3 rounded-xl font-semibold text-white transition-all"
                  style={{ backgroundColor: plan.color }}
                >
                  {plan.cta}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl">HuntZen</span>
              <span className="w-2 h-2 rounded-full bg-[#00D9FF]"></span>
            </div>
            <p className="text-white/60 text-sm text-center md:text-right max-w-md">
              Plateforme IA pour la recherche d&apos;emploi et le développement de carrière.
            </p>
          </div>
          <hr className="border-white/10 mb-8" />
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-white/50 text-sm">
            <p>&copy; {new Date().getFullYear()} HuntZen. Tous droits réservés.</p>
            <div className="flex items-center gap-6">
              <Link href="#" className="hover:text-[#00D9FF] transition-colors">
                Confidentialité
              </Link>
              <Link href="#" className="hover:text-[#00D9FF] transition-colors">
                CGU
              </Link>
              <Link href="#" className="hover:text-[#00D9FF] transition-colors">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
      `}</style>
    </div>
  )
}
