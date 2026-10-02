import { AdminShell } from "@/components/shell/admin-shell";
import { PictureBookStylesManager } from "@/components/admin/picture-book-styles-manager";
import { getAdminSystemConfigs } from "@/lib/settings-api";
import type { PictureBookStyle } from "@/lib/picture-book-styles";

export const dynamic = "force-dynamic";
export default async function AdminPictureBookStylesPage() {
  const configs = await getAdminSystemConfigs();
  const styles = JSON.parse(configs.find(config => config.key === "pictureBookStyles")?.value ?? "[]") as PictureBookStyle[];
  return <AdminShell active="/admin/picture-book-styles" title="绘本绘画风格"><PictureBookStylesManager initialStyles={styles} /></AdminShell>;
}
