"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Globe,
  MapPin,
  Briefcase,
  FileText,
  Send,
  Loader2,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import expatDataFr from "@/data/expat-data.json";
import expatDataEn from "@/data/expat-data.en.json";
import expatDataEs from "@/data/expat-data.es.json";
import expatDataPt from "@/data/expat-data.pt.json";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations, useLocale } from "next-intl";
import { PageGate } from "@/components/auth/page-gate";
import { useAuth } from "@/contexts/auth-context";
import { huntzenApi } from "@/lib/api/huntzen-client";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Country = (typeof expatDataFr.countries)[0];

const expatDataByLocale: Record<string, typeof expatDataFr> = {
  fr: expatDataFr,
  en: expatDataEn,
  es: expatDataEs,
  pt: expatDataPt,
};

const numberLocaleMap: Record<string, string> = {
  fr: "fr-FR",
  en: "en-US",
  es: "es-ES",
  pt: "pt-PT",
};

interface ExpatSource {
  url: string;
  scraped_at: string;
  country: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ExpatSource[];
  freshness_warnings?: string[];
  timestamp: Date;
}

export default function ExpatPage() {
  const t = useTranslations("expat");
  const tc = useTranslations("expat.chat");
  const locale = useLocale();
  const { session } = useAuth();

  // --- données statiques ---
  const [selectedCode, setSelectedCode] = useState("CA");
  const [checkedDocs, setCheckedDocs] = useState<Record<string, boolean>>({});

  const expatData = useMemo(
    () => expatDataByLocale[locale] ?? expatDataFr,
    [locale],
  );
  const numberLocale = numberLocaleMap[locale] ?? "fr-FR";
  const country = expatData.countries.find((c) => c.code === selectedCode)!;

  const formatSalary = (amount: number, currency: string, eurRate: number) => {
    const eur = Math.round(amount * eurRate);
    if (currency === "EUR")
      return `${amount.toLocaleString(numberLocale)} ${t("salaryPerYear")}`;
    return t("salaryApprox", {
      amount: amount.toLocaleString(numberLocale),
      currency,
      eurAmount: eur.toLocaleString(numberLocale),
    });
  };

  useEffect(() => {
    const saved = localStorage.getItem(`expat_checklist_${selectedCode}`);
    if (saved) {
      try {
        setCheckedDocs(JSON.parse(saved));
      } catch {}
    } else {
      setCheckedDocs({});
    }
  }, [selectedCode]);

  const toggleDoc = (id: string) => {
    const updated = { ...checkedDocs, [id]: !checkedDocs[id] };
    setCheckedDocs(updated);
    localStorage.setItem(
      `expat_checklist_${selectedCode}`,
      JSON.stringify(updated),
    );
  };

  // --- chat IA ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const suggestions = [
    tc("suggestion1"),
    tc("suggestion2"),
    tc("suggestion3"),
    tc("suggestion4"),
  ];

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setError(null);
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const token = session?.access_token;
        // Préfixer le message avec le pays sélectionné pour que l'agent backend
        // dispose du contexte pays dès la première sous-requête, indépendamment
        // de ce que l'IntentParser est capable d'extraire de la question seule.
        const messageWithContext = country
          ? `[Pays de destination : ${country.name}] ${trimmed}`
          : trimmed;
        const result = await huntzenApi.askExpat({
          message: messageWithContext,
          language: locale,
          history,
          token,
        });

        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: result.response,
          sources: result.sources ?? [],
          freshness_warnings: result.freshness_warnings ?? [],
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        setError(err instanceof Error ? err.message : tc("errorMessage"));
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, session, locale, tc],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const formatScrapedDate = (raw: string) => {
    try {
      return new Date(raw).toLocaleDateString(numberLocale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return raw;
    }
  };

  return (
    <PageGate featureFlag="page_expat">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* En-tête */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-100">
            <Globe className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>

        {/* Sélecteur pays */}
        <div>
          <label className="text-sm font-medium mb-2 block">
            {t("destination")}
          </label>
          <Select value={selectedCode} onValueChange={setSelectedCode}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {expatData.countries.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Coût de la vie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" /> {t("costOfLiving.title")} —{" "}
              {country.flag} {country.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
              <div className="bg-muted rounded-lg p-2 md:p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  {t("costOfLiving.rent")}
                </p>
                <p className="text-lg font-bold">
                  {country.costOfLiving.rent1br.toLocaleString(numberLocale)}{" "}
                  {country.currency}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("costOfLiving.perMonth")}
                </p>
              </div>
              <div className="bg-muted rounded-lg p-2 md:p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  {t("costOfLiving.transport")}
                </p>
                <p className="text-lg font-bold">
                  {country.costOfLiving.transport} {country.currency}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("costOfLiving.perMonth")}
                </p>
              </div>
              <div className="bg-muted rounded-lg p-2 md:p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  {t("costOfLiving.food")}
                </p>
                <p className="text-lg font-bold">
                  {country.costOfLiving.food} {country.currency}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("costOfLiving.perMonth")}
                </p>
              </div>
              <div className="bg-blue-50 rounded-lg p-2 md:p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  {t("costOfLiving.index")}
                </p>
                <p className="text-lg font-bold text-blue-700">
                  {country.costOfLiving.globalIndex}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("costOfLiving.baseCountry")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Salaires */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="w-4 h-4" /> {t("salaries.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium">
                      {t("salaries.domain")}
                    </th>
                    <th className="text-right py-2 font-medium">
                      {t("salaries.salary")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(country.salaries).map(([domain, amount]) => (
                    <tr key={domain} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 text-muted-foreground">
                        {t(`domains.${domain}` as Parameters<typeof t>[0]) ||
                          domain}
                      </td>
                      <td className="py-2.5 text-right font-mono text-xs">
                        {formatSalary(
                          amount as number,
                          country.currency,
                          country.eurRate,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {t("salaries.disclaimer")}
            </p>
          </CardContent>
        </Card>

        {/* Démarches administratives */}
        {country.adminDocs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" /> {t("admin.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {country.adminDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <label className="flex items-center gap-3 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={!!checkedDocs[doc.id]}
                        onChange={() => toggleDoc(doc.id)}
                        className="w-4 h-4 rounded"
                      />
                      <span
                        className={cn(
                          "text-sm",
                          checkedDocs[doc.id] &&
                            "line-through text-muted-foreground",
                        )}
                      >
                        {doc.label}
                      </span>
                    </label>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline shrink-0"
                    >
                      {t("admin.officialSite")}
                    </a>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {t("admin.savedProgress")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* ────────── Interface conversationnelle ────────── */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              {tc("title")}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tc("subtitle")}
            </p>
          </CardHeader>

          <CardContent className="pt-4 flex flex-col gap-4">
            {/* Zone messages */}
            <div className="min-h-[260px] max-h-[420px] overflow-y-auto flex flex-col gap-4 pr-1">
              {messages.length === 0 && !loading && (
                /* État vide — accueil + suggestions */
                <div className="flex flex-col items-center justify-center h-full gap-4 py-6">
                  <div className="p-3 rounded-full bg-blue-50">
                    <Globe className="w-7 h-7 text-blue-500" />
                  </div>
                  <p className="text-sm text-center text-muted-foreground max-w-sm">
                    {tc("welcome")}
                  </p>
                  <div className="flex flex-col gap-2 w-full max-w-md">
                    <p className="text-xs font-medium text-muted-foreground text-center">
                      {tc("suggestions")}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(s)}
                          className="text-left text-xs px-3 py-2 rounded-lg border border-blue-100 bg-blue-50/50 hover:bg-blue-100 text-blue-700 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Contexte pays sélectionné */}
                  <p className="text-xs text-muted-foreground italic">
                    {tc("contextCountry", { country: country.name })}
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex flex-col gap-1",
                    msg.role === "user" ? "items-end" : "items-start",
                  )}
                >
                  {/* Bulle */}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-br-sm"
                        : "bg-muted rounded-bl-sm",
                    )}
                  >
                    {msg.role === "user" ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>

                  {/* Avertissements fraîcheur */}
                  {msg.role === "assistant" &&
                    msg.freshness_warnings &&
                    msg.freshness_warnings.length > 0 && (
                      <div className="max-w-[85%] flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-medium">
                            {tc("freshnessWarning")} :{" "}
                          </span>
                          {msg.freshness_warnings.join(" ")}
                        </div>
                      </div>
                    )}

                  {/* Sources */}
                  {msg.role === "assistant" &&
                    msg.sources &&
                    msg.sources.length > 0 && (
                      <div className="max-w-[85%] text-xs text-muted-foreground space-y-1">
                        <p className="font-medium">{tc("sources")}</p>
                        <ul className="space-y-1">
                          {msg.sources.map((src, idx) => (
                            <li key={idx} className="flex items-center gap-1">
                              <a
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline truncate max-w-[260px]"
                              >
                                {src.url}
                              </a>
                              <ExternalLink className="w-3 h-3 shrink-0 text-blue-400" />
                              {src.scraped_at && (
                                <span className="text-muted-foreground shrink-0">
                                  —{" "}
                                  {tc("scrapedAt", {
                                    date: formatScrapedDate(src.scraped_at),
                                  })}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              ))}

              {/* État loading */}
              {loading && (
                <div className="flex items-start gap-2">
                  <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {tc("thinking")}
                  </div>
                </div>
              )}

              {/* État erreur */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium">{tc("errorTitle")} : </span>
                    {error}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Zone de saisie */}
            <div className="flex gap-2 items-end border rounded-xl p-2 focus-within:ring-2 focus-within:ring-blue-200 transition-shadow">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={tc("placeholder")}
                rows={2}
                disabled={loading}
                className="flex-1 resize-none border-0 shadow-none focus-visible:ring-0 text-sm p-1 min-h-0"
              />
              <Button
                size="icon"
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="shrink-0 rounded-lg"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span className="sr-only">{tc("send")}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageGate>
  );
}
