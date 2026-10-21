"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { ImageUp, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { centerCropRect } from "@/lib/course-editor-state";
import { uploadCourseCover } from "@/lib/course-cover-upload";

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("专辑封面读取失败"));
    image.src = url;
  });
}

async function cropCourseCover(file: File) {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(sourceUrl);
    const crop = centerCropRect(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("专辑封面处理失败");
    }

    canvas.width = 1600;
    canvas.height = 900;
    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      1600,
      900
    );

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("专辑封面处理失败")),
        "image/jpeg",
        0.9
      )
    );
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function CourseCoverUploader({
  coverUrl,
  disabled = false,
  inputId,
  onUploaded,
  onUploadingChange
}: {
  coverUrl: string;
  disabled?: boolean;
  inputId: string;
  onUploaded: (asset: { id: string; url: string }) => void;
  onUploadingChange: (isUploading: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const disabledRef = useRef(disabled);
  const previousDisabledRef = useRef(disabled);
  const uploadLockRef = useRef(false);
  const uploadInProgressRef = useRef(false);
  const generationRef = useRef(0);
  const localPreviewUrlRef = useRef("");
  const onUploadedRef = useRef(onUploaded);
  const onUploadingChangeRef = useRef(onUploadingChange);
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const previewUrl = localPreviewUrl || coverUrl;
  const actionLabel = coverUrl ? "替换封面" : "上传封面";

  disabledRef.current = disabled;
  onUploadedRef.current = onUploaded;
  onUploadingChangeRef.current = onUploadingChange;

  if (disabled && !previousDisabledRef.current) {
    generationRef.current += 1;
  }

  previousDisabledRef.current = disabled;

  function revokeLocalPreview() {
    if (localPreviewUrlRef.current) {
      URL.revokeObjectURL(localPreviewUrlRef.current);
      localPreviewUrlRef.current = "";
    }
  }

  function isCurrentUpload(generation: number) {
    return mountedRef.current
      && !disabledRef.current
      && generationRef.current === generation;
  }

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      revokeLocalPreview();
    };
  }, []);

  useEffect(() => {
    if (!disabled || !uploadInProgressRef.current) {
      return;
    }

    uploadLockRef.current = false;
    uploadInProgressRef.current = false;
    revokeLocalPreview();
    setLocalPreviewUrl("");
    setError("");
    setIsUploading(false);
    onUploadingChangeRef.current(false);
  }, [disabled]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || uploadLockRef.current || disabledRef.current) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件。");
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    uploadLockRef.current = true;
    uploadInProgressRef.current = true;
    setError("");
    setIsUploading(true);
    onUploadingChangeRef.current(true);

    try {
      const blob = await cropCourseCover(file);

      if (!isCurrentUpload(generation)) {
        return;
      }

      revokeLocalPreview();
      const previewObjectUrl = URL.createObjectURL(blob);
      localPreviewUrlRef.current = previewObjectUrl;
      setLocalPreviewUrl(previewObjectUrl);

      const result = await uploadCourseCover(blob);

      if (!isCurrentUpload(generation)) {
        return;
      }

      if (!result.ok) {
        setError(result.message);
        revokeLocalPreview();
        setLocalPreviewUrl("");
        return;
      }

      onUploadedRef.current({ id: result.data.id, url: result.data.url });
      revokeLocalPreview();
      setLocalPreviewUrl("");
    } catch {
      if (isCurrentUpload(generation)) {
        setError("专辑封面处理失败，请重新选择图片。");
        revokeLocalPreview();
        setLocalPreviewUrl("");
      }
    } finally {
      if (isCurrentUpload(generation)) {
        uploadLockRef.current = false;
        uploadInProgressRef.current = false;
        setIsUploading(false);
        onUploadingChangeRef.current(false);
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-secondary">
        {previewUrl ? (
          <img alt="专辑封面预览" className="size-full object-cover" src={previewUrl} />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <ImageUp className="size-6" />
            <span>上传 16:9 专辑封面</span>
          </div>
        )}
      </div>
      <input
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={disabled || isUploading}
        id={inputId}
        onChange={handleFileChange}
        ref={inputRef}
        type="file"
      />
      <Button
        className="w-fit"
        disabled={disabled || isUploading}
        onClick={() => inputRef.current?.click()}
        type="button"
        variant="outline"
      >
        {isUploading ? <Loader2 className="animate-spin" /> : null}
        {isUploading ? `正在${actionLabel}` : actionLabel}
      </Button>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
