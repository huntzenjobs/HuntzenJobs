"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Search,
  FileText,
  UserCheck,
  Briefcase,
  Award,
  Mic,
  Linkedin,
  Calendar,
  Bookmark,
  UserCheck2,
  FilePlus,
  Globe,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Users,
} from "lucide-react";
import { LandingHeader } from "@/components/landing-header";
import { LandingPricingSection } from "@/components/landing/pricing-section";
import { Footer } from "@/components/layout/footer";
import { useTranslations } from "next-intl";

const GRID_PATTERN =
  "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2300D9FF' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E\")";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.5 },
};

export default function HomePage() {
  const tHero = useTranslations("hero");
  const tTrustBar = useTranslations("trustBar");
  const tHow = useTranslations("howItWorks");
  const tFeatures = useTranslations("features");
  const tFeaturesGrid = useTranslations("featuresGrid");
  const tStats = useTranslations("stats");
  const tPricing = useTranslations("pricing");
  const tCtaFinal = useTranslations("ctaFinal");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && /^[a-zA-Z0-9_-]{3,32}$/.test(ref)) {
      document.cookie = `huntzen_referral_code=${ref}; path=/; max-age=604800; SameSite=Lax`;
    }
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      {/* SECTION 1 — HERO */}
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden bg-slate-900 pt-20">
        {/* Hero background image */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'url("https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2340&auto=format&fit=crop")',
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "brightness(0.25) saturate(0.7)",
          }}
        />
        <div
          className="absolute inset-0 opacity-20"
          style={{ backgroundImage: GRID_PATTERN, backgroundSize: "60px 60px" }}
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.15, 0.1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/4 left-1/4 w-64 sm:w-96 h-64 sm:h-96 bg-[#00D9FF]/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.08, 0.12, 0.08] }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
          className="absolute bottom-1/4 right-1/4 w-64 sm:w-80 h-64 sm:h-80 bg-purple-500/10 rounded-full blur-3xl"
        />

        <div className="container mx-auto px-4 sm:px-6 relative z-10 text-center py-16 sm:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6"
          >
            <span className="inline-block px-4 py-1.5 rounded-full bg-[#00D9FF]/10 border border-[#00D9FF]/30 text-[#00D9FF] text-xs sm:text-sm font-semibold">
              {tHero("tag")}
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-white tracking-tight mb-4 leading-tight"
            style={{ textShadow: "0 0 40px rgba(0, 217, 255, 0.2)" }}
          >
            {tHero("h1")}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-xl sm:text-2xl text-white/70 font-semibold mb-3"
          >
            {tHero("h2")}
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-base sm:text-lg text-white/50 max-w-2xl mx-auto mb-10 px-4"
          >
            {tHero("subtitle")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4"
          >
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-bold text-white bg-[#00D9FF] hover:bg-[#00C4EA] transition-all shadow-2xl hover:shadow-[#00D9FF]/50 hover:-translate-y-0.5 w-full sm:w-auto justify-center"
            >
              {tHero("ctaSearch")} →
            </Link>
            <a
              href="#how"
              className="text-white/70 hover:text-white text-base font-medium transition-colors flex items-center gap-2"
            >
              {tHero("ctaDiscover")}
              <motion.span
                animate={{ y: [0, 4, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                ↓
              </motion.span>
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="text-white/40 text-sm"
          >
            {tHero("socialProof")}
          </motion.p>
        </div>
      </section>

      {/* SECTION 2 — TRUST BAR */}
      <section className="py-12 bg-gradient-to-b from-slate-900 to-slate-50">
        <div className="container mx-auto px-4 sm:px-6 text-center">
          <motion.p
            {...fadeUp}
            className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-6"
          >
            {tTrustBar("title")}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex flex-wrap items-center justify-center gap-3"
          >
            {[
              "France Travail",
              "Indeed",
              "LinkedIn",
              "Welcome to the Jungle",
              "HelloWork",
              "APEC",
            ].map((name) => (
              <span
                key={name}
                className="px-4 py-1.5 rounded-full bg-slate-200 border border-slate-300 text-slate-600 text-sm font-semibold"
              >
                {name}
              </span>
            ))}
            <span className="px-4 py-1.5 rounded-full bg-slate-200 border border-slate-300 text-slate-500 text-sm font-semibold italic">
              {tTrustBar("andMore")}
            </span>
          </motion.div>
        </div>
      </section>

      {/* SECTION 3 — COMMENT ÇA MARCHE */}
      <section id="how" className="py-16 sm:py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <motion.h2
            {...fadeUp}
            className="text-3xl sm:text-4xl font-bold text-slate-900 text-center mb-14"
          >
            {tHow("title")}
          </motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-5xl mx-auto">
            {[
              { num: "①", title: tHow("step1Title"), desc: tHow("step1Desc") },
              { num: "②", title: tHow("step2Title"), desc: tHow("step2Desc") },
              { num: "③", title: tHow("step3Title"), desc: tHow("step3Desc") },
            ].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="text-center px-4"
              >
                <div className="text-5xl font-black text-[#00D9FF] mb-4">
                  {step.num}
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  {step.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4 — 3 FEATURES STAR */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6 max-w-6xl">
          {/* Feature A — Recherche (image gauche, texte droite) */}
          <div className="grid md:grid-cols-2 gap-12 items-center mb-20 sm:mb-28">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="rounded-3xl overflow-hidden aspect-square border-2 border-slate-200 shadow-xl"
            >
              <div
                className="w-full h-full bg-cover bg-center"
                style={{
                  backgroundImage:
                    'url("https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=2340&auto=format&fit=crop")',
                }}
              />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-block px-3 py-1 rounded-full bg-[#00D9FF]/10 text-[#00D9FF] text-xs font-bold tracking-widest mb-4">
                {tFeatures("jobs.badge")}
              </span>
              <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
                {tFeatures("jobs.title")}
              </h3>
              <p className="text-slate-600 text-base leading-relaxed mb-6">
                {tFeatures("jobs.description")}
              </p>
              <ul className="space-y-3 mb-6">
                {[
                  tFeatures("jobs.bullet1"),
                  tFeatures("jobs.bullet2"),
                  tFeatures("jobs.bullet3"),
                  tFeatures("jobs.bullet4"),
                ].map((b, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#00D9FF] flex-shrink-0 mt-0.5" />
                    <span className="text-slate-700 text-sm">{b}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/jobs"
                className="text-[#00D9FF] font-semibold hover:underline text-sm"
              >
                {tFeatures("jobs.cta")}
              </Link>
            </motion.div>
          </div>

          {/* Feature B — CV ATS (texte gauche, image droite — INVERSÉ) */}
          <div className="grid md:grid-cols-2 gap-12 items-center mb-20 sm:mb-28">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-block px-3 py-1 rounded-full bg-[#00D9FF]/10 text-[#00D9FF] text-xs font-bold tracking-widest mb-4">
                {tFeatures("cv.badge")}
              </span>
              <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
                {tFeatures("cv.title")}
              </h3>
              <p className="text-slate-600 text-base leading-relaxed mb-6">
                {tFeatures("cv.description")}
              </p>
              <ul className="space-y-3 mb-6">
                {[
                  tFeatures("cv.bullet1"),
                  tFeatures("cv.bullet2"),
                  tFeatures("cv.bullet3"),
                  tFeatures("cv.bullet4"),
                ].map((b, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#00D9FF] flex-shrink-0 mt-0.5" />
                    <span className="text-slate-700 text-sm">{b}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/cv-analysis"
                className="text-[#00D9FF] font-semibold hover:underline text-sm"
              >
                {tFeatures("cv.cta")}
              </Link>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="rounded-3xl overflow-hidden aspect-square border-2 border-slate-200 shadow-xl"
            >
              <div
                className="w-full h-full bg-cover bg-center"
                style={{
                  backgroundImage:
                    'url("https://images.unsplash.com/photo-1586281380349-632531db7ed4?q=80&w=2340&auto=format&fit=crop")',
                }}
              />
            </motion.div>
          </div>

          {/* Feature C — Coachs (image gauche, texte droite) */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="rounded-3xl overflow-hidden aspect-square border-2 border-slate-200 shadow-xl"
            >
              <div
                className="w-full h-full bg-cover bg-center"
                style={{
                  backgroundImage:
                    'url("https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2340&auto=format&fit=crop")',
                }}
              />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-block px-3 py-1 rounded-full bg-[#00D9FF]/10 text-[#00D9FF] text-xs font-bold tracking-widest mb-4">
                {tFeatures("coaches.badge")}
              </span>
              <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
                {tFeatures("coaches.title")}
              </h3>
              <p className="text-slate-600 text-base leading-relaxed mb-6">
                {tFeatures("coaches.description")}
              </p>
              <ul className="space-y-3 mb-6">
                {(["nova", "maria", "sofia", "lucas", "david"] as const).map(
                  (key, i) => {
                    const names = {
                      nova: "Nova",
                      maria: "Maria",
                      sofia: "Sofia",
                      lucas: "Lucas",
                      david: "David",
                    };
                    return (
                      <li key={i} className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-[#00D9FF] flex-shrink-0 mt-0.5" />
                        <span className="text-slate-700 text-sm">
                          <strong>{names[key]}</strong> ·{" "}
                          {tFeatures(`coaches.list.${key}`)}
                        </span>
                      </li>
                    );
                  },
                )}
              </ul>
              <Link
                href="/assistant"
                className="text-[#00D9FF] font-semibold hover:underline text-sm"
              >
                {tFeatures("coaches.cta")}
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* SECTION 5 — GRILLE 12 FEATURES */}
      <section className="py-16 sm:py-24 bg-slate-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <motion.h2
              {...fadeUp}
              className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3"
            >
              {tFeaturesGrid("title")}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-slate-500 text-base"
            >
              {tFeaturesGrid("subtitle")}
            </motion.p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
            {(
              [
                { icon: Search, key: "jobSearch", badge: null },
                { icon: FileText, key: "cvAnalysis", badge: null },
                { icon: UserCheck, key: "nova", badge: null },
                { icon: Briefcase, key: "maria", badge: null },
                { icon: Award, key: "sofia", badge: null },
                { icon: Mic, key: "lucas", badge: tFeaturesGrid("badgeSoon") },
                { icon: Linkedin, key: "david", badge: null },
                { icon: Calendar, key: "salons", badge: null },
                { icon: Bookmark, key: "savedJobs", badge: null },
                {
                  icon: UserCheck2,
                  key: "recruiterContact",
                  badge: tFeaturesGrid("recruiterBadge"),
                },
                { icon: FilePlus, key: "documents", badge: null },
                { icon: Globe, key: "expat", badge: null },
              ] as Array<{
                icon: React.ElementType;
                key: string;
                badge: string | null;
              }>
            ).map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: i * 0.04 }}
                  className="bg-white border border-slate-200 rounded-2xl p-6 hover:border-[#00D9FF]/40 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-slate-600" />
                    </div>
                    {item.badge && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mb-1">
                    {tFeaturesGrid(`items.${item.key}.name`)}
                  </h3>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    {tFeaturesGrid(`items.${item.key}.desc`)}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 6 — STATS */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <motion.h2
              {...fadeUp}
              className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3"
            >
              {tStats("title")}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-slate-500 text-base"
            >
              {tStats("subtitle")}
            </motion.p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                value: tStats("candidates.value"),
                label: tStats("candidates.label"),
                icon: Users,
              },
              {
                value: tStats("responseRate.value"),
                label: tStats("responseRate.label"),
                icon: CheckCircle2,
              },
              {
                value: tStats("salary.value"),
                label: tStats("salary.label"),
                icon: TrendingUp,
              },
            ].map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center bg-slate-50 rounded-2xl p-8 border border-slate-200 hover:border-[#00D9FF]/30 hover:shadow-lg transition-all"
              >
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 flex items-center justify-center bg-[#00D9FF]/10 rounded-2xl">
                    <stat.icon className="w-6 h-6 text-[#00D9FF]" />
                  </div>
                </div>
                <div className="text-4xl sm:text-5xl font-black text-[#00D9FF] mb-2">
                  {stat.value}
                </div>
                <div className="text-slate-600 font-medium text-sm">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
          <p className="text-center text-xs text-slate-400 mt-6">
            {tStats("disclaimer")}
          </p>
        </div>
      </section>

      {/* SECTION 7 — PRICING */}
      <section className="py-16 sm:py-20 bg-slate-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <motion.h2
              {...fadeUp}
              className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3"
            >
              {tPricing("title")}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-slate-500 text-base max-w-2xl mx-auto"
            >
              {tPricing("subtitle")}
            </motion.p>
          </div>

          <LandingPricingSection />
        </div>
      </section>

      {/* SECTION 8 — CTA FINAL */}
      <section className="relative py-20 sm:py-28 bg-slate-900 overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{ backgroundImage: GRID_PATTERN, backgroundSize: "60px 60px" }}
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.15, 0.1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 left-1/4 w-96 h-96 bg-[#00D9FF]/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.08, 0.12, 0.08] }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
          className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl"
        />
        <div className="container mx-auto px-4 sm:px-6 relative z-10 text-center">
          <motion.h2
            {...fadeUp}
            className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4"
          >
            {tCtaFinal("title")}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-white/60 text-lg mb-10"
          >
            {tCtaFinal("subtitle")}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-bold text-white bg-[#F97316] hover:bg-[#EA6C0A] transition-all shadow-2xl hover:shadow-orange-500/30 hover:-translate-y-0.5"
            >
              {tCtaFinal("cta")}
            </Link>
          </motion.div>
        </div>
      </section>

      <Footer />

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap");
        body {
          font-family:
            "Plus Jakarta Sans",
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }
      `}</style>
    </div>
  );
}
