import { Tags } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createTagAction,
  deleteTagAction,
  getAdminTags,
  updateTagAction
} from "@/lib/cms-api";

export const dynamic = "force-dynamic";

export default async function AdminTagsPage() {
  const tags = await getAdminTags();

  return (
    <AdminShell
      active="/admin/tags"
      title="文章标签"
      description="管理文章标签，用于内容聚合、SEO 关键词和前台阅读线索。"
    >
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>新增标签</CardTitle>
            <CardDescription>Slug 只能使用小写字母、数字和短横线。</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createTagAction} className="flex flex-col gap-4 md:grid md:grid-cols-[1fr_1fr_auto] md:items-end">
              <FieldGroup className="contents">
                <Field>
                  <FieldLabel htmlFor="name">标签名称</FieldLabel>
                  <Input id="name" name="name" placeholder="内容增长" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="slug">Slug</FieldLabel>
                  <Input id="slug" name="slug" placeholder="content-growth" required />
                </Field>
                <Button type="submit">
                  <Tags data-icon="inline-start" />
                  新增标签
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>标签列表</CardTitle>
            <CardDescription>已被文章使用的标签需要先从文章中移除才能删除。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>文章数</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tags.length > 0 ? (
                    tags.map((tag) => (
                      <TableRow key={tag.id}>
                        <TableCell>
                          <form action={updateTagAction} className="flex max-w-sm gap-2">
                            <input name="id" type="hidden" value={tag.id} />
                            <Input name="name" defaultValue={tag.name} required />
                            <Input name="slug" defaultValue={tag.slug} required />
                            <Button size="sm" variant="outline" type="submit">
                              保存
                            </Button>
                          </form>
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">{tag.slug}</TableCell>
                        <TableCell>{tag._count?.articleTags ?? 0}</TableCell>
                        <TableCell>{new Date(tag.updatedAt).toLocaleString("zh-CN", { hour12: false })}</TableCell>
                        <TableCell>
                          <form action={deleteTagAction}>
                            <input name="id" type="hidden" value={tag.id} />
                            <Button size="sm" variant="outline" type="submit">
                              删除
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={5}>
                        暂无文章标签。
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
