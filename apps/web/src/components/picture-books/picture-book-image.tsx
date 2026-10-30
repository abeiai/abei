"use client";

import { useState } from "react";
import { ImageOff, RotateCcw } from "lucide-react";
import { ResponsiveImage } from "../ui/responsive-image";
import type { ImageUsage } from "../../lib/image-delivery";

type Props = { src: string; fallbackSrc?: string; alt: string; className?: string; compact?: boolean; hidden?: boolean; usage?: ImageUsage; sizes?: string };

export function PictureBookImage(props: Props) {
  return <ImageAttempt key={props.src} {...props} />;
}

function ImageAttempt({ src, fallbackSrc, alt, className, compact, hidden, usage = "reading", sizes }: Props) {
  const [failed, setFailed] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed) return <div hidden={hidden} role={compact || hidden ? undefined : "alert"} className="flex flex-col items-center justify-center gap-3 p-4 text-center text-sm text-gray-500">
    <ImageOff className="size-6" />
    {!compact ? <><p>图片加载失败</p><button type="button" className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-gray-700" onClick={() => { setFailed(false); setUsingFallback(false); setAttempt(attempt + 1); }}><RotateCcw className="size-4" />重试加载</button></> : null}
  </div>;
  const activeSrc = usingFallback ? fallbackSrc! : src;
  return <ResponsiveImage fallbackToOriginal={!fallbackSrc?.startsWith("/api/creator-media/")} hidden={hidden} alt={alt} className={className} usage={usage} sizes={sizes} loading={compact ? "lazy" : "eager"} src={attempt && !usingFallback ? `${activeSrc}${activeSrc.includes("?") ? "&" : "?"}retry=${attempt}` : activeSrc} onError={() => { if (!usingFallback && fallbackSrc && fallbackSrc !== src) setUsingFallback(true); else setFailed(true); }} />;
}
