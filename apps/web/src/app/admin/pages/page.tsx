import Link from "next/link";
import { CalendarClock, Edit, Eye, Search } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { AdminTableSection } from "@/components/shell/admin-table-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  archivePageAction,
  deletePageAction,
  getAdminPages,
  publishPageAction,
  type CmsPage
} from "@/lib/cms-api";

export const dynamic = "force-dynamic";

const pageSize = 10;

type PageSearchParams = {
  q?: string;
  status?: string;
  sort?: string;
  page?: string;
};

function statusLabel(status: CmsPage["status"]) {
  return status === "PUBLISHED" ? "已发布" : status === "ARCHIVED" ? "已归档" : "草稿";
}

function pageDateValue(page: CmsPage) {
  const timestamp = new Date(page.updatedAt ?? page.createdAt).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function normalizeStatus(status?: string) {
  return status === "DRAFT" || status === "PUBLISHED" || status === "ARCHIVED" ? status : "";
}

function normalizeSort(sort?: string) {
  return sort === "date_asc" ? "date_asc" : "date_desc";
}

function normalizePage(page?: string) {
  const value = Number(page ?? 1);

  return Number.isInteger(value) && value > 0 ? value : 1;
}

function pageListHref(params: PageSearchParams, overrides: Partial<PageSearchParams> = {}) {
  const next = {
    ...params,
    ...overrides
  };
  const query = new URLSearchParams();

  if (next.q) {
    query.set("q", next.q);
  }

  if (next.status) {
    query.set("status", next.status);
  }

  if (next.sort && next.sort !== "date_desc") {
    query.set("sort", next.sort);
  }

  if (next.page && next.page !== "1") {
    query.set("page", next.page);
  }

  const value = query.toString();

  return value ? `/admin/pages?${value}` : "/admin/pages";
}

function filterPages(pages: CmsPage[], params: PageSearchParams) {
  const keyword = (params.q ?? "").trim().toLowerCase();
  const status = normalizeStatus(params.status);
  const sort = normalizeSort(params.sort);

  return pages
    .filter((page) => {
      const matchesKeyword =
        !keyword ||
        page.title.toLowerCase().includes(keyword) ||
        page.slug.toLowerCase().includes(keyword) ||
        (page.seoDescription ?? "").toLowerCase().includes(keyword);
      const matchesStatus = !status || page.status === status;

      return matchesKeyword && matchesStatus;
    })
    .sort((left, right) => {
      const result = pageDateValue(left) - pageDateValue(right);

      return sort === "date_asc" ? result : -result;
    });
}

function PaginationFooter({
  currentPage,
  totalItems,
  totalPages,
  params
}: {
  currentPage: number;
  totalItems: number;
  totalPages: number;
  params: PageSearchParams;
}) {
  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  return (
    <div className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <span>
        共 {totalItems} 个单页，分页：第 {currentPage} 页 / 共 {totalPages} 页
      </span>
      <div className="flex gap-2">
        {currentPage > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={pageListHref(params, { page: String(previousPage) })}>上一页</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            上一页
          </Button>
        )}
        {currentPage < totalPages ? (
          <Button asChild variant="outline" size="sm">
            <Link href={pageListHref(params, { page: String(nextPage) })}>下一页</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            下一页
          </Button>
        )}
      </div>
    </div>
  );
}

export default async function AdminPagesPage({
  searchParams
}: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const query = (await searchParams) ?? {};
  const normalizedParams: PageSearchParams = {
    q: query.q?.trim() ?? "",
    status: normalizeStatus(query.status),
    sort: normalizeSort(query.sort),
    page: String(normalizePage(query.page))
  };
  const pages = await getAdminPages();
  const filteredPages = filterPages(pages, normalizedParams);
  const totalPages = Math.max(1, Math.ceil(filteredPages.length / pageSize));
  const currentPage = Math.min(normalizePage(normalizedParams.page), totalPages);
  const start = (currentPage - 1) * pageSize;
  const visiblePages = filteredPages.slice(start, start + pageSize);
  const nextSort = normalizedParams.sort === "date_asc" ? "date_desc" : "date_asc";
  const currentListHref = pageListHref(normalizedParams, { page: String(currentPage) });

  return (
    <AdminShell
      active="/admin/pages"
      title="单页管理"
      description="按列表维护关于我们、服务条款等独立页面，支持搜索、状态筛选、更新时间排序和分页。"
    >
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>单页筛选</CardTitle>
            <CardDescription>单页不设置分类，可按关键词和发布状态筛选。</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" action="/admin/pages">
              <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
                <Field>
                  <FieldLabel>搜索</FieldLabel>
                  <Input name="q" placeholder="搜索标题、slug 或 SEO 描述" defaultValue={normalizedParams.q} />
                </Field>
                <Field>
                  <FieldLabel>状态</FieldLabel>
                  <Select name="status" defaultValue={normalizedParams.status}>
                    <option value="">全部状态</option>
                    <option value="DRAFT">草稿</option>
                    <option value="PUBLISHED">已发布</option>
                    <option value="ARCHIVED">已归档</option>
                  </Select>
                </Field>
                <Field className="justify-end">
                  <input name="sort" type="hidden" value={normalizedParams.sort} />
                  <Button type="submit">
                    <Search data-icon="inline-start" />
                    筛选
                  </Button>
                </Field>
              </FieldGroup>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link href="/admin/pages">重置筛选</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <AdminTableSection
          title="单页列表"
          description="前台只允许访问已发布且已到发布时间的单页。"
          addLabel="新增单页"
          addHref={`/admin/pages/new?returnTo=${encodeURIComponent(currentListHref)}`}
          headers={[
            "页面标题",
            "Slug",
            "状态",
            <Link
              className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
              href={pageListHref(normalizedParams, { sort: nextSort, page: "1" })}
              key="date"
            >
              更新时间
              <span>{normalizedParams.sort === "date_asc" ? "↑" : "↓"}</span>
            </Link>,
            "SEO 描述",
            "操作"
          ]}
          footer={
            <PaginationFooter
              currentPage={currentPage}
              totalItems={filteredPages.length}
              totalPages={totalPages}
              params={normalizedParams}
            />
          }
        >
          {visiblePages.length > 0 ? (
            visiblePages.map((page) => (
              <TableRow key={page.id}>
                <TableCell className="font-medium">{page.title}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{page.slug}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-2">
                    <Badge variant={page.status === "PUBLISHED" ? "secondary" : "muted"}>
                      {statusLabel(page.status)}
                    </Badge>
                    {page.scheduledAt ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarClock />
                        {new Date(page.scheduledAt).toLocaleString("zh-CN")}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>{new Date(page.updatedAt).toLocaleDateString("zh-CN")}</TableCell>
                <TableCell className="max-w-md text-muted-foreground">{page.seoDescription ?? "未设置"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/pages/${page.id}/preview`}>
                        <Eye data-icon="inline-start" />
                        预览
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/pages/${page.id}/edit?returnTo=${encodeURIComponent(currentListHref)}`}>
                        <Edit data-icon="inline-start" />
                        编辑
                      </Link>
                    </Button>
                    <form action={publishPageAction}>
                      <input name="id" type="hidden" value={page.id} />
                      <input name="slug" type="hidden" value={page.slug} />
                      <Button variant="outline" size="sm" type="submit">
                        发布
                      </Button>
                    </form>
                    <form action={archivePageAction}>
                      <input name="id" type="hidden" value={page.id} />
                      <input name="slug" type="hidden" value={page.slug} />
                      <Button variant="outline" size="sm" type="submit">
                        下架
                      </Button>
                    </form>
                    <form action={deletePageAction}>
                      <input name="id" type="hidden" value={page.id} />
                      <Button variant="outline" size="sm" type="submit">
                        删除
                      </Button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell className="text-center text-muted-foreground" colSpan={6}>
                暂无符合条件的单页
              </TableCell>
            </TableRow>
          )}
        </AdminTableSection>
      </div>
    </AdminShell>
  );
}
