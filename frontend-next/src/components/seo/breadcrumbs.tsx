/**
 * Composant Breadcrumbs avec Schema.org BreadcrumbList
 * Pour améliorer le SEO et l'UX
 */

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import Script from "next/script";

export interface BreadcrumbItem {
  label: string;
  href: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className = "" }: BreadcrumbsProps) {
  // Toujours inclure "Accueil" comme premier élément
  const allItems: BreadcrumbItem[] = [
    { label: "Accueil", href: "/" },
    ...items,
  ];

  // Générer Schema.org BreadcrumbList
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: allItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: `https://huntzenjobs.fr${item.href}`,
    })),
  };

  return (
    <>
      {/* Schema.org JSON-LD */}
      <Script
        id="breadcrumb-schema"
        type="application/ld+json"
        strategy="beforeInteractive"
      >
        {JSON.stringify(schema)}
      </Script>

      {/* Breadcrumbs visuel */}
      <nav
        aria-label="Fil d'Ariane"
        className={`flex items-center space-x-2 text-sm ${className}`}
      >
        {allItems.map((item, index) => {
          const isLast = index === allItems.length - 1;

          return (
            <div key={item.href} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />
              )}
              {isLast ? (
                <span
                  className="text-gray-600 font-medium"
                  aria-current="page"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="text-[#00D9FF] hover:text-[#00C4EA] transition-colors flex items-center gap-1"
                >
                  {index === 0 && <Home className="w-4 h-4" />}
                  <span>{item.label}</span>
                </Link>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );
}
