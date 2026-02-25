/**
 * GradientJobCard - Premium job preview card
 * Replaces blur effect with elegant gradient overlay for better performance
 * and superior UX
 */

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Lock,
  Sparkles,
  MapPin,
  Building,
  TrendingUp,
  Star,
} from "lucide-react";
import { useSubscription } from "@/contexts/subscription-context";
import { cn } from "@/lib/utils";
import { formatJobSource } from "@/lib/utils/job-source-formatter";

// ============================================================================
// TYPES
// ============================================================================

interface GradientJobCardProps {
  /** Card index for variation */
  index: number;
  /** Additional class names */
  className?: string;
}

// ============================================================================
// SAMPLE DATA
// ============================================================================

const SAMPLE_JOBS = [
  {
    title: "Développeur Full Stack Senior",
    company: "TechCorp Innovation",
    location: "Paris, France",
    salary: "55K - 75K EUR",
    description:
      "Nous recherchons un développeur passionné pour rejoindre notre équipe produit. Vous travaillerez sur des projets innovants en React, Node.js et TypeScript.",
    source: "LinkedIn",
    isHot: true,
  },
  {
    title: "Product Manager H/F",
    company: "Scale-up FinTech",
    location: "Lyon, France",
    salary: "60K - 80K EUR",
    description:
      "Pilotez la stratégie produit d'une fintech en forte croissance. Vous définirez la roadmap et travaillerez avec des équipes tech de pointe.",
    source: "Welcome to the Jungle",
    isHot: false,
  },
  {
    title: "Data Scientist Machine Learning",
    company: "AI Research Lab",
    location: "Toulouse, France",
    salary: "50K - 70K EUR",
    description:
      "Rejoignez notre laboratoire de recherche en IA. Vous développerez des modèles de ML pour résoudre des problèmes complexes en NLP et computer vision.",
    source: "Indeed",
    isHot: true,
  },
  {
    title: "DevOps Engineer Cloud",
    company: "Enterprise Solutions",
    location: "Bordeaux, France",
    salary: "48K - 68K EUR",
    description:
      "Gérez notre infrastructure cloud multi-régions. Expertise requise en Kubernetes, Terraform, et CI/CD pipelines avec GitLab.",
    source: "Monster",
    isHot: false,
  },
  {
    title: "UX/UI Designer Senior",
    company: "Agence Digitale Créative",
    location: "Nantes, France",
    salary: "45K - 62K EUR",
    description:
      "Concevez des expériences utilisateur exceptionnelles pour nos clients grands comptes. Maîtrise de Figma, design systems, et recherche utilisateur.",
    source: "Dribbble Jobs",
    isHot: true,
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

export const GradientJobCard = React.forwardRef<
  HTMLDivElement,
  GradientJobCardProps
>(({ index, className }, ref) => {
  const t = useTranslations("gradientJobCard");
  const { openPricingModal } = useSubscription();
  const [isHovered, setIsHovered] = React.useState(false);

  // Get sample job data
  const job = SAMPLE_JOBS[index % SAMPLE_JOBS.length];

  const handleClick = () => {
    openPricingModal("jobs_visible");
  };

  return (
    <Card
      ref={ref}
      className={cn(
        "relative overflow-hidden cursor-pointer group",
        "border-2 border-dashed border-violet-200",
        "bg-white",
        "transition-all duration-300",
        "hover:border-violet-300 hover:shadow-lg",
        className,
      )}
      style={{
        animationDelay: `${index * 80}ms`,
      }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Preview content - reduced opacity */}
      <div className="relative z-10 select-none pointer-events-none">
        <CardHeader className="pb-3 bg-gray-50">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0 opacity-30">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-lg font-bold line-clamp-2 text-gray-900">
                  {job.title}
                </h3>
                {job.isHot && (
                  <Star className="size-4 text-amber-500 fill-amber-500 shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shrink-0">
                  <Building className="h-4 w-4 text-white" />
                </div>
                <span className="font-medium">{job.company}</span>
              </div>
            </div>

            {/* Source badge */}
            <div className="opacity-25">
              <div className="px-2 py-1 rounded bg-gray-100 text-xs">
                {formatJobSource(job.source)}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="opacity-25">
          <div className="space-y-3">
            {/* Location */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span className="font-medium">{job.location}</span>
            </div>

            {/* Salary */}
            {job.salary && (
              <div className="flex items-center gap-2 bg-green-50 px-3 py-2 rounded-lg">
                <span className="text-sm font-bold text-green-600">
                  💰 {job.salary}
                </span>
              </div>
            )}

            {/* Description preview */}
            <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
              {job.description}
            </p>
          </div>
        </CardContent>
      </div>

      {/* Gradient overlay - creates depth */}
      <div
        className={cn(
          "absolute inset-0 z-20",
          "bg-gradient-to-t from-white via-white/95 to-white/80",
          "pointer-events-none",
        )}
        aria-hidden="true"
      />

      {/* Premium overlay with CTA */}
      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 pointer-events-none">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 mb-3 shadow-lg">
          <Lock className="w-6 h-6 text-white" />
        </div>

        {/* Text content */}
        <div className="text-center space-y-1 mb-4">
          <h4 className="font-semibold text-gray-800">{t("lockedOffer")}</h4>
          <p className="text-sm text-gray-600">{t("upgradeToPremium")}</p>
        </div>

        {/* CTA Button - clickable */}
        <div className="pointer-events-auto">
          <Button
            size="sm"
            className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-md"
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
          >
            <Sparkles className="w-4 h-4 mr-1" />
            {t("unlock")}
          </Button>
        </div>
      </div>
    </Card>
  );
});

GradientJobCard.displayName = "GradientJobCard";

// ============================================================================
// JOBS LIMIT REACHED COMPONENT
// ============================================================================

interface JobsLimitReachedProps {
  totalJobs: number;
  visibleJobs: number;
  className?: string;
}

export const JobsLimitReached = React.forwardRef<
  HTMLDivElement,
  JobsLimitReachedProps
>(({ totalJobs, visibleJobs, className }, ref) => {
  const t = useTranslations("gradientJobCard");
  const { openPricingModal } = useSubscription();
  const hiddenJobs = totalJobs - visibleJobs;

  return (
    <div
      ref={ref}
      className={cn(
        "col-span-full p-8 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 border-2 border-dashed border-violet-200 text-center",
        className,
      )}
    >
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 mb-4 shadow-lg">
        <Lock className="w-8 h-8 text-white" />
      </div>
      <h3 className="text-xl font-bold mb-2">
        {t("moreOffers", { count: hiddenJobs })}
      </h3>
      <p className="text-muted-foreground mb-4 max-w-md mx-auto">
        Vous avez atteint la limite de {visibleJobs} offres visibles. Passez
        Premium pour accéder à toutes les offres et ne manquer aucune
        opportunité.
      </p>
      <Button
        size="lg"
        onClick={() => openPricingModal("jobs_visible")}
        className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg"
      >
        <Sparkles className="w-5 h-5 mr-2" />
        Voir toutes les offres
      </Button>
    </div>
  );
});

JobsLimitReached.displayName = "JobsLimitReached";
