import Link from "next/link";
import { ArrowLeft, Image, ImageUp, Save, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CategoryMultiSelect } from "@/components/cms/category-multi-select";
import { VditorEditor } from "@/components/cms/vditor-editor";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CmsArticle, CmsCategory, CmsTag } from "@/lib/cms-api";
import type { MediaAsset } from "@/lib/media-api";

function datetimeLocalValue(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return localDate.toISOString().slice(0, 16);
}

function systemTimeValue(value?: string | null) {
  if (!value) {
    return "首次创建后自动生成";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "时间格式异常";
  }

  return date.toLocaleString("zh-CN", { hour12: false });
}

function articleCoverUrl(article?: CmsArticle) {
  return article?.coverMedia?.url ?? article?.coverImage ?? "";
}

function articleTagSlugs(article?: CmsArticle) {
  return article?.tags?.map((tag) => tag.slug) ?? [];
}

function articleCategoryIds(article?: CmsArticle, fallbackCategoryId?: string) {
  const ids = article?.categories?.map((category) => category.id) ?? [];

  if (ids.length > 0) {
    return ids;
  }

  return article?.categoryId ? [article.categoryId] : fallbackCategoryId ? [fallbackCategoryId] : [];
}

function defaultDisplayTime(article?: CmsArticle) {
  return datetimeLocalValue(article?.publishedAt ?? article?.createdAt ?? new Date().toISOString());
}

export function ArticleForm({
  action,
  categories,
  mediaAssets,
  tags,
  article,
  submitLabel,
  returnTo = "/admin/articles"
}: {
  action: (formData: FormData) => Promise<void>;
  categories: CmsCategory[];
  mediaAssets: MediaAsset[];
  tags: CmsTag[];
  article?: CmsArticle;
  submitLabel: string;
  returnTo?: string;
}) {
  const coverUrl = articleCoverUrl(article);

  return (
    <form action={action} className="flex flex-col gap-5">
      {article ? <input name="id" type="hidden" value={article.id} /> : null}
      <input name="returnTo" type="hidden" value={returnTo} />

      <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-medium tracking-normal">{article ? "编辑文章" : "写文章"}</h2>
          <p className="text-sm text-muted-foreground">正文使用 Vditor Markdown 编辑器，SEO 与 GEO 保持现有字段和基础提示。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href={returnTo}>
              <ArrowLeft data-icon="inline-start" />
              返回列表
            </Link>
          </Button>
          <Button type="submit">
            <Save data-icon="inline-start" />
            {submitLabel}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="rounded-lg border border-border bg-card">
            <div className="flex flex-col gap-5 p-5">
              <Field>
                <FieldLabel>标题</FieldLabel>
                <Input name="title" defaultValue={article?.title ?? ""} placeholder="请输入标题" required />
              </Field>
              <VditorEditor
                defaultValue={article?.content ?? ""}
                mediaAssets={mediaAssets}
                minHeight={560}
                name="content"
              />
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div className="flex flex-col gap-1">
                <h3 className="text-xl font-medium tracking-normal">SEO 优化</h3>
                <p className="text-sm text-muted-foreground">摘要、搜索展示和社交分享字段沿用现有保存逻辑。</p>
              </div>
              <Button type="button" variant="outline" disabled>
                <Sparkles data-icon="inline-start" />
                AI SEO
              </Button>
            </div>
            <div className="flex flex-col gap-5 p-5">
              <Field>
                <FieldLabel>摘要</FieldLabel>
                <Textarea
                  className="min-h-24"
                  name="summary"
                  defaultValue={article?.summary ?? ""}
                  placeholder="内容摘要，可用于后台摘录或列表简介"
                />
              </Field>
              <Field>
                <FieldLabel>描述</FieldLabel>
                <Textarea
                  className="min-h-24"
                  name="seoDescription"
                  defaultValue={article?.seoDescription ?? ""}
                  placeholder="搜索结果摘要"
                />
              </Field>
              <FieldGroup className="grid gap-5 lg:grid-cols-2">
                <Field>
                  <FieldLabel>SEO 标题</FieldLabel>
                  <Input name="seoTitle" defaultValue={article?.seoTitle ?? ""} />
                </Field>
                <Field>
                  <FieldLabel>关键词</FieldLabel>
                  <Input name="seoKeywords" defaultValue={article?.seoKeywords ?? ""} placeholder="多个关键词请使用逗号分隔" />
                </Field>
                <Field>
                  <FieldLabel>Canonical URL</FieldLabel>
                  <Input name="canonicalUrl" defaultValue={article?.canonicalUrl ?? ""} placeholder="https://..." />
                </Field>
                <Field>
                  <FieldLabel>OG 标题</FieldLabel>
                  <Input name="ogTitle" defaultValue={article?.ogTitle ?? ""} />
                </Field>
                <Field>
                  <FieldLabel>OG 描述</FieldLabel>
                  <Input name="ogDescription" defaultValue={article?.ogDescription ?? ""} />
                </Field>
                <Field>
                  <FieldLabel>OG 图片</FieldLabel>
                  <Input name="ogImage" defaultValue={article?.ogImage ?? ""} placeholder="https://..." />
                </Field>
              </FieldGroup>
              <Field>
                <FieldLabel>索引控制</FieldLabel>
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-input bg-background px-4 text-sm">
                  <input name="noIndex" type="checkbox" defaultChecked={article?.noIndex ?? false} />
                  不允许搜索引擎索引
                </label>
              </Field>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div className="flex flex-col gap-1">
                <h3 className="text-xl font-medium tracking-normal">GEO 优化</h3>
                <p className="text-sm text-muted-foreground">暂不调整功能，只保留生成式搜索优化的信息布局。</p>
              </div>
              <Button type="button" variant="outline" disabled>
                <Sparkles data-icon="inline-start" />
                AI GEO
              </Button>
            </div>
            <div className="flex flex-col gap-4 p-5">
              <div className="rounded-lg border border-border bg-background p-5">
                <div className="flex flex-wrap items-end gap-3">
                  <span className="text-sm font-medium text-muted-foreground">GEO 完整度评分</span>
                  <span className="text-4xl font-semibold tracking-normal">0/100</span>
                  <Badge variant="outline">待完善</Badge>
                </div>
                <div className="mt-4 h-2 rounded-full bg-secondary" />
              </div>
              <div className="grid gap-3 lg:grid-cols-4">
                {[
                  ["可引用定义", "建议 1 到 3 句，40 字以上更稳。"],
                  ["关键结论", "建议至少 3 条，每条一句。"],
                  ["FAQ", "建议至少 2 组问答。"],
                  ["来源引用", "建议至少 1 条，最好带链接。"]
                ].map(([title, description]) => (
                  <div className="rounded-lg border border-border bg-background p-4" key={title}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{title}</span>
                      <span className="text-sm font-medium text-muted-foreground">0/25</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-5 xl:sticky xl:top-5 xl:self-start">
          <section className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-lg font-medium tracking-normal">推荐图片</h3>
            <div className="mt-4 aspect-[4/3] overflow-hidden rounded-lg border border-border bg-background">
              {coverUrl ? (
                <img className="size-full object-cover" src={coverUrl} alt={article?.title ?? "文章推荐图片"} />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Image />
                  暂无推荐图片
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/admin/media">
                  <ImageUp data-icon="inline-start" />
                  上传图片
                </Link>
              </Button>
            </div>
            <FieldGroup className="mt-4">
              <Field>
                <FieldLabel>从媒体资源选择</FieldLabel>
                <Select name="coverMediaId" defaultValue={article?.coverMediaId ?? ""}>
                  <option value="">不选择媒体资源</option>
                  {mediaAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.originalName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <FieldLabel>外部图片 URL</FieldLabel>
                <Input name="coverImage" defaultValue={article?.coverImage ?? ""} placeholder="https://..." />
              </Field>
            </FieldGroup>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <FieldGroup>
              <Field>
                <FieldLabel>分类目录</FieldLabel>
                <CategoryMultiSelect
                  categories={categories}
                  defaultSelectedIds={articleCategoryIds(article, categories[0]?.id)}
                />
                <FieldDescription>可选择多个分类，第一个分类会作为兼容主分类。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>文章标签</FieldLabel>
                <Select className="min-h-28" name="tagSlugs" multiple defaultValue={articleTagSlugs(article)}>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.slug}>
                      {tag.name}
                    </option>
                  ))}
                </Select>
                <FieldDescription>按住系统多选键可选择多个标签。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>文章作者</FieldLabel>
                <Input value="后台管理员" disabled readOnly />
                <FieldDescription>当前文章模型尚未保存作者字段。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>显示网址</FieldLabel>
                <Input name="slug" defaultValue={article?.slug ?? ""} placeholder="article-slug" required />
              </Field>
              <Field>
                <FieldLabel>发布状态</FieldLabel>
                <Select name="status" defaultValue={article?.status ?? "DRAFT"}>
                  <option value="DRAFT">草稿</option>
                  <option value="PUBLISHED">已发布</option>
                  <option value="ARCHIVED">已归档</option>
                </Select>
              </Field>
              <Field>
                <FieldLabel>显示时间</FieldLabel>
                <Input name="publishedAt" type="datetime-local" defaultValue={defaultDisplayTime(article)} />
                <FieldDescription>用于前台展示和排序；新文章默认使用创建时刻。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>定时发布时间</FieldLabel>
                <Input name="scheduledAt" type="datetime-local" defaultValue={datetimeLocalValue(article?.scheduledAt)} />
              </Field>
              <Field>
                <FieldLabel>创建时间</FieldLabel>
                <Input value={systemTimeValue(article?.createdAt)} disabled readOnly />
              </Field>
              <Field>
                <FieldLabel>修改时间</FieldLabel>
                <Input value={systemTimeValue(article?.updatedAt)} disabled readOnly />
              </Field>
            </FieldGroup>
          </section>
        </aside>
      </div>
    </form>
  );
}
