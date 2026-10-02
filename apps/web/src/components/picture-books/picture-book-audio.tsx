"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";

export function PictureBookAudio(props: { src: string; className?: string }) {
  return <AudioAttempt key={props.src} {...props} />;
}

function AudioAttempt({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed) return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-600"><span>语音加载失败</span><button type="button" className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-gray-700" onClick={() => { setFailed(false); setAttempt(attempt + 1); }}><RotateCcw className="size-4" />重试加载</button></div>;
  return <audio aria-label="本页讲解语音" controls preload="metadata" className={className} src={attempt ? `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}` : src} onError={() => setFailed(true)} />;
}
