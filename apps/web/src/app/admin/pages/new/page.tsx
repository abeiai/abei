import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageForm } from "@/components/cms/page-form";
import { AdminShell } from "@/components/shell/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createPageAction } from "@/lib/cms-api";
import { getAdminMediaAssets } from "@/lib/media-api";

export const dynamic = "force-dynamic";

function safeReturnTo(value?: string) {
  return value === "/admin/pages" || value?.startsWith("/admin/pages?") ? value : "/admin/pages";
}

export default async function AdminNewPagePage({
  searchParams
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const returnTo = safeReturnTo(query.returnTo);
  const mediaAssets = await getAdminMediaAssets({ mediaType: "IMAGE" });

  return (
    <AdminShell
      active="/admin/pages"
      title="新增单页"
      description="创建单页后会回到单页列表，可继续筛选、预览或编辑。"
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
            <CardTitle>单页内容</CardTitle>
            <CardDescription>单页支持 Markdown 正文、图片插入、SEO 字段和索引控制。</CardDescription>
          </CardHeader>
          <CardContent>
            <PageForm action={createPageAction} mediaAssets={mediaAssets} submitLabel="新增单页" returnTo={returnTo} />
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
