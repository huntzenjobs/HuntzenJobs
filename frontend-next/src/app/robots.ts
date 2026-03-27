import { MetadataRoute } from "next";

/**
 * Robots.txt optimisé pour SEO 100/100
 * Next.js génère automatiquement /robots.txt
 */

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/profile",
          "/_next/",
          "/auth/",
          "/payment/",
        ],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/api/", "/admin/", "/profile", "/auth/", "/payment/"],
        crawlDelay: 0,
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: ["/api/", "/admin/", "/profile", "/auth/", "/payment/"],
        crawlDelay: 1,
      },
      // Bloquer les mauvais bots
      {
        userAgent: [
          "AhrefsBot",
          "SemrushBot",
          "DotBot",
          "MJ12bot",
          "BLEXBot",
        ],
        disallow: "/",
      },
    ],
    sitemap: "https://huntzenjobs.com/sitemap.xml",
  };
}
