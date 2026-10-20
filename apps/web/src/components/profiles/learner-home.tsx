import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LearnerHome as LearnerHomeData } from "@/lib/profile-api";
import {
  isInternalLearnerScenario,
  learnerScenarioHref,
  normalizeLearnerScenarioRoot
} from "@/lib/profile-routing";

export function learnerHomeModel(home: LearnerHomeData) {
  const seenRoots = new Set<string>();
  const scenarioCards = home.scenarios.flatMap((scenario) => {
    if (isInternalLearnerScenario(scenario.slug)) {
      return [];
    }

    const root = normalizeLearnerScenarioRoot(scenario.slug);

    if (seenRoots.has(root)) {
      return [];
    }
    seenRoots.add(root);

    return [{
      ...scenario,
      slug: root,
      href: learnerScenarioHref(root)
    }];
  });

  return {
    learner: {
      ...home.learner,
      avatarFallback: Array.from(home.learner.nickname.trim())[0] ?? "学"
    },
    scenarioCards,
    courseCards: home.courses.map((course) => ({ ...course, href: `/c/${encodeURIComponent(course.id)}` })),
    recentRecords: [...home.recentRecords],
    emptyMessages: {
      scenarios: "暂无可用应用",
      courses: "暂无可学专辑",
      recentRecords: "暂无学习记录"
    }
  };
}

export function LearnerHome({ home }: { home: LearnerHomeData }) {
  const model = learnerHomeModel(home);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:py-10">
      <section className="flex items-center gap-4 rounded-2xl border border-border bg-background p-5 shadow-sm">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-lg font-semibold text-primary-foreground">
          {model.learner.avatarUrl ? (
            <img alt={`${model.learner.nickname}头像`} className="size-full object-cover" src={model.learner.avatarUrl} />
          ) : (
            model.learner.avatarFallback
          )}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-normal">{model.learner.nickname}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{model.learner.gradeLabel}</p>
        </div>
      </section>

      <section className="flex flex-col gap-4" id="applications">
        <h2 className="text-base font-semibold">场景应用</h2>
        {model.scenarioCards.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {model.scenarioCards.map((scenario) => (
              <Card className="rounded-2xl shadow-sm" key={scenario.slug}>
                <CardHeader>
                  <CardTitle className="text-base">{scenario.name}</CardTitle>
                  {scenario.description ? <CardDescription>{scenario.description}</CardDescription> : null}
                </CardHeader>
                <CardContent>
                  <Button asChild size="sm">
                    <Link href={scenario.href}>进入应用</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState message={model.emptyMessages.scenarios} />
        )}
      </section>

      <section className="flex flex-col gap-4" id="courses">
        <h2 className="text-base font-semibold">我的专辑</h2>
        {model.courseCards.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {model.courseCards.map((course) => (
              <Card className="overflow-hidden rounded-2xl shadow-sm" key={course.id}>
                {course.coverUrl ? (
                  <img alt={`${course.name}封面`} className="aspect-video w-full object-cover" src={course.coverUrl} />
                ) : null}
                <CardHeader>
                  <CardTitle className="text-base">{course.name}</CardTitle>
                  {course.summary ? <CardDescription>{course.summary}</CardDescription> : null}
                </CardHeader>
                <CardContent>
                  <Button asChild size="sm" variant="outline">
                    <Link href={course.href}>进入专辑</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState message={model.emptyMessages.courses} />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">最近学习</h2>
        {model.recentRecords.length ? (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
            {model.recentRecords.map((record) => (
              <Link
                className="flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-secondary/60"
                href={record.href}
                key={`${record.type}:${record.id}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{record.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatRecordTime(record.createdAt)}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{recordStatusLabel(record.status)}</span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState message={model.emptyMessages.recentRecords} />
        )}
      </section>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-sm text-muted-foreground">{message}</div>;
}

function formatRecordTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
}

function recordStatusLabel(status: string) {
  return ({
    SUCCEEDED: "已完成",
    READY: "可学习",
    RUNNING: "进行中",
    CREATED: "等待中",
    DRAFT: "草稿",
    FAILED: "未完成"
  } as Record<string, string>)[status] ?? status;
}
