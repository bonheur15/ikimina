import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["postgres"],
  experimental: {
    // Compile current source on restart instead of restoring stale dev bundles.
    turbopackFileSystemCacheForDev: false,
    // Room for the one-time upload of the two source workbooks (Settings, fresh installs only).
    serverActions: { bodySizeLimit: "12mb" },
  },
  async redirects() {
    return [
      {
        // The app moved from ikimina.eu1.hubfly.app; keep old links working. API routes stay
        // reachable on the old host so webhooks and schedulers don't break on a redirect.
        source: "/:path((?!api/).*)",
        has: [{ type: "host", value: "ikimina.eu1.hubfly.app" }],
        destination: "https://elayo.eu1.hubfly.app/:path",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        // Browsers must always fetch the latest service worker so updates reach installed apps.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
