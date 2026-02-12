// Import Sentry configuration FIRST - must be before any other imports
import "../../sentry.client.config";

import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SkipLink } from "@/components/ui/skip-link";
import { createClient } from "@/lib/supabase/server";
import { homeMetadata } from "@/lib/seo/metadata";
import { HomePageSchemas } from "@/components/seo/structured-data";
import { inter, dmSans } from "@/lib/fonts";

// Metadata optimisées pour SEO 100/100
export const metadata: Metadata = homeMetadata;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch user server-side to eliminate race condition
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* PWA Meta Tags */}
        <meta name="application-name" content="HuntZen Jobs" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="HuntZen" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#00D9FF" />

        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192x192.png" />

        {/* Favicon */}
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />

        {/* DNS Prefetch et Preconnect pour resources externes */}
        <link rel="dns-prefetch" href="https://ngiakfikbuyugqfqtfwp.supabase.co" />
        <link rel="dns-prefetch" href="https://huntzenjobs-production.up.railway.app" />
        <link rel="preconnect" href="https://ngiakfikbuyugqfqtfwp.supabase.co" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://huntzenjobs-production.up.railway.app" crossOrigin="anonymous" />

        {/* Preload critical fonts (déjà géré par next/font mais explicite pour le navigateur) */}
        <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" />
        <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800;900&display=swap" />

        <HomePageSchemas />
      </head>
      <body className={`${inter.variable} ${dmSans.variable} font-sans antialiased`}>
        <SkipLink />
        <Providers initialUser={user}>{children}</Providers>
      </body>
    </html>
  );
}
