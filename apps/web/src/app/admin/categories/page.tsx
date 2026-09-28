import { CategoryManager } from "@/components/admin/category-manager";
import { AdminShell } from "@/components/shell/admin-shell";
import { getAdminCategories } from "@/lib/cms-api";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const categories = await getAdminCategories();

  return (
    <AdminShell
      active="/admin/categories"
      title="文章分类管理"
      description="管理文章分类名称、slug、状态和文章数量。"
    >
      <CategoryManager categories={categories} />
    </AdminShell>
  );
}
