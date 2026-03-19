"use client";

import { useState, useEffect } from "react";
import {
  Globe,
  MapPin,
  Briefcase,
  FileText,
  MessageSquare,
} from "lucide-react";
import { useRouter } from "next/navigation";
import expatData from "@/data/expat-data.json";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "next-intl";

type Country = (typeof expatData.countries)[0];

function formatSalary(amount: number, currency: string, eurRate: number) {
  const eur = Math.round(amount * eurRate);
  if (currency === "EUR") return `${amount.toLocaleString("fr-FR")} €/an`;
  return `${amount.toLocaleString("fr-FR")} ${currency}/an ≈ ${eur.toLocaleString("fr-FR")} €`;
}

export default function ExpatPage() {
  const t = useTranslations("expat");
  const router = useRouter();
  const [selectedCode, setSelectedCode] = useState("CA");
  const [checkedDocs, setCheckedDocs] = useState<Record<string, boolean>>({});

  const country = expatData.countries.find((c) => c.code === selectedCode)!;

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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-blue-100">
          <Globe className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4" /> {t("costOfLiving.title")} —{" "}
            {country.flag} {country.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">
                {t("costOfLiving.rent")}
              </p>
              <p className="text-lg font-bold">
                {country.costOfLiving.rent1br.toLocaleString("fr-FR")}{" "}
                {country.currency}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("costOfLiving.perMonth")}
              </p>
            </div>
            <div className="bg-muted rounded-lg p-4 text-center">
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
            <div className="bg-muted rounded-lg p-4 text-center">
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
            <div className="bg-blue-50 rounded-lg p-4 text-center">
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
                      className={`text-sm ${checkedDocs[doc.id] ? "line-through text-muted-foreground" : ""}`}
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

      <Card className="bg-gradient-to-br from-blue-50 to-teal-50 border-blue-100">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold">{t("coach.title")}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("coach.subtitle", { country: country.name })}
              </p>
            </div>
            <Button
              onClick={() =>
                router.push(
                  `/assistant?prefill=${encodeURIComponent(`Je souhaite m'expatrier en ${country.name}. Peux-tu m'aider à préparer mon projet ?`)}`,
                )
              }
              className="shrink-0 gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              {t("coach.cta")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
