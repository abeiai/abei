"use client";

import { useState } from "react";
import { ImageIcon, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface UploadResponse {
  code: number;
  message: string;
  data: {
    url: string;
  } | null;
}

export function SiteAssetUploader({
  initialFavicon,
  initialLogo
}: {
  initialFavicon: string;
  initialLogo: string;
}) {
  const [logoUrl, setLogoUrl] = useState(initialLogo);
  const [faviconUrl, setFaviconUrl] = useState(initialFavicon);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState<"logo" | "favicon" | null>(null);

  async function uploadFile(file: File) {
    const formData = new FormData();
    formData.set("file", file);
    formData.set("sourceType", "SYSTEM");

    const response = await fetch("/internal/admin/media/upload-json", {
      method: "POST",
      body: formData
    });
    const payload = (await response.json()) as UploadResponse;

    if (!response.ok || payload.code !== 0 || !payload.data) {
      throw new Error(payload.message || "上传失败");
    }

    return payload.data.url;
  }

  async function handleLogoUpload(file: File) {
    setUploading("logo");
    setMessage("");

    try {
      setLogoUrl(await uploadFile(file));
      setMessage("Logo 已上传，保存配置后生效。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logo 上传失败");
    } finally {
      setUploading(null);
    }
  }

  async function handleFaviconUpload(file: File) {
    setUploading("favicon");
    setMessage("");

    try {
      const faviconFile = await imageToIcoFile(file);
      setFaviconUrl(await uploadFile(faviconFile));
      setMessage("网站图标已转换为 ico，保存配置后生效。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "网站图标上传失败");
    } finally {
      setUploading(null);
    }
  }

  return (
    <FieldGroup className="xl:col-span-2">
      <div className="grid gap-4 md:grid-cols-2">
        <AssetUploadCard
          accept="image/*"
          description="建议上传透明背景 PNG 或 SVG 风格图片。"
          imageUrl={logoUrl}
          inputId="site-logo-upload"
          label="站点 Logo"
          uploading={uploading === "logo"}
          onFile={handleLogoUpload}
        />
        <AssetUploadCard
          accept="image/*"
          description="上传图片后会自动转成 favicon.ico。"
          imageUrl={faviconUrl}
          inputId="site-favicon-upload"
          label="网站 ico 图标"
          uploading={uploading === "favicon"}
          onFile={handleFaviconUpload}
        />
      </div>
      <Input name="siteLogo" type="hidden" value={logoUrl} readOnly />
      <Input name="siteFavicon" type="hidden" value={faviconUrl} readOnly />
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </FieldGroup>
  );
}

function AssetUploadCard({
  accept,
  description,
  imageUrl,
  inputId,
  label,
  uploading,
  onFile
}: {
  accept: string;
  description: string;
  imageUrl: string;
  inputId: string;
  label: string;
  uploading: boolean;
  onFile(file: File): void;
}) {
  return (
    <Field className="rounded-lg border border-border bg-background p-4">
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <label
        className="flex h-32 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-secondary/40"
        htmlFor={inputId}
      >
        {imageUrl ? (
          <img alt={label} className="max-h-full max-w-full object-contain" src={imageUrl} />
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon />
            点击上传
          </span>
        )}
      </label>
      <input
        accept={accept}
        className="hidden"
        id={inputId}
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";

          if (file) {
            onFile(file);
          }
        }}
      />
      <div className="flex items-center gap-2">
        <Button asChild size="sm" type="button" variant="outline">
          <label htmlFor={inputId}>
            <Upload data-icon="inline-start" />
            {uploading ? "上传中" : imageUrl ? "替换文件" : "上传文件"}
          </label>
        </Button>
      </div>
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}

async function imageToIcoFile(file: File) {
  const image = await loadImage(file);
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("浏览器不支持图片转换");
  }

  const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const left = Math.round((size - width) / 2);
  const top = Math.round((size - height) / 2);

  context.clearRect(0, 0, size, size);
  context.drawImage(image, left, top, width, height);

  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("图片转换失败"));
      }
    }, "image/png");
  });
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
  const headerSize = 6 + 16;
  const icoBytes = new Uint8Array(headerSize + pngBytes.length);
  const view = new DataView(icoBytes.buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  view.setUint8(6, size);
  view.setUint8(7, size);
  view.setUint8(8, 0);
  view.setUint8(9, 0);
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, pngBytes.length, true);
  view.setUint32(18, headerSize, true);
  icoBytes.set(pngBytes, headerSize);

  return new File([icoBytes], "favicon.ico", {
    type: "image/x-icon"
  });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片"));
    };
    image.src = url;
  });
}
