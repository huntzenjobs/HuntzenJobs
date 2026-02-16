"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useOptionalAuth } from "@/contexts/auth-context";
import { Menu, X, User, ChevronDown } from "lucide-react";
import { AdaptiveLogo } from "@/components/ui/adaptive-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

interface LandingHeaderProps {
  forceWhite?: boolean;
}

export function LandingHeader({ forceWhite = false }: LandingHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [outilsOpen, setOutilsOpen] = useState(false);
  const [ressourcesOpen, setRessourcesOpen] = useState(false);
  const auth = useOptionalAuth();
  const user = auth?.user;

  const outilsRef = useRef<HTMLDivElement>(null);
  const ressourcesRef = useRef<HTMLDivElement>(null);

  // Detect scroll to change header style
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        outilsRef.current &&
        !outilsRef.current.contains(event.target as Node)
      ) {
        setOutilsOpen(false);
      }
      if (
        ressourcesRef.current &&
        !ressourcesRef.current.contains(event.target as Node)
      ) {
        setRessourcesOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Force white background on auth pages
  const shouldBeWhite = forceWhite || isScrolled;

  return (
    <motion.header
      initial={{
        backgroundColor: forceWhite
          ? "rgba(255, 255, 255, 0.95)"
          : "rgba(0, 0, 0, 0.05)",
      }}
      animate={{
        backgroundColor: shouldBeWhite
          ? "rgba(255, 255, 255, 0.95)"
          : "rgba(0, 0, 0, 0.05)",
        borderColor: shouldBeWhite
          ? "rgba(0, 0, 0, 0.1)"
          : "rgba(255, 255, 255, 0.1)",
      }}
      transition={{ duration: 0.3 }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b"
    >
      <div className="container mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <AdaptiveLogo
            isDark={shouldBeWhite}
            size="lg"
            showText
            showPulse
            textColor={shouldBeWhite ? "text-black" : "text-white"}
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-6 xl:gap-8">
          {/* Recherche d'emploi - Direct */}
          <Link
            href="/jobs"
            className={`relative text-base font-bold transition-colors pb-1 group ${shouldBeWhite ? "text-gray-900 hover:text-black" : "text-white/90 hover:text-white"}`}
          >
            Recherche d&apos;emploi
            <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#00D9FF] transition-all duration-300 group-hover:w-full"></span>
          </Link>

          {/* Analyse CV - Direct */}
          <Link
            href="/cv-analysis"
            className={`relative text-base font-bold transition-colors pb-1 group ${shouldBeWhite ? "text-gray-900 hover:text-black" : "text-white/90 hover:text-white"}`}
          >
            Analyse CV
            <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#00D9FF] transition-all duration-300 group-hover:w-full"></span>
          </Link>

          {/* Outils - Dropdown */}
          <div ref={outilsRef} className="relative">
            <button
              onClick={() => setOutilsOpen(!outilsOpen)}
              onMouseEnter={() => setOutilsOpen(true)}
              className={`flex items-center gap-1 text-base font-bold transition-colors pb-1 ${shouldBeWhite ? "text-gray-900 hover:text-black" : "text-white/90 hover:text-white"}`}
            >
              Outils
              <ChevronDown
                className={`w-4 h-4 transition-transform ${outilsOpen ? "rotate-180" : ""}`}
              />
            </button>
            <AnimatePresence>
              {outilsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  onMouseLeave={() => setOutilsOpen(false)}
                  className={`absolute top-full left-0 mt-2 w-56 rounded-xl shadow-2xl border backdrop-blur-md overflow-hidden ${
                    shouldBeWhite
                      ? "bg-white/95 dark:bg-gray-800/95 border-gray-200 dark:border-gray-700"
                      : "bg-black/95 border-white/10"
                  }`}
                >
                  <Link
                    href="/assistant"
                    onClick={() => setOutilsOpen(false)}
                    className={`block px-4 py-3 text-sm font-semibold transition-colors ${
                      shouldBeWhite
                        ? "text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[#00D9FF]"
                        : "text-white/90 hover:bg-white/10 hover:text-[#00D9FF]"
                    }`}
                  >
                    Assistant Carrière
                  </Link>
                  <Link
                    href="/salons"
                    onClick={() => setOutilsOpen(false)}
                    className={`block px-4 py-3 text-sm font-semibold transition-colors ${
                      shouldBeWhite
                        ? "text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[#00D9FF]"
                        : "text-white/90 hover:bg-white/10 hover:text-[#00D9FF]"
                    }`}
                  >
                    Salons & Forums
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Ressources - Dropdown */}
          <div ref={ressourcesRef} className="relative">
            <button
              onClick={() => setRessourcesOpen(!ressourcesOpen)}
              onMouseEnter={() => setRessourcesOpen(true)}
              className={`flex items-center gap-1 text-base font-bold transition-colors pb-1 ${shouldBeWhite ? "text-gray-900 hover:text-black" : "text-white/90 hover:text-white"}`}
            >
              Ressources
              <ChevronDown
                className={`w-4 h-4 transition-transform ${ressourcesOpen ? "rotate-180" : ""}`}
              />
            </button>
            <AnimatePresence>
              {ressourcesOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  onMouseLeave={() => setRessourcesOpen(false)}
                  className={`absolute top-full left-0 mt-2 w-56 rounded-xl shadow-2xl border backdrop-blur-md overflow-hidden ${
                    shouldBeWhite
                      ? "bg-white/95 dark:bg-gray-800/95 border-gray-200 dark:border-gray-700"
                      : "bg-black/95 border-white/10"
                  }`}
                >
                  <Link
                    href="/blog"
                    onClick={() => setRessourcesOpen(false)}
                    className={`block px-4 py-3 text-sm font-semibold transition-colors ${
                      shouldBeWhite
                        ? "text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[#00D9FF]"
                        : "text-white/90 hover:bg-white/10 hover:text-[#00D9FF]"
                    }`}
                  >
                    Blog
                  </Link>
                  <Link
                    href="/faq"
                    onClick={() => setRessourcesOpen(false)}
                    className={`block px-4 py-3 text-sm font-semibold transition-colors ${
                      shouldBeWhite
                        ? "text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[#00D9FF]"
                        : "text-white/90 hover:bg-white/10 hover:text-[#00D9FF]"
                    }`}
                  >
                    FAQ
                  </Link>
                  <Link
                    href="/temoignages"
                    onClick={() => setRessourcesOpen(false)}
                    className={`block px-4 py-3 text-sm font-semibold transition-colors ${
                      shouldBeWhite
                        ? "text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[#00D9FF]"
                        : "text-white/90 hover:bg-white/10 hover:text-[#00D9FF]"
                    }`}
                  >
                    Avis
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Tarifs - Direct */}
          <Link
            href="/pricing"
            className={`relative text-base font-bold transition-colors pb-1 group ${shouldBeWhite ? "text-gray-900 hover:text-black" : "text-white/90 hover:text-white"}`}
          >
            Tarifs
            <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#00D9FF] transition-all duration-300 group-hover:w-full"></span>
          </Link>
        </nav>

        {/* Auth Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Theme Toggle */}
          <ThemeToggle />

          {user ? (
            <Link href="/jobs">
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${shouldBeWhite ? "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600" : "bg-white/10 hover:bg-white/20"}`}
              >
                <div className="w-7 h-7 rounded-full bg-[#00D9FF]/20 flex items-center justify-center">
                  <User className="w-4 h-4 text-[#00D9FF]" />
                </div>
                <span
                  className={`text-sm font-medium hidden md:inline ${shouldBeWhite ? "text-black" : "text-white"}`}
                >
                  {user.user_metadata?.full_name || user.email?.split("@")[0]}
                </span>
              </div>
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={`hidden md:inline-flex items-center px-4 lg:px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${shouldBeWhite ? "text-gray-900 hover:text-[#00D9FF]" : "text-white hover:text-[#00D9FF]"}`}
              >
                CONNEXION
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold text-white bg-[#00D9FF] hover:bg-[#00C4EA] transition-all shadow-lg hover:shadow-[#00D9FF]/50"
              >
                S&apos;INSCRIRE
              </Link>
            </>
          )}

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`lg:hidden p-2 transition-colors ${shouldBeWhite ? "text-black" : "text-white"}`}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`lg:hidden absolute top-20 left-0 right-0 backdrop-blur-md border-b ${shouldBeWhite ? "bg-white/95 dark:bg-gray-800/95 border-gray-200 dark:border-gray-700" : "bg-black/95 border-white/10"}`}
        >
          <nav className="container mx-auto px-6 py-4 flex flex-col gap-3">
            <Link
              href="/jobs"
              onClick={() => setMobileMenuOpen(false)}
              className={`text-base font-bold transition-colors py-2 ${shouldBeWhite ? "text-gray-900 hover:text-[#00D9FF]" : "text-white/90 hover:text-[#00D9FF]"}`}
            >
              Recherche d&apos;emploi
            </Link>
            <Link
              href="/cv-analysis"
              onClick={() => setMobileMenuOpen(false)}
              className={`text-base font-bold transition-colors py-2 ${shouldBeWhite ? "text-gray-900 hover:text-[#00D9FF]" : "text-white/90 hover:text-[#00D9FF]"}`}
            >
              Analyse CV
            </Link>

            {/* Outils Section */}
            <div
              className={`border-t pt-3 mt-2 ${shouldBeWhite ? "border-gray-200 dark:border-gray-700" : "border-white/10"}`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-wide mb-2 ${shouldBeWhite ? "text-gray-500 dark:text-gray-400" : "text-white/60"}`}
              >
                Outils
              </p>
              <Link
                href="/assistant"
                onClick={() => setMobileMenuOpen(false)}
                className={`block text-sm font-semibold transition-colors py-2 pl-3 ${shouldBeWhite ? "text-gray-800 hover:text-[#00D9FF]" : "text-white/80 hover:text-[#00D9FF]"}`}
              >
                Assistant Carrière
              </Link>
              <Link
                href="/salons"
                onClick={() => setMobileMenuOpen(false)}
                className={`block text-sm font-semibold transition-colors py-2 pl-3 ${shouldBeWhite ? "text-gray-800 hover:text-[#00D9FF]" : "text-white/80 hover:text-[#00D9FF]"}`}
              >
                Salons & Forums
              </Link>
            </div>

            {/* Ressources Section */}
            <div
              className={`border-t pt-3 ${shouldBeWhite ? "border-gray-200 dark:border-gray-700" : "border-white/10"}`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-wide mb-2 ${shouldBeWhite ? "text-gray-500 dark:text-gray-400" : "text-white/60"}`}
              >
                Ressources
              </p>
              <Link
                href="/blog"
                onClick={() => setMobileMenuOpen(false)}
                className={`block text-sm font-semibold transition-colors py-2 pl-3 ${shouldBeWhite ? "text-gray-800 hover:text-[#00D9FF]" : "text-white/80 hover:text-[#00D9FF]"}`}
              >
                Blog
              </Link>
              <Link
                href="/faq"
                onClick={() => setMobileMenuOpen(false)}
                className={`block text-sm font-semibold transition-colors py-2 pl-3 ${shouldBeWhite ? "text-gray-800 hover:text-[#00D9FF]" : "text-white/80 hover:text-[#00D9FF]"}`}
              >
                FAQ
              </Link>
              <Link
                href="/temoignages"
                onClick={() => setMobileMenuOpen(false)}
                className={`block text-sm font-semibold transition-colors py-2 pl-3 ${shouldBeWhite ? "text-gray-800 hover:text-[#00D9FF]" : "text-white/80 hover:text-[#00D9FF]"}`}
              >
                Avis
              </Link>
            </div>

            <Link
              href="/pricing"
              onClick={() => setMobileMenuOpen(false)}
              className={`text-base font-bold transition-colors py-2 mt-2 ${shouldBeWhite ? "text-gray-900 hover:text-[#00D9FF]" : "text-white/90 hover:text-[#00D9FF]"}`}
            >
              Tarifs
            </Link>
          </nav>
        </motion.div>
      )}
    </motion.header>
  );
}
