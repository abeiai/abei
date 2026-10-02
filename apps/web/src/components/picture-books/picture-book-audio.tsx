"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";

type Props = { src: string; className?: string; hidden?: boolean; preload?: "auto" | "metadata" };

export function PictureBookAudio(props: Props) {
  return <AudioAttempt key={props.src} {...props} />;
}

function AudioAttempt({ src, className, hidden, preload = "metadata" }: Props) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed) return <div hidden={hidden} role={hidden ? undefined : "alert"} className="flex flex-wrap items-center gap-2 text-sm text-red-600"><span>语音加载失败</span><button type="button" className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-gray-700" onClick={() => { setFailed(false); setAttempt(attempt + 1); }}><RotateCcw className="size-4" />重试加载</button></div>;
  return <audio hidden={hidden} aria-label="本页讲解语音" controls preload={preload} className={className} src={attempt ? `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}` : src} onError={() => setFailed(true)} />;
}
