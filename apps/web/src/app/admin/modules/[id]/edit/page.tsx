import { notFound } from "next/navigation";

import { ContentModuleForm } from "@/components/content-modules/content-module-form";
import { AdminShell } from "@/components/shell/admin-shell";
import { getAdminArticles, getAdminCategories, getAdminPages } from "@/lib/cms-api";
import { getAdminContentModule } from "@/lib/content-module-api";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditContentModulePage({ params }: PageProps) {
  const { id } = await params;

  try {
    const [module, categories, pages, articles] = await Promise.all([
      getAdminContentModule(id),
      getAdminCategories(),
      getAdminPages(),
      getAdminArticles()
    ]);

    return (
      <AdminShell
        active="/admin/modules"
        title="编辑模块"
        description="调整模块基础信息、展示配置和条目内容。"
      >
        <ContentModuleForm module={module} categories={categories} pages={pages} articles={articles} />
      </AdminShell>
    );
  } catch {
    notFound();
  }
}
