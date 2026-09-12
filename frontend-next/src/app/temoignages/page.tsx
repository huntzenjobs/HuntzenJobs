import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/landing-header";
import { Footer } from "@/components/layout/footer";
import { getLocalizedMetadata } from "@/lib/seo/metadata";

const testimonialsPageMetadata: Metadata = {
  title: "Retours d'expérience | HuntZen Jobs",
  description:
    "Les retours d'expérience HuntZen Jobs seront publiés après vérification.",
};

export async function generateMetadata(): Promise<Metadata> {
  return getLocalizedMetadata(testimonialsPageMetadata, "testimonials");
}

export default async function TestimonialsPage() {
  const t = await getTranslations("testimonials");

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <LandingHeader />
      <section className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 px-4 pb-20 pt-32 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="mb-6 text-5xl font-black md:text-6xl">{t("title")}</h1>
          <p className="text-xl leading-relaxed text-gray-300">
            {t("subtitle")}
          </p>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-lg dark:border-gray-700 dark:bg-gray-800 sm:p-12">
          <p className="text-lg leading-relaxed text-gray-700 dark:text-gray-200">
            {t("body")}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-xl bg-[#00D9FF] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#00C4EA] focus:outline-none focus:ring-2 focus:ring-[#00D9FF] focus:ring-offset-2"
            >
              {t("ctaSignup")}
            </Link>
            <Link
              href="/about"
              className="rounded-xl border-2 border-[#00D9FF] px-6 py-3 font-semibold text-[#008DA8] transition-colors hover:bg-[#00D9FF]/10 focus:outline-none focus:ring-2 focus:ring-[#00D9FF] focus:ring-offset-2 dark:text-[#00D9FF]"
            >
              {t("ctaAbout")}
            </Link>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
