import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // portfolio.palavir.co is retired: every route permanently redirects into
  // palavir.co/data. Order matters -- Next.js applies the first matching
  // redirect, so most-specific sources come first and the '/:path*'
  // catch-all stays last so it cannot shadow them.
  async redirects() {
    return [
      {
        source: "/degree-roi/findings",
        destination: "https://palavir.co/data/where-your-degree-takes-you/findings",
        permanent: true,
      },
      {
        source: "/degree-roi/:major",
        destination: "https://palavir.co/data/where-your-degree-takes-you/:major",
        permanent: true,
      },
      {
        source: "/degree-roi",
        destination: "https://palavir.co/data/where-your-degree-takes-you",
        permanent: true,
      },
      {
        source: "/",
        destination: "https://palavir.co/data",
        permanent: true,
      },
      {
        source: "/:path*",
        destination: "https://palavir.co/data",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // Static data JSON (incl. per-major shards) — was max-age=0, so it
        // re-downloaded on every visit and every major-page navigation. Cache
        // it; updates ship on deploy, so a short fresh window + SWR is safe.
        source: "/data/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://cdn.jsdelivr.net; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
