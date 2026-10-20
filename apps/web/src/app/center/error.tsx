"use client";

import { Button } from "@/components/ui/button";

export default function ResourceCenterError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-3xl flex-col items-center justify-center gap-4 px-5 py-16 text-center">
      <h1 className="text-2xl font-semibold">绘本馆加载失败</h1>
      <p className="text-sm text-muted-foreground">暂时无法获取已发布专辑，请稍后重试。</p>
      <Button onClick={() => reset()} type="button">重新加载</Button>
    </main>
  );
}
