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
    name: "阿贝经典",
    tagline: "延续旧版阿贝的橙色主调、白色画布与轻盈边框",
    description: "以阿贝橙突出主要操作，搭配白底、浅灰分区、小圆角按钮和柔和阴影，统一前台创作与学习界面。",
    previewColors: ["#ffffff", "#f6f6f5", "#292633", "#ff7b31", "#fff1e7"],
    features: ["阿贝橙", "白色画布", "小圆角按钮", "浅灰分区"],
    tokens: {
      "--background": "#ffffff",
      "--foreground": "#292633",
      "--card": "#ffffff",
      "--card-foreground": "#292633",
      "--popover": "#ffffff",
      "--popover-foreground": "#292633",
      "--primary": "#ff7b31",
      "--primary-foreground": "#ffffff",
      "--secondary": "#f6f6f5",
      "--secondary-foreground": "#292633",
      "--muted": "#f6f6f5",
      "--muted-foreground": "#5f5f5f",
      "--accent": "#fff1e7",
      "--accent-foreground": "#a94510",
      "--destructive": "#dc2626",
      "--border": "#e5e7eb",
      "--input": "#e5e7eb",
      "--ring": "#ff7b31",
      "--radius": "0.375rem",
      "--studio-coral": "#ff7b31",
      "--studio-gold": "#e8b75f",
      "--studio-sage": "#76a887",
      "--studio-blue": "#7b9ab8",
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
