import Link from "next/link";
import { CalendarClock, Edit, Eye, Image, Play, Search } from "lucide-react";

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
  archiveArticleAction,
  deleteArticleAction,
  getAdminArticles,
  getAdminCategories,
  publishArticleAction,
  publishDueContentAction,
  type CmsArticle
} from "@/lib/cms-api";

export const dynamic = "force-dynamic";

const pageSize = 10;

type ArticleSearchParams = {
  q?: string;
  category?: string;
  status?: string;
  sort?: string;
  page?: string;
};

function statusLabel(status: CmsArticle["status"]) {
  return status === "PUBLISHED" ? "已发布" : status === "ARCHIVED" ? "已归档" : "草稿";
}

function articleCoverUrl(article: CmsArticle) {
  return article.coverMedia?.url ?? article.coverImage ?? "";
}

function articleDateValue(article: CmsArticle) {
  const value = article.publishedAt ?? article.scheduledAt ?? article.updatedAt ?? article.createdAt;
  const timestamp = new Date(value).getTime();

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

function articleListHref(params: ArticleSearchParams, overrides: Partial<ArticleSearchParams> = {}) {
  const next = {
    ...params,
    ...overrides
  };
  const query = new URLSearchParams();

  if (next.q) {
    query.set("q", next.q);
  }

  if (next.category) {
    query.set("category", next.category);
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

  return value ? `/admin/articles?${value}` : "/admin/articles";
}

function filterArticles(articles: CmsArticle[], params: ArticleSearchParams) {
  const keyword = (params.q ?? "").trim().toLowerCase();
  const status = normalizeStatus(params.status);
  const category = params.category ?? "";
  const sort = normalizeSort(params.sort);

  return articles
    .filter((article) => {
      const matchesKeyword =
        !keyword ||
        article.title.toLowerCase().includes(keyword) ||
        article.slug.toLowerCase().includes(keyword) ||
        (article.summary ?? "").toLowerCase().includes(keyword);
      const matchesCategory =
        !category ||
        article.categoryId === category ||
        Boolean(article.categories?.some((item) => item.id === category));
      const matchesStatus = !status || article.status === status;

      return matchesKeyword && matchesCategory && matchesStatus;
    })
    .sort((left, right) => {
      const result = articleDateValue(left) - articleDateValue(right);

      return sort === "date_asc" ? result : -result;
    });
}

async function publishDueFormAction() {
  "use server";

  await publishDueContentAction();
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
  params: ArticleSearchParams;
}) {
  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  return (
    <div className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <span>
        共 {totalItems} 篇，分页：第 {currentPage} 页 / 共 {totalPages} 页
      </span>
      <div className="flex gap-2">
        {currentPage > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={articleListHref(params, { page: String(previousPage) })}>上一页</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            上一页
          </Button>
        )}
        {currentPage < totalPages ? (
          <Button asChild variant="outline" size="sm">
            <Link href={articleListHref(params, { page: String(nextPage) })}>下一页</Link>
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

export default async function AdminArticlesPage({
  searchParams
}: {
  searchParams?: Promise<ArticleSearchParams>;
}) {
  const query = (await searchParams) ?? {};
  const normalizedParams: ArticleSearchParams = {
    q: query.q?.trim() ?? "",
    category: query.category ?? "",
    status: normalizeStatus(query.status),
    sort: normalizeSort(query.sort),
    page: String(normalizePage(query.page))
  };
  const [articles, categories] = await Promise.all([getAdminArticles(), getAdminCategories()]);
  const filteredArticles = filterArticles(articles, normalizedParams);
  const totalPages = Math.max(1, Math.ceil(filteredArticles.length / pageSize));
  const currentPage = Math.min(normalizePage(normalizedParams.page), totalPages);
  const start = (currentPage - 1) * pageSize;
  const visibleArticles = filteredArticles.slice(start, start + pageSize);
  const nextSort = normalizedParams.sort === "date_asc" ? "date_desc" : "date_asc";
  const currentListHref = articleListHref(normalizedParams, { page: String(currentPage) });

  return (
    <AdminShell
      active="/admin/articles"
      title="文章管理"
      description="按列表维护文章，支持搜索、分类筛选、状态筛选、发布时间排序和分页。"
    >
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>文章筛选</CardTitle>
            <CardDescription>输入关键词后可结合分类和状态缩小列表范围。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <form className="flex flex-col gap-4" action="/admin/articles">
                <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_180px_auto]">
                  <Field>
                    <FieldLabel>搜索</FieldLabel>
                    <Input name="q" placeholder="搜索标题、slug 或摘要" defaultValue={normalizedParams.q} />
                  </Field>
                  <Field>
                    <FieldLabel>分类</FieldLabel>
                    <Select name="category" defaultValue={normalizedParams.category}>
                      <option value="">全部分类</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
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
                    <Link href="/admin/articles">重置筛选</Link>
                  </Button>
                </div>
              </form>
              <form action={publishDueFormAction}>
                <Button variant="outline" type="submit">
                  <Play data-icon="inline-start" />
                  执行定时发布
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        <AdminTableSection
          title="文章列表"
          description="前台只展示已发布且已到发布时间的文章。"
          addLabel="新增文章"
          addHref={`/admin/articles/new?returnTo=${encodeURIComponent(currentListHref)}`}
          headers={[
            "标题",
            "分类",
            "标签",
            "状态",
            <Link
              className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
              href={articleListHref(normalizedParams, { sort: nextSort, page: "1" })}
              key="date"
            >
              发布时间
              <span>{normalizedParams.sort === "date_asc" ? "↑" : "↓"}</span>
            </Link>,
            "操作"
          ]}
          footer={
            <PaginationFooter
              currentPage={currentPage}
              totalItems={filteredArticles.length}
              totalPages={totalPages}
              params={normalizedParams}
            />
          }
        >
          {visibleArticles.length > 0 ? (
            visibleArticles.map((article) => (
              <TableRow key={article.id}>
                <TableCell className="max-w-sm">
                  <div className="flex items-center gap-3">
                    <div className="size-16 overflow-hidden rounded-lg border border-border bg-card">
                      {articleCoverUrl(article) ? (
                        <img className="size-full object-cover" src={articleCoverUrl(article)} alt={article.title} />
                      ) : (
                        <div className="flex size-full items-center justify-center text-muted-foreground">
                          <Image />
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate font-medium">{article.title}</span>
                      <span className="truncate font-mono text-xs text-muted-foreground">{article.slug}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(article.categories && article.categories.length > 0 ? article.categories : article.category ? [article.category] : []).map(
                      (category) => (
                        <Badge variant="outline" key={category.id}>
                          {category.name}
                        </Badge>
                      )
                    )}
                    {!article.categories?.length && !article.category ? (
                      <span className="text-sm text-muted-foreground">未分类</span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {article.tags && article.tags.length > 0 ? (
                      article.tags.map((tag) => (
                        <Badge variant="outline" key={tag.id}>
                          {tag.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">未设置</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-2">
                    <Badge variant={article.status === "PUBLISHED" ? "secondary" : "muted"}>
                      {statusLabel(article.status)}
                    </Badge>
                    {article.scheduledAt ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarClock />
                        {new Date(article.scheduledAt).toLocaleString("zh-CN")}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString("zh-CN") : "未发布"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/articles/${article.id}/preview`}>
                        <Eye data-icon="inline-start" />
                        预览
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/articles/${article.id}/edit?returnTo=${encodeURIComponent(currentListHref)}`}>
                        <Edit data-icon="inline-start" />
                        编辑
                      </Link>
                    </Button>
                    <form action={publishArticleAction}>
                      <input name="id" type="hidden" value={article.id} />
                      <input name="slug" type="hidden" value={article.slug} />
                      <Button variant="outline" size="sm" type="submit">
                        发布
                      </Button>
                    </form>
                    <form action={archiveArticleAction}>
                      <input name="id" type="hidden" value={article.id} />
                      <input name="slug" type="hidden" value={article.slug} />
                      <Button variant="outline" size="sm" type="submit">
                        下架
                      </Button>
                    </form>
                    <form action={deleteArticleAction}>
                      <input name="id" type="hidden" value={article.id} />
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
                暂无符合条件的文章
              </TableCell>
            </TableRow>
          )}
        </AdminTableSection>
      </div>
    </AdminShell>
  );
}
