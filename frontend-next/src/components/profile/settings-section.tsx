"use client";

import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Bell, Mail, Globe, Loader2, LogOut, Trash2 } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useRouter } from "next/navigation";
import { useOptionalAuth } from "@/contexts/auth-context";
import { useTranslations } from "next-intl";

interface SettingsSectionProps {
  userId: string;
  initialSettings?: {
    preferred_language?: string;
    email_notifications?: boolean;
    newsletter_subscribed?: boolean;
  };
}

export function SettingsSection({
  userId,
  initialSettings = {},
}: SettingsSectionProps) {
  const router = useRouter();
  const auth = useOptionalAuth();
  const t = useTranslations("profile");

  // State for settings
  const [language, setLanguage] = useState(
    initialSettings.preferred_language || "fr",
  );
  const [emailNotifications, setEmailNotifications] = useState(
    initialSettings.email_notifications ?? true,
  );
  const [newsletter, setNewsletter] = useState(
    initialSettings.newsletter_subscribed ?? false,
  );

  // Loading states
  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);
  const [isUpdatingNewsletter, setIsUpdatingNewsletter] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Debounced values for auto-save
  const debouncedEmailNotifications = useDebounce(emailNotifications, 500);
  const debouncedNewsletter = useDebounce(newsletter, 500);

  // Update settings in database
  const updateSettings = useCallback(
    async (field: string, value: boolean) => {
      const supabase = createClient();

      try {
        const { error } = await supabase
          .from("profiles")
          .update({
            [field]: value,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (error) {
          console.error("Settings update error:", error);
          toast.error("Erreur lors de la mise à jour des paramètres");
          return false;
        }

        return true;
      } catch (err) {
        console.error("Unexpected error:", err);
        toast.error("Une erreur inattendue est survenue");
        return false;
      }
    },
    [userId],
  );

  // Logout handler
  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);

      // Use Auth context signOut which handles logging
      if (auth?.signOut) {
        await auth.signOut();
      } else {
        // Fallback
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
      }

      toast.success("Déconnexion réussie");
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Erreur lors de la déconnexion");
      setIsLoggingOut(false);
    }
  };

  // Auto-save email notifications
  useEffect(() => {
    // Skip initial render
    if (
      debouncedEmailNotifications ===
      (initialSettings.email_notifications ?? true)
    ) {
      return;
    }

    const save = async () => {
      setIsUpdatingNotifications(true);
      const success = await updateSettings(
        "email_notifications",
        debouncedEmailNotifications,
      );
      setIsUpdatingNotifications(false);

      if (success) {
        // Silent success (no toast for auto-save)
      }
    };

    save();
  }, [
    debouncedEmailNotifications,
    initialSettings.email_notifications,
    updateSettings,
  ]);

  // Auto-save newsletter
  useEffect(() => {
    // Skip initial render
    if (
      debouncedNewsletter === (initialSettings.newsletter_subscribed ?? false)
    ) {
      return;
    }

    const save = async () => {
      setIsUpdatingNewsletter(true);
      const success = await updateSettings(
        "newsletter_subscribed",
        debouncedNewsletter,
      );
      setIsUpdatingNewsletter(false);

      if (success) {
        // Silent success (no toast for auto-save)
      }
    };

    save();
  }, [
    debouncedNewsletter,
    initialSettings.newsletter_subscribed,
    updateSettings,
  ]);

  return (
    <div className="space-y-8">
      {/* Language Preference */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-gray-600" aria-hidden="true" />
          <div>
            <Label htmlFor="language" className="text-base font-semibold">
              Langue de l'interface
            </Label>
            <p className="text-sm text-gray-500 mt-1">
              Choisissez votre langue préférée pour l'application
            </p>
          </div>
        </div>

        <Select value={language} onValueChange={setLanguage} disabled>
          <SelectTrigger id="language" className="max-w-xs">
            <SelectValue placeholder="Sélectionner une langue" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fr">Français</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>

        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
          💡 {t("multilingualComingSoon")}
        </p>
      </div>

      {/* Email Notifications */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2 flex-1">
            <Bell className="w-5 h-5 text-gray-600 mt-1" aria-hidden="true" />
            <div className="space-y-1">
              <Label
                htmlFor="email-notifications"
                className="text-base font-semibold cursor-pointer"
              >
                Notifications par email
              </Label>
              <p
                id="email-notifications-description"
                className="text-sm text-gray-500"
              >
                Recevez des notifications pour les événements importants
                (nouvelles offres correspondantes, analyses CV terminées,
                messages importants)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="email-notifications"
              checked={emailNotifications}
              onCheckedChange={setEmailNotifications}
              disabled={isUpdatingNotifications}
              aria-label="Activer les notifications par email"
              aria-describedby="email-notifications-description"
            />
            {isUpdatingNotifications && (
              <Loader2
                className="w-4 h-4 text-gray-400 animate-spin"
                aria-hidden="true"
              />
            )}
          </div>
        </div>

        {emailNotifications && (
          <div className="ml-7 pl-4 border-l-2 border-huntzen-blue/20 space-y-2 text-sm text-gray-600">
            <p className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-huntzen-blue rounded-full" />
              Nouvelles offres d'emploi correspondant à votre profil
            </p>
            <p className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-huntzen-blue rounded-full" />
              Analyses CV terminées et prêtes à consulter
            </p>
            <p className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-huntzen-blue rounded-full" />
              Conseils personnalisés du Coach IA
            </p>
          </div>
        )}
      </div>

      {/* Newsletter */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2 flex-1">
            <Mail className="w-5 h-5 text-gray-600 mt-1" aria-hidden="true" />
            <div className="space-y-1">
              <Label
                htmlFor="newsletter"
                className="text-base font-semibold cursor-pointer"
              >
                Newsletter HuntZen
              </Label>
              <p id="newsletter-description" className="text-sm text-gray-500">
                Recevez nos conseils exclusifs, astuces de recherche d'emploi,
                et les dernières fonctionnalités (1 email par semaine maximum)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="newsletter"
              checked={newsletter}
              onCheckedChange={setNewsletter}
              disabled={isUpdatingNewsletter}
              aria-label="S'abonner à la newsletter HuntZen"
              aria-describedby="newsletter-description"
            />
            {isUpdatingNewsletter && (
              <Loader2
                className="w-4 h-4 text-gray-400 animate-spin"
                aria-hidden="true"
              />
            )}
          </div>
        </div>

        {newsletter && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
            <p className="font-medium text-blue-900 mb-2">
              {t("thankSubscription")}
            </p>
            <p className="text-blue-700">
              Vous recevrez notre prochaine newsletter avec des conseils
              exclusifs pour maximiser vos chances de décrocher le job de vos
              rêves.
            </p>
          </div>
        )}
      </div>

      {/* Privacy Notice */}
      <div className="pt-6 border-t">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600 space-y-2">
          <p className="font-medium text-gray-900">
            🔒 Confidentialité et données
          </p>
          <p>
            Vos préférences sont enregistrées de manière sécurisée. Vous pouvez
            modifier ces paramètres à tout moment. Nous ne partageons jamais vos
            informations avec des tiers sans votre consentement.
          </p>
          <p className="text-xs text-gray-500">
            Pour en savoir plus, consultez notre{" "}
            <a href="/privacy" className="text-huntzen-blue hover:underline">
              Politique de confidentialité
            </a>
          </p>
        </div>
      </div>

      {/* Account Actions */}
      <div className="pt-6 border-t space-y-6">
        <div>
          <h3 className="text-base font-semibold mb-4">Gestion du compte</h3>

          {/* Logout Button */}
          <div className="space-y-3">
            <Button
              onClick={handleLogout}
              disabled={isLoggingOut}
              variant="outline"
              className="w-full sm:w-auto border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
            >
              {isLoggingOut ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Déconnexion en cours...
                </>
              ) : (
                <>
                  <LogOut className="w-4 h-4 mr-2" />
                  Se déconnecter
                </>
              )}
            </Button>
            <p className="text-sm text-gray-500">
              Vous serez déconnecté de votre session actuelle
            </p>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="pt-4 border-t border-red-200">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-4">
            <div>
              <h4 className="font-semibold text-red-900 mb-2">
                ⚠️ Zone de danger
              </h4>
              <p className="text-sm text-red-700">
                Les actions ci-dessous sont irréversibles. Procédez avec
                précaution.
              </p>
            </div>

            <Button
              variant="outline"
              disabled
              className="w-full sm:w-auto border-red-300 text-red-700 hover:bg-red-100"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer mon compte
            </Button>
            <p className="text-xs text-red-600">
              💡 {t("deleteAccountComingSoon")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
