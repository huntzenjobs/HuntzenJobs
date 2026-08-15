import { withSerwist } from "@serwist/turbopack";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export function resolveOutputMode(vercelEnvironment) {
  return vercelEnvironment ? undefined : "standalone";
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: resolveOutputMode(process.env.VERCEL),
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ["isomorphic-dompurify", "jsdom"],
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "auth.huntzenjobs.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 365,
    dangerouslyAllowSVG: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.googletagmanager.com https://va.vercel-scripts.com https://vercel.live",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://auth.huntzenjobs.com https://ngiakfikbuyugqfqtfwp.supabase.co https://*.supabase.co https://huntzenjobs-production.up.railway.app https://api-staging.huntzenjobs.com https://*.ingest.sentry.io http://localhost:* ws://localhost:* wss://auth.huntzenjobs.com wss://ngiakfikbuyugqfqtfwp.supabase.co",
              "frame-src 'self' https://www.googletagmanager.com https://vercel.live",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  experimental: {
    scrollRestoration: true,
  },
};

export default withSerwist(withNextIntl(nextConfig));
