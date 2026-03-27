import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="text-center px-4">
        <h1 className="text-8xl font-black text-[#00D9FF] mb-4">
          {t("title")}
        </h1>
        <p className="text-xl text-white/80 mb-8 max-w-md mx-auto">
          {t("description")}
        </p>
        <Link
          href="/"
          className="inline-flex items-center px-6 py-3 bg-[#00D9FF] hover:bg-[#00C4EA] text-white font-semibold rounded-xl transition-colors"
        >
          {t("backHome")}
        </Link>
      </div>
    </div>
  );
}
