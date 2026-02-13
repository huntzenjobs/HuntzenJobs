"use client";

/**
 * Témoignages Client Component
 * Interface interactive avec filtres et animations
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Star, Search, Filter, ChevronDown } from "lucide-react";
import Link from "next/link";
import { Testimonial } from "./testimonials-data";
import { InternalLinksFooter } from "@/components/seo/internal-links";

interface TestimonialsClientProps {
  testimonials: Testimonial[];
  averageRating: number;
  totalReviews: number;
}

export function TestimonialsClient({
  testimonials,
  averageRating,
  totalReviews,
}: TestimonialsClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [displayCount, setDisplayCount] = useState(12);

  // Extraire tous les tags uniques
  const allTags = Array.from(
    new Set(testimonials.flatMap((t) => t.tags)),
  ).sort();

  // Filtrer les témoignages
  const filteredTestimonials = testimonials.filter((testimonial) => {
    const matchesSearch =
      testimonial.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      testimonial.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      testimonial.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      testimonial.title.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTag = selectedTag
      ? testimonial.tags.includes(selectedTag)
      : true;

    const matchesRating = selectedRating
      ? testimonial.rating === selectedRating
      : true;

    return matchesSearch && matchesTag && matchesRating;
  });

  const displayedTestimonials = filteredTestimonials.slice(0, displayCount);
  const hasMore = displayCount < filteredTestimonials.length;

  // Render stars
  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-5 h-5 ${star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
          />
        ))}
      </div>
    );
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
              Témoignages HuntZen Jobs
            </h1>
            <p className="text-xl text-gray-300 leading-relaxed mb-8">
              Découvrez comment <strong>HuntZen Jobs</strong> a transformé la
              recherche d'emploi de +10 000 utilisateurs
            </p>

            {/* Rating globale */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="inline-flex items-center gap-6 bg-white/10 backdrop-blur-md rounded-2xl px-8 py-6 border-2 border-white/20"
            >
              <div>
                <div className="text-5xl font-black text-[#00D9FF]">
                  {averageRating.toFixed(1)}
                </div>
                <div className="text-sm text-gray-300 mt-1">sur 5</div>
              </div>
              <div>
                <div className="flex gap-1 mb-2">{renderStars(5)}</div>
                <div className="text-sm text-gray-300">
                  {totalReviews} avis vérifiés
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Filters */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-5xl mx-auto border border-gray-200 dark:border-gray-700"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Rechercher un témoignage..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-[#00D9FF] transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* Tag filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <select
                value={selectedTag || ""}
                onChange={(e) => setSelectedTag(e.target.value || null)}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-[#00D9FF] transition-all appearance-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Tous les métiers</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>

            {/* Rating filter */}
            <div className="relative">
              <Star className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <select
                value={selectedRating || ""}
                onChange={(e) =>
                  setSelectedRating(
                    e.target.value ? parseInt(e.target.value) : null,
                  )
                }
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-[#00D9FF] transition-all appearance-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Toutes les notes</option>
                <option value="5">5 étoiles</option>
                <option value="4">4 étoiles</option>
              </select>
            </div>
          </div>

          {/* Active filters */}
          {(selectedTag || selectedRating || searchQuery) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="inline-flex items-center gap-2 px-3 py-1 bg-[#00D9FF]/10 text-[#00D9FF] rounded-lg text-sm font-medium hover:bg-[#00D9FF]/20 transition-all"
                >
                  {searchQuery}
                  <span className="text-lg">×</span>
                </button>
              )}
              {selectedTag && (
                <button
                  onClick={() => setSelectedTag(null)}
                  className="inline-flex items-center gap-2 px-3 py-1 bg-[#00D9FF]/10 text-[#00D9FF] rounded-lg text-sm font-medium hover:bg-[#00D9FF]/20 transition-all"
                >
                  {selectedTag}
                  <span className="text-lg">×</span>
                </button>
              )}
              {selectedRating && (
                <button
                  onClick={() => setSelectedRating(null)}
                  className="inline-flex items-center gap-2 px-3 py-1 bg-[#00D9FF]/10 text-[#00D9FF] rounded-lg text-sm font-medium hover:bg-[#00D9FF]/20 transition-all"
                >
                  {selectedRating} étoiles
                  <span className="text-lg">×</span>
                </button>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* Testimonials Grid */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {filteredTestimonials.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
              {displayedTestimonials.map((testimonial, index) => (
                <motion.div
                  key={testimonial.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.05 }}
                  className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all p-6 border border-gray-200 dark:border-gray-700"
                >
                  {/* Header */}
                  <div className="flex items-start gap-4 mb-4">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#00D9FF] to-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                      {testimonial.avatar}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 dark:text-white truncate">
                        {testimonial.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                        {testimonial.role}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {testimonial.location}
                      </p>
                    </div>
                  </div>

                  {/* Rating */}
                  <div className="flex items-center gap-2 mb-3">
                    {renderStars(testimonial.rating)}
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(testimonial.date).toLocaleDateString("fr-FR")}
                    </span>
                  </div>

                  {/* Title */}
                  <h4 className="font-bold text-gray-900 dark:text-white mb-2 line-clamp-2">
                    {testimonial.title}
                  </h4>

                  {/* Content */}
                  <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed mb-4 line-clamp-4">
                    {testimonial.content}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2">
                    {testimonial.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                    {testimonial.tags.length > 2 && (
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg text-xs">
                        +{testimonial.tags.length - 2}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="text-center mt-12"
              >
                <button
                  onClick={() => setDisplayCount((prev) => prev + 12)}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-[#00D9FF] hover:bg-[#00C4EA] text-white font-bold rounded-xl shadow-lg hover:shadow-[#00D9FF]/50 transition-all"
                >
                  Voir plus de témoignages
                  <ChevronDown className="w-5 h-5" />
                </button>
                <p className="text-gray-600 dark:text-gray-300 mt-4">
                  {displayCount} sur {filteredTestimonials.length} témoignages
                  affichés
                </p>
              </motion.div>
            )}
          </>
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
              Aucun témoignage trouvé
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Essayez d'autres critères de recherche
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedTag(null);
                setSelectedRating(null);
              }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#00D9FF] hover:bg-[#00C4EA] text-white font-semibold rounded-xl transition-all"
            >
              Réinitialiser les filtres
            </button>
          </motion.div>
        )}
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto text-center"
          >
            <h2 className="text-4xl font-black mb-6">
              Rejoignez +10 000 utilisateurs satisfaits
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              Transformez votre recherche d'emploi avec HuntZen Jobs dès
              maintenant
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/signup"
                className="inline-block px-8 py-4 bg-[#00D9FF] hover:bg-[#00C4EA] text-white font-bold rounded-xl shadow-lg hover:shadow-[#00D9FF]/50 transition-all"
              >
                Créer mon compte gratuitement
              </Link>
              <Link
                href="/about"
                className="inline-block px-8 py-4 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-xl shadow-lg transition-all"
              >
                En savoir plus sur HuntZen
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
