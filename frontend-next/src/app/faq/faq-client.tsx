"use client";

/**
 * FAQ Client Component - Interactive accordion
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, MessageCircle } from "lucide-react";
import Link from "next/link";
import { InternalLinksFooter } from "@/components/seo/internal-links";
import { LandingHeader } from "@/components/landing-header";
import { faqCategories } from "./faq-data";

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
          item.a.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    }))
    .filter((category) => category.questions.length > 0);

  const toggleQuestion = (categoryIndex: number, questionIndex: number) => {
    const key = `${categoryIndex}-${questionIndex}`;
    setOpenIndex(openIndex === key ? null : key);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <LandingHeader />
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
              Tout ce que vous devez savoir sur <strong>HuntZen Jobs</strong>,
              la plateforme N°1 de recherche d'emploi en France
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
