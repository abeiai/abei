"use client";
import { useState } from "react";
import type { LegacyAiLogDetail } from "@/lib/legacy-ai-logs-api";

export function LegacyLogAsset({ logId, asset }: { logId: string; asset: LegacyAiLogDetail["assets"][number] }) {
  const [failed, setFailed] = useState(false);
  const url = `/api/admin/legacy-ai-logs/${encodeURIComponent(logId)}/assets/${encodeURIComponent(asset.id)}/file`;
  if (failed) return <p role="status" className="text-sm text-muted-foreground">素材暂时无法读取</p>;
  if (!asset.url || asset.status !== "AVAILABLE") return <p className="text-sm text-muted-foreground">{asset.status === "MISSING" ? "素材已失效或缺失" : "素材尚未导入"}</p>;
  if (asset.mediaType === "IMAGE") return <img src={url} alt={asset.filename || "历史图片"} loading="lazy" onError={() => setFailed(true)} className="max-h-80 w-full rounded-lg object-contain" />;
  if (asset.mediaType === "AUDIO") return <audio src={url} controls preload="none" onError={() => setFailed(true)} className="w-full" />;
  return <video src={url} controls preload="none" onError={() => setFailed(true)} className="max-h-80 w-full rounded-lg" />;
}
