"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Check,
  X,
  Sparkles,
  Briefcase,
  DollarSign,
  Building2,
  Code,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types
export interface AdvancedFilters {
  industries?: string[];
  keywords?: string[];
  experienceLevel?: string;
  salaryMin?: number;
  salaryMax?: number;
  companySize?: string;
}

interface AdvancedFiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: AdvancedFilters) => void;
  initialFilters?: AdvancedFilters;
}

export function AdvancedFiltersModal({
  isOpen,
  onClose,
  onApply,
  initialFilters = {},
}: AdvancedFiltersModalProps) {
  const t = useTranslations("advancedFilters");

  // Constants (inside component to use t())
  const INDUSTRIES = [
    t("industryTechIT"),
    t("industryFinance"),
    "Healthcare",
    "E-commerce",
    t("industryMarketing"),
    t("industryEducation"),
    "Retail",
    t("industryManufacturing"),
    t("industryConsulting"),
    "Real Estate",
    "Media",
    "Telecom",
    "Energy",
    "Automotive",
    "Food & Beverage",
    "Travel & Tourism",
    "Gaming",
    "Crypto / Blockchain",
    "SaaS",
    "FinTech",
  ];

  const EXPERIENCE_LEVELS = [
    { value: "junior", label: t("experienceJunior") },
    { value: "mid", label: t("experienceMid") },
    { value: "senior", label: t("experienceSenior") },
    { value: "lead", label: t("experienceLead") },
  ];

  const COMPANY_SIZES = [
    {
      value: "startup",
      label: t("companySizeStartup"),
      description: "Petite équipe agile",
    },
    {
      value: "scaleup",
      label: t("companySizeScaleup"),
      description: "Croissance rapide",
    },
    {
      value: "enterprise",
      label: t("companySizeEnterprise"),
      description: "Grande organisation",
    },
  ];

  // State
  const [industries, setIndustries] = useState<string[]>(
    initialFilters.industries || [],
  );
  const [keywords, setKeywords] = useState<string[]>(
    initialFilters.keywords || [],
  );
  const [keywordInput, setKeywordInput] = useState("");
  const [experienceLevel, setExperienceLevel] = useState<string | undefined>(
    initialFilters.experienceLevel,
  );
  const [salaryMin, setSalaryMin] = useState<number | undefined>(
    initialFilters.salaryMin,
  );
  const [salaryMax, setSalaryMax] = useState<number | undefined>(
    initialFilters.salaryMax,
  );
  const [companySize, setCompanySize] = useState<string | undefined>(
    initialFilters.companySize,
  );
  const [industrySearchOpen, setIndustrySearchOpen] = useState(false);

  // Handlers
  const handleAddKeyword = useCallback(() => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      setKeywords([...keywords, keywordInput.trim()]);
      setKeywordInput("");
    }
  }, [keywordInput, keywords]);

  const handleRemoveKeyword = useCallback(
    (keyword: string) => {
      setKeywords(keywords.filter((k) => k !== keyword));
    },
    [keywords],
  );

  const handleToggleIndustry = useCallback(
    (industry: string) => {
      if (industries.includes(industry)) {
        setIndustries(industries.filter((i) => i !== industry));
      } else {
        setIndustries([...industries, industry]);
      }
    },
    [industries],
  );

  const handleReset = useCallback(() => {
    setIndustries([]);
    setKeywords([]);
    setKeywordInput("");
    setExperienceLevel(undefined);
    setSalaryMin(undefined);
    setSalaryMax(undefined);
    setCompanySize(undefined);
  }, []);

  const handleApply = useCallback(() => {
    const filters: AdvancedFilters = {};

    if (industries.length > 0) filters.industries = industries;
    if (keywords.length > 0) filters.keywords = keywords;
    if (experienceLevel) filters.experienceLevel = experienceLevel;
    if (salaryMin !== undefined && salaryMin > 0) filters.salaryMin = salaryMin;
    if (salaryMax !== undefined && salaryMax > 0) filters.salaryMax = salaryMax;
    if (companySize) filters.companySize = companySize;

    onApply(filters);
    onClose();
  }, [
    industries,
    keywords,
    experienceLevel,
    salaryMin,
    salaryMax,
    companySize,
    onApply,
    onClose,
  ]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">
                {t("title")}
              </DialogTitle>
              <DialogDescription>
                Affinez votre recherche avec des critères supplémentaires
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Industries */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-gray-500" />
              <Label className="text-sm font-semibold">
                {t("industriesLabel")}
              </Label>
            </div>

            <Popover
              open={industrySearchOpen}
              onOpenChange={setIndustrySearchOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={industrySearchOpen}
                  className="w-full justify-between"
                >
                  {industries.length > 0
                    ? `${industries.length} industrie(s) sélectionnée(s)`
                    : "Sélectionner des industries..."}
                  <Briefcase className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Rechercher une industrie..." />
                  <CommandEmpty>Aucune industrie trouvée.</CommandEmpty>
                  <CommandGroup className="max-h-64 overflow-auto">
                    {INDUSTRIES.map((industry) => (
                      <CommandItem
                        key={industry}
                        onSelect={() => handleToggleIndustry(industry)}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            industries.includes(industry)
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        {industry}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>

            {industries.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {industries.map((industry) => (
                  <Badge key={industry} variant="secondary" className="gap-1">
                    {industry}
                    <button
                      onClick={() => handleToggleIndustry(industry)}
                      className="ml-1 hover:bg-gray-200 rounded-full"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Keywords */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-gray-500" />
              <Label className="text-sm font-semibold">
                Mots-clés techniques
              </Label>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: React, Python, AWS..."
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddKeyword();
                  }
                }}
              />
              <Button onClick={handleAddKeyword} variant="secondary">
                Ajouter
              </Button>
            </div>
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {keywords.map((keyword) => (
                  <Badge
                    key={keyword}
                    variant="default"
                    className="gap-1 bg-huntzen-blue"
                  >
                    {keyword}
                    <button
                      onClick={() => handleRemoveKeyword(keyword)}
                      className="ml-1 hover:bg-blue-700 rounded-full"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Experience Level */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-gray-500" />
              <Label className="text-sm font-semibold">
                {t("experienceLabel")}
              </Label>
            </div>
            <Select value={experienceLevel} onValueChange={setExperienceLevel}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un niveau..." />
              </SelectTrigger>
              <SelectContent>
                {EXPERIENCE_LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Salary Range */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-gray-500" />
              <Label className="text-sm font-semibold">
                {t("salaryLabel")}
              </Label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="salary-min" className="text-xs text-gray-600">
                  {t("salaryMin")}
                </Label>
                <Input
                  id="salary-min"
                  type="number"
                  placeholder="30 000"
                  value={salaryMin || ""}
                  onChange={(e) =>
                    setSalaryMin(
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  min={0}
                  step={5000}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary-max" className="text-xs text-gray-600">
                  {t("salaryMax")}
                </Label>
                <Input
                  id="salary-max"
                  type="number"
                  placeholder="100 000"
                  value={salaryMax || ""}
                  onChange={(e) =>
                    setSalaryMax(
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  min={0}
                  step={5000}
                />
              </div>
            </div>
            {salaryMin !== undefined &&
              salaryMax !== undefined &&
              salaryMin > salaryMax && (
                <p className="text-xs text-red-600">
                  Le salaire minimum doit être inférieur au maximum
                </p>
              )}
          </div>

          <Separator />

          {/* Company Size */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-500" />
              <Label className="text-sm font-semibold">
                {t("companySizeLabel")}
              </Label>
            </div>
            <RadioGroup value={companySize} onValueChange={setCompanySize}>
              {COMPANY_SIZES.map((size) => (
                <div
                  key={size.value}
                  className="flex items-start space-x-3 space-y-0"
                >
                  <RadioGroupItem value={size.value} id={size.value} />
                  <Label
                    htmlFor={size.value}
                    className="font-normal cursor-pointer"
                  >
                    <div className="font-medium">{size.label}</div>
                    <div className="text-xs text-gray-500">
                      {size.description}
                    </div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
            className="w-full sm:w-auto"
          >
            {t("resetButton")}
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="ghost"
              onClick={onClose}
              className="flex-1 sm:flex-none"
            >
              {t("cancelButton")}
            </Button>
            <Button
              onClick={handleApply}
              className="flex-1 sm:flex-none bg-huntzen-blue hover:bg-blue-700"
              disabled={
                salaryMin !== undefined &&
                salaryMax !== undefined &&
                salaryMin > salaryMax
              }
            >
              {t("applyButton")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
