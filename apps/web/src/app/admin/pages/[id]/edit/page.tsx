import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageForm } from "@/components/cms/page-form";
import { AdminShell } from "@/components/shell/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminPagePreview, updatePageAction } from "@/lib/cms-api";
import { getAdminMediaAssets } from "@/lib/media-api";

export const dynamic = "force-dynamic";

function safeReturnTo(value?: string) {
  return value === "/admin/pages" || value?.startsWith("/admin/pages?") ? value : "/admin/pages";
}

export default async function AdminEditPagePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const returnTo = safeReturnTo(query.returnTo);
  const [page, mediaAssets] = await Promise.all([
    getAdminPagePreview(id).catch(() => null),
    getAdminMediaAssets({ mediaType: "IMAGE" })
  ]);

  if (!page) {
    redirect("/admin/pages");
  }

  return (
    <AdminShell
      active="/admin/pages"
      title="编辑单页"
      description="保存单页后会返回单页列表，不会跳转到后台首页。"
    >
      <div className="flex flex-col gap-6">
        <Button asChild variant="ghost" className="w-fit">
          <Link href={returnTo}>
            <ArrowLeft data-icon="inline-start" />
            返回单页列表
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>{page.title}</CardTitle>
            <CardDescription>修改正文、发布状态、SEO 字段和索引控制。</CardDescription>
          </CardHeader>
          <CardContent>
            <PageForm
              action={updatePageAction}
              mediaAssets={mediaAssets}
              page={page}
              submitLabel="保存单页"
              returnTo={returnTo}
            />
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
