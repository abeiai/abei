import Link from "next/link";

import { ArticleForm } from "@/components/cms/article-form";
import { AdminShell } from "@/components/shell/admin-shell";
import { Button } from "@/components/ui/button";
import { createArticleAction, getAdminCategories, getAdminTags } from "@/lib/cms-api";
import { getAdminMediaAssets } from "@/lib/media-api";

export const dynamic = "force-dynamic";

function safeReturnTo(value?: string) {
  return value === "/admin/articles" || value?.startsWith("/admin/articles?") ? value : "/admin/articles";
}

export default async function AdminNewArticlePage({
  searchParams
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const returnTo = safeReturnTo(query.returnTo);
  const [categories, mediaAssets, tags] = await Promise.all([
    getAdminCategories(),
    getAdminMediaAssets({ mediaType: "IMAGE" }),
    getAdminTags()
  ]);

  return (
    <AdminShell
      active="/admin/articles"
      title="新增文章"
      description="创建文章后会回到文章列表，可继续筛选、预览或编辑。"
    >
      <div className="flex flex-col gap-6">
        {categories.length > 0 ? (
          <ArticleForm
            action={createArticleAction}
            categories={categories}
            mediaAssets={mediaAssets}
            tags={tags}
            submitLabel="新增文章"
            returnTo={returnTo}
          />
        ) : (
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
            <p>请先创建文章分类，再新增文章。</p>
            <Button asChild className="w-fit" variant="outline">
              <Link href="/admin/categories">去创建分类</Link>
            </Button>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
