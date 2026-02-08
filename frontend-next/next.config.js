/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output standalone for Docker deployment
  output: 'standalone',

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://ngiakfikbuyugqfqtfwp.supabase.co https://*.supabase.co https://huntzenjobs-production.up.railway.app http://localhost:* ws://localhost:* wss://ngiakfikbuyugqfqtfwp.supabase.co",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },

  // Enable instrumentation for Sentry and other monitoring
  experimental: {
    instrumentationHook: true,
  },

  // Webpack configuration to suppress OpenTelemetry dynamic require warnings
  webpack: (config, { isServer, webpack }) => {
    // Suppress critical dependency warnings for OpenTelemetry auto-instrumentation
    // These packages use dynamic require() which webpack cannot statically analyze
    config.module = {
      ...config.module,
      // Disable warnings for expression contexts (dynamic requires)
      exprContextCritical: false,
    }

    // Suppress specific webpack warnings from OpenTelemetry instrumentation packages
    // These warnings are expected and safe - the packages use dynamic requires for auto-instrumentation
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /node_modules\/require-in-the-middle/,
        message: /Critical dependency/,
      },
      {
        module: /node_modules\/@opentelemetry\/instrumentation/,
        message: /Critical dependency/,
      },
      {
        module: /node_modules\/@prisma\/instrumentation/,
        message: /Critical dependency/,
      },
    ]

    return config
  },
}

module.exports = nextConfig
