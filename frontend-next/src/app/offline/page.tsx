"use client";

import Link from "next/link";
import { WifiOff, RefreshCw, Home } from "lucide-react";
import { useTranslations } from "next-intl";

export default function OfflinePage() {
  const t = useTranslations("offline");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-white px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8 flex justify-center">
          <div className="rounded-full bg-gray-100 p-6">
            <WifiOff className="w-16 h-16 text-gray-400" />
          </div>
        </div>

        <h1 className="text-3xl font-black text-gray-900 mb-4">
          {t("title")}
        </h1>

        <p className="text-gray-600 text-lg mb-8">
          {t("description")}
        </p>

        <div className="space-y-4">
          <button
            onClick={() => window.location.reload()}
            className="w-full flex items-center justify-center gap-2 bg-[#00D9FF] text-white font-bold py-3 px-6 rounded-lg hover:bg-[#00B8DD] transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
            {t("retry")}
          </button>

          <Link
            href="/"
            className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 font-bold py-3 px-6 rounded-lg border-2 border-gray-200 hover:border-[#00D9FF] hover:text-[#00D9FF] transition-colors"
          >
            <Home className="w-5 h-5" />
            {t("backHome")}
          </Link>
        </div>

        <div className="mt-12 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <h2 className="font-bold text-gray-900 mb-2">
            {t("featuresTitle")}
          </h2>
          <ul className="text-sm text-gray-600 text-left space-y-1">
            <li>• {t("feature1")}</li>
            <li>• {t("feature2")}</li>
            <li>• {t("feature3")}</li>
          </ul>
        </div>

        <p className="mt-8 text-sm text-gray-500">
          {t("note")}
        </p>
      </div>
    </div>
  );
}
