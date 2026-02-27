"use client";

import { useState, useEffect } from "react";
import {
  Calendar,
  MapPin,
  Users,
  Building2,
  Clock,
  ExternalLink,
  Filter,
  X,
  Loader2,
  Sparkles,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { huntzenApi, type JobFair } from "@/lib/api/huntzen-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import DOMPurify from "dompurify";
import { FeaturedEventsCarousel } from "@/components/salons/featured-events-carousel";
import { ErrorBoundary } from "@/components/error-boundary";
import { useTranslations } from "next-intl";

// Fonction pour nettoyer le HTML et extraire le texte brut
function stripHtml(html: string): string {
  if (typeof window === "undefined") return html; // SSR fallback

  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [], // Ne garder aucune balise = texte brut
  });

  // Remplacer les entités HTML - Safe: content is already sanitized by DOMPurify above
  // This is only used for decoding HTML entities, not for rendering user content
  const txt = document.createElement("textarea");
  txt.innerHTML = clean; // Safe: sanitized content
  return txt.value.trim();
}

export default function SalonsPage() {
  const t = useTranslations("dashboard.salons");
  const [events, setEvents] = useState<JobFair[]>([]);
  const [visibleEventsCount, setVisibleEventsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedSector, setSelectedSector] = useState("");
  const [selectedPublic, setSelectedPublic] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("");

  // Filter options
  const [regions, setRegions] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);

  const [showFilters, setShowFilters] = useState(true); // Open by default for better UX

  // Load filter options
  useEffect(() => {
    async function loadFilterOptions() {
      try {
        const [regionsData, sectorsData, typesData] = await Promise.all([
          huntzenApi.getJobFairRegions(),
          huntzenApi.getJobFairSectors(),
          huntzenApi.getJobFairEventTypes(),
        ]);
        setRegions(regionsData);
        setSectors(sectorsData);
        setEventTypes(typesData);
      } catch (err) {
        console.error("Error loading filter options:", err);
      }
    }
    loadFilterOptions();
  }, []);

  // Search events
  async function searchEvents() {
    setLoading(true);
    setError(null);

    try {
      const result = await huntzenApi.searchJobFairs({
        region: selectedRegion,
        sector: selectedSector,
        public: selectedPublic,
        event_type: selectedType,
        format_type: selectedFormat,
      });

      setEvents(result.events);
      setVisibleEventsCount(0); // Reset counter for progressive reveal
    } catch (err: any) {
      setError(err.message || t("errorText"));
    } finally {
      setLoading(false);
    }
  }

  // Initial load
  useEffect(() => {
    searchEvents();
  }, []);

  // Progressive reveal of events for better UX
  useEffect(() => {
    if (events.length === 0) {
      setVisibleEventsCount(0);
      return;
    }

    // Show events progressively (5 at a time, every 150ms)
    const BATCH_SIZE = 5;
    const REVEAL_INTERVAL = 150;

    if (visibleEventsCount < events.length) {
      const timer = setTimeout(() => {
        setVisibleEventsCount((prev) =>
          Math.min(prev + BATCH_SIZE, events.length),
        );
      }, REVEAL_INTERVAL);

      return () => clearTimeout(timer);
    }
  }, [events.length, visibleEventsCount]);

  // Clear filters
  function clearFilters() {
    setSelectedRegion("");
    setSelectedSector("");
    setSelectedPublic("");
    setSelectedType("");
    setSelectedFormat("");
  }

  // Check if any filter is active
  const hasActiveFilters =
    selectedRegion ||
    selectedSector ||
    selectedPublic ||
    selectedType ||
    selectedFormat;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Hero Header - HuntZen Style */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-start justify-between gap-4 bg-gradient-to-br from-white to-gray-50 p-8 rounded-2xl border border-slate-200 shadow-sm mb-8"
      >
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-3">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] flex items-center justify-center shadow-lg shadow-[#00D9FF]/30"
            >
              <Calendar className="w-7 h-7 text-white" />
            </motion.div>
            <h1 className="text-4xl font-black text-black">{t("title")}</h1>
          </div>
          <p className="text-base text-slate-700 leading-relaxed max-w-3xl">
            {t("subtitle")}
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Button
            variant="outline"
            size="lg"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 border-2 transition-all",
              showFilters
                ? "border-[#00D9FF] bg-[#00D9FF]/10 text-black hover:bg-[#00D9FF]/20"
                : "border-slate-300 hover:border-[#00D9FF]",
            )}
          >
            <Filter className="size-4" />
            {showFilters ? t("hideFilters") : t("showFilters")}
          </Button>
        </motion.div>
      </motion.div>

      {/* Stats bar */}
      {!loading && !error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex items-center gap-4 text-sm text-slate-600 mb-6"
        >
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-[#00D9FF]" />
            <span className="font-medium">
              {t("eventsCount", { count: events.length })}
            </span>
          </div>
          {hasActiveFilters && (
            <div className="flex items-center gap-2 text-amber-600">
              <TrendingUp className="size-4" />
              <span>{t("filteredResults")}</span>
            </div>
          )}
        </motion.div>
      )}

      {/* Filters - Wrapped with ErrorBoundary */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="mb-8"
          >
            <ErrorBoundary
              fallback={
                <Card className="p-6 bg-red-50 border-red-200">
                  <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
                  <p className="text-red-700 text-center">{t("errorText")}</p>
                </Card>
              }
            >
              <Card className="border-2 border-slate-200 shadow-sm bg-white">
                <CardHeader className="bg-gradient-to-br from-white to-gray-50 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] flex items-center justify-center shadow-lg shadow-[#00D9FF]/30">
                        <Filter className="size-4 text-white" />
                      </div>
                      <CardTitle className="text-lg font-bold text-black">
                        {t("filterTitle")}
                      </CardTitle>
                    </div>
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="text-xs text-[#00D9FF] hover:text-black hover:bg-gray-100 hover:text-slate-900"
                      >
                        <X className="size-3 mr-1" />
                        {t("resetFilters")}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {/* Region */}
                    <div className="space-y-2">
                      <Label htmlFor="region">Région</Label>
                      <Select
                        value={selectedRegion || "all"}
                        onValueChange={(val) =>
                          setSelectedRegion(val === "all" ? "" : val)
                        }
                      >
                        <SelectTrigger id="region">
                          <SelectValue placeholder="Toutes les régions" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            Toutes les régions
                          </SelectItem>
                          {regions.map((region) => (
                            <SelectItem key={region} value={region}>
                              {region}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Sector */}
                    <div className="space-y-2">
                      <Label htmlFor="sector">Secteur</Label>
                      <Select
                        value={selectedSector || "all"}
                        onValueChange={(val) =>
                          setSelectedSector(val === "all" ? "" : val)
                        }
                      >
                        <SelectTrigger id="sector">
                          <SelectValue placeholder="Tous les secteurs" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tous les secteurs</SelectItem>
                          {sectors.map((sector) => (
                            <SelectItem key={sector} value={sector}>
                              {sector.charAt(0).toUpperCase() + sector.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Public */}
                    <div className="space-y-2">
                      <Label htmlFor="public">Public</Label>
                      <Select
                        value={selectedPublic || "all"}
                        onValueChange={(val) =>
                          setSelectedPublic(val === "all" ? "" : val)
                        }
                      >
                        <SelectTrigger id="public">
                          <SelectValue placeholder="Tous publics" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tous publics</SelectItem>
                          <SelectItem value="etudiants">Étudiants</SelectItem>
                          <SelectItem value="pros">Professionnels</SelectItem>
                          <SelectItem value="seniors">Seniors</SelectItem>
                          <SelectItem value="reconversion">
                            Reconversion
                          </SelectItem>
                          <SelectItem value="tous">Tous</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Event Type */}
                    <div className="space-y-2">
                      <Label htmlFor="type">Type</Label>
                      <Select
                        value={selectedType || "all"}
                        onValueChange={(val) =>
                          setSelectedType(val === "all" ? "" : val)
                        }
                      >
                        <SelectTrigger id="type">
                          <SelectValue placeholder="Tous types" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tous types</SelectItem>
                          {eventTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type === "job_dating"
                                ? "Job Dating"
                                : type.charAt(0).toUpperCase() + type.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Format */}
                    <div className="space-y-2">
                      <Label htmlFor="format">Format</Label>
                      <Select
                        value={selectedFormat || "all"}
                        onValueChange={(val) =>
                          setSelectedFormat(val === "all" ? "" : val)
                        }
                      >
                        <SelectTrigger id="format">
                          <SelectValue placeholder="Tous formats" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tous formats</SelectItem>
                          <SelectItem value="physique">Physique</SelectItem>
                          <SelectItem value="virtuel">Virtuel</SelectItem>
                          <SelectItem value="hybride">Hybride</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center gap-3">
                    <Button
                      onClick={searchEvents}
                      disabled={loading}
                      size="lg"
                      className="bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] hover:shadow-lg hover:shadow-[#00D9FF]/40 text-white font-semibold transition-all duration-300"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          {t("loadingText")}
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 size-4" />
                          {t("searchButton")}
                        </>
                      )}
                    </Button>
                    {hasActiveFilters && (
                      <p className="text-sm text-slate-500">
                        {
                          Object.values({
                            selectedRegion,
                            selectedSector,
                            selectedPublic,
                            selectedType,
                            selectedFormat,
                          }).filter(Boolean).length
                        }{" "}
                        {t("activeFilters")}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </ErrorBoundary>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Featured Events - NOUVEAU */}
      {!loading && !error && events.length > 0 && (
        <FeaturedEventsCarousel events={events} />
      )}

      {/* Error state */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700"
        >
          <p className="text-sm font-medium">{error}</p>
        </motion.div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="animate-pulse border-2 border-slate-200">
                <CardHeader className="bg-gradient-to-br from-white to-gray-50">
                  <div className="h-6 bg-gray-200 rounded-lg w-3/4 mb-2" />
                  <div className="h-4 bg-slate-100 rounded-lg w-1/2" />
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="h-4 bg-gray-200 rounded-lg" />
                  <div className="h-4 bg-gray-200 rounded-lg w-5/6" />
                  <div className="h-4 bg-gray-200 rounded-lg w-4/6" />
                  <div className="h-10 bg-slate-100 rounded-lg w-full mt-4" />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Events grid - Wrapped with ErrorBoundary */}
      {!loading && !error && (
        <ErrorBoundary
          fallback={
            <Card className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                {t("errorText")}
              </h3>
              <p className="text-slate-600">{t("noResultsSub")}</p>
            </Card>
          }
        >
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="col-span-full"
              >
                <Card className="border-2 border-dashed border-slate-300 bg-gradient-to-br from-gray-50 to-white">
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200 }}
                      className="w-16 h-16 rounded-full bg-gradient-to-br from-[#00D9FF]/20 to-[#00C4EA]/20 flex items-center justify-center mb-4"
                    >
                      <Calendar className="size-8 text-[#00D9FF]" />
                    </motion.div>
                    <h3 className="text-xl font-bold text-black mb-2">
                      {t("emptyStateTitle")}
                    </h3>
                    <p className="text-slate-600 text-center max-w-md">
                      {t("noResults")}
                      <br />
                      {t("noResultsSub")}
                    </p>
                    {hasActiveFilters && (
                      <Button
                        variant="outline"
                        onClick={clearFilters}
                        className="mt-6 border-[#00D9FF] text-[#00D9FF] hover:bg-[#00D9FF]/10"
                      >
                        <X className="size-4 mr-2" />
                        {t("clearFilters")}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <>
                {events.slice(0, visibleEventsCount).map((event, index) => (
                  <EventCard
                    key={`${event.url}-${index}`}
                    event={event}
                    index={index}
                  />
                ))}

                {/* Loading indicator for progressive reveal */}
                {visibleEventsCount < events.length && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="col-span-full flex items-center justify-center py-8"
                  >
                    <div className="flex items-center gap-3 text-slate-600">
                      <Loader2 className="w-5 h-5 animate-spin text-[#00D9FF]" />
                      <span className="text-sm font-medium">
                        {t("loadingEvents", {
                          current: visibleEventsCount,
                          total: events.length,
                        })}
                      </span>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </div>
        </ErrorBoundary>
      )}
    </div>
  );
}

// Event Card Component
function EventCard({ event, index }: { event: JobFair; index: number }) {
  const t = useTranslations("dashboard.salons");
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const getFormatBadgeColor = (format: string) => {
    switch (format.toLowerCase()) {
      case "physique":
        return "bg-[#00D9FF] text-white";
      case "virtuel":
        return "bg-[#00D9FF] text-white";
      case "hybride":
        return "bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const getEventTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "salon":
        return "bg-[#00D9FF]/10 text-[#00D9FF] border-[#00D9FF]/30";
      case "forum":
        return "bg-[#00D9FF]/10 text-[#00D9FF] border-[#00D9FF]/30";
      case "job_dating":
        return "bg-pink-100 text-pink-700 border-pink-200";
      case "webinar":
        return "bg-cyan-100 text-cyan-700 border-cyan-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="h-full"
    >
      <Card className="h-full flex flex-col hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border-2 border-slate-200 hover:border-[#00D9FF]/50 bg-white overflow-hidden">
        {/* Header - hauteur fixe */}
        <div className="bg-gradient-to-br from-white to-gray-50 border-b border-slate-200 p-4 h-[88px] flex items-center">
          <div className="flex items-start justify-between gap-3 w-full">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold line-clamp-1 text-black mb-1.5 leading-tight">
                {event.title}
              </h3>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] flex items-center justify-center shrink-0 shadow-sm shadow-[#00D9FF]/30">
                  <Building2 className="size-3 text-white" />
                </div>
                <span className="font-medium text-slate-700 text-xs truncate">
                  {event.organizer}
                </span>
              </div>
            </div>
            <Badge
              className={cn(
                "border-0 shadow-sm font-semibold shrink-0 text-[10px] px-2 py-0.5",
                getFormatBadgeColor(event.format),
              )}
            >
              {event.format}
            </Badge>
          </div>
        </div>

        {/* Content - structure fixe sans padding-top du CardContent */}
        <div className="flex-1 flex flex-col p-4 pt-3 space-y-2.5">
          {/* Date */}
          <div className="flex items-center gap-2 p-2 rounded-lg bg-gradient-to-r from-[#00D9FF]/10 to-[#00C4EA]/10 border border-[#00D9FF]/30 h-14">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] flex items-center justify-center shrink-0 shadow-sm shadow-[#00D9FF]/30">
              <Calendar className="size-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-[#00D9FF] font-medium uppercase tracking-wide leading-none mb-0.5">
                Date
              </p>
              <p className="text-xs font-semibold text-black line-clamp-1 leading-tight">
                {formatDate(event.date_start)}
                {event.date_end && event.date_end !== event.date_start && (
                  <span className="text-slate-500 text-[10px]">
                    {" "}
                    → {formatDate(event.date_end)}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Location */}
          <div className="flex items-center gap-2 p-2 rounded-lg bg-gradient-to-r from-red-50 to-pink-50 border border-red-100 h-14">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center shrink-0">
              <MapPin className="size-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-red-600 font-medium uppercase tracking-wide leading-none mb-0.5">
                Lieu
              </p>
              <p className="text-xs font-semibold text-black line-clamp-1 leading-tight">
                {event.city}, {event.region}
              </p>
            </div>
          </div>

          {/* Time */}
          <div className="flex items-center gap-2 p-2 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 h-14">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shrink-0">
              <Clock className="size-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-green-600 font-medium uppercase tracking-wide leading-none mb-0.5">
                Horaires
              </p>
              <p className="text-xs font-semibold text-black line-clamp-1 leading-tight">
                {event.time_start ? (
                  <>
                    {event.time_start}
                    {event.time_end && ` - ${event.time_end}`}
                  </>
                ) : (
                  <span className="text-slate-400 text-[10px]">
                    {t("notCommunicated")}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Tags - hauteur fixe */}
          <div className="flex flex-wrap gap-1.5 h-[52px] overflow-hidden">
            <Badge
              className={cn(
                "text-[10px] border font-semibold h-5 px-2",
                getEventTypeColor(event.event_type),
              )}
            >
              {event.event_type === "job_dating"
                ? "Job Dating"
                : event.event_type.charAt(0).toUpperCase() +
                  event.event_type.slice(1)}
            </Badge>
            {event.sector !== "tous" && (
              <Badge
                variant="outline"
                className="text-[10px] capitalize font-medium border-slate-300 h-5 px-2"
              >
                {event.sector}
              </Badge>
            )}
            {event.is_free && (
              <Badge className="text-[10px] bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 shadow-sm font-semibold h-5 px-2">
                {t("freeLabel")}
              </Badge>
            )}
            {event.companies_count && (
              <Badge
                variant="outline"
                className="text-[10px] font-medium border-amber-300 bg-amber-50 text-amber-700 h-5 px-2"
              >
                {event.companies_count} entreprises
              </Badge>
            )}
          </div>

          {/* Description - hauteur fixe */}
          {event.description ? (
            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed border-t border-slate-100 pt-2 h-[52px]">
              {stripHtml(event.description)}
            </p>
          ) : (
            <div className="h-[52px]" />
          )}

          {/* Button - toujours en bas avec mt-auto */}
          <div className="mt-auto pt-2">
            <Button
              asChild
              size="sm"
              className="w-full bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] hover:shadow-lg hover:shadow-[#00D9FF]/40 text-white font-semibold text-xs h-9 transition-all duration-300"
            >
              <a href={event.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3 mr-1.5" />
                {t("viewDetails")}
              </a>
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
