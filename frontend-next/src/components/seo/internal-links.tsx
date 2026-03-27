/**
 * Internal Links Component - SEO Optimization
 * Liens internes avec anchors "huntzen jobs", "huntzen", etc.
 */

import Link from "next/link";

interface InternalLink {
  href: string;
  text: string;
  anchor: string;
}

const internalLinks: InternalLink[] = [
  {
    href: "/",
    text: "page d'accueil",
    anchor: "HuntZen Jobs",
  },
  {
    href: "/jobs",
    text: "offres d'emploi",
    anchor: "offres d'emploi HuntZen",
  },
  {
    href: "/cv-analysis",
    text: "analyse CV",
    anchor: "analyse CV HuntZen Jobs",
  },
  {
    href: "/assistant",
    text: "assistant carrière",
    anchor: "coach carrière HuntZen",
  },
  {
    href: "/pricing",
    text: "tarifs",
    anchor: "tarifs HuntZen Jobs",
  },
  {
    href: "/about",
    text: "à propos",
    anchor: "à propos de HuntZen",
  },
  {
    href: "/faq",
    text: "FAQ",
    anchor: "FAQ HuntZen Jobs",
  },
  {
    href: "/temoignages",
    text: "témoignages",
    anchor: "témoignages HuntZen Jobs",
  },
  {
    href: "/salons",
    text: "salons emploi",
    anchor: "salons emploi HuntZen",
  },
];

/**
 * Section de liens internes pour footer
 * À placer en bas de chaque page principale
 */
export function InternalLinksFooter() {
  return (
    <div className="bg-gray-50 py-12 border-t border-gray-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <h3 className="text-lg font-bold text-gray-900 mb-6 text-center">
            Découvrez toutes les fonctionnalités de HuntZen Jobs
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {internalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[#00D9FF] hover:text-[#00C4EA] font-medium transition-colors text-center py-2 hover:underline"
              >
                {link.anchor}
              </Link>
            ))}
          </div>

          <p className="text-gray-600 text-sm text-center mt-8 leading-relaxed">
            <strong>HuntZen Jobs</strong> est votre allié pour la recherche
            d'emploi en France. Que vous cherchiez des{" "}
            <Link href="/jobs" className="text-[#00D9FF] hover:underline">
              offres d'emploi
            </Link>
            , une{" "}
            <Link
              href="/cv-analysis"
              className="text-[#00D9FF] hover:underline"
            >
              analyse CV ATS
            </Link>
            , ou un{" "}
            <Link href="/assistant" className="text-[#00D9FF] hover:underline">
              coaching carrière personnalisé
            </Link>
            , <strong>HuntZen</strong> vous accompagne dans votre réussite
            professionnelle.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Breadcrumb optimisé SEO avec "HuntZen Jobs"
 */
interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function SEOBreadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav
      className="flex items-center gap-2 text-sm text-gray-600 mb-6"
      aria-label="Breadcrumb"
    >
      <Link
        href="/"
        className="hover:text-[#00D9FF] transition-colors font-medium"
      >
        HuntZen Jobs
      </Link>
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="text-gray-400">/</span>
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-[#00D9FF] transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-900 font-medium">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}

/**
 * CTA Section avec liens internes
 */
interface CTALinksProps {
  title?: string;
  description?: string;
  primaryLink?: string;
  primaryText?: string;
}

export function CTAWithLinks({
  title = "Transformez votre recherche d'emploi avec HuntZen Jobs",
  description = "Rejoignez des milliers de candidats qui ont trouvé leur emploi idéal grâce à HuntZen Jobs",
  primaryLink = "/signup",
  primaryText = "Commencer gratuitement",
}: CTALinksProps) {
  return (
    <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-black mb-4">{title}</h2>
          <p className="text-lg text-gray-300 mb-8">{description}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={primaryLink}
              className="inline-block px-8 py-4 bg-[#00D9FF] hover:bg-[#00C4EA] text-white font-bold rounded-xl shadow-lg hover:shadow-[#00D9FF]/50 transition-all"
            >
              {primaryText}
            </Link>
            <Link
              href="/about"
              className="inline-block px-8 py-4 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-xl shadow-lg transition-all"
            >
              En savoir plus
            </Link>
          </div>

          {/* Links */}
          <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm">
            <Link
              href="/temoignages"
              className="text-gray-400 hover:text-white transition-colors"
            >
              Avis HuntZen Jobs
            </Link>
            <span className="text-gray-600">•</span>
            <Link
              href="/pricing"
              className="text-gray-400 hover:text-white transition-colors"
            >
              Tarifs transparents
            </Link>
            <span className="text-gray-600">•</span>
            <Link
              href="/faq"
              className="text-gray-400 hover:text-white transition-colors"
            >
              Questions fréquentes
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
