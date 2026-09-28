import Link from "next/link";
import { ArrowRight, Coins, FileText, Sparkles } from "lucide-react";

import { DashboardShell } from "@/components/shell/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAiTasks, historyProfileFilterGroups, parseHistoryProfileFilter } from "@/lib/ai-api";
import { getAudioTasks } from "@/lib/audio-api";
import { getCurrentUser } from "@/lib/auth-actions";
import { getWallet } from "@/lib/billing-api";
import { getLearners, requireAccountProfile } from "@/lib/profile-api";
import { dashboardQuickLinks } from "@/lib/product-data";
import { publicAccountLabel } from "@/lib/user-identity";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ profile?: string | string[] }>;
} = {}) {
  await requireAccountProfile("/dashboard");
  const user = await getCurrentUser();
  const learners = await getLearners();
  const profile = parseHistoryProfileFilter((await searchParams).profile, learners);
  const profileGroups = historyProfileFilterGroups(learners);
  const accountLabel = publicAccountLabel(user);
  const [wallet, tasks, audioTasks] = await Promise.all([
    getWallet(),
    getAiTasks(profile).catch(() => []),
    getAudioTasks(profile).catch(() => [])
  ]);
  const latestTasks = [
    ...tasks.map((task) => ({
      id: `ai:${task.id}`,
      title: task.scenario.name,
      statusName: task.statusName,
      href: `/dashboard/tasks/${task.id}`,
      createdAt: task.createdAt
    })),
    ...audioTasks.map((task) => ({
      id: `audio:${task.id}`,
      title: task.typeName,
      statusName: task.statusName,
      href: `/dashboard/audio-tasks/${task.id}`,
      createdAt: task.createdAt
    }))
  ]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 4);
  const stats = [
    {
      label: "账号",
      value: "正常",
      description: accountLabel,
      icon: FileText
    },
    {
      label: "可用点数",
      value: wallet.availableCredits.toLocaleString("zh-CN"),
      description: "钱包余额",
      icon: Coins
    },
    {
      label: "全部任务",
      value: (tasks.length + audioTasks.length).toLocaleString("zh-CN"),
      description: "AI 与音频",
      icon: Sparkles
    }
  ];

  return (
    <DashboardShell active="overview" continuation="/dashboard">
      <section className="flex w-full flex-col gap-8 px-5 py-8">
        <div className="flex justify-end"><Button asChild variant="outline"><Link href="/dashboard/referrals">推荐好友，双方各得500点</Link></Button></div>
        <form action="/dashboard" className="flex flex-wrap items-end gap-3" method="get">
          <label className="flex min-w-56 flex-col gap-2 text-sm font-semibold">
            历史身份
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal"
              defaultValue={profile}
              name="profile"
            >
              {profileGroups.map((group) =>
                group.label ? (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                ) : group.options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))
              )}
            </select>
          </label>
          <Button type="submit" variant="outline">筛选</Button>
        </form>
        <div className="grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader>
                <div className="xueleai-icon-tile flex size-10 items-center justify-center rounded-md">
                  <stat.icon />
                </div>
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className="text-3xl">{stat.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {dashboardQuickLinks.map((item) => (
            <Link
              className="xueleai-card xueleai-interactive-card group rounded-md border border-border bg-card text-card-foreground"
              href={item.href}
              key={item.href}
            >
              <div className="flex flex-col gap-2 p-5">
                <div className="xueleai-icon-tile flex size-10 items-center justify-center rounded-md">
                  <item.icon />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-lg font-bold">{item.title}</span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                </div>
                <span className="text-sm leading-6 text-muted-foreground">{item.description}</span>
              </div>
            </Link>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>最近任务</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {latestTasks.length > 0 ? (
              latestTasks.map((task) => (
                <Link
                  className="flex items-center justify-between gap-4 rounded-md border border-border bg-background p-4 text-sm"
                  href={task.href}
                  key={task.id}
                >
                  <span className="font-medium">{task.title}</span>
                  <span className="text-muted-foreground">{task.statusName}</span>
                </Link>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-border bg-background p-6 text-sm text-muted-foreground">
                暂无任务
              </div>
            )}
            {latestTasks.length > 0 ? (
              <Button asChild className="w-fit" variant="outline">
                <Link href="/dashboard/tasks">查看全部任务</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </DashboardShell>
  );
}
