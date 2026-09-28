import type { Metadata } from "next";
import Link from "next/link";

import { LearnerShell } from "@/components/shell/learner-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLearnerMaterialDetail } from "@/lib/learner-learning-api";
import {
  formatLearningDuration,
  type LearningMaterialType
} from "@/lib/learner-learning-types";
import { getProfileSelection, requireLearnerProfile } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "学习详情 - 学乐 AI"
};

const statusLabels = {
  NOT_STARTED: "未开始",
  IN_PROGRESS: "学习中",
  COMPLETED: "已完成"
} as const;

const metricLabels: Record<string, string> = {
  coveragePercent: "观看覆盖率",
  playedSeconds: "累计播放",
  submittedCount: "已提交",
  correctCount: "答对",
  completedNodeCount: "已完成节点",
  reviewCount: "复习张数",
  hardCount: "困难",
  blurryCount: "模糊",
  masteredCount: "掌握"
};

export default async function LearnerMaterialDetailPage({
  params
}: {
  params: Promise<{ materialType: string; materialId: string }>;
}) {
  const { materialType, materialId } = await params;
  const returnTo = `/learn/center/materials/${encodeURIComponent(materialType)}/${encodeURIComponent(materialId)}`;
  const home = await requireLearnerProfile(returnTo);
  const selection = await getProfileSelection(returnTo);
  let detail;
  try {
    detail = await getLearnerMaterialDetail(
      materialType as LearningMaterialType,
      materialId
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "学习详情加载失败";
    return (
      <LearnerShell home={home} selection={selection}>
        <div className="mx-auto w-full max-w-4xl px-5 py-10">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="grid gap-4 p-8 text-center">
              <h1 className="text-xl font-semibold">学习详情暂不可用</h1>
              <p className="text-sm text-muted-foreground">{message}</p>
              <Button asChild className="mx-auto" variant="outline">
                <Link href="/learn/center">返回学习中心</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </LearnerShell>
    );
  }

  return (
    <LearnerShell home={home} selection={selection}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-8 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link className="text-sm text-muted-foreground hover:text-foreground" href="/learn/center">
              返回学习中心
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal">{detail.title}</h1>
            {detail.course ? (
              <p className="mt-1 text-sm text-muted-foreground">{detail.course.name}</p>
            ) : null}
          </div>
          <Button asChild>
            <Link href={detail.continueHref}>继续学习</Link>
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Summary label="状态" value={statusLabels[detail.status]} />
          <Summary label="完成进度" value={`${detail.progressPercent}%`} />
          <Summary label="累计学习" value={formatLearningDuration(detail.activeStudySeconds)} />
          <Summary label="学习次数" value={`${detail.studyCount} 次`} />
        </div>

        <section className="grid gap-3" aria-labelledby="material-parts-title">
          <h2 className="text-base font-semibold" id="material-parts-title">各部分学习情况</h2>
          {detail.parts.map((part) => (
            <Card className="rounded-2xl shadow-sm" key={part.key}>
              <CardHeader className="flex-row items-center justify-between gap-4">
                <CardTitle className="text-base">{part.label}</CardTitle>
                <span className="text-sm text-muted-foreground">{statusLabels[part.status]}</span>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${part.progressPercent}%` }} />
                </div>
                <p className="text-sm text-muted-foreground">
                  完成 {part.progressPercent}% · 学习 {formatLearningDuration(part.activeStudySeconds)}
                </p>
                {Object.entries(part.metrics).length ? (
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    {Object.entries(part.metrics).map(([key, value]) => (
                      <span key={key}>{metricLabels[key] ?? key}：{formatMetric(key, value)}</span>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </LearnerShell>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function formatMetric(key: string, value: number) {
  if (key === "coveragePercent") return `${value}%`;
  if (key === "playedSeconds") return formatLearningDuration(value);
  return `${value}`;
}
