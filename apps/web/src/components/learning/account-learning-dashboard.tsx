import { Info } from "lucide-react";
import Link from "next/link";
import React from "react";

import { LearningTrend } from "@/components/learning/learning-trend";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatLearningDuration,
  type AccountLearnerLearningFilters,
  type AccountLearnerLearningOverview,
  type LearnerMaterialDetail,
  type LearnerMaterialSummary
} from "@/lib/learner-learning-types";
import type { ProfileSelectionLearner } from "@/lib/profile-api";

export function AccountLearningDashboard({
  detail,
  filters,
  learners,
  materials,
  overview,
  selectedLearnerId
}: {
  detail: LearnerMaterialDetail | null;
  filters: AccountLearnerLearningFilters;
  learners: ProfileSelectionLearner[];
  materials: LearnerMaterialSummary[];
  overview: AccountLearnerLearningOverview;
  selectedLearnerId: string;
}) {
  const selected = learners.find((learner) => learner.id === selectedLearnerId);
  const presetRanges = datePresets(new Date());
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-8 md:px-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-normal">学习情况</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {selected ? `${selected.nickname} · ${selected.gradeLabel}` : "学习者数据"}
        </p>
      </header>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader><CardTitle className="text-base">筛选</CardTitle></CardHeader>
        <CardContent>
          <form action="/dashboard/learners/learning" className="grid gap-4 lg:grid-cols-4">
            <Filter label="学习者">
              <select className={selectClass} defaultValue={selectedLearnerId} name="learnerId">
                {learners.map((learner) => (
                  <option key={learner.id} value={learner.id}>{learner.nickname}</option>
                ))}
              </select>
            </Filter>
            <Filter label="开始日期"><input className={selectClass} defaultValue={filters.from} name="from" type="date" /></Filter>
            <Filter label="结束日期"><input className={selectClass} defaultValue={filters.to} name="to" type="date" /></Filter>
            <Filter label="应用">
              <select className={selectClass} defaultValue={filters.scenarioId ?? ""} name="scenarioId">
                <option value="">全部应用</option>
                {overview.scenarioBreakdown.map((row) => <option key={row.scenarioId} value={row.scenarioId}>{row.scenarioName}</option>)}
              </select>
            </Filter>
            <Filter label="专辑">
              <select className={selectClass} defaultValue={filters.courseId ?? ""} name="courseId">
                <option value="">全部专辑</option>
                {overview.courseBreakdown.map((row) => <option key={row.courseId} value={row.courseId}>{row.courseName}</option>)}
              </select>
            </Filter>
            <Filter label="资源类型"><input className={selectClass} defaultValue={filters.resourceType} maxLength={64} name="resourceType" placeholder="全部资源类型" /></Filter>
            <Filter label="资源"><input className={selectClass} defaultValue={filters.resourceId} maxLength={128} name="resourceId" placeholder="全部资源" /></Filter>
            <Filter label="课件类型">
              <select className={selectClass} defaultValue={filters.materialType ?? ""} name="materialType">
                <option value="">全部课件</option>
                <option value="VIDEO_GUIDE">视频导学</option>
                <option value="ENGLISH_GUIDED_STUDY">带学课件</option>
                <option value="LEARNING_FLASHCARD">学习闪卡</option>
              </select>
            </Filter>
            <div className="flex flex-wrap items-end gap-2 lg:col-span-4">
              <Button type="submit">应用筛选</Button>
              <Button asChild variant="outline"><Link href={presetHref(selectedLearnerId, presetRanges.today)}>今日</Link></Button>
              <Button asChild variant="outline"><Link href={presetHref(selectedLearnerId, presetRanges.week)}>本周</Link></Button>
              <Button asChild variant="outline"><Link href={presetHref(selectedLearnerId, presetRanges.month)}>本月</Link></Button>
              <Button asChild variant="ghost"><Link href={`/dashboard/learners/learning?learnerId=${encodeURIComponent(selectedLearnerId)}`}>清除筛选</Link></Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="学习指标">
        <Metric label="有效在线" value={formatLearningDuration(overview.totals.onlineSeconds)} />
        <Metric label="学习时长" value={formatLearningDuration(overview.totals.studySeconds)} />
        <Metric label="学习天数" value={`${overview.totals.learningDays} 天`} />
        <Metric label="开始课件" value={`${overview.totals.startedMaterialCount} 个`} />
        <Metric label="完成课件" value={`${overview.totals.completedMaterialCount} 个`} />
      </section>

      <Section title="每日学习趋势"><LearningTrend daily={overview.daily} /></Section>
      <BreakdownTable
        columns={["应用", "有效在线", "学习时长", "有效操作"]}
        empty="暂无应用学习记录"
        rows={overview.scenarioBreakdown.map((row) => [row.scenarioName, formatLearningDuration(row.onlineSeconds), formatLearningDuration(row.studySeconds), `${row.meaningfulActionCount}`])}
        title="已学习应用"
      />
      <BreakdownTable
        columns={["专辑", "学习时长", "开始课件", "完成课件"]}
        empty="暂无专辑学习记录"
        rows={overview.courseBreakdown.map((row) => [row.courseName, formatLearningDuration(row.studySeconds), `${row.startedMaterialCount}`, `${row.completedMaterialCount}`])}
        title="专辑投入"
      />
      <BreakdownTable
        columns={["学习资源", "学习时长", "开始课件", "完成课件"]}
        empty="暂无资源学习记录"
        rows={overview.resourceBreakdown.map((row) => [row.resourceName, formatLearningDuration(row.studySeconds), `${row.startedMaterialCount}`, `${row.completedMaterialCount}`])}
        title="学习资源投入"
      />

      <Section title="课件进度">
        {materials.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-muted-foreground"><tr><th className="pb-3 font-medium">课件</th><th className="pb-3 font-medium">状态</th><th className="pb-3 font-medium">进度</th><th className="pb-3 font-medium">学习时长</th><th className="pb-3 font-medium">操作</th></tr></thead>
              <tbody>
                {materials.map((material) => (
                  <tr className="border-t border-border" key={`${material.materialType}:${material.materialId}`}>
                    <td className="py-3 pr-4 font-medium">{material.title}</td>
                    <td className="py-3 pr-4">{statusLabel(material.status)}</td>
                    <td className="py-3 pr-4">{material.progressPercent}%</td>
                    <td className="py-3 pr-4">{formatLearningDuration(material.activeStudySeconds)}</td>
                    <td className="py-3"><Link className="font-medium text-primary hover:underline" href={detailHref(selectedLearnerId, filters, material)}>分段明细</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty text="暂无课件学习记录" />}
      </Section>

      {detail ? (
        <Section title={`${detail.title} · 分段明细`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {detail.parts.map((part) => (
              <div className="rounded-xl border border-border p-4" key={part.key}>
                <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{part.label}</h3><span className="text-sm text-muted-foreground">{statusLabel(part.status)}</span></div>
                <p className="mt-2 text-sm text-muted-foreground">完成 {part.progressPercent}% · {formatLearningDuration(part.activeStudySeconds)}</p>
                {Object.entries(part.metrics).map(([key, value]) => <p className="mt-1 text-xs text-muted-foreground" key={key}>{metricLabel(key)}：{value}</p>)}
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

const selectClass = "h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35";

function Filter({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="grid gap-2 text-sm font-semibold"><span>{label}</span>{children}</label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card className="rounded-2xl shadow-sm"><CardContent className="p-5"><p className="flex items-center gap-1 text-sm text-muted-foreground">{label}<span title="按所选日期和筛选条件统计"><Info className="size-3.5" aria-label={`${label}说明`} /></span></p><p className="mt-2 text-xl font-semibold">{value}</p></CardContent></Card>;
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="grid gap-3"><h2 className="text-base font-semibold">{title}</h2><Card className="rounded-2xl shadow-sm"><CardContent className="p-5">{children}</CardContent></Card></section>;
}

function BreakdownTable({ columns, empty, rows, title }: { columns: string[]; empty: string; rows: string[][]; title: string }) {
  return <Section title={title}>{rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="text-muted-foreground"><tr>{columns.map((column) => <th className="pb-3 font-medium" key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr className="border-t border-border" key={`${row[0]}:${index}`}>{row.map((cell, cellIndex) => <td className={cellIndex === 0 ? "py-3 pr-4 font-medium" : "py-3 pr-4"} key={`${cellIndex}:${cell}`}>{cell}</td>)}</tr>)}</tbody></table></div> : <Empty text={empty} />}</Section>;
}

function Empty({ text }: { text: string }) { return <p className="py-5 text-sm text-muted-foreground">{text}</p>; }

function statusLabel(status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED") { return status === "COMPLETED" ? "已完成" : status === "IN_PROGRESS" ? "学习中" : "未开始"; }

function metricLabel(key: string) { return ({ coveragePercent: "观看覆盖率", playedSeconds: "累计播放秒数", submittedCount: "已提交", correctCount: "答对", completedNodeCount: "已完成节点", reviewCount: "复习张数", hardCount: "困难", blurryCount: "模糊", masteredCount: "掌握" } as Record<string, string>)[key] ?? key; }

function detailHref(learnerId: string, filters: AccountLearnerLearningFilters, material: LearnerMaterialSummary) {
  const params = new URLSearchParams({ learnerId, ...Object.fromEntries(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1]))), materialType: material.materialType, materialId: material.materialId });
  return `/dashboard/learners/learning?${params}`;
}

function presetHref(learnerId: string, range: { from: string; to: string }) { return `/dashboard/learners/learning?${new URLSearchParams({ learnerId, ...range })}`; }

function datePresets(now: Date) {
  const to = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const date = new Date(`${to}T00:00:00Z`);
  const add = (days: number) => { const value = new Date(date); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
  return { today: { from: to, to }, week: { from: add(-6), to }, month: { from: `${to.slice(0, 8)}01`, to } };
}
