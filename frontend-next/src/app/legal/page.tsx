import { Metadata } from "next";
import Link from "next/link";
import { Scale, ChevronRight } from "lucide-react";
import { LandingHeader } from "@/components/landing-header";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Mentions l\u00e9gales | HuntZen Jobs",
  description:
    "Mentions l\u00e9gales de HuntZen Jobs -- \u00e9diteur, h\u00e9bergeur, propri\u00e9t\u00e9 intellectuelle et conditions d'utilisation.",
  robots: { index: true, follow: true },
};

export default async function LegalPage() {
  const t = await getTranslations("legal");

  const sections = [
    { id: "editeur", label: t("quickLinks.editor") },
    { id: "hebergement", label: t("quickLinks.hosting") },
    { id: "propriete", label: t("quickLinks.intellectualProperty") },
    { id: "responsabilite", label: t("quickLinks.liability") },
    { id: "donnees", label: t("quickLinks.personalData") },
    { id: "cookies", label: t("quickLinks.cookies") },
    { id: "contact", label: t("quickLinks.contact") },
  ];

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      {/* Hero */}
      <div className="pt-20 bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-[#00D9FF]/20 rounded-xl flex items-center justify-center">
              <Scale className="w-6 h-6 text-[#00D9FF]" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-black">
              {t("title")}
            </h1>
          </div>
          <p className="text-xl text-white/80">
            {t("subtitle")}
          </p>
          <p className="mt-3 text-sm text-white/50">
            {t("lastUpdated")}
          </p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap gap-3">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:border-[#00D9FF] hover:text-[#00D9FF] transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-12">
        {/* Editeur */}
        <section id="editeur">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200">
            {t("editor.title")}
          </h2>
          <div className="prose prose-gray max-w-none">
            {/* Static i18n content with trusted <strong> tags from translation files */}
            <p className="text-gray-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: t("editor.intro") }} />
            <div className="mt-4 p-6 bg-gray-50 rounded-xl border border-gray-200 space-y-2 text-gray-700">
              <p><strong>{t("editor.companyName")}</strong> {t("editor.companyNameValue")}</p>
              <p><strong>{t("editor.legalForm")}</strong> {t("editor.legalFormValue")}</p>
              <p><strong>{t("editor.capital")}</strong> {t("editor.capitalValue")}</p>
              <p><strong>{t("editor.address")}</strong> {t("editor.addressValue")}</p>
              <p><strong>{t("editor.nipc")}</strong> {t("editor.nipcValue")}</p>
              <p>
                <strong>{t("editor.email")}</strong>{" "}
                <a href={`mailto:${t("editor.emailValue")}`} className="text-[#00D9FF] hover:underline">
                  {t("editor.emailValue")}
                </a>
              </p>
              <p><strong>{t("editor.director")}</strong> {t("editor.directorValue")}</p>
            </div>
          </div>
        </section>

        {/* Hebergement */}
        <section id="hebergement">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200">
            {t("hosting.title")}
          </h2>
          <div className="prose prose-gray max-w-none space-y-4 text-gray-600">
            <p>{t("hosting.intro")}</p>
            <div className="p-6 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
              <div>
                <p className="font-semibold text-gray-800">{t("hosting.frontendLabel")}</p>
                <p><strong>{t("hosting.frontendProvider")}</strong></p>
                <p>{t("hosting.frontendAddress")}</p>
                <p>
                  <a href={`https://${t("hosting.frontendUrl")}`} target="_blank" rel="noopener noreferrer" className="text-[#00D9FF] hover:underline">
                    {t("hosting.frontendUrl")}
                  </a>
                </p>
              </div>
              <div className="border-t border-gray-200 pt-4">
                <p className="font-semibold text-gray-800">{t("hosting.backendLabel")}</p>
                <p><strong>{t("hosting.backendProvider")}</strong></p>
                <p>{t("hosting.backendAddress")}</p>
                <p>
                  <a href={`https://${t("hosting.backendUrl")}`} target="_blank" rel="noopener noreferrer" className="text-[#00D9FF] hover:underline">
                    {t("hosting.backendUrl")}
                  </a>
                </p>
              </div>
              <div className="border-t border-gray-200 pt-4">
                <p className="font-semibold text-gray-800">{t("hosting.databaseLabel")}</p>
                <p><strong>{t("hosting.databaseProvider")}</strong></p>
                <p>{t("hosting.databaseAddress")}</p>
                <p>
                  <a href={`https://${t("hosting.databaseUrl")}`} target="_blank" rel="noopener noreferrer" className="text-[#00D9FF] hover:underline">
                    {t("hosting.databaseUrl")}
                  </a>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Propriete intellectuelle */}
        <section id="propriete">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200">
            {t("intellectualProperty.title")}
          </h2>
          <div className="prose prose-gray max-w-none space-y-4 text-gray-600">
            <p>{t("intellectualProperty.content1")}</p>
            <p>{t("intellectualProperty.content2")}</p>
          </div>
        </section>

        {/* Limitation de responsabilite */}
        <section id="responsabilite">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200">
            {t("liability.title")}
          </h2>
          <div className="prose prose-gray max-w-none space-y-4 text-gray-600">
            <p>{t("liability.content1")}</p>
            <p>{t("liability.content2")}</p>
          </div>
        </section>

        {/* Donnees personnelles */}
        <section id="donnees">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200">
            {t("personalData.title")}
          </h2>
          <div className="prose prose-gray max-w-none space-y-4 text-gray-600">
            <p>
              {t("personalData.content1")}{" "}
              <Link href="/privacy" className="text-[#00D9FF] hover:underline font-medium">
                {t("personalData.privacyLink")}
              </Link>
              {t("personalData.content2")}
            </p>
            <p>
              {t("personalData.content3")}{" "}
              <a href={`mailto:${t("personalData.privacyEmail")}`} className="text-[#00D9FF] hover:underline">
                {t("personalData.privacyEmail")}
              </a>
              .
            </p>
          </div>
        </section>

        {/* Cookies */}
        <section id="cookies">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200">
            {t("cookiesSection.title")}
          </h2>
          <div className="prose prose-gray max-w-none space-y-4 text-gray-600">
            <p>{t("cookiesSection.content1")}</p>
            <p>{t("cookiesSection.content2")}</p>
          </div>
        </section>

        {/* Contact */}
        <section id="contact">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200">
            {t("contactSection.title")}
          </h2>
          <div className="prose prose-gray max-w-none space-y-4 text-gray-600">
            <p>{t("contactSection.intro")}</p>
            <div className="p-6 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
              <p>
                <strong>{t("contactSection.emailLabel")}</strong>{" "}
                <a href={`mailto:${t("contactSection.emailValue")}`} className="text-[#00D9FF] hover:underline">
                  {t("contactSection.emailValue")}
                </a>
              </p>
              <p>
                <strong>{t("contactSection.formLabel")}</strong>{" "}
                <Link href="/contact" className="text-[#00D9FF] hover:underline">
                  {t("contactSection.formValue")}
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Footer links */}
      <div className="border-t border-gray-200 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
            <Link href="/privacy" className="hover:text-[#00D9FF]">
              {t("footerLinks.privacy")}
            </Link>
            <Link href="/terms" className="hover:text-[#00D9FF]">
              {t("footerLinks.terms")}
            </Link>
            <Link href="/contact" className="hover:text-[#00D9FF]">
              {t("footerLinks.contact")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
