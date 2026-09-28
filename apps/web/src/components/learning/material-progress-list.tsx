import Link from "next/link";
import React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatLearningDuration,
  type LearnerMaterialSummary
} from "@/lib/learner-learning-types";

const statusLabels = {
  NOT_STARTED: "未开始",
  IN_PROGRESS: "学习中",
  COMPLETED: "已完成"
} as const;

const typeLabels = {
  VIDEO_GUIDE: "视频导学",
  ENGLISH_GUIDED_STUDY: "带学课件",
  LEARNING_FLASHCARD: "学习闪卡"
} as const;

export function MaterialProgressList({
  materials
}: {
  materials: LearnerMaterialSummary[];
}) {
  if (!materials.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-sm text-muted-foreground">
        暂无学习记录
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {materials.map((material) => (
        <Card
          className="rounded-2xl shadow-sm"
          key={`${material.materialType}:${material.materialId}`}
        >
          <CardContent className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold">{material.title}</p>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                  {typeLabels[material.materialType]}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {statusLabels[material.status]} · {material.progressPercent}% · 学习
                {formatLearningDuration(material.activeStudySeconds)}
                {material.course ? ` · ${material.course.name}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                最近学习：{new Date(material.lastStudiedAt).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </p>
              <div
                aria-label={`学习进度 ${material.progressPercent}%`}
                className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(0, Math.min(100, material.progressPercent))}%` }}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={material.detailHref}>查看详情</Link>
              </Button>
              <Button asChild size="sm">
                <Link href={material.continueHref}>继续学习</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
