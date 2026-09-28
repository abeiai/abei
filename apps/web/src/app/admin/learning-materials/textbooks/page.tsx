import { TextbookManager } from "@/components/admin/textbook-manager";
import { AdminShell } from "@/components/shell/admin-shell";
import {
  getAdminTextbookDownloadUrl,
  getAdminTextbooks,
  type AdminTextbookQuery
} from "@/lib/learning-materials-api";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<AdminTextbookQuery>;
}

export default async function AdminTextbooksPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const result = await getAdminTextbooks(query);
  const textbooks = result.items.map((textbook) => ({
    ...textbook,
    mdDownloadUrl: getAdminTextbookDownloadUrl(textbook.id, "md"),
    pdfDownloadUrl: getAdminTextbookDownloadUrl(textbook.id, "pdf")
  }));

  return (
    <AdminShell
      active="/admin/learning-materials/textbooks"
      title="教材管理"
      description="维护电子教材资源，按类型、学科、版本和年级筛选。"
    >
      <TextbookManager
        filters={result.filters}
        pagination={result.pagination}
        query={query}
        textbooks={textbooks}
      />
    </AdminShell>
  );
}
