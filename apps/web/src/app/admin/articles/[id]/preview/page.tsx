import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { MarkdownContent } from "@/components/markdown/markdown-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminArticlePreview } from "@/lib/cms-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "文章预览",
  robots: {
    index: false,
    follow: false
  }
};

function statusLabel(status: string) {
  return status === "PUBLISHED" ? "已发布" : status === "ARCHIVED" ? "已归档" : "草稿";
}

export default async function AdminArticlePreviewPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const article = await getAdminArticlePreview(id).catch(() => null);

  if (!article) {
    redirect("/admin/login");
  }

  const coverUrl = article.coverMedia?.url || article.coverImage;
  const categories = article.categories && article.categories.length > 0
    ? article.categories
    : article.category
      ? [article.category]
      : [];

  return (
    <AdminShell
      active="/admin/articles"
      title="文章预览"
      description="仅管理员可访问，预览不会改变文章发布状态。"
    >
      <div className="flex flex-col gap-6">
        <Button asChild variant="ghost" className="w-fit">
          <Link href="/admin/articles">
            <ArrowLeft data-icon="inline-start" />
            返回文章管理
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-2">
              {categories.length > 0 ? (
                categories.map((category) => (
                  <Badge variant="outline" key={category.id}>
                    {category.name}
                  </Badge>
                ))
              ) : (
                <Badge variant="outline">未分类</Badge>
              )}
              <Badge variant={article.status === "PUBLISHED" ? "secondary" : "muted"}>
                {statusLabel(article.status)}
              </Badge>
              {article.scheduledAt ? (
                <Badge variant="muted">定时：{new Date(article.scheduledAt).toLocaleString("zh-CN")}</Badge>
              ) : null}
            </div>
            <CardTitle>{article.title}</CardTitle>
            <CardDescription>{article.summary ?? "未填写摘要"}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-8">
            <div className="aspect-[16/9] overflow-hidden rounded-lg border border-border bg-secondary">
              {coverUrl ? (
                <img className="size-full object-cover" src={coverUrl} alt={article.title} />
              ) : (
                <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                  暂无封面
                </div>
              )}
            </div>
            {article.tags && article.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {article.tags.map((tag) => (
                  <Badge variant="outline" key={tag.id}>
                    {tag.name}
                  </Badge>
                ))}
              </div>
            ) : null}
            <MarkdownContent
              className="border-t border-border pt-8 text-base leading-8"
              content={article.content}
            />
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
