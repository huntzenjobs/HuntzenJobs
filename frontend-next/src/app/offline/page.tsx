"use client";

import Link from "next/link";
import { WifiOff, RefreshCw, Home } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-white px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8 flex justify-center">
          <div className="rounded-full bg-gray-100 p-6">
            <WifiOff className="w-16 h-16 text-gray-400" />
          </div>
        </div>

        <h1 className="text-3xl font-black text-gray-900 mb-4">
          Mode hors ligne
        </h1>

        <p className="text-gray-600 text-lg mb-8">
          Il semblerait que vous soyez déconnecté d'Internet. Certaines
          fonctionnalités peuvent être limitées.
        </p>

        <div className="space-y-4">
          <button
            onClick={() => window.location.reload()}
            className="w-full flex items-center justify-center gap-2 bg-[#00D9FF] text-white font-bold py-3 px-6 rounded-lg hover:bg-[#00B8DD] transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
            Réessayer
          </button>

          <Link
            href="/"
            className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 font-bold py-3 px-6 rounded-lg border-2 border-gray-200 hover:border-[#00D9FF] hover:text-[#00D9FF] transition-colors"
          >
            <Home className="w-5 h-5" />
            Retour à l'accueil
          </Link>
        </div>

        <div className="mt-12 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <h2 className="font-bold text-gray-900 mb-2">
            💡 Fonctionnalités hors ligne
          </h2>
          <ul className="text-sm text-gray-600 text-left space-y-1">
            <li>• Consultation des emplois mis en cache</li>
            <li>• Visualisation de votre CV</li>
            <li>• Accès à vos candidatures récentes</li>
          </ul>
        </div>

        <p className="mt-8 text-sm text-gray-500">
          Vérifiez votre connexion Internet et réessayez
        </p>
      </div>
    </div>
  );
}
