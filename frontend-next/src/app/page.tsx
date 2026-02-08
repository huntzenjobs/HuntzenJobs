import Link from 'next/link'
import { Rocket, ChevronRight, Search, FileText, Users, Target, BarChart3 } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Header - Exact HuntZen Style */}
      <header className="absolute top-0 left-0 right-0 z-50 py-4">
        <div className="container mx-auto px-6 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-white font-bold text-xl">HuntZen</span>
            <span className="w-2 h-2 rounded-full bg-huntzen-blue"></span>
          </Link>

          {/* Navigation Menu */}
          <nav className="hidden lg:flex items-center gap-8">
            <Link href="#features" className="text-white text-sm hover:text-huntzen-blue transition-colors">
              Fonctionnalités
            </Link>
            <Link href="/jobs" className="text-white text-sm hover:text-huntzen-blue transition-colors">
              Offres d&apos;emploi
            </Link>
            <Link href="/cv-analysis" className="text-white text-sm hover:text-huntzen-blue transition-colors">
              Analyse CV
            </Link>
            <Link href="/assistant" className="text-white text-sm hover:text-huntzen-blue transition-colors">
              Coach IA
            </Link>
            <Link href="/pricing" className="text-white text-sm hover:text-huntzen-blue transition-colors">
              Tarifs
            </Link>
          </nav>

          {/* Auth Buttons */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden md:inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white border border-white/30 hover:bg-white/10 transition-all"
            >
              CONNEXION
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white bg-huntzen-blue hover:bg-huntzen-blue-dark transition-all"
            >
              S&apos;INSCRIRE
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section - Exact HuntZen Style */}
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#0a1628] via-[#0f1b2e] to-[#1a2332]">
        {/* Animated Background Pattern */}
        <div className="absolute inset-0">
          {/* Hexagonal pattern */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%232563eb' stroke-width='1'/%3E%3C/svg%3E")`,
              backgroundSize: '60px 60px'
            }}
          />
          {/* Gradient orbs */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-huntzen-blue/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-huntzen-turquoise/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        {/* Hero Content */}
        <div className="container mx-auto px-6 relative z-10 text-center pt-20 pb-16">
          <h1 className="text-5xl md:text-7xl font-black text-white tracking-[0.2em] mb-6">
            HUNTZEN IA
          </h1>
          <p className="text-lg md:text-xl text-white/80 max-w-3xl mx-auto mb-10 font-light">
            Plateforme IA tout-en-un pour maîtriser sa carrière et ses négociations
          </p>

          <div className="flex flex-col items-center gap-4">
            <Link
              href="/cv-analysis"
              className="inline-flex items-center gap-3 px-8 py-4 rounded-lg text-base font-semibold text-white bg-huntzen-blue hover:bg-huntzen-blue-dark transition-all shadow-lg hover:shadow-xl hover:-translate-y-1"
            >
              <Rocket className="w-5 h-5" />
              Analyser mon profil
            </Link>
            <Link
              href="#features"
              className="text-white/70 text-sm hover:text-white transition-colors underline underline-offset-4"
            >
              Voir comment ça marche
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section - Exact HuntZen Style */}
      <section className="py-20 bg-white" id="features">
        <div className="container mx-auto px-6">
          {/* Section Header */}
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 rounded-full bg-huntzen-blue/10 text-huntzen-blue text-xs font-bold tracking-[0.2em] uppercase mb-4">
              COMMENT ÇA MARCHE
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Plateforme IA tout-en-un pour maîtriser sa carrière et ses négociations
            </h2>
          </div>

          {/* Features Grid - 5 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 max-w-7xl mx-auto">
            {/* Feature 1 */}
            <div className="group bg-white border border-gray-200 rounded-2xl p-6 hover:border-huntzen-blue hover:shadow-lg transition-all text-center">
              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center bg-gray-100 rounded-full group-hover:bg-huntzen-blue/10 transition-all">
                <BarChart3 className="w-8 h-8 text-gray-700 group-hover:text-huntzen-blue transition-colors" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 min-h-[45px] flex items-center justify-center">
                Simulation de carrière & salaires
              </h3>
              <Link href="#" className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-huntzen-blue transition-colors">
                En savoir plus
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Feature 2 */}
            <div className="group bg-white border border-gray-200 rounded-2xl p-6 hover:border-huntzen-blue hover:shadow-lg transition-all text-center">
              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center bg-gray-100 rounded-full group-hover:bg-huntzen-blue/10 transition-all">
                <FileText className="w-8 h-8 text-gray-700 group-hover:text-huntzen-blue transition-colors" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 min-h-[45px] flex items-center justify-center">
                Diagnostic compétences et formations
              </h3>
              <Link href="/cv-analysis" className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-huntzen-blue transition-colors">
                En savoir plus
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Feature 3 */}
            <div className="group bg-white border border-gray-200 rounded-2xl p-6 hover:border-huntzen-blue hover:shadow-lg transition-all text-center">
              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center bg-gray-100 rounded-full group-hover:bg-huntzen-blue/10 transition-all">
                <Search className="w-8 h-8 text-gray-700 group-hover:text-huntzen-blue transition-colors" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 min-h-[45px] flex items-center justify-center">
                Agrégateurs d&apos;offres
              </h3>
              <Link href="/jobs" className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-huntzen-blue transition-colors">
                En savoir plus
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Feature 4 */}
            <div className="group bg-white border border-gray-200 rounded-2xl p-6 hover:border-huntzen-blue hover:shadow-lg transition-all text-center">
              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center bg-gray-100 rounded-full group-hover:bg-huntzen-blue/10 transition-all">
                <FileText className="w-8 h-8 text-gray-700 group-hover:text-huntzen-blue transition-colors" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 min-h-[45px] flex items-center justify-center">
                Optimisation CV
              </h3>
              <Link href="/cv-analysis" className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-huntzen-blue transition-colors">
                En savoir plus
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Feature 5 */}
            <div className="group bg-white border border-gray-200 rounded-2xl p-6 hover:border-huntzen-blue hover:shadow-lg transition-all text-center">
              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center bg-gray-100 rounded-full group-hover:bg-huntzen-blue/10 transition-all">
                <Users className="w-8 h-8 text-gray-700 group-hover:text-huntzen-blue transition-colors" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 min-h-[45px] flex items-center justify-center">
                Simulation d&apos;entretien
              </h3>
              <Link href="/assistant" className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-huntzen-blue transition-colors">
                En savoir plus
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Prêt à booster votre carrière ?
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
            Rejoignez des milliers de professionnels qui utilisent HuntZen pour trouver leur prochain emploi.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg font-semibold text-white bg-huntzen-blue hover:bg-huntzen-blue-dark transition-all"
            >
              Créer un compte gratuit
              <ChevronRight className="w-5 h-5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg font-semibold text-gray-700 border-2 border-gray-300 hover:border-huntzen-blue hover:text-huntzen-blue transition-all"
            >
              Se connecter
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0a1628] text-white py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl">HuntZen</span>
              <span className="w-2 h-2 rounded-full bg-huntzen-blue"></span>
              <span className="text-sm text-white/60">IA</span>
            </div>
            <p className="text-white/60 text-sm text-center md:text-right max-w-md">
              Plateforme IA pour la recherche d&apos;emploi et le développement de carrière.
            </p>
          </div>
          <hr className="border-white/10 mb-8" />
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-white/50 text-sm">
            <p>&copy; {new Date().getFullYear()} HuntZen. Tous droits réservés.</p>
            <div className="flex items-center gap-6">
              <Link href="#" className="hover:text-huntzen-blue transition-colors">
                Confidentialité
              </Link>
              <Link href="#" className="hover:text-huntzen-blue transition-colors">
                CGU
              </Link>
              <Link href="#" className="hover:text-huntzen-blue transition-colors">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
