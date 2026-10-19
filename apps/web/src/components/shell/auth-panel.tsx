import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicSystemConfigs } from "@/lib/settings-api";
import styles from "./auth-panel.module.css";

interface AuthPanelProps {
  variant?: "public" | "admin";
  layout?: "default" | "illustrated";
  title?: string | null;
  description?: string;
  children: ReactNode;
  footer: {
    label: string;
    href: string;
    action: string;
  };
}

export async function AuthPanel({ title, description, children, footer, variant = "public", layout = "default" }: AuthPanelProps) {
  const { siteLogo, siteName } = await getSiteIdentity();
  const showHeader = title !== null || Boolean(description);

  return (
    <main className={`xueleai-auth-shell ${variant === "admin" ? "abei-admin-theme" : ""} ${layout === "illustrated" ? styles.illustrated : ""} min-h-screen bg-background text-foreground`} data-public-theme={variant === "public" ? "default" : undefined}>
      <div className="mx-auto flex min-h-screen w-full max-w-[460px] flex-col justify-center px-5 py-10">
        <section className="flex flex-col items-center gap-6">
          <Link className="flex min-h-10 items-center justify-center gap-3 font-display text-3xl font-semibold" href="/">
            {siteLogo ? (
              <img alt={siteName} className="max-h-12 w-auto object-contain" src={siteLogo} />
            ) : (
              <>
                <span className={variant === "admin" ? "abei-admin-brand-mark" : "xueleai-brand-mark"}>{variant === "admin" ? "A" : "学"}</span>
                <span>{siteName}</span>
              </>
            )}
          </Link>
          <Card className="w-full">
            {showHeader ? (
              <CardHeader>
                {title !== null ? <CardTitle>{title ?? siteName}</CardTitle> : null}
                {description ? <CardDescription>{description}</CardDescription> : null}
              </CardHeader>
            ) : null}
            <CardContent className={`flex flex-col gap-6 ${showHeader ? "" : "pt-5 md:pt-6"}`}>
              {children}
              <p className="text-center text-sm text-muted-foreground">
                <span>{footer.label}</span>
                <Link className="ml-1 font-medium text-foreground" href={footer.href}>
                  {footer.action}
                </Link>
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

async function getSiteIdentity() {
  try {
    const configs = await getPublicSystemConfigs();
    const configMap = new Map(configs.map((config) => [config.key, config.value]));

    return {
      siteLogo: safeImageUrl(configMap.get("siteLogo")),
      siteName: displaySiteName(configMap.get("siteName"))
    };
  } catch {
    return {
      siteLogo: "",
      siteName: "学乐 AI"
    };
  }
}

function safeImageUrl(value: string | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("/") && !normalized.startsWith("//")) {
    return normalized;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  return "";
}

function displaySiteName(value: string | undefined) {
  const normalized = value?.trim();

  return !normalized || normalized === "AI SaaS" ? "学乐 AI" : normalized;
}
