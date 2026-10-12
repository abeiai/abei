import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return ["/creator/:path*", "/account/connections"].map(source => ({
      source,
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "Referrer-Policy", value: "no-referrer" }
      ]
    }));
  },
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.xueleai.com"
      }
    ]
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb"
    }
  },
  output: "standalone",
  outputFileTracingRoot: join(appDir, "../..")
};

export default nextConfig;
