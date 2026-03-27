"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  CheckCircle,
  Sparkles,
  BarChart3,
  Globe,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface JobsPlaceholderProps {
  onSearchClick?: (jobTitle: string) => void;
}

export function JobsPlaceholder({ onSearchClick }: JobsPlaceholderProps) {
  const t = useTranslations("jobs.placeholder");
  const popularSearches = [
    "Développeur Full Stack",
    "Product Manager",
    "Data Scientist",
    "DevOps Engineer",
    "UX Designer",
    "Business Developer",
    "Growth Hacker",
    "Backend Developer",
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-8 md:space-y-12 py-6 md:py-8"
    >
      {/* Recherches populaires */}
      <div>
        <h3 className="text-lg md:text-2xl font-bold text-gray-900 mb-4 md:mb-6 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-huntzen-blue" />
          {t("popularSearches")}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {popularSearches.map((job) => (
            <Button
              key={job}
              variant="outline"
              className="h-auto py-3 px-4 text-left justify-start border-2 border-gray-200 text-gray-900 hover:border-huntzen-blue hover:text-huntzen-blue hover:bg-blue-50 transition-all"
              onClick={() => onSearchClick?.(job)}
            >
              <span className="font-medium text-sm">{job}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <Card className="text-center p-4 md:p-8 border-2 border-huntzen-blue/30 hover:border-huntzen-blue transition-all hover:shadow-xl">
          <BarChart3 className="w-8 h-8 md:w-12 md:h-12 text-huntzen-blue mx-auto mb-3 md:mb-4" />
          <div className="text-3xl md:text-5xl font-black text-huntzen-blue mb-2">
            10K+
          </div>
          <p className="text-gray-600 font-medium">{t("jobsAggregated")}</p>
          <Badge className="mt-3 bg-blue-50 text-huntzen-blue border-0">
            {t("updatedBadge")}
          </Badge>
        </Card>

        <Card className="text-center p-4 md:p-8 border-2 border-huntzen-turquoise/30 hover:border-huntzen-turquoise transition-all hover:shadow-xl">
          <Globe className="w-8 h-8 md:w-12 md:h-12 text-huntzen-turquoise mx-auto mb-3 md:mb-4" />
          <div className="text-3xl md:text-5xl font-black text-huntzen-turquoise mb-2">
            15+
          </div>
          <p className="text-gray-600 font-medium">{t("partnerSources")}</p>
          <Badge className="mt-3 bg-cyan-50 text-huntzen-turquoise border-0">
            {t("partnerBadge")}
          </Badge>
        </Card>

        <Card className="text-center p-4 md:p-8 border-2 border-blue-500/30 hover:border-blue-500 transition-all hover:shadow-xl">
          <Zap className="w-8 h-8 md:w-12 md:h-12 text-blue-500 mx-auto mb-3 md:mb-4" />
          <div className="text-3xl md:text-5xl font-black text-blue-500 mb-2">
            24h
          </div>
          <p className="text-gray-600 font-medium">{t("maxUpdateDelay")}</p>
          <Badge className="mt-3 bg-blue-50 text-blue-500 border-0">
            {t("dailyOffersBadge")}
          </Badge>
        </Card>
      </div>

      {/* Tips visuels */}
      <Card className="p-4 md:p-8 bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-50 border-2 border-huntzen-blue/30">
        <h3 className="font-bold text-base md:text-xl mb-4 md:mb-6 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-huntzen-blue" />
          {t("searchTips")}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-huntzen-blue flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-gray-900 mb-1">
                {t("tipSpecificTitle")}
              </div>
              <p className="text-sm text-gray-600">{t("tipSpecificDesc")}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-huntzen-blue flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-gray-900 mb-1">
                {t("tipAreaTitle")}
              </div>
              <p className="text-sm text-gray-600">{t("tipAreaDesc")}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-huntzen-blue flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-gray-900 mb-1">
                {t("tipFiltersTitle")}
              </div>
              <p className="text-sm text-gray-600">{t("tipFiltersDesc")}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-huntzen-blue flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-gray-900 mb-1">
                {t("tipRegularTitle")}
              </div>
              <p className="text-sm text-gray-600">{t("tipRegularDesc")}</p>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
