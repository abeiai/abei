import Link from "next/link";
import { Edit3, Layers3, Trash2 } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { AdminTableSection } from "@/components/shell/admin-table-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  deleteContentModuleAction,
  getAdminContentModules,
  type ContentModule,
  type ContentModuleType
} from "@/lib/content-module-api";

export const dynamic = "force-dynamic";

const typeLabels: Record<ContentModuleType, string> = {
  SLIDESHOW: "幻灯模块",
  IMAGE_CARD_LIST: "图文卡片列表",
  SPLIT_IMAGE_TEXT: "左右图文"
};

interface PageProps {
  searchParams?: Promise<{
    type?: string;
  }>;
}

function normalizeType(value?: string): ContentModuleType | undefined {
  return value === "SLIDESHOW" || value === "IMAGE_CARD_LIST" || value === "SPLIT_IMAGE_TEXT"
    ? value
    : undefined;
}

function itemCount(module: ContentModule) {
  return module._count?.items ?? module.items.length;
}

export default async function AdminModulesPage({ searchParams }: PageProps) {
  const query = (await searchParams) ?? {};
  const type = normalizeType(query.type);
  const modules = await getAdminContentModules(type);

  return (
    <AdminShell
      active="/admin/modules"
      title="模块管理"
      description="管理前台可复用的格式化内容模块，先支持幻灯、图文卡片列表和左右图文。"
    >
      <div className="flex flex-col gap-6">
        <form className="rounded-md border border-border bg-card p-4" action="/admin/modules">
          <FieldGroup className="grid gap-4 md:grid-cols-[260px_auto]">
            <Field>
              <FieldLabel htmlFor="type">模块类型</FieldLabel>
              <Select id="type" name="type" defaultValue={type ?? ""}>
                <option value="">全部模块</option>
                <option value="SLIDESHOW">幻灯模块</option>
                <option value="IMAGE_CARD_LIST">图文卡片列表</option>
                <option value="SPLIT_IMAGE_TEXT">左右图文</option>
              </Select>
            </Field>
            <Field className="justify-end">
              <Button type="submit">筛选</Button>
            </Field>
          </FieldGroup>
        </form>

        <AdminTableSection
          title="模块列表"
          description="模块保存后可由前台按 slug 调用展示。"
          addLabel="新增模块"
          addHref="/admin/modules/new"
          headers={["模块", "类型", "状态", "条目", "更新时间", "操作"]}
          footer={
            <div className="text-sm text-muted-foreground">
              共 {modules.length} 个模块。当前版本先完成后台管理，前台渲染可按 slug 接入。
            </div>
          }
        >
          {modules.length > 0 ? (
            modules.map((module) => (
              <TableRow key={module.id}>
                <TableCell className="min-w-72">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-secondary">
                      <Layers3 />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">{module.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{module.slug}</p>
                      {module.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{module.description}</p>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{typeLabels[module.type]}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={module.isEnabled ? "secondary" : "muted"}>
                    {module.isEnabled ? "启用" : "停用"}
                  </Badge>
                </TableCell>
                <TableCell>{itemCount(module)}</TableCell>
                <TableCell>{new Date(module.updatedAt).toLocaleString("zh-CN")}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/modules/${module.id}/edit`}>
                        <Edit3 data-icon="inline-start" />
                        编辑
                      </Link>
                    </Button>
                    <form action={deleteContentModuleAction}>
                      <input name="id" type="hidden" value={module.id} />
                      <Button type="submit" variant="outline" size="sm">
                        <Trash2 data-icon="inline-start" />
                        删除
                      </Button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={6}>
                暂无模块，请先新增一个幻灯模块或图文模块。
              </TableCell>
            </TableRow>
          )}
        </AdminTableSection>
      </div>
    </AdminShell>
  );
}
