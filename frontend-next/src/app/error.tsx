"use client";

/**
 * Next.js Error Component
 * Catches errors in Server Components and Client Components
 * Works alongside ErrorBoundary for comprehensive error handling
 */

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslations } from "next-intl";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");

  useEffect(() => {
    // Log error to Sentry
    Sentry.captureException(error);

    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("Next.js Error:", error);
    }
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <CardTitle>{t("title")}</CardTitle>
          </div>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {process.env.NODE_ENV === "development" && error.digest && (
            <div className="bg-muted p-3 rounded-md">
              <p className="text-xs font-mono text-muted-foreground">
                Error ID: {error.digest}
              </p>
            </div>
          )}

          {process.env.NODE_ENV === "development" && (
            <div className="bg-muted p-3 rounded-md">
              <p className="text-sm font-mono text-muted-foreground">
                {error.message}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={reset} className="flex-1">
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("retry")}
            </Button>
            <Button
              variant="outline"
              onClick={() => (window.location.href = "/")}
              className="flex-1"
            >
              <Home className="mr-2 h-4 w-4" />
              {t("home")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
