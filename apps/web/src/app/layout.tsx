import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { AnalyticsCode } from "@/components/shell/analytics-code";
import { getPublicSystemConfigs } from "@/lib/settings-api";
import { resolveSiteSeo, rootSiteMetadata } from "@/lib/site-seo-metadata";
import "@incremark/theme/styles.css";
import "katex/dist/katex.min.css";
import "vditor/dist/index.css";
import "./globals.css";

const mulishFont = localFont({
  src: [
    {
      path: "../assets/fonts/mulish/Mulish-VariableFont_wght.ttf",
      style: "normal",
      weight: "200 900"
    },
    {
      path: "../assets/fonts/mulish/Mulish-Italic-VariableFont_wght.ttf",
      style: "italic",
      weight: "200 900"
    }
  ],
  display: "swap",
  fallback: ["Arial", "Helvetica"],
  variable: "--font-mulish"
});

export async function generateMetadata(): Promise<Metadata> {
  const configs = await getPublicSystemConfigs().catch(() => []);
  return rootSiteMetadata(resolveSiteSeo(configs));
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const analyticsCode = await getAnalyticsCode();

  return (
    <html
      lang="zh-CN"
      data-app-version={process.env.APP_VERSION ?? "0.0.0"}
      data-release={process.env.APP_RELEASE_SHA ?? "unknown"}
      data-scroll-behavior="smooth"
    >
      <body className={mulishFont.variable}>
        <AnalyticsCode code={analyticsCode} />
        {children}
      </body>
    </html>
  );
}

async function getAnalyticsCode() {
  try {
    const configs = await getPublicSystemConfigs();
    const value = configs.find((config) => config.key === "analyticsCode")?.value ?? "";

    return value.trim() ? value : "";
  } catch {
    return "";
  }
}
