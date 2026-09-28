import { MenuManager } from "@/components/admin/menu-manager";
import { AdminShell } from "@/components/shell/admin-shell";
import { getAdminArticles, getAdminCategories, getAdminPages } from "@/lib/cms-api";
import { getAdminSystemConfigs } from "@/lib/settings-api";

export const dynamic = "force-dynamic";

export default async function AdminMenusPage() {
  const [configs, pages, articles, categories] = await Promise.all([
    getAdminSystemConfigs(),
    getAdminPages().catch(() => []),
    getAdminArticles().catch(() => []),
    getAdminCategories().catch(() => [])
  ]);
  const configByKey = new Map(configs.map((config) => [config.key, config.value]));

  return (
    <AdminShell
      active="/admin/menus"
      title="菜单管理"
      description="参考 WordPress 的菜单逻辑，维护前台顶部菜单、底部菜单和自定义导航结构。"
    >
      <MenuManager
        articles={articles.map((article) => ({
          id: article.id,
          title: article.title,
          slug: article.slug,
          status: article.status === "PUBLISHED" ? "已发布" : article.status === "DRAFT" ? "草稿" : "已下架"
        }))}
        categories={categories.map((category) => ({
          id: category.id,
          title: category.name,
          slug: category.slug,
          status: category.isVisible ? "显示" : "隐藏"
        }))}
        initialConfigValue={configByKey.get("siteMenus") ?? ""}
        legacyNavItems={configByKey.get("publicNavItems") ?? ""}
        pages={pages.map((page) => ({
          id: page.id,
          title: page.title,
          slug: page.slug,
          status: page.status === "PUBLISHED" ? "已发布" : page.status === "DRAFT" ? "草稿" : "已下架"
        }))}
      />
    </AdminShell>
  );
}
