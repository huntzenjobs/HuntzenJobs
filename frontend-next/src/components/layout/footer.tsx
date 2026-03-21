"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Linkedin, Twitter, Instagram } from "lucide-react";

const PRODUCT_LINKS = [
  { href: "/cv-analysis", key: "cvAnalysis" },
  { href: "/jobs", key: "jobSearch" },
  { href: "/assistant", key: "coach" },
  { href: "/pricing", key: "pricing" },
] as const;

const RESOURCE_LINKS = [
  { href: "/faq", key: "faq" },
  { href: "https://press.huntzen.space/", key: "blog", external: true },
  { href: "/temoignages", key: "testimonials" },
  { href: "/about", key: "about" },
] as const;

const LEGAL_LINKS = [
  { href: "/privacy", key: "privacy" },
  { href: "/terms", key: "terms" },
  { href: "/contact", key: "contact" },
  { href: "/legal", key: "legalNotice" },
] as const;

export function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="bg-black text-white pt-12 pb-6">
      <div className="container mx-auto px-4 sm:px-6">
        {/* 4 colonnes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl">HuntZen</span>
              <span className="w-2 h-2 rounded-full bg-[#00D9FF] animate-pulse" />
            </div>
            <p className="text-white/60 text-sm">{t("tagline")}</p>
            <div className="flex items-center gap-3">
              <a
                href="https://linkedin.com/company/huntzenjobs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/70 hover:text-white transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-4 h-4" />
              </a>
              <a
                href="https://twitter.com/huntzenjobs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/70 hover:text-white transition-colors"
                aria-label="Twitter / X"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a
                href="https://instagram.com/huntzenjobs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/70 hover:text-white transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Produit */}
          <div>
            <h3 className="font-semibold text-sm mb-4">
              {t("sections.product")}
            </h3>
            <ul className="space-y-2">
              {PRODUCT_LINKS.map(({ href, key }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-white/60 text-sm hover:text-white transition-colors"
                  >
                    {t(`links.${key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Ressources */}
          <div>
            <h3 className="font-semibold text-sm mb-4">
              {t("sections.resources")}
            </h3>
            <ul className="space-y-2">
              {RESOURCE_LINKS.map(({ href, key, ...rest }) => (
                <li key={href}>
                  {"external" in rest ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/60 text-sm hover:text-white transition-colors"
                    >
                      {t(`links.${key}`)}
                    </a>
                  ) : (
                    <Link
                      href={href}
                      className="text-white/60 text-sm hover:text-white transition-colors"
                    >
                      {t(`links.${key}`)}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Légal */}
          <div>
            <h3 className="font-semibold text-sm mb-4">
              {t("sections.legal")}
            </h3>
            <ul className="space-y-2">
              {LEGAL_LINKS.map(({ href, key }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-white/60 text-sm hover:text-white transition-colors"
                  >
                    {t(`links.${key}` as Parameters<typeof t>[0])}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bas de footer */}
        <hr className="border-white/10 mb-6" />
        <p className="text-white/40 text-xs text-center">
          &copy; {new Date().getFullYear()} HuntZen. {t("copyright")}
        </p>
      </div>
    </footer>
  );
}
