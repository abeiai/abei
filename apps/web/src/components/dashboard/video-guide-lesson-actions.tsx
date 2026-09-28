"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";

import { ActionToast, type ActionToastState } from "@/components/ui/action-toast";
import { Button } from "@/components/ui/button";

export function VideoGuideLessonActions({
  canEdit = false,
  disabled = false,
  lessonId,
  sharePath,
  shareUrl
}: {
  canEdit?: boolean;
  disabled?: boolean;
  lessonId: string;
  sharePath: string;
  shareUrl: string;
}) {
  const [toastState, setToastState] = useState<ActionToastState>({});

  async function copyShareUrl() {
    if (disabled) {
      setToastState({
        message: "课件仍在生成中，完成后才能分享",
        status: "error",
        submittedAt: Date.now()
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setToastState({
        message: "学习页面链接已复制",
        status: "success",
        submittedAt: Date.now()
      });
    } catch {
      setToastState({
        message: "浏览器暂不允许复制，请手动复制链接",
        status: "error",
        submittedAt: Date.now()
      });
    }
  }

  return (
    <>
      <ActionToast state={toastState} />
      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <Button asChild variant="outline">
            <Link href={`/media-tutor/creator/${encodeURIComponent(lessonId)}`}>
              <ExternalLink data-icon="inline-start" />
              继续编辑
            </Link>
          </Button>
        ) : disabled ? (
          <Button disabled variant="outline">
            <ExternalLink data-icon="inline-start" />
            生成中
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href={sharePath}>
              <ExternalLink data-icon="inline-start" />
              进入学习
            </Link>
          </Button>
        )}
        <Button onClick={copyShareUrl} variant="outline">
          <Copy />
          复制链接
        </Button>
      </div>
    </>
  );
}
