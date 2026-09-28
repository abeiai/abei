import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft, Edit } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { MarkdownContent } from "@/components/markdown/markdown-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminPagePreview } from "@/lib/cms-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "单页预览",
  robots: {
    index: false,
    follow: false
  }
};

function statusLabel(status: string) {
  return status === "PUBLISHED" ? "已发布" : status === "ARCHIVED" ? "已归档" : "草稿";
}

export default async function AdminPagePreviewPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const page = await getAdminPagePreview(id).catch(() => null);

  if (!page) {
    redirect("/admin/pages");
  }

  return (
    <AdminShell
      active="/admin/pages"
      title="单页预览"
      description="仅管理员可访问，预览不会改变单页发布状态。"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="ghost">
            <Link href="/admin/pages">
              <ArrowLeft data-icon="inline-start" />
              返回单页列表
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/admin/pages/${page.id}/edit`}>
              <Edit data-icon="inline-start" />
              编辑单页
            </Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-2">
              <Badge variant={page.status === "PUBLISHED" ? "secondary" : "muted"}>
                {statusLabel(page.status)}
              </Badge>
              {page.scheduledAt ? (
                <Badge variant="muted">定时：{new Date(page.scheduledAt).toLocaleString("zh-CN")}</Badge>
              ) : null}
              {page.noIndex ? <Badge variant="outline">禁止索引</Badge> : null}
            </div>
            <CardTitle>{page.title}</CardTitle>
            <CardDescription>{page.seoDescription ?? "未填写 SEO 描述"}</CardDescription>
          </CardHeader>
          <CardContent>
            <MarkdownContent
              className="border-t border-border pt-8 text-base leading-8"
              content={page.content}
            />
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
