import { Metadata } from "next";
import Link from "next/link";
import { Scale, ChevronRight } from "lucide-react";
import { LandingHeader } from "@/components/landing-header";

export const metadata: Metadata = {
  title: "Mentions légales | HuntZen Jobs",
  description:
    "Mentions légales de HuntZen Jobs — éditeur, hébergeur, propriété intellectuelle et conditions d'utilisation.",
  robots: { index: true, follow: true },
};

const sections = [
  { id: "editeur", label: "Éditeur" },
  { id: "hebergement", label: "Hébergement" },
  { id: "propriete", label: "Propriété intellectuelle" },
  { id: "responsabilite", label: "Limitation de responsabilité" },
  { id: "donnees", label: "Données personnelles" },
  { id: "cookies", label: "Cookies" },
  { id: "contact", label: "Contact" },
];

export default function LegalPage() {
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
            <h1 className="text-4xl sm:text-5xl font-black">Mentions légales</h1>
          </div>
          <p className="text-xl text-white/80">
            Informations légales relatives à l&apos;éditeur et à l&apos;hébergement du site huntzenjobs.com.
          </p>
          <p className="mt-3 text-sm text-white/50">Dernière mise à jour : mars 2026</p>
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

        {/* Éditeur */}
        <section id="editeur">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200">
            1. Éditeur du site
          </h2>
          <div className="prose prose-gray max-w-none">
            <p className="text-gray-600 leading-relaxed">
              Le site <strong>huntzenjobs.com</strong> est édité par :
            </p>
            <div className="mt-4 p-6 bg-gray-50 rounded-xl border border-gray-200 space-y-2 text-gray-700">
              <p><strong>Raison sociale :</strong> HuntZen SAS</p>
              <p><strong>Siège social :</strong> France</p>
              <p><strong>Email :</strong>{" "}
                <a href="mailto:contact@huntzenjobs.com" className="text-[#00D9FF] hover:underline">
                  contact@huntzenjobs.com
                </a>
              </p>
              <p><strong>Directeur de publication :</strong> Wissem Jegham</p>
            </div>
          </div>
        </section>

        {/* Hébergement */}
        <section id="hebergement">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200">
            2. Hébergement
          </h2>
          <div className="prose prose-gray max-w-none space-y-4 text-gray-600">
            <p>Le site est hébergé par les prestataires suivants :</p>
            <div className="p-6 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
              <div>
                <p className="font-semibold text-gray-800">Frontend (interface utilisateur)</p>
                <p><strong>Vercel Inc.</strong></p>
                <p>440 N Barranca Ave #4133, Covina, CA 91723, États-Unis</p>
                <p>
                  <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-[#00D9FF] hover:underline">
                    vercel.com
                  </a>
                </p>
              </div>
              <div className="border-t border-gray-200 pt-4">
                <p className="font-semibold text-gray-800">Backend (API)</p>
                <p><strong>Railway Corp.</strong></p>
                <p>548 Market St PMB 68957, San Francisco, CA 94104, États-Unis</p>
                <p>
                  <a href="https://railway.app" target="_blank" rel="noopener noreferrer" className="text-[#00D9FF] hover:underline">
                    railway.app
                  </a>
                </p>
              </div>
              <div className="border-t border-gray-200 pt-4">
                <p className="font-semibold text-gray-800">Base de données</p>
                <p><strong>Supabase Inc.</strong></p>
                <p>970 Toa Payoh North #07-04, Singapore 318992</p>
                <p>
                  <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-[#00D9FF] hover:underline">
                    supabase.com
                  </a>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Propriété intellectuelle */}
        <section id="propriete">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200">
            3. Propriété intellectuelle
          </h2>
          <div className="prose prose-gray max-w-none space-y-4 text-gray-600">
            <p>
              L&apos;ensemble du contenu du site huntzenjobs.com (textes, images, logos, icônes, code source,
              interface utilisateur) est la propriété exclusive de HuntZen SAS ou de ses partenaires et
              est protégé par les lois françaises et internationales relatives à la propriété intellectuelle.
            </p>
            <p>
              Toute reproduction, représentation, modification, publication ou adaptation de tout ou partie
              des éléments du site, quel que soit le moyen ou le procédé utilisé, est interdite sans
              l&apos;autorisation écrite préalable de HuntZen SAS.
            </p>
          </div>
        </section>

        {/* Limitation de responsabilité */}
        <section id="responsabilite">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200">
            4. Limitation de responsabilité
          </h2>
          <div className="prose prose-gray max-w-none space-y-4 text-gray-600">
            <p>
              HuntZen SAS s&apos;efforce d&apos;assurer l&apos;exactitude et la mise à jour des informations
              diffusées sur le site. HuntZen SAS ne saurait être tenue responsable des erreurs ou omissions
              dans les informations publiées, ni des dommages directs ou indirects pouvant résulter de
              l&apos;utilisation du site.
            </p>
            <p>
              Les offres d&apos;emploi affichées sur HuntZen Jobs sont agrégées depuis des sources tierces.
              HuntZen SAS ne peut garantir l&apos;exactitude, l&apos;exhaustivité ou la disponibilité de
              ces offres et décline toute responsabilité concernant leur contenu.
            </p>
          </div>
        </section>

        {/* Données personnelles */}
        <section id="donnees">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200">
            5. Données personnelles
          </h2>
          <div className="prose prose-gray max-w-none space-y-4 text-gray-600">
            <p>
              La collecte et le traitement des données personnelles sont régis par notre{" "}
              <Link href="/privacy" className="text-[#00D9FF] hover:underline font-medium">
                Politique de confidentialité
              </Link>
              , conformément au Règlement Général sur la Protection des Données (RGPD —
              Règlement UE 2016/679).
            </p>
            <p>
              Pour exercer vos droits (accès, rectification, effacement, portabilité), contactez-nous à{" "}
              <a href="mailto:privacy@huntzenjobs.com" className="text-[#00D9FF] hover:underline">
                privacy@huntzenjobs.com
              </a>.
            </p>
          </div>
        </section>

        {/* Cookies */}
        <section id="cookies">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200">
            6. Cookies
          </h2>
          <div className="prose prose-gray max-w-none space-y-4 text-gray-600">
            <p>
              Le site huntzenjobs.com utilise des cookies techniques nécessaires à son fonctionnement
              (authentification, préférences utilisateur) et des cookies analytiques pour améliorer
              l&apos;expérience utilisateur.
            </p>
            <p>
              Conformément à la réglementation RGPD et aux recommandations de la CNIL, votre consentement
              est recueilli avant le dépôt de tout cookie non essentiel. Vous pouvez modifier vos préférences
              à tout moment depuis le bandeau de consentement.
            </p>
          </div>
        </section>

        {/* Contact */}
        <section id="contact">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200">
            7. Contact
          </h2>
          <div className="prose prose-gray max-w-none space-y-4 text-gray-600">
            <p>Pour toute question relative aux présentes mentions légales :</p>
            <div className="p-6 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
              <p>
                <strong>Email :</strong>{" "}
                <a href="mailto:contact@huntzenjobs.com" className="text-[#00D9FF] hover:underline">
                  contact@huntzenjobs.com
                </a>
              </p>
              <p>
                <strong>Formulaire de contact :</strong>{" "}
                <Link href="/contact" className="text-[#00D9FF] hover:underline">
                  huntzenjobs.com/contact
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
            <Link href="/privacy" className="hover:text-[#00D9FF]">Politique de confidentialité</Link>
            <Link href="/terms" className="hover:text-[#00D9FF]">Conditions d&apos;utilisation</Link>
            <Link href="/contact" className="hover:text-[#00D9FF]">Contact</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
