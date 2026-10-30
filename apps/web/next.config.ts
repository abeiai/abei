import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const imageRemoteBases = (process.env.IMAGE_REMOTE_BASE_URLS || process.env.S3_PUBLIC_BASE_URL || "https://r.abeiai.com")
  .split(",").map(value => {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("图片公开地址须为无鉴权参数的 HTTPS 地址");
    return url.toString().replace(/\/+$/, "");
  });
const imageDeliveryBase = process.env.IMAGE_DELIVERY_BASE_URL?.trim() || "";
if (imageDeliveryBase) {
  const url = new URL(imageDeliveryBase);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("图片分发地址须为 HTTPS 域名");
}

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
    localPatterns: [
      { pathname: "**", search: "" },
      { pathname: "/home-assets/**" },
      { pathname: "/picture-book-demos/**" },
      { pathname: "/images/voice-avatars/**" }
    ],
    remotePatterns: [...imageRemoteBases.map(base => {
      const url = new URL(base);
      return { protocol: "https" as const, hostname: url.hostname, port: url.port, pathname: `${url.pathname.replace(/\/+$/, "")}/**` };
    }), { protocol: "https", hostname: "cdn.xueleai.com" }, { protocol: "https", hostname: "cdn.abeiai.com" }],
    deviceSizes: [640, 960, 1280, 1920],
    imageSizes: [64, 128, 160, 320],
    qualities: [75, 82, 90],
    formats: ["image/webp"],
    minimumCacheTTL: 86400,
    maximumDiskCacheSize: 512 * 1024 * 1024,
    maximumResponseBody: 20 * 1024 * 1024,
    maximumRedirects: 0
  },
  env: {
    NEXT_PUBLIC_IMAGE_REMOTE_BASE_URLS: imageRemoteBases.join(","),
    NEXT_PUBLIC_IMAGE_DELIVERY_BASE_URL: imageDeliveryBase.replace(/\/+$/, ""),
    NEXT_PUBLIC_IMAGE_RELEASE_VERSION: process.env.APP_RELEASE_SHA && !["unknown", "local"].includes(process.env.APP_RELEASE_SHA)
      ? process.env.APP_RELEASE_SHA : Date.now().toString(36)
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
