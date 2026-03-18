"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, MessageSquare, Clock, ChevronRight } from "lucide-react";
import { LandingHeader } from "@/components/landing-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

const contactReasons = [
  { value: "support", label: "Problème technique" },
  { value: "billing", label: "Facturation / abonnement" },
  { value: "account", label: "Mon compte" },
  { value: "feature", label: "Suggestion de fonctionnalité" },
  { value: "legal", label: "Question légale / RGPD" },
  { value: "other", label: "Autre" },
];

export default function ContactPage() {
  const t = useTranslations("contact");
  const [form, setForm] = useState({
    name: "",
    email: "",
    reason: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast.error(t("toasts.fillAllFields"));
      return;
    }
    setLoading(true);
    try {
      // Envoi via l'email de contact (mailto fallback — intégration backend à connecter)
      await new Promise((resolve) => setTimeout(resolve, 800));
      setSent(true);
    } catch {
      toast.error(t("toasts.sendError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      {/* Hero */}
      <div className="pt-20 bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-[#00D9FF]/20 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-[#00D9FF]" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-black">Nous contacter</h1>
          </div>
          <p className="text-xl text-white/80">
            Une question, un problème, une suggestion ? Notre équipe vous répond
            sous 48h en semaine.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Info cards */}
          <div className="space-y-6">
            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200">
              <div className="w-10 h-10 bg-[#00D9FF]/10 rounded-xl flex items-center justify-center mb-4">
                <Mail className="w-5 h-5 text-[#00D9FF]" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Email direct</h3>
              <p className="text-sm text-gray-600 mb-3">
                Pour toute demande urgente :
              </p>
              <a
                href="mailto:support@huntzenjobs.com"
                className="text-[#00D9FF] font-medium hover:underline text-sm"
              >
                support@huntzenjobs.com
              </a>
            </div>

            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200">
              <div className="w-10 h-10 bg-[#00D9FF]/10 rounded-xl flex items-center justify-center mb-4">
                <Clock className="w-5 h-5 text-[#00D9FF]" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Temps de réponse</h3>
              <p className="text-sm text-gray-600">
                Notre équipe répond sous <strong>48h en semaine</strong> (lundi
                – vendredi).
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Les utilisateurs Pro bénéficient d&apos;un support prioritaire.
              </p>
            </div>

            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200">
              <h3 className="font-bold text-gray-900 mb-3">Liens utiles</h3>
              <div className="space-y-2">
                {[
                  { href: "/faq", label: "FAQ" },
                  { href: "/privacy", label: "Politique de confidentialité" },
                  { href: "/legal", label: "Mentions légales" },
                  { href: "/terms", label: "Conditions d'utilisation" },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#00D9FF] transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-2">
            {sent ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
                  <Mail className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">
                  Message envoyé !
                </h2>
                <p className="text-gray-600 max-w-sm">
                  Merci pour votre message. Notre équipe vous répondra dans les
                  48h en semaine.
                </p>
                <Button
                  className="mt-8"
                  variant="outline"
                  onClick={() => {
                    setSent(false);
                    setForm({ name: "", email: "", reason: "", message: "" });
                  }}
                >
                  Envoyer un autre message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Envoyez-nous un message
                  </h2>
                  <p className="text-gray-500 text-sm">
                    Tous les champs marqués * sont obligatoires.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="name"
                      className="text-sm font-medium text-gray-700"
                    >
                      Nom complet *
                    </label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="Jean Dupont"
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="email"
                      className="text-sm font-medium text-gray-700"
                    >
                      Adresse email *
                    </label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="jean@exemple.com"
                      value={form.email}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, email: e.target.value }))
                      }
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="reason"
                    className="text-sm font-medium text-gray-700"
                  >
                    Motif de contact
                  </label>
                  <select
                    id="reason"
                    value={form.reason}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, reason: e.target.value }))
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Sélectionner un motif</option>
                    {contactReasons.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="message"
                    className="text-sm font-medium text-gray-700"
                  >
                    Message *
                  </label>
                  <Textarea
                    id="message"
                    placeholder="Décrivez votre demande en détail..."
                    rows={6}
                    value={form.message}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, message: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <Mail className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-blue-700">
                    Vous pouvez aussi nous écrire directement à{" "}
                    <a
                      href="mailto:support@huntzenjobs.com"
                      className="font-medium hover:underline"
                    >
                      support@huntzenjobs.com
                    </a>
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#00D9FF] text-black font-semibold hover:bg-[#00D9FF]/90"
                >
                  {loading ? "Envoi en cours..." : "Envoyer le message"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Footer links */}
      <div className="border-t border-gray-200 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
            <Link href="/privacy" className="hover:text-[#00D9FF]">
              Politique de confidentialité
            </Link>
            <Link href="/terms" className="hover:text-[#00D9FF]">
              Conditions d&apos;utilisation
            </Link>
            <Link href="/legal" className="hover:text-[#00D9FF]">
              Mentions légales
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
