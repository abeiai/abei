"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Activity, BookCheck, BookOpen, CalendarDays, Camera, Clock3, LayoutGrid, Save } from "lucide-react";

import { LearningTrend } from "@/components/learning/learning-trend";
import { MaterialProgressList } from "@/components/learning/material-progress-list";
import { learnerHomeModel } from "@/components/profiles/learner-home";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  updateCurrentLearnerAction,
  uploadCurrentLearnerAvatarAction
} from "@/lib/profile-actions";
import type { LearnerHome } from "@/lib/profile-api";
import {
  learnerLearningCenterMetrics,
  type LearnerLearningOverview
} from "@/lib/learner-learning-types";

const initialState = {};

export function LearnerCenter({
  home,
  overview
}: {
  home: LearnerHome;
  overview: LearnerLearningOverview;
}) {
  const model = learnerHomeModel(home);
  const metrics = learnerLearningCenterMetrics(overview);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-normal">学习中心</h1>

      <section aria-labelledby="learner-profile-title">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base" id="learner-profile-title">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]">
            <div className="flex items-center gap-4">
              <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-2xl font-semibold text-primary-foreground">
                {model.learner.avatarUrl ? (
                  <img
                    alt={`${model.learner.nickname}头像`}
                    className="size-full object-cover"
                    src={model.learner.avatarUrl}
                  />
                ) : (
                  model.learner.avatarFallback
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold">{model.learner.nickname}</p>
                <p className="mt-1 text-sm text-muted-foreground">{model.learner.gradeLabel}</p>
              </div>
            </div>
            <div className="grid gap-5">
              <NicknameForm nickname={model.learner.nickname} />
              <AvatarForm />
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="authorized-apps-title" className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold" id="authorized-apps-title">已授权应用</h2>
          <span className="text-sm text-muted-foreground">{model.scenarioCards.length} 个</span>
        </div>
        {model.scenarioCards.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {model.scenarioCards.map((scenario) => (
              <Card className="rounded-2xl shadow-sm" key={scenario.slug}>
                <CardHeader className="flex-row items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                    <LayoutGrid className="size-5" />
                  </span>
                  <CardTitle className="text-base">{scenario.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button asChild size="sm" variant="outline">
                    <Link href={scenario.href}>进入应用</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState text="暂无已授权应用" />
        )}
      </section>

      <section aria-labelledby="authorized-resources-title" className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold" id="authorized-resources-title">已授权学习资源</h2>
          <span className="text-sm text-muted-foreground">{model.courseCards.length} 门课程</span>
        </div>
        {model.courseCards.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {model.courseCards.map((course) => (
              <Card className="overflow-hidden rounded-2xl shadow-sm" key={course.id}>
                {course.coverUrl ? (
                  <img alt={`${course.name}封面`} className="aspect-video w-full object-cover" src={course.coverUrl} />
                ) : null}
                <CardHeader className="flex-row items-center gap-3">
                  <BookOpen className="size-5 shrink-0" />
                  <CardTitle className="text-base">{course.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button asChild size="sm" variant="outline">
                    <Link href={course.href}>进入课程</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState text="暂无已授权学习资源" />
        )}
      </section>

      <section aria-labelledby="learning-statistics-title" className="grid gap-4">
        <h2 className="text-base font-semibold" id="learning-statistics-title">学习情况</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatisticCard
            icon={<Activity className="size-5" />}
            label="今日有效在线时长"
            value={metrics.todayOnline}
          />
          <StatisticCard
            icon={<Clock3 className="size-5" />}
            label="今日学习时长"
            value={metrics.todayStudy}
          />
          <StatisticCard
            icon={<CalendarDays className="size-5" />}
            label="本周学习天数"
            value={metrics.learningDays}
          />
          <StatisticCard
            icon={<BookOpen className="size-5" />}
            label="已学习课件数"
            value={metrics.startedMaterials}
          />
          <StatisticCard
            icon={<BookCheck className="size-5" />}
            label="已完成课件数"
            value={metrics.completedMaterials}
          />
        </div>
        <div className="mt-2 grid gap-3">
          <h3 className="text-sm font-semibold">最近 7 天学习趋势</h3>
          <LearningTrend daily={overview.daily} />
        </div>
        <div className="mt-2 grid gap-3">
          <h3 className="text-sm font-semibold">最近学习</h3>
          <MaterialProgressList materials={overview.recentMaterials} />
        </div>
      </section>
    </div>
  );
}

function NicknameForm({ nickname }: { nickname: string }) {
  const [state, formAction, pending] = useActionState(updateCurrentLearnerAction, initialState);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <Field>
        <FieldLabel htmlFor="current-learner-nickname">昵称</FieldLabel>
        <Input defaultValue={nickname} id="current-learner-nickname" maxLength={30} name="nickname" required />
      </Field>
      <Button disabled={pending} size="sm" type="submit">
        <Save />
        {pending ? "保存中…" : "保存昵称"}
      </Button>
      <ActionFeedback state={state} />
    </form>
  );
}

function AvatarForm() {
  const [state, formAction, pending] = useActionState(uploadCurrentLearnerAvatarAction, initialState);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <Field>
        <FieldLabel htmlFor="current-learner-avatar">头像</FieldLabel>
        <Input accept="image/*" id="current-learner-avatar" name="file" required type="file" />
      </Field>
      <Button disabled={pending} size="sm" type="submit" variant="outline">
        <Camera />
        {pending ? "上传中…" : "更新头像"}
      </Button>
      <ActionFeedback state={state} />
    </form>
  );
}

function ActionFeedback({ state }: { state: { error?: string; success?: string } }) {
  if (!state.error && !state.success) return null;
  return (
    <p
      aria-live="polite"
      className={state.error ? "text-sm text-destructive sm:col-span-2" : "text-sm sm:col-span-2"}
    >
      {state.error ?? state.success}
    </p>
  );
}

function StatisticCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-sm text-muted-foreground">{text}</div>;
}
