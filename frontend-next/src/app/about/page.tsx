"use client";

/**
 * Page À Propos HuntZen Jobs - CRITIQUE pour SEO
 * Optimisée pour dominer les recherches "huntzen" et "huntzenjobs"
 * Contenu: 1700+ mots avec densité mot-clé "huntzen" 2-3%
 */

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Target,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { useTranslations } from "next-intl";

export default function AboutPage() {
  const t = useTranslations("about");

  const vsItems = [
    { titleKey: "vs_item1_title" as const, descKey: "vs_item1_desc" as const },
    { titleKey: "vs_item2_title" as const, descKey: "vs_item2_desc" as const },
    { titleKey: "vs_item3_title" as const, descKey: "vs_item3_desc" as const },
    { titleKey: "vs_item4_title" as const, descKey: "vs_item4_desc" as const },
    { titleKey: "vs_item5_title" as const, descKey: "vs_item5_desc" as const },
    { titleKey: "vs_item6_title" as const, descKey: "vs_item6_desc" as const },
  ];

  const richStrong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
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
              {t("hero_title")}
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 leading-relaxed">
              {t.rich("hero_subtitle", { strong: richStrong })}
            </p>
          </motion.div>
        </div>
      </div>

      {/* Qui est HuntZen Section */}
      <div className="py-20 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl font-black text-gray-900 dark:text-white mb-8">
                {t("who_title")}
              </h2>

              <div className="prose prose-lg max-w-none text-gray-700 dark:text-gray-300 leading-relaxed space-y-6">
                <p>{t.rich("who_p1", { strong: richStrong })}</p>
                <p>{t.rich("who_p2", { strong: richStrong })}</p>
                <p>{t.rich("who_p3", { strong: richStrong })}</p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Pourquoi choisir HuntZen Section */}
      <div className="py-20 bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl font-black text-gray-900 dark:text-white mb-6">
                {t("why_title")}
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
                {t.rich("why_subtitle", { strong: richStrong })}
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                viewport={{ once: true }}
                className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all"
              >
                <div className="w-16 h-16 bg-[#00D9FF]/10 dark:bg-[#00D9FF]/20 rounded-2xl flex items-center justify-center mb-6">
                  <Target className="w-8 h-8 text-[#00D9FF]" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                  {t("feature1_title")}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                  {t.rich("feature1_desc", { strong: richStrong })}
                </p>
              </motion.div>

              {/* Feature 2 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                viewport={{ once: true }}
                className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all"
              >
                <div className="w-16 h-16 bg-[#00D9FF]/10 dark:bg-[#00D9FF]/20 rounded-2xl flex items-center justify-center mb-6">
                  <Sparkles className="w-8 h-8 text-[#00D9FF]" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                  {t("feature2_title")}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                  {t.rich("feature2_desc", { strong: richStrong })}
                </p>
              </motion.div>

              {/* Feature 3 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                viewport={{ once: true }}
                className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all"
              >
                <div className="w-16 h-16 bg-[#00D9FF]/10 dark:bg-[#00D9FF]/20 rounded-2xl flex items-center justify-center mb-6">
                  <TrendingUp className="w-8 h-8 text-[#00D9FF]" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                  {t("feature3_title")}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                  {t.rich("feature3_desc", { strong: richStrong })}
                </p>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* L'histoire de HuntZen Section */}
      <div className="py-20 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl font-black text-gray-900 dark:text-white mb-8">
                {t("story_title")}
              </h2>

              <div className="prose prose-lg max-w-none text-gray-700 dark:text-gray-300 leading-relaxed space-y-6">
                <p>{t.rich("story_p1", { strong: richStrong })}</p>
                <p>{t.rich("story_p2", { strong: richStrong })}</p>
                <p>{t.rich("story_p3", { strong: richStrong })}</p>
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
            <h2 className="text-4xl font-black mb-4">{t("stats_title")}</h2>
            <p className="text-xl text-gray-300">{t("stats_subtitle")}</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {[
              { value: "+100K", key: "stat_jobs" },
              { value: "50K+", key: "stat_users" },
              { value: "87%", key: "stat_satisfaction" },
              { value: "24/7", key: "stat_support" },
            ].map((stat, index) => (
              <motion.div
                key={stat.key}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="text-center"
              >
                <div className="text-5xl font-black text-[#00D9FF] mb-2">
                  {stat.value}
                </div>
                <div className="text-gray-300">
                  {t(stat.key as Parameters<typeof t>[0])}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* HuntZen vs autres plateformes */}
      <div className="py-20 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl font-black text-gray-900 dark:text-white mb-6">
                {t("vs_title")}
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-300">
                {t.rich("vs_subtitle", { strong: richStrong })}
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {vsItems.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="flex items-start gap-4 bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-700 p-6 rounded-xl border border-gray-200 dark:border-gray-600"
                >
                  <CheckCircle2 className="w-6 h-6 text-[#00D9FF] flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                      {t(item.titleKey)}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300 text-sm">
                      {t(item.descKey)}
                    </p>
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
              {t("cta_title")}
            </h2>
            <p className="text-xl mb-8 text-white/90">
              {t.rich("cta_subtitle", { strong: richStrong })}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-8 py-4 bg-white text-[#00D9FF] font-bold rounded-xl shadow-lg hover:shadow-2xl hover:scale-105 transition-all"
              >
                {t("cta_signup")}
                <ArrowRight className="w-5 h-5" />
              </Link>

              <Link
                href="/jobs"
                className="inline-flex items-center gap-2 px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-bold rounded-xl border-2 border-white hover:bg-white/20 transition-all"
              >
                {t("cta_jobs")}
              </Link>
            </div>

            <p className="mt-8 text-white/80 text-sm">
              {t("cta_already")}{" "}
              <Link href="/login" className="underline font-semibold">
                {t("cta_login")}
              </Link>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
