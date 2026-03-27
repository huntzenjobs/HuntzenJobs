"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/auth-context";
import { AssistantProvider } from "@/contexts/assistant-context";
import { I18nProvider } from "@/contexts/i18n-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { initWebVitalsMonitoring } from "@/lib/performance/web-vitals";
import type { User } from "@supabase/supabase-js";

export function Providers({
  children,
  initialUser = null,
}: {
  children: React.ReactNode;
  initialUser?: User | null;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // Initialiser le monitoring des Core Web Vitals
  useEffect(() => {
    initWebVitalsMonitoring();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <AuthProvider initialUser={initialUser}>
            <AssistantProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="light"
                forcedTheme="light"
                enableSystem={false}
                disableTransitionOnChange
              >
                {children}
                <Toaster position="top-right" />
              </ThemeProvider>
            </AssistantProvider>
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
