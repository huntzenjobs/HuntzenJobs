'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/contexts/auth-context'
import { AssistantProvider } from '@/contexts/assistant-context'
import { ErrorBoundary } from '@/components/error-boundary'
import type { User } from '@supabase/supabase-js'

export function Providers({
  children,
  initialUser = null
}: {
  children: React.ReactNode
  initialUser?: User | null
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
      })
  )

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialUser={initialUser}>
          <AssistantProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              {children}
              <Toaster position="top-right" />
            </ThemeProvider>
          </AssistantProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
