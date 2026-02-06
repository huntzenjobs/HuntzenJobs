// Import Sentry configuration FIRST - must be before any other imports
import "../../sentry.client.config";

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SkipLink } from "@/components/ui/skip-link";
import { createClient } from "@/lib/supabase/server";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "HuntZen IA - Assistant Carrière Intelligent",
  description: "Plateforme IA tout-en-un pour maîtriser sa carrière et ses négociations",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch user server-side to eliminate race condition
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <SkipLink />
        <Providers initialUser={user}>{children}</Providers>
      </body>
    </html>
  );
}
