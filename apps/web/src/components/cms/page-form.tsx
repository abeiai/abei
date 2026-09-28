import Link from "next/link";

import { VditorEditor } from "@/components/cms/vditor-editor";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CmsPage } from "@/lib/cms-api";
import type { MediaAsset } from "@/lib/media-api";

function datetimeLocalValue(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 16);
}

export function PageForm({
  action,
  mediaAssets,
  page,
  submitLabel,
  returnTo = "/admin/pages"
}: {
  action: (formData: FormData) => Promise<void>;
  mediaAssets: MediaAsset[];
  page?: CmsPage;
  submitLabel: string;
  returnTo?: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-5">
      {page ? <input name="id" type="hidden" value={page.id} /> : null}
      <input name="returnTo" type="hidden" value={returnTo} />
      <div className="grid gap-5 md:grid-cols-2">
        <FieldGroup>
          <Field>
            <FieldLabel>页面标题</FieldLabel>
            <Input name="title" defaultValue={page?.title ?? ""} required />
          </Field>
          <Field>
            <FieldLabel>Slug</FieldLabel>
            <Input name="slug" defaultValue={page?.slug ?? ""} placeholder="about" required />
          </Field>
          <Field>
            <FieldLabel>状态</FieldLabel>
            <Select name="status" defaultValue={page?.status ?? "DRAFT"}>
              <option value="DRAFT">草稿</option>
              <option value="PUBLISHED">已发布</option>
              <option value="ARCHIVED">已归档</option>
            </Select>
          </Field>
        </FieldGroup>
        <FieldGroup>
          <Field>
            <FieldLabel>定时发布时间</FieldLabel>
            <Input name="scheduledAt" type="datetime-local" defaultValue={datetimeLocalValue(page?.scheduledAt)} />
            <FieldDescription>草稿到达该时间后可由定时发布任务转为已发布。</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>索引控制</FieldLabel>
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-input bg-card px-4 text-sm">
              <input name="noIndex" type="checkbox" defaultChecked={page?.noIndex ?? false} />
              不允许搜索引擎索引
            </label>
          </Field>
        </FieldGroup>
      </div>

      <FieldGroup className="lg:grid lg:grid-cols-2">
        <Field>
          <FieldLabel>SEO 标题</FieldLabel>
          <Input name="seoTitle" defaultValue={page?.seoTitle ?? ""} />
        </Field>
        <Field>
          <FieldLabel>SEO 描述</FieldLabel>
          <Input name="seoDescription" defaultValue={page?.seoDescription ?? ""} />
        </Field>
        <Field>
          <FieldLabel>SEO 关键词</FieldLabel>
          <Input name="seoKeywords" defaultValue={page?.seoKeywords ?? ""} />
        </Field>
        <Field>
          <FieldLabel>Canonical URL</FieldLabel>
          <Input name="canonicalUrl" defaultValue={page?.canonicalUrl ?? ""} placeholder="https://..." />
        </Field>
        <Field>
          <FieldLabel>OG 标题</FieldLabel>
          <Input name="ogTitle" defaultValue={page?.ogTitle ?? ""} />
        </Field>
        <Field>
          <FieldLabel>OG 描述</FieldLabel>
          <Input name="ogDescription" defaultValue={page?.ogDescription ?? ""} />
        </Field>
        <Field className="lg:col-span-2">
          <FieldLabel>OG 图片</FieldLabel>
          <Input name="ogImage" defaultValue={page?.ogImage ?? ""} placeholder="https://..." />
        </Field>
      </FieldGroup>

      <VditorEditor defaultValue={page?.content ?? ""} mediaAssets={mediaAssets} minHeight={560} name="content" />

      <div className="flex flex-wrap gap-3">
        <Button type="submit">{submitLabel}</Button>
        <Button asChild variant="outline">
          <Link href={returnTo}>返回列表</Link>
        </Button>
      </div>
    </form>
  );
}
