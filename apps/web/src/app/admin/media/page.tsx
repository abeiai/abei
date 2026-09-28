import Link from "next/link";
import { AudioLines, Eye, FileVideo, Filter, Image as ImageIcon, ImageUp, RotateCcw } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getAdminMediaAssets, type MediaAsset, type MediaAssetSource, type MediaAssetType } from "@/lib/media-api";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const mediaTypes: Array<{
  accept: string;
  label: string;
  value: MediaAssetType;
}> = [
  {
    accept: "image/jpeg,image/png,image/webp,image/gif",
    label: "图片",
    value: "IMAGE"
  },
  {
    accept: "audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/webm,audio/ogg,audio/aac,audio/mp4",
    label: "音频",
    value: "AUDIO"
  },
  {
    accept: "video/mp4,video/webm,video/quicktime,video/x-matroska",
    label: "视频",
    value: "VIDEO"
  }
];

const sourceTypes: Array<{
  label: string;
  value: MediaAssetSource;
}> = [
  {
    label: "系统自带",
    value: "SYSTEM"
  },
  {
    label: "用户上传",
    value: "USER_UPLOAD"
  },
  {
    label: "AI 生成",
    value: "AI_GENERATED"
  },
  {
    label: "网页获取",
    value: "WEB_FETCHED"
  }
];

function parseMediaType(value?: string): MediaAssetType {
  return mediaTypes.find((item) => item.value === value)?.value ?? "IMAGE";
}

function parseSourceType(value?: string): MediaAssetSource | undefined {
  return sourceTypes.find((item) => item.value === value)?.value;
}

function mediaTypeLabel(value: MediaAssetType) {
  return mediaTypes.find((item) => item.value === value)?.label ?? "媒体";
}

function sourceTypeLabel(value: MediaAssetSource) {
  return sourceTypes.find((item) => item.value === value)?.label ?? "未知来源";
}

function storageLabel(value: string) {
  return value === "S3" ? "对象存储" : "本地存储";
}

function formatSize(value: number) {
  if (value > 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(2)} MB`;
  }

  return `${Math.max(1, Math.round(value / 1024)).toLocaleString("zh-CN")} KB`;
}

function tabHref(mediaType: MediaAssetType, sourceType?: MediaAssetSource, q?: string) {
  const params = new URLSearchParams();
  params.set("mediaType", mediaType);

  if (sourceType) {
    params.set("sourceType", sourceType);
  }

  if (q) {
    params.set("q", q);
  }

  return `/admin/media?${params.toString()}`;
}

function activeMediaAccept(mediaType: MediaAssetType) {
  return mediaTypes.find((item) => item.value === mediaType)?.accept ?? mediaTypes[0].accept;
}

function assetPreview(asset: MediaAsset) {
  if (asset.mediaType === "IMAGE") {
    return <img className="size-full object-cover" src={asset.url} alt={asset.originalName} />;
  }

  if (asset.mediaType === "AUDIO") {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-5 p-5">
        <div className="flex size-16 items-center justify-center rounded-full bg-secondary">
          <AudioLines />
        </div>
        <audio className="w-full" controls preload="metadata" src={asset.url}>
          <track kind="captions" />
        </audio>
      </div>
    );
  }

  return (
    <video className="size-full object-cover" controls preload="metadata" src={asset.url}>
      <track kind="captions" />
    </video>
  );
}

function emptyIcon(mediaType: MediaAssetType) {
  if (mediaType === "AUDIO") {
    return <AudioLines />;
  }

  if (mediaType === "VIDEO") {
    return <FileVideo />;
  }

  return <ImageIcon />;
}

export default async function AdminMediaPage({
  searchParams
}: {
  searchParams?: Promise<{ mediaType?: string; q?: string; sourceType?: string; uploadError?: string; uploaded?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const mediaType = parseMediaType(query.mediaType);
  const sourceType = parseSourceType(query.sourceType);
  const q = query.q?.trim() ?? "";
  const assets = await getAdminMediaAssets({
    mediaType,
    q,
    sourceType
  });
  const resultStart = assets.length > 0 ? 1 : 0;

  return (
    <AdminShell
      active="/admin/media"
      title="媒体素材"
      description="管理图片、音频、视频素材，并按系统自带、用户上传、AI 生成、网页获取区分来源。"
    >
      <div className="flex flex-col gap-5">
        {query.uploadError ? (
          <div className="rounded-lg border border-destructive/20 bg-card p-4 text-sm text-destructive">
            上传失败：{query.uploadError}
          </div>
        ) : null}
        {query.uploaded ? (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            文件已上传，素材列表已更新。
          </div>
        ) : null}

        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {mediaTypes.map((item) => (
                  <Link
                    className={cn(
                      "inline-flex h-10 items-center rounded-full border px-5 text-sm font-medium transition-colors",
                      item.value === mediaType
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-transparent text-foreground hover:bg-secondary"
                    )}
                    href={tabHref(item.value, sourceType, q)}
                    key={item.value}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                显示 {resultStart}-{assets.length} / 共 {assets.length} 项{mediaTypeLabel(mediaType)}素材
              </p>
            </div>

            <form
              action={`/api/admin/media/upload?mediaType=${mediaType}`}
              className="grid gap-3 md:grid-cols-[180px_minmax(260px,1fr)_auto] xl:min-w-[680px]"
              encType="multipart/form-data"
              method="post"
            >
              <FieldGroup className="md:col-span-2 md:grid md:grid-cols-[180px_minmax(260px,1fr)]">
                <Field>
                  <FieldLabel htmlFor="sourceType">素材来源</FieldLabel>
                  <Select id="sourceType" name="sourceType" defaultValue="USER_UPLOAD">
                    {sourceTypes.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="file">添加文件</FieldLabel>
                  <Input id="file" name="file" type="file" accept={activeMediaAccept(mediaType)} required />
                </Field>
              </FieldGroup>
              <Button className="md:self-end" type="submit">
                <ImageUp data-icon="inline-start" />
                上传文件
              </Button>
            </form>
          </div>
        </div>

        <Card>
          <CardContent className="p-4">
            <form className="grid gap-3 lg:grid-cols-[220px_minmax(280px,1fr)_auto_auto]" action="/admin/media">
              <input name="mediaType" type="hidden" value={mediaType} />
              <Select name="sourceType" defaultValue={sourceType ?? ""}>
                <option value="">全部来源</option>
                {sourceTypes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
              <Input name="q" defaultValue={q} placeholder="搜索素材名称或原文件名" />
              <Button type="submit" variant="outline">
                <Filter data-icon="inline-start" />
                筛选
              </Button>
              <Button asChild variant="outline">
                <Link href={tabHref(mediaType)}>
                  <RotateCcw data-icon="inline-start" />
                  重置
                </Link>
              </Button>
            </form>
          </CardContent>
        </Card>

        {assets.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
            {assets.map((asset) => (
              <Card className="overflow-hidden" key={asset.id}>
                <div className="aspect-[4/3] border-b border-border bg-secondary">{assetPreview(asset)}</div>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="muted">{sourceTypeLabel(asset.sourceType)}</Badge>
                    <Badge variant="outline">{storageLabel(asset.storageProvider)}</Badge>
                    {asset.sourceType !== "USER_UPLOAD" ? <Badge variant="outline">只读</Badge> : null}
                  </div>
                  <div className="flex min-h-28 flex-col gap-2">
                    <h3 className="line-clamp-3 text-base font-medium leading-6 tracking-normal">{asset.originalName}</h3>
                    <p className="text-sm text-muted-foreground">
                      {formatSize(asset.size)} · {mediaTypeLabel(asset.mediaType)}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{asset.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(asset.createdAt).toLocaleString("zh-CN", { hour12: false })}
                    </p>
                  </div>
                  <Button asChild className="w-fit px-0" variant="ghost">
                    <a href={asset.url} rel="noreferrer" target="_blank">
                      <Eye data-icon="inline-start" />
                      查看
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-secondary">{emptyIcon(mediaType)}</div>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-medium tracking-normal">暂无{mediaTypeLabel(mediaType)}素材</h2>
              <p className="text-sm text-muted-foreground">上传文件后会按当前媒体类型和来源展示在这里。</p>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
