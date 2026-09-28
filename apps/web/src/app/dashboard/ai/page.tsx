import {
  AlertCircle,
  CheckCircle2,
  Coins,
  LoaderCircle,
  Sparkles,
  WalletCards
} from "lucide-react";

import { DashboardShell } from "@/components/shell/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createAiTaskAction, getAiScenarios, getAiTask, type AiTask } from "@/lib/ai-api";
import { getCurrentUser } from "@/lib/auth-actions";
import { getWallet } from "@/lib/billing-api";
import { requireAccountProfile } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) {
    return "未完成";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}

function statusVariant(status: AiTask["status"]) {
  if (status === "SUCCEEDED") {
    return "secondary" as const;
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return "muted" as const;
  }

  return "outline" as const;
}

function taskInputText(task: AiTask | null) {
  return task?.input && typeof task.input.text === "string" ? task.input.text : "";
}

export default async function AiDashboardPage({
  searchParams
}: {
  searchParams: Promise<{ task?: string; error?: string; created?: string; failed?: string }>;
}) {
  const params = await searchParams;
  await requireAccountProfile("/dashboard/ai");
  await getCurrentUser();
  const [wallet, scenarios] = await Promise.all([getWallet(), getAiScenarios()]);
  const currentTask = params.task ? await getAiTask(params.task).catch(() => null) : null;
  const selectedScenarioId = currentTask?.scenarioId ?? scenarios[0]?.id ?? "";

  return (
    <DashboardShell active="ai" continuation="/dashboard/ai">
      <section className="flex w-full flex-col gap-8 px-5 py-8">
        {params.error ? (
          <Card>
            <CardContent className="flex items-center gap-3 pt-6 text-sm text-muted-foreground">
              <AlertCircle data-icon="inline-start" />
              操作失败：{params.error}
            </CardContent>
          </Card>
        ) : null}

        {params.created && currentTask?.status === "SUCCEEDED" ? (
          <Card>
            <CardContent className="flex items-center gap-3 pt-6 text-sm">
              <CheckCircle2 data-icon="inline-start" />
              生成成功，点数已完成结算。
            </CardContent>
          </Card>
        ) : null}

        {params.failed && currentTask?.status === "FAILED" ? (
          <Card>
            <CardContent className="flex items-center gap-3 pt-6 text-sm text-muted-foreground">
              <AlertCircle data-icon="inline-start" />
              生成失败，冻结点数已自动释放，请稍后重试。
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-full bg-secondary">
                <WalletCards />
              </div>
              <CardDescription>当前可用点数</CardDescription>
              <CardTitle className="text-3xl">
                {wallet.availableCredits.toLocaleString("zh-CN")}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-full bg-secondary">
                <Coins />
              </div>
              <CardDescription>冻结点数</CardDescription>
              <CardTitle className="text-3xl">
                {wallet.frozenCredits.toLocaleString("zh-CN")}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-full bg-secondary">
                <Sparkles />
              </div>
              <CardDescription>可用场景</CardDescription>
              <CardTitle className="text-3xl">{scenarios.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>创建生成任务</CardTitle>
              <CardDescription>当前仅开放简体中文文案生成场景。</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createAiTaskAction} className="flex flex-col gap-6">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="scenarioId">生成场景</FieldLabel>
                    <Select id="scenarioId" name="scenarioId" defaultValue={selectedScenarioId}>
                      {scenarios.map((scenario) => (
                        <option key={scenario.id} value={scenario.id}>
                          {scenario.name} · 预估 {scenario.costCredits.toLocaleString("zh-CN")} 点
                        </option>
                      ))}
                    </Select>
                    <FieldDescription>
                      {scenarios[0]?.description ?? "暂无可用 AI 场景。"}
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="input">输入内容</FieldLabel>
                    <Textarea
                      id="input"
                      name="input"
                      defaultValue={taskInputText(currentTask)}
                      minLength={2}
                      maxLength={2000}
                      placeholder="例如：为一个面向内容运营的场景应用写首页介绍文案"
                      rows={8}
                      required
                    />
                    <FieldDescription>最多 2000 字。</FieldDescription>
                  </Field>
                </FieldGroup>
                <Button className="w-fit" disabled={scenarios.length === 0} type="submit">
                  <Sparkles data-icon="inline-start" />
                  生成文案
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>生成结果</CardTitle>
              <CardDescription>最近一次选中的任务会显示在这里。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {currentTask ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4">
                    <div className="flex flex-col gap-1 text-sm">
                      <span className="text-muted-foreground">任务编号</span>
                      <span className="font-mono text-xs">{currentTask.id}</span>
                    </div>
                    <Badge variant={statusVariant(currentTask.status)}>
                      {currentTask.statusName}
                    </Badge>
                  </div>
                  <div className="grid gap-3 text-sm md:grid-cols-4">
                    <div className="rounded-xl border border-border bg-background p-4">
                      <p className="text-muted-foreground">预估点数</p>
                      <p className="mt-1 font-medium">
                        {currentTask.estimatedCredits.toLocaleString("zh-CN")} 点
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-4">
                      <p className="text-muted-foreground">实际消耗</p>
                      <p className="mt-1 font-medium">
                        {(currentTask.actualCredits ?? 0).toLocaleString("zh-CN")} 点
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-4">
                      <p className="text-muted-foreground">完成时间</p>
                      <p className="mt-1 font-medium">{formatDate(currentTask.finishedAt)}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-4">
                      <p className="text-muted-foreground">使用模型</p>
                      <p className="mt-1 break-all font-medium">
                        {currentTask.modelName ?? "本地 mock"}
                      </p>
                    </div>
                  </div>
                  {currentTask.status === "SUCCEEDED" && currentTask.output ? (
                    <div className="whitespace-pre-wrap rounded-xl border border-border bg-background p-5 text-sm leading-7">
                      {currentTask.output}
                    </div>
                  ) : null}
                  {currentTask.status === "FAILED" ? (
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-5 text-sm text-muted-foreground">
                      <AlertCircle data-icon="inline-start" />
                      {currentTask.errorMessage ?? "AI 生成失败，请稍后重试"}
                    </div>
                  ) : null}
                  {currentTask.status === "RUNNING" || currentTask.status === "RESERVED" ? (
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-5 text-sm text-muted-foreground">
                      <LoaderCircle data-icon="inline-start" />
                      任务处理中，请稍后刷新查看结果。
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-background p-6 text-sm text-muted-foreground">
                  暂无生成结果。提交任务后会在这里展示输出内容和点数结算情况。
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </DashboardShell>
  );
}
