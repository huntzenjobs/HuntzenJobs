"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Send,
  ExternalLink,
  Trash2,
  CheckCircle2,
  Clock,
  Eye,
  XCircle,
  Trophy,
  Building,
  MapPin,
  Calendar,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useOptionalAuth } from "@/contexts/auth-context";
import { useAuthenticatedFetch } from "@/hooks/use-authenticated-fetch";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { PageGate } from "@/components/auth/page-gate";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "";

interface Application {
  id: string;
  external_job_id: string;
  job_title: string;
  company: string;
  location?: string;
  salary?: string;
  job_url: string;
  job_source: string;
  status: "applied" | "viewed" | "interview" | "rejected" | "offer";
  confirmed_by_user: boolean;
  applied_at: string;
  notes?: string;
}

const STATUS_CONFIG = {
  applied: {
    icon: Send,
    color: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  viewed: {
    icon: Eye,
    color: "bg-yellow-50 text-yellow-700 border-yellow-200",
    dot: "bg-yellow-500",
  },
  interview: {
    icon: CheckCircle2,
    color: "bg-green-50 text-green-700 border-green-200",
    dot: "bg-green-500",
  },
  rejected: {
    icon: XCircle,
    color: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-400",
  },
  offer: {
    icon: Trophy,
    color: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
};

export default function CandidaturesPage() {
  const t = useTranslations("candidatures");
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const { authenticatedFetch } = useAuthenticatedFetch();

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays === 0) return t("date.today");
    if (diffDays === 1) return t("date.yesterday");
    if (diffDays < 7) return t("date.daysAgo", { count: diffDays });
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  };

  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    supabase
      .from("user_applications")
      .select("*")
      .eq("user_id", user.id)
      .order("applied_at", { ascending: false })
      .then(({ data }) => {
        setApplications((data as Application[]) || []);
        setLoading(false);
      });
  }, [user]);

  const filtered = useMemo(() => {
    if (filterStatus === "all") return applications;
    return applications.filter((a) => a.status === filterStatus);
  }, [applications, filterStatus]);

  const stats = useMemo(
    () => ({
      total: applications.length,
      interview: applications.filter((a) => a.status === "interview").length,
      offer: applications.filter((a) => a.status === "offer").length,
      pending: applications.filter((a) =>
        ["applied", "viewed"].includes(a.status),
      ).length,
    }),
    [applications],
  );

  const updateStatus = async (id: string, status: string) => {
    try {
      await authenticatedFetch(`${BACKEND_URL}/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setApplications((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status: status as Application["status"] } : a,
        ),
      );
    } catch {}
  };

  const deleteApplication = async (id: string) => {
    try {
      await authenticatedFetch(`${BACKEND_URL}/api/applications/${id}`, {
        method: "DELETE",
      });
      setApplications((prev) => prev.filter((a) => a.id !== id));
    } catch {}
  };

  if (!user) {
    return (
      <PageGate featureFlag="page_candidatures">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
          <Send className="w-12 h-12 text-slate-300" />
          <h2 className="text-xl font-bold text-slate-700">
            {t("loginRequired")}
          </h2>
        </div>
      </PageGate>
    );
  }

  return (
    <PageGate featureFlag="page_candidatures">
      <div className="space-y-6 p-4 md:p-8 max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <Send className="w-6 h-6 text-[#00D9FF]" />
              {t("title")}
            </h1>
            <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
          </div>

          {/* Stats */}
          <div className="flex gap-3 flex-wrap">
            {[
              {
                label: t("stats.total"),
                value: stats.total,
                color: "text-slate-700",
              },
              {
                label: t("stats.pending"),
                value: stats.pending,
                color: "text-blue-600",
              },
              {
                label: t("stats.interviews"),
                value: stats.interview,
                color: "text-green-600",
              },
              {
                label: t("stats.offers"),
                value: stats.offer,
                color: "text-amber-600",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-center shadow-sm"
              >
                <p className={cn("text-2xl font-black", s.color)}>{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44 h-9 text-sm bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("status.all")}</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([key]) => (
                <SelectItem key={key} value={key}>
                  {t(`status.${key}` as Parameters<typeof t>[0])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 bg-slate-100 animate-pulse rounded-xl"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <Send className="w-12 h-12 text-slate-200" />
            <p className="text-slate-500 font-medium">
              {applications.length === 0
                ? t("empty.noneYet")
                : t("empty.filtered")}
            </p>
            {applications.length === 0 && (
              <Link
                href="/jobs"
                className="px-5 py-2.5 bg-[#00D9FF] text-white font-semibold rounded-xl text-sm hover:bg-[#00C4EA] transition-colors"
              >
                {t("empty.searchCta")}
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((app, i) => {
              const cfg = STATUS_CONFIG[app.status];
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={app.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-all flex flex-col md:flex-row md:items-center gap-4"
                >
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-base leading-tight">
                        {app.job_title}
                      </h3>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs font-semibold border rounded-full px-2 py-0.5",
                          cfg.color,
                        )}
                      >
                        <Icon className="w-3 h-3" />
                        {t(`status.${app.status}` as Parameters<typeof t>[0])}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Building className="w-3.5 h-3.5" />
                        {app.company}
                      </span>
                      {app.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {app.location}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(app.applied_at)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={app.status}
                      onValueChange={(v) => updateStatus(app.id, v)}
                    >
                      <SelectTrigger className="h-8 w-36 text-xs bg-slate-50 border-slate-200">
                        <div
                          className={cn("w-2 h-2 rounded-full mr-1.5", cfg.dot)}
                        />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CONFIG).map(([key]) => (
                          <SelectItem key={key} value={key} className="text-xs">
                            {t(`status.${key}` as Parameters<typeof t>[0])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <a
                      href={app.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-slate-400 hover:text-[#00D9FF] transition-colors"
                      title={t("actions.viewOffer")}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          className="p-2 text-slate-300 hover:text-red-400 transition-colors"
                          title={t("actions.delete")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t("confirmDelete.title")}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("confirmDelete.description")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t("confirmDelete.cancel")}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteApplication(app.id)}
                            className="bg-red-500 hover:bg-red-600"
                          >
                            {t("confirmDelete.confirm")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </PageGate>
  );
}
