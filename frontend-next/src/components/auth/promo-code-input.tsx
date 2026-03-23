"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, X, Loader2, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface CodeValidationResult {
  valid: boolean;
  type?: "referral" | "promo";
  description?: string;
  referrer_name?: string;
  discount_type?: string | null;
  discount_value?: number | null;
  plan?: string | null;
}

interface PromoCodeInputProps {
  onCodeValidated: (code: string, result: CodeValidationResult) => void;
  initialCode?: string;
  className?: string;
}

export function PromoCodeInput({ onCodeValidated, initialCode, className }: PromoCodeInputProps) {
  const t = useTranslations("auth.promoCode");
  const [isOpen, setIsOpen] = useState(!!initialCode);
  const [code, setCode] = useState(initialCode || "");
  const [status, setStatus] = useState<"idle" | "loading" | "valid" | "invalid">("idle");
  const [result, setResult] = useState<CodeValidationResult | null>(null);

  const validate = useCallback(async (codeToValidate: string) => {
    if (!codeToValidate.trim()) return;
    setStatus("loading");

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${backendUrl}/api/codes/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeToValidate.trim() }),
      });

      if (!res.ok) {
        setStatus("invalid");
        return;
      }

      const data: CodeValidationResult = await res.json();
      setResult(data);

      if (data.valid) {
        setStatus("valid");
        onCodeValidated(codeToValidate.trim().toUpperCase(), data);
      } else {
        setStatus("invalid");
      }
    } catch {
      setStatus("invalid");
    }
  }, [onCodeValidated]);

  useEffect(() => {
    if (initialCode) {
      validate(initialCode);
    }
  }, [initialCode, validate]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          "flex items-center gap-2 text-sm text-gray-500 hover:text-[#00D9FF] transition-colors",
          className,
        )}
      >
        <Tag className="w-4 h-4" />
        {t("trigger")}
      </button>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (status !== "idle") setStatus("idle");
          }}
          placeholder={t("placeholder")}
          className={cn(
            "h-10 text-sm",
            status === "valid" && "border-green-500 focus-visible:ring-green-500",
            status === "invalid" && "border-red-500 focus-visible:ring-red-500",
          )}
          disabled={status === "loading"}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => validate(code)}
          disabled={!code.trim() || status === "loading" || status === "valid"}
          className="h-10 px-4"
        >
          {status === "loading" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : status === "valid" ? (
            <Check className="w-4 h-4" />
          ) : (
            t("apply")
          )}
        </Button>
      </div>

      {status === "valid" && result && (
        <p className="text-sm text-green-600 flex items-center gap-1.5">
          <Check className="w-4 h-4" />
          {result.type === "referral"
            ? t("validReferral", { name: result.referrer_name || "" })
            : t("validPromo", { description: result.description || "" })}
        </p>
      )}

      {status === "invalid" && (
        <p className="text-sm text-red-500 flex items-center gap-1.5">
          <X className="w-4 h-4" />
          {t("invalid")}
        </p>
      )}
    </div>
  );
}
