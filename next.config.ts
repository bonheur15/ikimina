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
