"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  TrendingUp,
  FileText,
  Search,
  Users,
  Target,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Briefcase,
  Calendar,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import { LandingHeader } from "@/components/landing-header";
import { Footer } from "@/components/layout/footer";
import { useTranslations } from "next-intl";

export default function HomePage() {
  const tHero = useTranslations("hero");
  const tTools = useTranslations("tools");
  const tPain = useTranslations("painPoints");
  const tFeatures = useTranslations("features");
  const tStats = useTranslations("stats");
  const tPricing = useTranslations("pricing");
  const tPlans = useTranslations("pricingPlans");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && /^[a-zA-Z0-9_-]{3,32}$/.test(ref)) {
      document.cookie = `huntzen_referral_code=${ref}; path=/; max-age=604800; SameSite=Lax`;
    }
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <LandingHeader />

      {/* Hero Section with Background Image */}
      <section className="relative min-h-[65vh] sm:min-h-[70vh] flex items-center justify-center overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 pt-20">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0">
          <div
            className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-purple-900/20 to-gray-900/40"
            style={{
              backgroundImage:
                'url("https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2340&auto=format&fit=crop")',
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "brightness(0.3) saturate(0.8)",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gray-900/50 to-gray-900" />
        </div>

        {/* Animated grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2300D9FF' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Gradient orbs with animation */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.1, 0.15, 0.1],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-1/4 left-1/4 w-64 sm:w-96 h-64 sm:h-96 bg-[#00D9FF]/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.08, 0.12, 0.08],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
          className="absolute bottom-1/4 right-1/4 w-64 sm:w-80 h-64 sm:h-80 bg-purple-500/10 rounded-full blur-3xl"
        />

        {/* Hero Content */}
        <div className="container mx-auto px-4 sm:px-6 relative z-10 text-center py-12 sm:py-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            className="mb-6"
          >
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-white tracking-tight mb-4 relative"
              style={{
                textShadow:
                  "0 0 40px rgba(0, 217, 255, 0.3), 0 0 80px rgba(0, 217, 255, 0.1)",
              }}
            >
              HUNTZEN
              <span className="block text-4xl sm:text-5xl md:text-6xl lg:text-7xl mt-2 bg-gradient-to-r from-[#00D9FF] to-purple-400 bg-clip-text text-transparent">
                JOBS
              </span>
            </motion.h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-base sm:text-lg md:text-xl text-white/90 max-w-3xl mx-auto mb-8 px-4 leading-relaxed"
          >
            {tHero("subtitle")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 rounded-xl text-sm sm:text-base font-bold text-white bg-[#00D9FF] hover:bg-[#00C4EA] transition-all shadow-2xl hover:shadow-[#00D9FF]/50 hover:-translate-y-1 w-full sm:w-auto justify-center"
            >
              <Search className="w-4 h-4 sm:w-5 sm:h-5" />
              {tHero("ctaSearch")}
            </Link>
            <a
              href="#features"
              className="text-white/70 hover:text-white text-sm sm:text-base font-medium transition-colors flex items-center gap-2"
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
        </div>
      </section>

      {/* Nos Outils - Enhanced Section */}
      <section
        className="py-12 sm:py-16 bg-slate-50 dark:bg-gray-900"
        id="features"
      >
        <div className="container mx-auto px-4 sm:px-6">
          {/* Section Header */}
          <div className="text-center mb-10 sm:mb-12">
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#00D9FF]/10 dark:bg-[#00D9FF]/20 text-[#00D9FF] text-xs font-bold tracking-widest uppercase mb-4"
            >
              <Sparkles className="w-3 h-3" />
              {tTools("badge")}
            </motion.span>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3"
            >
              {tTools("title")}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto text-sm sm:text-base px-4"
            >
              {tTools("subtitle")}
            </motion.p>
          </div>

          {/* Tools — Bento Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-6xl mx-auto">
            {(
              [
                {
                  type: "featured",
                  icon: Search,
                  category: tTools("items.jobSearch.category"),
                  title: tTools("items.jobSearch.title"),
                  description: tTools("items.jobSearch.description"),
                  href: "/jobs",
                },
                {
                  type: "regular",
                  icon: Target,
                  category: tTools("items.compatibility.category"),
                  title: tTools("items.compatibility.title"),
                  description: tTools("items.compatibility.description"),
                  href: "/jobs",
                },
                {
                  type: "regular",
                  icon: FileText,
                  category: tTools("items.cvAnalysis.category"),
                  title: tTools("items.cvAnalysis.title"),
                  description: tTools("items.cvAnalysis.description"),
                  href: "/cv-analysis",
                },
                {
                  type: "regular",
                  icon: Sparkles,
                  category: tTools("items.skills.category"),
                  title: tTools("items.skills.title"),
                  description: tTools("items.skills.description"),
                  href: "/cv-analysis",
                },
                {
                  type: "regular",
                  icon: Users,
                  category: tTools("items.interview.category"),
                  title: tTools("items.interview.title"),
                  description: tTools("items.interview.description"),
                  href: "/assistant",
                },
                {
                  type: "featured",
                  icon: MessageSquare,
                  category: tTools("items.coach.category"),
                  title: tTools("items.coach.title"),
                  description: tTools("items.coach.description"),
                  href: "/assistant",
                },
                {
                  type: "medium",
                  icon: TrendingUp,
                  category: tTools("items.salary.category"),
                  title: tTools("items.salary.title"),
                  description: tTools("items.salary.description"),
                  href: "/assistant",
                },
                {
                  type: "medium",
                  icon: Calendar,
                  category: tTools("items.salons.category"),
                  title: tTools("items.salons.title"),
                  description: tTools("items.salons.description"),
                  href: "/salons",
                },
              ] as Array<{
                type: string;
                icon: React.ElementType;
                category: string;
                title: string;
                description: string;
                href: string;
              }>
            ).map((tool, index) => {
              const Icon = tool.icon;
              const isFeatured = tool.type === "featured";
              const isMedium = tool.type === "medium";
              const colSpan =
                isFeatured || isMedium ? "col-span-2" : "col-span-1";

              return (
                <motion.div
                  key={index}
                  className={colSpan}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: index * 0.055 }}
                >
                  <Link href={tool.href} className="group block h-full">
                    {isFeatured ? (
                      /* FEATURED DARK CARD */
                      <div
                        className="relative h-full overflow-hidden rounded-2xl bg-slate-900 dark:bg-[#050A14] border border-slate-800/60 p-6 sm:p-8 flex flex-col"
                        style={{ minHeight: "210px" }}
                      >
                        {/* Ambient cyan glow */}
                        <div className="absolute -top-12 -left-12 w-56 h-56 bg-[#00D9FF] opacity-[0.10] blur-[70px] rounded-full pointer-events-none" />
                        {/* Watermark icon */}
                        <Icon className="absolute -bottom-6 -right-6 w-40 h-40 text-white opacity-[0.04] pointer-events-none" />
                        {/* Icon */}
                        <div className="relative z-10 w-11 h-11 rounded-xl bg-[#00D9FF]/10 border border-[#00D9FF]/20 flex items-center justify-center mb-5">
                          <Icon className="w-5 h-5 text-[#00D9FF]" />
                        </div>
                        <span className="relative z-10 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500 mb-2">
                          {tool.category}
                        </span>
                        <h3 className="relative z-10 text-2xl sm:text-3xl font-bold text-white leading-tight mb-3">
                          {tool.title}
                        </h3>
                        <p className="relative z-10 text-base text-slate-400 leading-relaxed flex-1">
                          {tool.description}
                        </p>
                        <div className="relative z-10 mt-5 flex items-center gap-2 text-[#00D9FF] text-base font-semibold">
                          <span>{tTools("explore")}</span>
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                        </div>
                      </div>
                    ) : isMedium ? (
                      /* MEDIUM HORIZONTAL CARD */
                      <div className="relative h-full overflow-hidden rounded-2xl bg-white dark:bg-white border border-slate-200/80 dark:border-slate-200/80 p-5 sm:p-6 flex flex-row items-center gap-4 hover:border-[#00D9FF]/40 hover:shadow-[0_6px_24px_rgba(0,217,255,0.08)] transition-all duration-300">
                        <Icon className="absolute -bottom-4 -right-4 w-24 h-24 text-slate-900 opacity-[0.03] pointer-events-none" />
                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-[#00D9FF]/10 transition-colors duration-200">
                          <Icon className="w-5 h-5 text-slate-400 group-hover:text-[#00D9FF] transition-colors duration-200" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400 block mb-0.5">
                            {tool.category}
                          </span>
                          <h3 className="text-base font-bold text-slate-900 leading-snug">
                            {tool.title}
                          </h3>
                          <p className="text-sm text-slate-500 mt-1 leading-relaxed hidden sm:block">
                            {tool.description}
                          </p>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-1.5 text-sm font-semibold text-slate-300 group-hover:text-[#00D9FF] transition-colors duration-200">
                          <span className="hidden sm:block">Explorer</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-200" />
                        </div>
                      </div>
                    ) : (
                      /* REGULAR CARD */
                      <div
                        className="relative h-full overflow-hidden rounded-2xl bg-white dark:bg-white border border-slate-200/80 dark:border-slate-200/80 p-5 flex flex-col hover:border-[#00D9FF]/40 hover:shadow-[0_8px_30px_rgba(0,217,255,0.08)] transition-all duration-300"
                        style={{ minHeight: "210px" }}
                      >
                        <Icon className="absolute -bottom-3 -right-3 w-20 h-20 text-slate-900 opacity-[0.03] pointer-events-none" />
                        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center mb-4 group-hover:bg-[#00D9FF]/10 transition-colors duration-200">
                          <Icon className="w-4 h-4 text-slate-400 group-hover:text-[#00D9FF] transition-colors duration-200" />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400 mb-2">
                          {tool.category}
                        </span>
                        <h3 className="text-base font-bold text-slate-900 leading-snug flex-1">
                          {tool.title}
                        </h3>
                        <p className="text-sm text-slate-500 leading-relaxed mt-2 mb-3">
                          {tool.description}
                        </p>
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-300 group-hover:text-[#00D9FF] transition-colors duration-200">
                          <span>{tTools("explore")}</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-200" />
                        </div>
                      </div>
                    )}
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* La recherche d'emploi aujourd'hui */}
      <section className="py-12 sm:py-16 bg-gray-50 dark:bg-gray-800">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-3"
            >
              {tPain("title")}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-[#00D9FF] font-semibold uppercase text-xs sm:text-sm tracking-wide"
            >
              {tPain("subtitle")}
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-6xl mx-auto">
            {[
              {
                title: tPain("items.ghosting.title"),
                description: tPain("items.ghosting.description"),
                icon: AlertCircle,
              },
              {
                title: tPain("items.exhausting.title"),
                description: tPain("items.exhausting.description"),
                icon: Search,
              },
              {
                title: tPain("items.negotiation.title"),
                description: tPain("items.negotiation.description"),
                icon: TrendingUp,
              },
              {
                title: tPain("items.feedback.title"),
                description: tPain("items.feedback.description"),
                icon: Target,
              },
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white dark:bg-gray-800 rounded-2xl p-5 sm:p-6 border-2 border-gray-100 dark:border-gray-700 hover:border-[#00D9FF]/30 hover:shadow-lg transition-all group"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 flex items-center justify-center bg-[#00D9FF]/10 dark:bg-[#00D9FF]/20 rounded-xl group-hover:bg-[#00D9FF]/20 dark:group-hover:bg-[#00D9FF]/30 transition-colors flex-shrink-0">
                    <item.icon className="w-5 h-5 text-[#00D9FF]" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-[#00D9FF]">
                    {item.title}
                  </h3>
                </div>
                <p className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Votre allié carrière */}
      <section className="py-16 sm:py-20 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-3"
            >
              {(() => {
                const title = tFeatures("title");
                const highlight = tFeatures("titleHighlight");
                const idx = title.indexOf(highlight);
                if (idx === -1) return title;
                return (
                  <>
                    {title.slice(0, idx)}
                    <span className="text-[#00D9FF]">{highlight}</span>
                    {title.slice(idx + highlight.length)}
                  </>
                );
              })()}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-gray-600 dark:text-gray-300 text-base sm:text-lg max-w-2xl mx-auto"
            >
              {tFeatures("subtitle")}
            </motion.p>
          </div>

          {/* Two Column Features */}
          <div className="max-w-6xl mx-auto space-y-16 sm:space-y-20">
            {/* Feature 1: Analyse CV */}
            <div className="grid md:grid-cols-2 gap-8 sm:gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              >
                <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">
                  {(() => {
                    const title = tFeatures("cv.title");
                    const highlight = tFeatures("cv.titleHighlight");
                    const i = title.indexOf(highlight);
                    if (i === -1) return title;
                    return (
                      <>
                        <span className="text-[#00D9FF]">{highlight}</span>
                        {title.slice(i + highlight.length)}
                      </>
                    );
                  })()}
                </h3>
                <p className="text-gray-700 dark:text-gray-300 text-base sm:text-lg mb-4 sm:mb-6 leading-relaxed">
                  {tFeatures("cv.description")}
                </p>
                <ul className="space-y-3">
                  {(tFeatures.raw("cv.items") as string[]).map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#00D9FF] flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700 dark:text-gray-300 text-sm sm:text-base">
                        {item}
                      </span>
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
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{
                    backgroundImage:
                      'url("https://images.unsplash.com/photo-1586281380349-632531db7ed4?q=80&w=2340&auto=format&fit=crop")',
                  }}
                />
              </motion.div>
            </div>

            {/* Feature 2: Matching */}
            <div className="grid md:grid-cols-2 gap-8 sm:gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="relative rounded-3xl overflow-hidden aspect-square border-2 border-gray-200 shadow-xl md:order-1"
              >
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{
                    backgroundImage:
                      'url("https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=2340&auto=format&fit=crop")',
                  }}
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="md:order-2"
              >
                <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">
                  <span className="text-[#00D9FF]">
                    {tFeatures("matching.title")}
                  </span>
                </h3>
                <p className="text-gray-700 dark:text-white/80 text-base sm:text-lg mb-4 sm:mb-6 leading-relaxed">
                  {tFeatures("matching.description")}
                </p>
                <ul className="space-y-3">
                  {(tFeatures.raw("matching.items") as string[]).map(
                    (item, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-[#00D9FF] flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700 dark:text-white/85 text-sm sm:text-base">
                          {item}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section - UPDATED */}
      <section className="py-12 sm:py-16 bg-gray-50 dark:bg-gray-800">
        <div className="container mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10 sm:mb-12"
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">
              {tStats("title")}
            </h2>
            <p className="text-gray-600 dark:text-gray-300 text-sm sm:text-base">
              {tStats("subtitle")}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {[
              {
                value: tStats("candidates.value"),
                label: tStats("candidates.label"),
                icon: Users,
                color: "#00D9FF",
              },
              {
                value: tStats("responseRate.value"),
                label: tStats("responseRate.label"),
                icon: CheckCircle2,
                color: "#00D9FF",
              },
              {
                value: tStats("salary.value"),
                label: tStats("salary.label"),
                icon: TrendingUp,
                color: "#00D9FF",
              },
            ].map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center bg-white dark:bg-gray-700 rounded-2xl p-6 sm:p-8 border-2 border-gray-100 dark:border-gray-600 hover:border-[#00D9FF]/30 hover:shadow-lg transition-all group"
              >
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center bg-[#00D9FF]/10 dark:bg-[#00D9FF]/20 rounded-2xl group-hover:bg-[#00D9FF]/20 dark:group-hover:bg-[#00D9FF]/30 transition-colors">
                    <stat.icon className="w-6 h-6 sm:w-7 sm:h-7 text-[#00D9FF]" />
                  </div>
                </div>
                <div
                  className="text-4xl sm:text-5xl font-black mb-2"
                  style={{ color: stat.color }}
                >
                  {stat.value}
                </div>
                <div className="text-gray-600 dark:text-gray-300 font-medium text-sm sm:text-base">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-16 sm:py-20 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3"
            >
              {tPricing("title")}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-gray-600 dark:text-gray-300 text-sm sm:text-base max-w-2xl mx-auto"
            >
              {tPricing("subtitle")}
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-7xl mx-auto">
            {[
              {
                name: tPlans("plans.free.name"),
                price: "0€",
                period: tPlans("plans.free.period"),
                color: "#9CA3AF",
                features: tPlans.raw("plans.free.features") as string[],
                unavailable: tPlans.raw("plans.free.unavailable") as string[],
                cta: tPlans("plans.free.cta"),
              },
              {
                name: tPlans("plans.essential.name"),
                price: "8.90€",
                period: tPlans("plans.essential.period"),
                color: "#00D9FF",
                popular: true,
                features: tPlans.raw("plans.essential.features") as string[],
                unavailable: tPlans.raw(
                  "plans.essential.unavailable",
                ) as string[],
                cta: tPlans("plans.essential.cta"),
              },
              {
                name: tPlans("plans.pro.name"),
                price: "13.90€",
                period: tPlans("plans.pro.period"),
                color: "#9333EA",
                features: tPlans.raw("plans.pro.features") as string[],
                unavailable: tPlans.raw("plans.pro.unavailable") as string[],
                cta: tPlans("plans.pro.cta"),
              },
              {
                name: tPlans("plans.premium.name"),
                price: "19.90€",
                period: tPlans("plans.premium.period"),
                color: "#F97316",
                features: tPlans.raw("plans.premium.features") as string[],
                unavailable: tPlans.raw(
                  "plans.premium.unavailable",
                ) as string[],
                cta: tPlans("plans.premium.cta"),
              },
            ].map((plan, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`bg-white dark:bg-gray-800 rounded-2xl p-5 sm:p-6 border-2 ${
                  plan.popular
                    ? "border-[#00D9FF] shadow-xl lg:scale-105"
                    : "border-gray-200 dark:border-gray-700"
                } hover:shadow-lg transition-all relative flex flex-col h-full`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#00D9FF] text-white text-xs font-bold rounded-full">
                    {tPlans("popular")}
                  </div>
                )}

                <div className="text-center mb-6">
                  <div className="text-gray-600 dark:text-gray-400 font-bold text-xs sm:text-sm mb-2">
                    {plan.name}
                  </div>
                  <div className="flex items-baseline justify-center gap-1">
                    <span
                      className="text-4xl sm:text-5xl font-black"
                      style={{ color: plan.color }}
                    >
                      {plan.price}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">
                      {plan.period}
                    </span>
                  </div>
                </div>

                <ul className="space-y-2.5 sm:space-y-3 mb-6 flex-grow">
                  {plan.features.map((feature, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs sm:text-sm"
                    >
                      <CheckCircle2
                        className="w-4 h-4 flex-shrink-0 mt-0.5"
                        style={{ color: plan.color }}
                      />
                      <span className="text-gray-700 dark:text-gray-300">
                        {feature}
                      </span>
                    </li>
                  ))}
                  {plan.unavailable.map((feature, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs sm:text-sm text-gray-400 dark:text-gray-500"
                    >
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signup"
                  className="block w-full text-center px-4 py-2.5 sm:py-3 rounded-xl font-semibold text-white text-xs sm:text-sm transition-all hover:shadow-lg mt-auto"
                  style={{ backgroundColor: plan.color }}
                >
                  {plan.cta}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Internal Links Footer for SEO */}

      {/* Footer */}
      <Footer />

      <style jsx global>{`
        body {
          font-family:
            var(--font-dm-sans),
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }
      `}</style>
    </div>
  );
}
