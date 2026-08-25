"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useOptionalAuth } from "@/contexts/auth-context";
import { Menu, X, User, ChevronDown } from "lucide-react";
import { AdaptiveLogo } from "@/components/ui/adaptive-logo";
import {
  LanguageSwitcher,
  LanguageSwitcherCompact,
} from "@/components/language-switcher";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("nav");

  const outilsRef = useRef<HTMLDivElement>(null);
  const ressourcesRef = useRef<HTMLDivElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);

  // Detect scroll to change header style
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close dropdowns when clicking outside or pressing Escape
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOutilsOpen(false);
        setRessourcesOpen(false);
        setMobileMenuOpen((wasOpen) => {
          if (wasOpen) {
            window.requestAnimationFrame(() => {
              mobileMenuButtonRef.current?.focus();
            });
          }
          return false;
        });
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
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
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b pt-safe"
    >
      <div className="container mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-3">
          <AdaptiveLogo
            isDark={shouldBeWhite}
            size="sm"
            showText
            showPulse
            className="lg:hidden"
            textColor={shouldBeWhite ? "text-black" : "text-white"}
          />
          <AdaptiveLogo
            isDark={shouldBeWhite}
            size="lg"
            showText
            showPulse
            className="hidden lg:flex"
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
            {t("jobs")}
            <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#00D9FF] transition-all duration-300 group-hover:w-full"></span>
          </Link>

          {/* Salons & Forums - Direct */}
          <Link
            href="/salons"
            className={`relative text-base font-bold transition-colors pb-1 group ${shouldBeWhite ? "text-gray-900 hover:text-black" : "text-white/90 hover:text-white"}`}
          >
            {t("salons")}
            <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#00D9FF] transition-all duration-300 group-hover:w-full"></span>
          </Link>

          {/* Outils - Dropdown */}
          <div ref={outilsRef} className="relative">
            <button
              onClick={() => setOutilsOpen(!outilsOpen)}
              onMouseEnter={() => {
                setOutilsOpen(true);
                setRessourcesOpen(false);
              }}
              aria-haspopup="true"
              aria-expanded={outilsOpen}
              className={`flex items-center gap-1 text-base font-bold transition-colors pb-1 ${shouldBeWhite ? "text-gray-900 hover:text-black" : "text-white/90 hover:text-white"}`}
            >
              {t("tools")}
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
                      ? "bg-white/95 border-gray-200"
                      : "bg-black/95 border-white/10"
                  }`}
                >
                  <Link
                    href="/assistant"
                    onClick={() => setOutilsOpen(false)}
                    className={`block px-4 py-3 text-sm font-semibold transition-colors ${
                      shouldBeWhite
                        ? "text-gray-900 hover:bg-gray-100 hover:text-[#00D9FF]"
                        : "text-white/90 hover:bg-white/10 hover:text-[#00D9FF]"
                    }`}
                  >
                    {t("toolsItems.assistant")}
                  </Link>
                  <Link
                    href="/cv-analysis"
                    onClick={() => setOutilsOpen(false)}
                    className={`block px-4 py-3 text-sm font-semibold transition-colors ${
                      shouldBeWhite
                        ? "text-gray-900 hover:bg-gray-100 hover:text-[#00D9FF]"
                        : "text-white/90 hover:bg-white/10 hover:text-[#00D9FF]"
                    }`}
                  >
                    {t("toolsItems.cvAnalysis")}
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Ressources - Dropdown */}
          <div ref={ressourcesRef} className="relative">
            <button
              onClick={() => setRessourcesOpen(!ressourcesOpen)}
              onMouseEnter={() => {
                setRessourcesOpen(true);
                setOutilsOpen(false);
              }}
              aria-haspopup="true"
              aria-expanded={ressourcesOpen}
              className={`flex items-center gap-1 text-base font-bold transition-colors pb-1 ${shouldBeWhite ? "text-gray-900 hover:text-black" : "text-white/90 hover:text-white"}`}
            >
              {t("resources")}
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
                      ? "bg-white/95 border-gray-200"
                      : "bg-black/95 border-white/10"
                  }`}
                >
                  <a
                    href="https://press.huntzen.space/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setRessourcesOpen(false)}
                    className={`block px-4 py-3 text-sm font-semibold transition-colors ${
                      shouldBeWhite
                        ? "text-gray-900 hover:bg-gray-100 hover:text-[#00D9FF]"
                        : "text-white/90 hover:bg-white/10 hover:text-[#00D9FF]"
                    }`}
                  >
                    {t("resourcesItems.blog")}
                  </a>
                  <Link
                    href="/faq"
                    onClick={() => setRessourcesOpen(false)}
                    className={`block px-4 py-3 text-sm font-semibold transition-colors ${
                      shouldBeWhite
                        ? "text-gray-900 hover:bg-gray-100 hover:text-[#00D9FF]"
                        : "text-white/90 hover:bg-white/10 hover:text-[#00D9FF]"
                    }`}
                  >
                    {t("resourcesItems.faq")}
                  </Link>
                  <Link
                    href="/temoignages"
                    onClick={() => setRessourcesOpen(false)}
                    className={`block px-4 py-3 text-sm font-semibold transition-colors ${
                      shouldBeWhite
                        ? "text-gray-900 hover:bg-gray-100 hover:text-[#00D9FF]"
                        : "text-white/90 hover:bg-white/10 hover:text-[#00D9FF]"
                    }`}
                  >
                    {t("resourcesItems.reviews")}
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
            {t("pricing")}
            <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#00D9FF] transition-all duration-300 group-hover:w-full"></span>
          </Link>
        </nav>

        {/* Auth Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Language Switcher — always visible (compact globe icon) */}
          <div className="hidden lg:block">
            <LanguageSwitcher
              className={
                shouldBeWhite
                  ? "text-gray-900 hover:text-black"
                  : "text-white hover:text-white"
              }
            />
          </div>

          {/* Theme Toggle — désactivé (dark mode non prêt) */}

          {user ? (
            <Link href="/jobs">
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${shouldBeWhite ? "bg-gray-100 hover:bg-gray-200" : "bg-white/10 hover:bg-white/20"}`}
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
                className={`hidden lg:inline-flex items-center px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${shouldBeWhite ? "text-gray-900 hover:text-[#00D9FF]" : "text-white hover:text-[#00D9FF]"}`}
              >
                {t("login")}
              </Link>
              <Link
                href="/signup"
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg bg-[#00D9FF] px-3 text-xs font-bold text-white shadow-lg transition-all hover:bg-[#00C4EA] hover:shadow-[#00D9FF]/50 sm:px-5 sm:text-sm"
              >
                {t("signup")}
              </Link>
            </>
          )}

          {/* Mobile Menu Button */}
          <button
            ref={mobileMenuButtonRef}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors lg:hidden ${shouldBeWhite ? "text-black hover:bg-black/5" : "text-white hover:bg-white/10"}`}
            aria-controls="landing-mobile-menu"
            aria-expanded={mobileMenuOpen}
            aria-label={t(mobileMenuOpen ? "closeMenu" : "openMenu")}
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
          id="landing-mobile-menu"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`absolute top-full left-0 right-0 max-h-[calc(100dvh-5rem)] overflow-y-auto border-b backdrop-blur-md lg:hidden ${shouldBeWhite ? "bg-white/95 border-gray-200" : "bg-black/95 border-white/10"}`}
        >
          <nav className="container mx-auto px-6 py-4 flex flex-col gap-3">
            {!user && (
              <div className="grid grid-cols-2 gap-3 pb-1">
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex min-h-11 items-center justify-center rounded-lg border text-sm font-semibold transition-colors ${shouldBeWhite ? "border-gray-200 text-gray-900 hover:bg-gray-100" : "border-white/20 text-white hover:bg-white/10"}`}
                >
                  {t("login")}
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-h-11 items-center justify-center rounded-lg bg-[#00D9FF] px-3 text-sm font-bold text-white transition-colors hover:bg-[#00C4EA]"
                >
                  {t("signup")}
                </Link>
              </div>
            )}
            <Link
              href="/jobs"
              onClick={() => setMobileMenuOpen(false)}
              className={`text-base font-bold transition-colors py-2 ${shouldBeWhite ? "text-gray-900 hover:text-[#00D9FF]" : "text-white/90 hover:text-[#00D9FF]"}`}
            >
              {t("jobs")}
            </Link>
            <Link
              href="/salons"
              onClick={() => setMobileMenuOpen(false)}
              className={`text-base font-bold transition-colors py-2 ${shouldBeWhite ? "text-gray-900 hover:text-[#00D9FF]" : "text-white/90 hover:text-[#00D9FF]"}`}
            >
              {t("salons")}
            </Link>

            {/* Outils Section */}
            <div
              className={`border-t pt-3 mt-2 ${shouldBeWhite ? "border-gray-200" : "border-white/10"}`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-wide mb-2 ${shouldBeWhite ? "text-gray-500" : "text-white/60"}`}
              >
                {t("tools")}
              </p>
              <Link
                href="/assistant"
                onClick={() => setMobileMenuOpen(false)}
                className={`block text-sm font-semibold transition-colors py-2 pl-3 ${shouldBeWhite ? "text-gray-800 hover:text-[#00D9FF]" : "text-white/80 hover:text-[#00D9FF]"}`}
              >
                {t("toolsItems.assistant")}
              </Link>
              <Link
                href="/cv-analysis"
                onClick={() => setMobileMenuOpen(false)}
                className={`block text-sm font-semibold transition-colors py-2 pl-3 ${shouldBeWhite ? "text-gray-800 hover:text-[#00D9FF]" : "text-white/80 hover:text-[#00D9FF]"}`}
              >
                {t("toolsItems.cvAnalysis")}
              </Link>
            </div>

            {/* Ressources Section */}
            <div
              className={`border-t pt-3 ${shouldBeWhite ? "border-gray-200" : "border-white/10"}`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-wide mb-2 ${shouldBeWhite ? "text-gray-500" : "text-white/60"}`}
              >
                {t("resources")}
              </p>
              <a
                href="https://press.huntzen.space/"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className={`block text-sm font-semibold transition-colors py-2 pl-3 ${shouldBeWhite ? "text-gray-800 hover:text-[#00D9FF]" : "text-white/80 hover:text-[#00D9FF]"}`}
              >
                {t("resourcesItems.blog")}
              </a>
              <Link
                href="/faq"
                onClick={() => setMobileMenuOpen(false)}
                className={`block text-sm font-semibold transition-colors py-2 pl-3 ${shouldBeWhite ? "text-gray-800 hover:text-[#00D9FF]" : "text-white/80 hover:text-[#00D9FF]"}`}
              >
                {t("resourcesItems.faq")}
              </Link>
              <Link
                href="/temoignages"
                onClick={() => setMobileMenuOpen(false)}
                className={`block text-sm font-semibold transition-colors py-2 pl-3 ${shouldBeWhite ? "text-gray-800 hover:text-[#00D9FF]" : "text-white/80 hover:text-[#00D9FF]"}`}
              >
                {t("resourcesItems.reviews")}
              </Link>
            </div>

            <Link
              href="/pricing"
              onClick={() => setMobileMenuOpen(false)}
              className={`text-base font-bold transition-colors py-2 mt-2 ${shouldBeWhite ? "text-gray-900 hover:text-[#00D9FF]" : "text-white/90 hover:text-[#00D9FF]"}`}
            >
              {t("pricing")}
            </Link>

            {/* Language Switcher Mobile */}
            <div
              className={`border-t pt-3 mt-2 ${shouldBeWhite ? "border-gray-200" : "border-white/10"}`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-wide mb-2 ${shouldBeWhite ? "text-gray-500" : "text-white/60"}`}
              >
                {t("language")}
              </p>
              <LanguageSwitcherCompact />
            </div>
          </nav>
        </motion.div>
      )}
    </motion.header>
  );
}
