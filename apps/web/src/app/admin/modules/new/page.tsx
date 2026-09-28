import { ContentModuleForm } from "@/components/content-modules/content-module-form";
import { AdminShell } from "@/components/shell/admin-shell";
import { getAdminArticles, getAdminCategories, getAdminPages } from "@/lib/cms-api";

export const dynamic = "force-dynamic";

export default async function NewContentModulePage() {
  const [categories, pages, articles] = await Promise.all([
    getAdminCategories(),
    getAdminPages(),
    getAdminArticles()
  ]);

  return (
    <AdminShell
      active="/admin/modules"
      title="新增模块"
      description="选择模块类型后配置对应的前台展示内容。"
    >
      <ContentModuleForm categories={categories} pages={pages} articles={articles} />
    </AdminShell>
  );
}
