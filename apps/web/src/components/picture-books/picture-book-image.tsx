"use client";

import { useState } from "react";
import { ImageOff, RotateCcw } from "lucide-react";

type Props = { src: string; alt: string; className?: string; compact?: boolean; hidden?: boolean };

export function PictureBookImage(props: Props) {
  return <ImageAttempt key={props.src} {...props} />;
}

function ImageAttempt({ src, alt, className, compact, hidden }: Props) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed) return <div hidden={hidden} role={compact || hidden ? undefined : "alert"} className="flex flex-col items-center justify-center gap-3 p-4 text-center text-sm text-gray-500">
    <ImageOff className="size-6" />
    {!compact ? <><p>图片加载失败</p><button type="button" className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-gray-700" onClick={() => { setFailed(false); setAttempt(attempt + 1); }}><RotateCcw className="size-4" />重试加载</button></> : null}
  </div>;
  return <img hidden={hidden} alt={alt} className={className} loading={compact ? "lazy" : "eager"} decoding="async" src={attempt ? `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}` : src} onError={() => setFailed(true)} />;
}
