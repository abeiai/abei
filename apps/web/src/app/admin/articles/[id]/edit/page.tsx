import { redirect } from "next/navigation";

import { ArticleForm } from "@/components/cms/article-form";
import { AdminShell } from "@/components/shell/admin-shell";
import { getAdminArticlePreview, getAdminCategories, getAdminTags, updateArticleAction } from "@/lib/cms-api";
import { getAdminMediaAssets } from "@/lib/media-api";

export const dynamic = "force-dynamic";

function safeReturnTo(value?: string) {
  return value === "/admin/articles" || value?.startsWith("/admin/articles?") ? value : "/admin/articles";
}

export default async function AdminEditArticlePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const returnTo = safeReturnTo(query.returnTo);
  const [article, categories, mediaAssets, tags] = await Promise.all([
    getAdminArticlePreview(id).catch(() => null),
    getAdminCategories(),
    getAdminMediaAssets({ mediaType: "IMAGE" }),
    getAdminTags()
  ]);

  if (!article) {
    redirect("/admin/articles");
  }

  return (
    <AdminShell
      active="/admin/articles"
      title="编辑文章"
      description="保存文章后会返回文章列表，不会跳转到后台首页。"
    >
      <div className="flex flex-col gap-6">
        <ArticleForm
          action={updateArticleAction}
          article={article}
          categories={categories}
          mediaAssets={mediaAssets}
          tags={tags}
          submitLabel="保存文章"
          returnTo={returnTo}
        />
      </div>
    </AdminShell>
  );
}
