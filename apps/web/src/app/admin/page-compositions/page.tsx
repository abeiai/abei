import { PageCompositionEditor } from "@/components/page-compositions/page-composition-editor";
import { AdminShell } from "@/components/shell/admin-shell";
import { getAdminPages } from "@/lib/cms-api";
import { getAdminContentModules } from "@/lib/content-module-api";
import {
  getAdminPageCompositionByTarget,
  type PageCompositionTargetType
} from "@/lib/page-composition-api";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{
    targetType?: string;
    pageId?: string;
  }>;
}

function normalizeTargetType(value?: string): PageCompositionTargetType {
  return value === "PAGE" ? "PAGE" : "HOME";
}

export default async function AdminPageCompositionsPage({ searchParams }: PageProps) {
  const query = (await searchParams) ?? {};
  const [pages, modules] = await Promise.all([getAdminPages(), getAdminContentModules()]);
  const requestedTargetType = normalizeTargetType(query.targetType);
  const targetType = requestedTargetType === "PAGE" && pages.length === 0 ? "HOME" : requestedTargetType;
  const pageId = targetType === "PAGE" ? query.pageId || pages[0]?.id || "" : "";
  const composition = await getAdminPageCompositionByTarget(targetType, pageId);

  return (
    <AdminShell
      active="/admin/page-compositions"
      title="页面编排"
      description="为首页和单页选择要展示的模块，并通过拖拽调整顺序。"
    >
      <PageCompositionEditor
        pages={pages}
        modules={modules}
        composition={composition}
        targetType={targetType}
        pageId={pageId}
      />
    </AdminShell>
  );
}
