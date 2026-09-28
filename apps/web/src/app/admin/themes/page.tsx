import { ThemeTemplateManager } from "@/components/admin/theme-template-manager";
import { AdminShell } from "@/components/shell/admin-shell";
import { getAdminSystemConfigs } from "@/lib/settings-api";
import { defaultThemeTemplateKey, isThemeTemplateKey } from "@/lib/theme-templates";

export const dynamic = "force-dynamic";

export default async function AdminThemesPage() {
  const settings = await getAdminSystemConfigs();
  const configByKey = new Map(settings.map((setting) => [setting.key, setting.value]));
  const activeTheme = configByKey.get("activeThemeTemplate") ?? defaultThemeTemplateKey;

  return (
    <AdminShell
      active="/admin/themes"
      title="主题模板"
      description="选择前台展示模板。主题切换只影响视觉，不影响业务功能和历史数据。"
    >
      <ThemeTemplateManager activeThemeKey={isThemeTemplateKey(activeTheme) ? activeTheme : defaultThemeTemplateKey} />
    </AdminShell>
  );
}
