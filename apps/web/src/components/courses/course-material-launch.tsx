"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { pictureBookAlbumLaunchHref } from "@/lib/picture-book-player-controls";

type CourseMaterialLaunchProps = {
  canOpenDirectly: boolean;
  courseId: string;
  href: string;
  itemName: string;
};

export function CourseMaterialLaunch({
  canOpenDirectly,
  courseId,
  href,
  itemName
}: CourseMaterialLaunchProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  if (canOpenDirectly) {
    return (
      <Button
        asChild
        aria-label={`播放${itemName}`}
        className="size-8 px-0"
        size="sm"
        title={`播放${itemName}`}
      >
        <Link href={pictureBookAlbumLaunchHref(href, courseId)}>
          <Play className="ml-0.5 size-4 fill-current" />
        </Link>
      </Button>
    );
  }

  const returnPath = `/c/${encodeURIComponent(courseId)}`;
  const encodedReturnPath = encodeURIComponent(returnPath);

  return (
    <>
      <Button
        aria-haspopup="dialog"
        aria-label={`登录后播放${itemName}`}
        className="size-8 px-0"
        onClick={() => dialogRef.current?.showModal()}
        size="sm"
        title={`播放${itemName}`}
        type="button"
      >
        <Play className="ml-0.5 size-4 fill-current" />
      </Button>
      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/45"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            dialogRef.current?.close();
          }
        }}
        ref={dialogRef}
      >
        <div className="space-y-5 p-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold" id={titleId}>登录后继续学习</h2>
            <p className="text-sm leading-6 text-muted-foreground" id={descriptionId}>
              登录或注册账号后即可学习该课件，完成后将返回当前资源详情页。
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <form method="dialog">
              <Button type="submit" variant="ghost">取消</Button>
            </form>
            <Button asChild variant="outline">
              <Link href={`/register?next=${encodedReturnPath}`}>免费注册</Link>
            </Button>
            <Button asChild>
              <Link href={`/login?next=${encodedReturnPath}`}>登录</Link>
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
