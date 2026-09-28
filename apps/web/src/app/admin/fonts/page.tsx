import { CopybookFontManager } from "@/components/admin/copybook-font-manager";
import { AdminShell } from "@/components/shell/admin-shell";
import { getAdminCopybookFonts } from "@/lib/copybook-fonts-api";

export const dynamic = "force-dynamic";

export default async function AdminFontsPage() {
  const fonts = await getAdminCopybookFonts();

  return (
    <AdminShell
      active="/admin/fonts"
      title="字体管理"
      description="维护字帖生成可用字体文件，并标记字体适合哪些字帖模板。"
    >
      <CopybookFontManager fonts={fonts} />
    </AdminShell>
  );
}
