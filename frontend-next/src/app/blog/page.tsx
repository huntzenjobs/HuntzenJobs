"use client";

/**
 * Blog HuntZen Jobs - Page principale
 * Liste des articles optimisés SEO pour dominer "huntzen"
 */

import { motion } from "framer-motion";
import Link from "next/link";
import { Calendar, Clock, ArrowRight } from "lucide-react";
import { LandingHeader } from "@/components/landing-header";

// Articles de blog (à terme, viendra d'une base de données ou CMS)
const blogPosts = [
  {
    slug: "huntzen-jobs-guide-complet-2026",
    title: "HuntZen Jobs : Le Guide Complet 2026",
    excerpt:
      "Découvrez tout sur HuntZen Jobs, la plateforme N°1 de recherche d'emploi en France. Guide complet pour optimiser votre recherche d'emploi.",
    category: "Guide",
    readTime: "15 min",
    publishedAt: "2026-02-12",
    image: "/blog/huntzen-guide.jpg",
  },
  {
    slug: "trouver-emploi-huntzen-7-jours",
    title: "Comment Trouver un Emploi avec HuntZen en 7 Jours",
    excerpt:
      "Méthode step-by-step pour décrocher un emploi en une semaine grâce à HuntZen Jobs. Stratégies éprouvées et conseils d'experts.",
    category: "Tutoriel",
    readTime: "12 min",
    publishedAt: "2026-02-10",
    image: "/blog/huntzen-7-jours.jpg",
  },
  {
    slug: "huntzen-vs-indeed-linkedin",
    title: "HuntZen Jobs vs Indeed vs LinkedIn : Le Match",
    excerpt:
      "Comparaison détaillée des plateformes emploi. Pourquoi HuntZen Jobs surpasse Indeed et LinkedIn pour votre recherche d'emploi.",
    category: "Comparatif",
    readTime: "10 min",
    publishedAt: "2026-02-08",
    image: "/blog/huntzen-comparatif.jpg",
  },
];

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <LandingHeader />
      {/* Header SEO optimisé */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white pt-32 pb-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl mx-auto text-center"
          >
            <h1 className="text-5xl md:text-6xl font-black mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-[#00D9FF]">
              Blog HuntZen Jobs
            </h1>
            <p className="text-xl text-gray-300 leading-relaxed">
              Guides, conseils et stratégies pour réussir votre recherche
              d'emploi avec <strong>HuntZen Jobs</strong>
            </p>
          </motion.div>
        </div>
      </div>

      {/* Articles Grid */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {blogPosts.map((post, index) => (
            <motion.article
              key={post.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden group border border-gray-200 dark:border-gray-700"
            >
              {/* Image placeholder */}
              <div className="h-48 bg-gradient-to-br from-[#00D9FF] to-blue-600 relative overflow-hidden">
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-all duration-300" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <h3 className="text-white text-2xl font-bold px-6 text-center">
                    {post.category}
                  </h3>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                {/* Meta */}
                <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-4">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {new Date(post.publishedAt).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{post.readTime}</span>
                  </div>
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3 group-hover:text-[#00D9FF] transition-colors">
                  {post.title}
                </h2>

                {/* Excerpt */}
                <p className="text-gray-600 dark:text-gray-300 mb-4 line-clamp-3">
                  {post.excerpt}
                </p>

                {/* Read more */}
                <Link
                  href={`/blog/${post.slug}`}
                  className="inline-flex items-center gap-2 text-[#00D9FF] font-semibold hover:gap-3 transition-all group"
                >
                  Lire l'article
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </motion.article>
          ))}
        </div>

        {/* Coming soon */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 text-center"
        >
          <div className="inline-block bg-gradient-to-r from-[#00D9FF]/10 to-blue-500/10 dark:from-[#00D9FF]/20 dark:to-blue-500/20 rounded-2xl px-8 py-6 border border-[#00D9FF]/20 dark:border-[#00D9FF]/30">
            <p className="text-gray-700 dark:text-gray-300 font-semibold mb-2">
              📚 Plus d'articles arrivent bientôt !
            </p>
            <p className="text-gray-600 dark:text-gray-400">
              Abonnez-vous pour ne rien manquer des conseils HuntZen Jobs
            </p>
          </div>
        </motion.div>
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
              Prêt à transformer votre recherche d'emploi ?
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              Rejoignez HuntZen Jobs et accédez à +100 000 offres d'emploi
            </p>
            <Link
              href="/signup"
              className="inline-block px-8 py-4 bg-[#00D9FF] hover:bg-[#00C4EA] text-white font-bold rounded-xl shadow-lg hover:shadow-[#00D9FF]/50 transition-all"
            >
              Commencer gratuitement
            </Link>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
