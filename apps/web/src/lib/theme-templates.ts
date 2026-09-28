import type { CSSProperties } from "react";

export type ThemeTemplateKey = "default" | "blue-tech";

export interface ThemeTemplate {
  description: string;
  features: string[];
  key: ThemeTemplateKey;
  name: string;
  previewColors: string[];
  tagline: string;
  tokens: Record<`--${string}`, string>;
}

export const defaultThemeTemplateKey: ThemeTemplateKey = "default";

export const themeTemplates: ThemeTemplate[] = [
  {
    key: "default",
    name: "MiniMax 黑白产品",
    tagline: "参考 MiniMax 的黑白画布、胶囊按钮和高密度产品卡片，适合国际级 AI SaaS 首页",
    description: "使用白色主画布、近黑主行动、浅灰内容分区和少量 coral/blue 产品强调色，让前台更接近高端 AI 基础设施与产品矩阵站点。",
    previewColors: ["#ffffff", "#f7f8fa", "#0a0a0a", "#ff5530", "#1456f0"],
    features: ["黑白画布", "胶囊按钮", "产品色卡", "兼容页面编排模块"],
    tokens: {
      "--background": "#ffffff",
      "--foreground": "#0a0a0a",
      "--card": "#ffffff",
      "--card-foreground": "#0a0a0a",
      "--popover": "#ffffff",
      "--popover-foreground": "#0a0a0a",
      "--primary": "#0a0a0a",
      "--primary-foreground": "#ffffff",
      "--secondary": "#f7f8fa",
      "--secondary-foreground": "#222222",
      "--muted": "#f2f3f5",
      "--muted-foreground": "#5f5f5f",
      "--accent": "#ff5530",
      "--accent-foreground": "#ffffff",
      "--destructive": "#dc2626",
      "--border": "#e5e7eb",
      "--input": "#e5e7eb",
      "--ring": "#1d4ed8",
      "--radius": "0.5rem",
      "--studio-coral": "#ff5530",
      "--studio-gold": "#ea5ec1",
      "--studio-sage": "#a855f7",
      "--studio-blue": "#1456f0",
      "--studio-paper": "#ffffff",
      "--theme-card-shadow": "0 1px 2px rgba(0, 0, 0, 0.04)",
      "--theme-header-shadow": "0 1px 0 rgba(234, 236, 240, 0.96)"
    }
  },
  {
    key: "blue-tech",
    name: "蓝色科技",
    tagline: "更清爽的蓝色科技感界面，适合 AI 平台和开发者产品",
    description: "使用冷白画布、蓝色主按钮、细网格背景和更明快的卡片层级，保持所有前台功能、菜单、CMS、页面编排和体验区数据不变。",
    previewColors: ["#f3f8ff", "#ffffff", "#0b63f6", "#c5daf4"],
    features: ["蓝色主视觉", "科技感网格背景", "更强卡片层级", "不改变业务功能"],
    tokens: {
      "--background": "#f3f8ff",
      "--foreground": "#07162f",
      "--card": "#ffffff",
      "--card-foreground": "#07162f",
      "--popover": "#ffffff",
      "--popover-foreground": "#07162f",
      "--primary": "#0b63f6",
      "--primary-foreground": "#ffffff",
      "--secondary": "#e7f1ff",
      "--secondary-foreground": "#09234c",
      "--muted": "#eaf3ff",
      "--muted-foreground": "#5b6f8f",
      "--accent": "#d9ebff",
      "--accent-foreground": "#07162f",
      "--destructive": "#dc2626",
      "--border": "#c5daf4",
      "--input": "#aac4e6",
      "--ring": "#2f7cf6",
      "--radius": "0.75rem",
      "--theme-card-shadow": "0 18px 44px rgba(14, 89, 168, 0.10)",
      "--theme-header-shadow": "0 10px 30px rgba(14, 89, 168, 0.08)"
    }
  }
];

const fallbackThemeTemplate = themeTemplates[0]!;

export function isThemeTemplateKey(value: string): value is ThemeTemplateKey {
  return themeTemplates.some((theme) => theme.key === value);
}

export function getThemeTemplate(value: string | undefined | null) {
  return themeTemplates.find((theme) => theme.key === value) ?? fallbackThemeTemplate;
}

export function themeTemplateStyle(theme: ThemeTemplate, primaryColorOverride?: string): CSSProperties {
  void primaryColorOverride;
  const tokens = {
    ...theme.tokens
  };

  return tokens as CSSProperties;
}
