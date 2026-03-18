"use client";

import { useState } from "react";
import { Save, Zap } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import StripePriceDialog from "./stripe-price-dialog";
import type { Plan } from "@/hooks/admin/use-admin-plans";

// All known feature flags — add new ones here as the app grows
const FEATURE_FLAGS = [
  { key: "advanced_filters", label: "Filtres avancés" },
  { key: "favorites", label: "Favoris" },
  { key: "visual_score", label: "Score visuel ATS" },
  { key: "pdf_export", label: "Export PDF" },
  { key: "cv_history", label: "Historique CV" },
  { key: "interview_sim", label: "Simulateur entretien" },
  { key: "email_alerts", label: "Alertes email" },
  { key: "personalized_advice", label: "Conseils personnalisés" },
  { key: "coach_history", label: "Historique coach" },
  { key: "cover_letter", label: "Lettre de motivation IA" },
  { key: "branding", label: "Branding personnel" },
];

const PLAN_ACCENT: Record<string, string> = {
  free: "border-t-slate-400",
  starter: "border-t-blue-500",
  pro: "border-t-purple-500",
  premium: "border-t-amber-400",
};

interface Props {
  plan: Plan;
  onUpdateLimits: (
    planId: string,
    limits: Record<string, number>,
  ) => Promise<boolean>;
  onUpdateFeatures: (
    planId: string,
    payload: {
      feature_flags?: Record<string, boolean>;
      features?: string[];
      features_excluded?: string[];
    },
  ) => Promise<boolean>;
  onUpdatePrice: (
    planId: string,
    prices: Record<string, number>,
  ) => Promise<boolean>;
  onUpdateStripePrice: (
    planId: string,
    period: "monthly" | "yearly",
    amount: number,
    currency: string,
  ) => Promise<any>;
  onUpdateWording: (
    planId: string,
    wording: { display_name?: string; description?: string },
  ) => Promise<boolean>;
}

export default function PlanCardEditor({
  plan,
  onUpdateLimits,
  onUpdateFeatures,
  onUpdatePrice,
  onUpdateStripePrice,
  onUpdateWording,
}: Props) {
  const [limits, setLimits] = useState({
    cv_analyses: plan.limits?.cv_analyses ?? 0,
    assistant_messages: plan.limits?.assistant_messages ?? 0,
    job_searches: plan.limits?.job_searches ?? 0,
  });
  const [priceMonthly, setPriceMonthly] = useState(String(plan.price_monthly));
  const [priceYearly, setPriceYearly] = useState(
    String(plan.price_yearly ?? ""),
  );
  // Initialise les toggles depuis plan.feature_flags (accès réel) en retirant le préfixe "has_"
  // Ex: { has_pdf_export: true } → ["pdf_export"]
  const [features, setFeatures] = useState<string[]>(() =>
    FEATURE_FLAGS.map(({ key }) => key).filter(
      (key) => (plan.feature_flags || {})[`has_${key}`] === true,
    ),
  );
  const [displayName, setDisplayName] = useState(plan.display_name || "");
  const [description, setDescription] = useState(plan.description || "");
  const [stripePriceOpen, setStripePriceOpen] = useState<
    "monthly" | "yearly" | null
  >(null);
  const [saving, setSaving] = useState<string | null>(null);

  const toggleFeature = (key: string) => {
    setFeatures((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key],
    );
  };

  const handleSaveLimits = async () => {
    setSaving("limits");
    await onUpdateLimits(plan.id, limits);
    setSaving(null);
  };

  const [featuresText, setFeaturesText] = useState(
    (plan.features ?? []).join("\n"),
  );
  const [featuresExcludedText, setFeaturesExcludedText] = useState(
    (plan.features_excluded ?? []).join("\n"),
  );

  const handleSaveFeatures = async () => {
    setSaving("features");
    const featureFlags: Record<string, boolean> = {};
    for (const { key } of FEATURE_FLAGS) {
      featureFlags[`has_${key}`] = features.includes(key);
    }
    await onUpdateFeatures(plan.id, { feature_flags: featureFlags });
    setSaving(null);
  };

  const handleSaveFeaturesText = async () => {
    setSaving("featuresText");
    await onUpdateFeatures(plan.id, {
      features: featuresText.split("\n").filter(Boolean),
      features_excluded: featuresExcludedText.split("\n").filter(Boolean),
    });
    setSaving(null);
  };

  const handleSaveWording = async () => {
    setSaving("wording");
    await onUpdateWording(plan.id, { display_name: displayName, description });
    setSaving(null);
  };

  const handleSavePrice = async () => {
    setSaving("price");
    const prices: Record<string, number> = {
      price_monthly: parseFloat(priceMonthly),
    };
    if (priceYearly) prices.price_yearly = parseFloat(priceYearly);
    await onUpdatePrice(plan.id, prices);
    setSaving(null);
  };

  const activeMonthlyStripePrice = plan.stripe_prices?.find(
    (p) => p.billing_period === "monthly" && p.is_active,
  );
  const activeYearlyStripePrice = plan.stripe_prices?.find(
    (p) => p.billing_period === "yearly" && p.is_active,
  );

  const formatLimit = (val: number) =>
    val === -1 ? "∞ illimité" : String(val);

  return (
    <>
      <Card
        className={`border-t-4 ${PLAN_ACCENT[plan.name] || "border-t-gray-300"}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{plan.display_name}</CardTitle>
            <Badge variant={plan.is_active ? "default" : "outline"}>
              {plan.is_active ? "Actif" : "Inactif"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{plan.description}</p>
        </CardHeader>

        <CardContent>
          <div
            className={`grid grid-cols-1 gap-6 lg:gap-0 lg:divide-x lg:divide-border ${plan.name !== "free" ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
          >
            {/* — Section 1: Limites numériques — */}
            <div className="space-y-3 lg:pr-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Limites / jour
                </span>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">Analyses CV</Label>
                  <Input
                    type="number"
                    min="-1"
                    value={limits.cv_analyses}
                    onChange={(e) =>
                      setLimits((l) => ({
                        ...l,
                        cv_analyses: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="h-8 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {formatLimit(limits.cv_analyses)}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Messages assistant</Label>
                  <Input
                    type="number"
                    min="-1"
                    value={limits.assistant_messages}
                    onChange={(e) =>
                      setLimits((l) => ({
                        ...l,
                        assistant_messages: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="h-8 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {formatLimit(limits.assistant_messages)}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Recherches emploi</Label>
                  <Input
                    type="number"
                    min="-1"
                    value={limits.job_searches}
                    onChange={(e) =>
                      setLimits((l) => ({
                        ...l,
                        job_searches: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="h-8 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {formatLimit(limits.job_searches)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">-1 = illimité</p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveLimits}
                disabled={saving === "limits"}
                className="w-full"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving === "limits" ? "Sauvegarde..." : "Sauvegarder"}
              </Button>
            </div>

            {/* — Section 2: Feature flags — */}
            <div className="space-y-2 lg:px-6">
              <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Feature Flags
              </span>
              <div className="space-y-1.5 mt-2">
                {FEATURE_FLAGS.map(({ key, label }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-0.5"
                  >
                    <Label
                      className="text-xs font-normal cursor-pointer"
                      htmlFor={`${plan.id}-${key}`}
                    >
                      {label}
                    </Label>
                    <Switch
                      id={`${plan.id}-${key}`}
                      checked={features.includes(key)}
                      onCheckedChange={() => toggleFeature(key)}
                    />
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveFeatures}
                disabled={saving === "features"}
                className="w-full mt-3"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving === "features" ? "Sauvegarde..." : "Sauvegarder"}
              </Button>
            </div>

            {/* — Section 3: Prix affichés — */}
            <div className="space-y-3 lg:px-6">
              <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Prix affiché
              </span>
              <div className="space-y-2 mt-2">
                <div className="space-y-1">
                  <Label className="text-xs">Mensuel (€)</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-muted-foreground text-xs">
                      €
                    </span>
                    <Input
                      className="h-8 text-sm pl-6"
                      type="number"
                      min="0"
                      step="0.01"
                      value={priceMonthly}
                      onChange={(e) => setPriceMonthly(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Annuel (€)</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-muted-foreground text-xs">
                      €
                    </span>
                    <Input
                      className="h-8 text-sm pl-6"
                      type="number"
                      min="0"
                      step="0.01"
                      value={priceYearly}
                      onChange={(e) => setPriceYearly(e.target.value)}
                      placeholder="—"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Ne modifie pas Stripe.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSavePrice}
                disabled={saving === "price"}
                className="w-full"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving === "price" ? "Sauvegarde..." : "Sauvegarder"}
              </Button>
            </div>

            {/* — Section 4: Wording — */}
            <div className="space-y-3 lg:px-6">
              <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Wording
              </span>
              <div className="space-y-2 mt-2">
                <div className="space-y-1">
                  <Label className="text-xs">Nom affiché</Label>
                  <Input
                    className="h-8 text-sm"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ex: Starter"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description courte</Label>
                  <Input
                    className="h-8 text-sm"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex: Le plus choisi"
                  />
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveWording}
                disabled={saving === "wording"}
                className="w-full"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving === "wording" ? "Sauvegarde..." : "Sauvegarder"}
              </Button>
            </div>

            {/* — Section 5: Features texte — */}
            <div className="space-y-3 lg:px-6">
              <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Features texte
              </span>
              <div className="space-y-2 mt-2">
                <div className="space-y-1">
                  <Label className="text-xs">✓ Incluses (une par ligne)</Label>
                  <Textarea
                    className="text-xs min-h-[80px] font-mono"
                    value={featuresText}
                    onChange={(e) => setFeaturesText(e.target.value)}
                    placeholder="Recherches illimitées&#10;Filtres avancés"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">✗ Exclues (une par ligne)</Label>
                  <Textarea
                    className="text-xs min-h-[60px] font-mono"
                    value={featuresExcludedText}
                    onChange={(e) => setFeaturesExcludedText(e.target.value)}
                    placeholder="Export PDF&#10;Simulation entretien"
                  />
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving === "featuresText"}
                    className="w-full"
                  >
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    {saving === "featuresText"
                      ? "Sauvegarde..."
                      : "Sauvegarder les features"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmer la sauvegarde</AlertDialogTitle>
                    <AlertDialogDescription>
                      Les features texte du plan {plan.display_name} seront
                      remplacées. Cette action écrasera les listes existantes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSaveFeaturesText}>
                      Confirmer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* — Section 6: Stripe Price IDs (plans payants uniquement) — */}
            {plan.name !== "free" && (
              <div className="space-y-3 lg:pl-6">
                <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Stripe Prices
                </span>
                <div className="space-y-2 mt-2">
                  {(["monthly", "yearly"] as const).map((period) => {
                    const sp =
                      period === "monthly"
                        ? activeMonthlyStripePrice
                        : activeYearlyStripePrice;
                    return (
                      <div key={period} className="space-y-1">
                        <p className="text-xs font-medium">
                          {period === "monthly" ? "Mensuel" : "Annuel"}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {sp?.stripe_price_id || "Non configuré"}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs"
                          onClick={() => setStripePriceOpen(period)}
                        >
                          <Zap className="h-3 w-3 mr-1" />
                          Changer
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1.5 rounded leading-relaxed">
                  Crée un nouveau price et archive l'ancien. Abonnements
                  existants non affectés.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {stripePriceOpen && (
        <StripePriceDialog
          open={!!stripePriceOpen}
          onClose={() => setStripePriceOpen(null)}
          plan={plan}
          billingPeriod={stripePriceOpen}
          currentPrice={
            stripePriceOpen === "monthly"
              ? activeMonthlyStripePrice
              : activeYearlyStripePrice
          }
          onConfirm={async (amount, currency) => {
            await onUpdateStripePrice(
              plan.id,
              stripePriceOpen,
              amount,
              currency,
            );
          }}
        />
      )}
    </>
  );
}
