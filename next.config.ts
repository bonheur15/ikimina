import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  devIndicators: false,
  experimental: {
    // Compile current source on restart instead of restoring stale dev bundles.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
